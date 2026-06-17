-- Multi-tenant foundation: schools + school_id on core tables
-- Run in Supabase SQL Editor or via `supabase db push`
--
-- Safe to re-run if a prior attempt failed partway through.

-- ---------------------------------------------------------------------------
-- 1. Schools table (create first — nothing may reference it before this)
-- ---------------------------------------------------------------------------

create table if not exists public.schools (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

alter table public.schools enable row level security;

-- ---------------------------------------------------------------------------
-- 2. school_id columns (nullable until backfill completes)
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists school_id uuid references public.schools (id) on delete restrict;

alter table public.students
  add column if not exists school_id uuid references public.schools (id) on delete restrict;

alter table public.messages
  add column if not exists school_id uuid references public.schools (id) on delete restrict;

alter table public.message_templates
  add column if not exists school_id uuid references public.schools (id) on delete restrict;

-- ---------------------------------------------------------------------------
-- 3. Seed default school + backfill existing data
-- ---------------------------------------------------------------------------

do $$
declare
  default_school_id uuid;
begin
  select id
  into default_school_id
  from public.schools
  where name = 'İlk Memnun Kreş'
  limit 1;

  if default_school_id is null then
    insert into public.schools (name)
    values ('İlk Memnun Kreş')
    returning id into default_school_id;
  end if;

  update public.profiles
  set school_id = default_school_id
  where school_id is null;

  update public.students
  set school_id = default_school_id
  where school_id is null;

  update public.messages
  set school_id = default_school_id
  where school_id is null;

  update public.message_templates
  set school_id = default_school_id
  where school_id is null;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Enforce NOT NULL + indexes
-- ---------------------------------------------------------------------------

alter table public.profiles
  alter column school_id set not null;

alter table public.students
  alter column school_id set not null;

alter table public.messages
  alter column school_id set not null;

alter table public.message_templates
  alter column school_id set not null;

create index if not exists profiles_school_id_idx on public.profiles (school_id);
create index if not exists students_school_id_idx on public.students (school_id);
create index if not exists messages_school_id_idx on public.messages (school_id);
create index if not exists message_templates_school_id_idx on public.message_templates (school_id);

-- ---------------------------------------------------------------------------
-- 5. Default school for new rows (until per-tenant onboarding exists)
-- ---------------------------------------------------------------------------

create or replace function public.default_school_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.schools
  order by created_at asc
  limit 1;
$$;

alter table public.profiles
  alter column school_id set default public.default_school_id();

alter table public.students
  alter column school_id set default public.default_school_id();

alter table public.messages
  alter column school_id set default public.default_school_id();

alter table public.message_templates
  alter column school_id set default public.default_school_id();

-- ---------------------------------------------------------------------------
-- 6. Schools RLS (after profiles.school_id exists)
-- ---------------------------------------------------------------------------

drop policy if exists "Users can read their own school" on public.schools;
drop policy if exists "Directors can manage their school row" on public.schools;

create policy "Users can read their own school"
  on public.schools
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.school_id = schools.id
    )
  );

create policy "Directors can manage their school row"
  on public.schools
  for all
  to authenticated
  using (
    public.is_director()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.school_id = schools.id
    )
  )
  with check (
    public.is_director()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.school_id = schools.id
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Auto-create profile with school_id on signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, school_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    public.default_school_id()
  );
  return new;
end;
$$;
