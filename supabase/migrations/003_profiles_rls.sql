-- Allow authenticated users to read their own profile row.
-- Without these policies, RLS blocks SELECT even when a profile row exists.

alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Admins can read all profiles" on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;

create policy "Users can read own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Admins can read all profiles"
  on public.profiles
  for select
  to authenticated
  using (public.is_admin());

create policy "Admins can update all profiles"
  on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Admins need read access to these tables for AdminDashboard
alter table public.groups enable row level security;
alter table public.students enable row level security;

drop policy if exists "Admins can manage groups" on public.groups;
drop policy if exists "Admins can manage students" on public.students;

create policy "Admins can manage groups"
  on public.groups
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can manage students"
  on public.students
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
