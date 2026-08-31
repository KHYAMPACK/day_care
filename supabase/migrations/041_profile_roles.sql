-- Multi-role staff: one person can hold director + teacher + counselor roles.

create table if not exists public.profile_roles (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role       public.user_role not null,
  created_at timestamptz not null default now(),

  primary key (profile_id, role)
);

create index if not exists profile_roles_role_idx on public.profile_roles (role);

insert into public.profile_roles (profile_id, role)
select p.id, p.role
from public.profiles p
where p.role is not null
on conflict (profile_id, role) do nothing;

-- ---------------------------------------------------------------------------
-- Role helpers (union of assigned roles, not active UI role)
-- ---------------------------------------------------------------------------

create or replace function public.has_role(target_role public.user_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profile_roles pr
    where pr.profile_id = auth.uid()
      and pr.role = target_role
  );
$$;

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('teacher'::public.user_role);
$$;

create or replace function public.is_director()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('director'::public.user_role);
$$;

create or replace function public.is_counselor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('counselor'::public.user_role);
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('teacher'::public.user_role)
      or public.has_role('director'::public.user_role)
      or public.has_role('counselor'::public.user_role);
$$;

-- Keep profiles.role in sync as legacy primary role for older queries.
create or replace function public.sync_profiles_primary_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_primary public.user_role;
begin
  v_profile_id := coalesce(NEW.profile_id, OLD.profile_id);

  select pr.role into v_primary
  from public.profile_roles pr
  where pr.profile_id = v_profile_id
  order by
    case pr.role
      when 'director' then 1
      when 'counselor' then 2
      when 'teacher' then 3
      when 'parent' then 4
      else 5
    end
  limit 1;

  update public.profiles
  set role = coalesce(v_primary, 'parent'::public.user_role)
  where id = v_profile_id;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists profile_roles_sync_primary on public.profile_roles;
create trigger profile_roles_sync_primary
  after insert or update or delete on public.profile_roles
  for each row execute function public.sync_profiles_primary_role();

-- Backfill primary role after table creation
update public.profiles p
set role = sub.role
from (
  select
    pr.profile_id,
    (
      array_agg(
        pr.role
        order by
          case pr.role
            when 'director' then 1
            when 'counselor' then 2
            when 'teacher' then 3
            when 'parent' then 4
            else 5
          end
      )
    )[1] as role
  from public.profile_roles pr
  group by pr.profile_id
) sub
where p.id = sub.profile_id;

-- New auth users: mirror role into profile_roles
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_role public.user_role;
  v_username text;
  v_full_name text;
begin
  begin
    v_school_id := nullif(new.raw_user_meta_data ->> 'school_id', '')::uuid;
  exception
    when invalid_text_representation then
      v_school_id := null;
  end;

  begin
    v_role := nullif(new.raw_user_meta_data ->> 'role', '')::public.user_role;
  exception
    when invalid_text_representation then
      v_role := null;
  end;

  v_username := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  v_full_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), new.email);
  v_role := coalesce(v_role, 'parent'::public.user_role);

  insert into public.profiles (id, email, full_name, school_id, role, username)
  values (
    new.id,
    new.email,
    v_full_name,
    coalesce(v_school_id, public.default_school_id()),
    v_role,
    v_username
  );

  insert into public.profile_roles (profile_id, role)
  values (new.id, v_role)
  on conflict (profile_id, role) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profile_roles enable row level security;

drop policy if exists "Users read own profile roles" on public.profile_roles;
create policy "Users read own profile roles"
  on public.profile_roles for select to authenticated
  using (profile_id = auth.uid() or public.is_director());

drop policy if exists "Directors manage profile roles in school" on public.profile_roles;
create policy "Directors manage profile roles in school"
  on public.profile_roles for all to authenticated
  using (
    public.is_director()
    and exists (
      select 1 from public.profiles p
      where p.id = profile_roles.profile_id
        and p.school_id = (select p2.school_id from public.profiles p2 where p2.id = auth.uid())
    )
  )
  with check (
    public.is_director()
    and exists (
      select 1 from public.profiles p
      where p.id = profile_roles.profile_id
        and p.school_id = (select p2.school_id from public.profiles p2 where p2.id = auth.uid())
    )
  );

grant select on public.profile_roles to authenticated;
grant insert, update, delete on public.profile_roles to authenticated;
grant execute on function public.has_role(public.user_role) to authenticated;
