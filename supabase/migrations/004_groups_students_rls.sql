-- groups / students: RLS returns empty arrays (no error) when enabled without policies.
-- Run this if AdminDashboard dropdowns are empty but rows exist in the Table Editor.

alter table public.groups enable row level security;
alter table public.students enable row level security;

drop policy if exists "Admins can manage groups" on public.groups;
drop policy if exists "Admins can select groups" on public.groups;
drop policy if exists "Admins can insert groups" on public.groups;
drop policy if exists "Admins can update groups" on public.groups;
drop policy if exists "Admins can delete groups" on public.groups;

create policy "Admins can select groups"
  on public.groups
  for select
  to authenticated
  using (public.is_admin());

create policy "Admins can insert groups"
  on public.groups
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update groups"
  on public.groups
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete groups"
  on public.groups
  for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can manage students" on public.students;
drop policy if exists "Admins can select students" on public.students;
drop policy if exists "Admins can insert students" on public.students;
drop policy if exists "Admins can update students" on public.students;
drop policy if exists "Admins can delete students" on public.students;

create policy "Admins can select students"
  on public.students
  for select
  to authenticated
  using (public.is_admin());

create policy "Admins can insert students"
  on public.students
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update students"
  on public.students
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete students"
  on public.students
  for delete
  to authenticated
  using (public.is_admin());

-- Junction tables used when resolving group messages for parents
alter table public.student_groups enable row level security;
alter table public.student_parents enable row level security;

drop policy if exists "Admins can manage student_groups" on public.student_groups;
drop policy if exists "Admins can select student_groups" on public.student_groups;
drop policy if exists "Admins can insert student_groups" on public.student_groups;
drop policy if exists "Admins can delete student_groups" on public.student_groups;

create policy "Admins can select student_groups"
  on public.student_groups for select to authenticated using (public.is_admin());
create policy "Admins can insert student_groups"
  on public.student_groups for insert to authenticated with check (public.is_admin());
create policy "Admins can delete student_groups"
  on public.student_groups for delete to authenticated using (public.is_admin());

drop policy if exists "Admins can manage student_parents" on public.student_parents;
drop policy if exists "Admins can select student_parents" on public.student_parents;
drop policy if exists "Admins can insert student_parents" on public.student_parents;
drop policy if exists "Admins can delete student_parents" on public.student_parents;

create policy "Admins can select student_parents"
  on public.student_parents for select to authenticated using (public.is_admin());
create policy "Admins can insert student_parents"
  on public.student_parents for insert to authenticated with check (public.is_admin());
create policy "Admins can delete student_parents"
  on public.student_parents for delete to authenticated using (public.is_admin());
