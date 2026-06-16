-- Introduce teacher + director roles (replaces legacy admin).
-- Run in Supabase SQL Editor or via `supabase db push`.

-- ---------------------------------------------------------------------------
-- 1. Replace enum: parent | teacher | director  (admin → teacher)
-- ---------------------------------------------------------------------------

create type public.user_role_new as enum ('parent', 'teacher', 'director');

alter table public.profiles
  alter column role drop default;

alter table public.profiles
  alter column role type public.user_role_new
  using (
    case role::text
      when 'admin' then 'teacher'::public.user_role_new
      when 'parent' then 'parent'::public.user_role_new
      when 'teacher' then 'teacher'::public.user_role_new
      when 'director' then 'director'::public.user_role_new
      else 'parent'::public.user_role_new
    end
  );

drop type public.user_role;

alter type public.user_role_new rename to user_role;

alter table public.profiles
  alter column role set default 'parent'::public.user_role;

-- ---------------------------------------------------------------------------
-- 2. Role helper functions
-- ---------------------------------------------------------------------------

create or replace function public.is_teacher()
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
      and role = 'teacher'
  );
$$;

create or replace function public.is_director()
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
      and role = 'director'
  );
$$;

create or replace function public.is_staff()
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
      and role in ('teacher', 'director')
  );
$$;

-- Backward-compatible alias used by existing policies and RPCs
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_staff();
$$;

-- ---------------------------------------------------------------------------
-- 3. profiles — staff read/update; directors full CRUD
-- ---------------------------------------------------------------------------

drop policy if exists "Admins can read all profiles" on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;
drop policy if exists "Staff can read all profiles" on public.profiles;
drop policy if exists "Staff can update all profiles" on public.profiles;
drop policy if exists "Directors can manage all profiles" on public.profiles;

create policy "Staff can read all profiles"
  on public.profiles
  for select
  to authenticated
  using (public.is_staff());

create policy "Staff can update all profiles"
  on public.profiles
  for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "Directors can manage all profiles"
  on public.profiles
  for all
  to authenticated
  using (public.is_director())
  with check (public.is_director());

-- ---------------------------------------------------------------------------
-- 4. students — staff CRUD; directors explicit full access
-- ---------------------------------------------------------------------------

drop policy if exists "Admins can select students" on public.students;
drop policy if exists "Admins can insert students" on public.students;
drop policy if exists "Admins can update students" on public.students;
drop policy if exists "Admins can delete students" on public.students;
drop policy if exists "Admins can manage students" on public.students;
drop policy if exists "Staff can select students" on public.students;
drop policy if exists "Staff can insert students" on public.students;
drop policy if exists "Staff can update students" on public.students;
drop policy if exists "Staff can delete students" on public.students;
drop policy if exists "Directors can manage all students" on public.students;

create policy "Staff can select students"
  on public.students for select to authenticated
  using (public.is_staff());

create policy "Staff can insert students"
  on public.students for insert to authenticated
  with check (public.is_staff());

create policy "Staff can update students"
  on public.students for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "Staff can delete students"
  on public.students for delete to authenticated
  using (public.is_staff());

create policy "Directors can manage all students"
  on public.students for all to authenticated
  using (public.is_director())
  with check (public.is_director());

-- ---------------------------------------------------------------------------
-- 5. student_parents — staff select/insert/delete; directors full CRUD
-- ---------------------------------------------------------------------------

drop policy if exists "Admins can select student_parents" on public.student_parents;
drop policy if exists "Admins can insert student_parents" on public.student_parents;
drop policy if exists "Admins can delete student_parents" on public.student_parents;
drop policy if exists "Admins can manage student_parents" on public.student_parents;
drop policy if exists "Staff can select student_parents" on public.student_parents;
drop policy if exists "Staff can insert student_parents" on public.student_parents;
drop policy if exists "Staff can delete student_parents" on public.student_parents;
drop policy if exists "Directors can manage all student_parents" on public.student_parents;

create policy "Staff can select student_parents"
  on public.student_parents for select to authenticated
  using (public.is_staff());

create policy "Staff can insert student_parents"
  on public.student_parents for insert to authenticated
  with check (public.is_staff());

create policy "Staff can delete student_parents"
  on public.student_parents for delete to authenticated
  using (public.is_staff());

create policy "Directors can manage all student_parents"
  on public.student_parents for all to authenticated
  using (public.is_director())
  with check (public.is_director());

-- ---------------------------------------------------------------------------
-- 6. messages — staff CRUD; directors explicit full access
-- ---------------------------------------------------------------------------

drop policy if exists "Admins can select messages" on public.messages;
drop policy if exists "Admins can insert messages" on public.messages;
drop policy if exists "Admins can update messages" on public.messages;
drop policy if exists "Admins can delete messages" on public.messages;
drop policy if exists "Staff can select messages" on public.messages;
drop policy if exists "Staff can insert messages" on public.messages;
drop policy if exists "Staff can update messages" on public.messages;
drop policy if exists "Staff can delete messages" on public.messages;
drop policy if exists "Directors can manage all messages" on public.messages;

create policy "Staff can select messages"
  on public.messages for select to authenticated
  using (public.is_staff());

create policy "Staff can insert messages"
  on public.messages for insert to authenticated
  with check (public.is_staff());

create policy "Staff can update messages"
  on public.messages for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "Staff can delete messages"
  on public.messages for delete to authenticated
  using (public.is_staff());

create policy "Directors can manage all messages"
  on public.messages for all to authenticated
  using (public.is_director())
  with check (public.is_director());

-- ---------------------------------------------------------------------------
-- 7. groups, student_groups, message_templates — staff access (unchanged scope)
-- ---------------------------------------------------------------------------

drop policy if exists "Admins can select groups" on public.groups;
drop policy if exists "Admins can insert groups" on public.groups;
drop policy if exists "Admins can update groups" on public.groups;
drop policy if exists "Admins can delete groups" on public.groups;
drop policy if exists "Admins can manage groups" on public.groups;
drop policy if exists "Staff can select groups" on public.groups;
drop policy if exists "Staff can insert groups" on public.groups;
drop policy if exists "Staff can update groups" on public.groups;
drop policy if exists "Staff can delete groups" on public.groups;

create policy "Staff can select groups"
  on public.groups for select to authenticated using (public.is_staff());
create policy "Staff can insert groups"
  on public.groups for insert to authenticated with check (public.is_staff());
create policy "Staff can update groups"
  on public.groups for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "Staff can delete groups"
  on public.groups for delete to authenticated using (public.is_staff());

drop policy if exists "Admins can select student_groups" on public.student_groups;
drop policy if exists "Admins can insert student_groups" on public.student_groups;
drop policy if exists "Admins can delete student_groups" on public.student_groups;
drop policy if exists "Admins can manage student_groups" on public.student_groups;
drop policy if exists "Staff can select student_groups" on public.student_groups;
drop policy if exists "Staff can insert student_groups" on public.student_groups;
drop policy if exists "Staff can delete student_groups" on public.student_groups;

create policy "Staff can select student_groups"
  on public.student_groups for select to authenticated using (public.is_staff());
create policy "Staff can insert student_groups"
  on public.student_groups for insert to authenticated with check (public.is_staff());
create policy "Staff can delete student_groups"
  on public.student_groups for delete to authenticated using (public.is_staff());

drop policy if exists "Admins can select message templates" on public.message_templates;
drop policy if exists "Admins can insert message templates" on public.message_templates;
drop policy if exists "Admins can update message templates" on public.message_templates;
drop policy if exists "Admins can delete message templates" on public.message_templates;
drop policy if exists "Staff can select message templates" on public.message_templates;
drop policy if exists "Staff can insert message templates" on public.message_templates;
drop policy if exists "Staff can update message templates" on public.message_templates;
drop policy if exists "Staff can delete message templates" on public.message_templates;

create policy "Staff can select message templates"
  on public.message_templates for select to authenticated using (public.is_staff());
create policy "Staff can insert message templates"
  on public.message_templates for insert to authenticated with check (public.is_staff());
create policy "Staff can update message templates"
  on public.message_templates for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "Staff can delete message templates"
  on public.message_templates for delete to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------------
-- 8. Push subscription RPCs — staff (teachers + directors)
-- ---------------------------------------------------------------------------

create or replace function public.get_push_subscriptions_for_students(target_student_ids uuid[])
returns table (
  parent_id uuid,
  student_id uuid,
  subscription jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    sp.parent_id,
    sp.student_id,
    p.web_push_subscription as subscription
  from public.student_parents sp
  join public.profiles p on p.id = sp.parent_id
  where sp.student_id = any(target_student_ids)
    and public.is_staff()
    and p.web_push_subscription is not null;
$$;

create or replace function public.get_push_subscriptions_for_group(target_group_id uuid)
returns table (
  parent_id uuid,
  student_id uuid,
  subscription jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    sp.parent_id,
    sp.student_id,
    p.web_push_subscription as subscription
  from public.student_groups sg
  join public.student_parents sp on sp.student_id = sg.student_id
  join public.profiles p on p.id = sp.parent_id
  where sg.group_id = target_group_id
    and public.is_staff()
    and p.web_push_subscription is not null;
$$;
