-- Daycare notification app: initial schema
-- Run in Supabase SQL Editor or via `supabase db push`

-- ---------------------------------------------------------------------------
-- Extensions & enums
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

create type public.user_role as enum ('admin', 'parent');

-- ---------------------------------------------------------------------------
-- profiles (extends Supabase auth.users)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       public.user_role not null default 'parent',
  full_name  text,
  email      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);

-- ---------------------------------------------------------------------------
-- students
-- ---------------------------------------------------------------------------

create table public.students (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  date_of_birth date,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- groups (classrooms / cohorts)
-- ---------------------------------------------------------------------------

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint groups_name_unique unique (name)
);

-- ---------------------------------------------------------------------------
-- student_groups (junction: students ↔ groups)
-- ---------------------------------------------------------------------------

create table public.student_groups (
  student_id uuid not null references public.students (id) on delete cascade,
  group_id   uuid not null references public.groups (id) on delete cascade,
  joined_at  timestamptz not null default now(),

  primary key (student_id, group_id)
);

create index student_groups_group_id_idx on public.student_groups (group_id);

-- ---------------------------------------------------------------------------
-- student_parents (junction: students ↔ parent profiles)
-- ---------------------------------------------------------------------------

create table public.student_parents (
  student_id uuid not null references public.students (id) on delete cascade,
  parent_id  uuid not null references public.profiles (id) on delete cascade,
  relation   text default 'parent',
  created_at timestamptz not null default now(),

  primary key (student_id, parent_id)
);

create index student_parents_parent_id_idx on public.student_parents (parent_id);

create or replace function public.enforce_student_parent_role()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where id = new.parent_id
      and role = 'parent'
  ) then
    raise exception 'parent_id must reference a profile with role ''parent''';
  end if;

  return new;
end;
$$;

create trigger student_parents_enforce_parent_role
  before insert or update on public.student_parents
  for each row execute function public.enforce_student_parent_role();

-- ---------------------------------------------------------------------------
-- messages
-- A message targets either a specific student or an entire group (or both).
-- Parents may read messages tied to their children directly or via group membership.
-- ---------------------------------------------------------------------------

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  title      text,
  body       text not null,
  student_id uuid references public.students (id) on delete cascade,
  group_id   uuid references public.groups (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint messages_target_required
    check (student_id is not null or group_id is not null)
);

create index messages_student_id_idx on public.messages (student_id);
create index messages_group_id_idx on public.messages (group_id);
create index messages_created_at_idx on public.messages (created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger students_set_updated_at
  before update on public.students
  for each row execute function public.set_updated_at();

create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function public.set_updated_at();

create trigger messages_set_updated_at
  before update on public.messages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create profile row when a user signs up
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.is_parent_of_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.student_parents sp
    join public.profiles p on p.id = sp.parent_id
    where sp.student_id = target_student_id
      and sp.parent_id = auth.uid()
      and p.role = 'parent'
  );
$$;

create or replace function public.parent_can_read_message(message_row public.messages)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Direct student message
    (
      message_row.student_id is not null
      and public.is_parent_of_student(message_row.student_id)
    )
    or
    -- Group message: at least one of the parent's children is in that group
    (
      message_row.group_id is not null
      and exists (
        select 1
        from public.student_groups sg
        join public.student_parents sp
          on sp.student_id = sg.student_id
        join public.profiles p
          on p.id = sp.parent_id
        where sg.group_id = message_row.group_id
          and sp.parent_id = auth.uid()
          and p.role = 'parent'
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security: messages
-- ---------------------------------------------------------------------------

alter table public.messages enable row level security;

-- Admins: full access
create policy "Admins can select messages"
  on public.messages
  for select
  to authenticated
  using (public.is_admin());

create policy "Admins can insert messages"
  on public.messages
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update messages"
  on public.messages
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete messages"
  on public.messages
  for delete
  to authenticated
  using (public.is_admin());

-- Parents: read-only for messages about their children
create policy "Parents can read messages for their children"
  on public.messages
  for select
  to authenticated
  using (public.parent_can_read_message(messages));
