-- Stable primary role: set once at account creation, not changed when add-role runs later.

alter table public.profiles
  add column if not exists primary_role public.user_role;

-- Backfill from earliest profile_roles row per profile.
update public.profiles p
set primary_role = sub.role
from (
  select distinct on (pr.profile_id)
    pr.profile_id,
    pr.role
  from public.profile_roles pr
  order by pr.profile_id, pr.created_at asc, pr.role asc
) sub
where p.id = sub.profile_id
  and p.primary_role is null;

-- Fallback for profiles without profile_roles rows.
update public.profiles
set primary_role = role
where primary_role is null
  and role is not null;

update public.profiles
set primary_role = 'parent'::public.user_role
where primary_role is null;

alter table public.profiles
  alter column primary_role set not null;

-- Prevent accidental overwrites after initial set.
create or replace function public.protect_profiles_primary_role()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.primary_role is not null and new.primary_role is distinct from old.primary_role then
    new.primary_role := old.primary_role;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_primary_role on public.profiles;
create trigger profiles_protect_primary_role
  before update on public.profiles
  for each row execute function public.protect_profiles_primary_role();

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_full_director()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.primary_role = 'director'::public.user_role
  );
$$;

create or replace function public.is_assistant_director()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('director'::public.user_role)
     and not public.is_full_director();
$$;

grant execute on function public.is_full_director() to authenticated;
grant execute on function public.is_assistant_director() to authenticated;

-- New auth users: set primary_role on profile insert.
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

  insert into public.profiles (id, email, full_name, school_id, role, primary_role, username)
  values (
    new.id,
    new.email,
    v_full_name,
    coalesce(v_school_id, public.default_school_id()),
    v_role,
    v_role,
    v_username
  );

  insert into public.profile_roles (profile_id, role)
  values (new.id, v_role)
  on conflict (profile_id, role) do nothing;

  return new;
end;
$$;

-- Only full müdürs may delete students (assistant müdürs blocked).
drop policy if exists "Staff can delete students" on public.students;

create policy "Full directors can delete students"
  on public.students for delete to authenticated
  using (public.is_full_director());
