-- Username + PIN auth: profiles.username per school, synthetic login emails

alter table public.profiles
  add column if not exists username text;

create unique index if not exists profiles_school_username_unique_idx
  on public.profiles (school_id, lower(username))
  where username is not null;

create or replace function public.build_login_email(p_school_id uuid, p_username text)
returns text
language sql
immutable
as $$
  select lower(trim(p_username)) || '@' || p_school_id::text || '.login.internal';
$$;

create or replace function public.slugify_username(p_full_name text)
returns text
language plpgsql
immutable
as $$
declare
  v text;
begin
  v := lower(trim(coalesce(p_full_name, '')));
  v := translate(v, 'çğıöşü', 'cgiosu');
  v := translate(v, 'ÇĞİÖŞÜ', 'cgiosu');
  v := regexp_replace(v, '[^a-z0-9]+', '.', 'g');
  v := trim(both '.' from v);
  if v = '' then
    v := 'user';
  end if;
  return v;
end;
$$;

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

  insert into public.profiles (id, email, full_name, school_id, role, username)
  values (
    new.id,
    new.email,
    v_full_name,
    coalesce(v_school_id, public.default_school_id()),
    coalesce(v_role, 'parent'::public.user_role),
    v_username
  );

  return new;
end;
$$;

grant execute on function public.build_login_email(uuid, text) to anon, authenticated;

-- Anon-accessible school lookup by invite code (for localhost dev tenant)
create or replace function public.resolve_school_by_code(p_code text)
returns table (
  id uuid,
  name text,
  logo_url text,
  primary_color text,
  secondary_color text,
  custom_domain text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.name,
    s.logo_url,
    s.primary_color,
    s.secondary_color,
    s.custom_domain
  from public.schools s
  where s.school_code = upper(btrim(coalesce(p_code, '')))
  limit 1;
$$;

revoke all on function public.resolve_school_by_code(text) from public;
grant execute on function public.resolve_school_by_code(text) to anon, authenticated;
