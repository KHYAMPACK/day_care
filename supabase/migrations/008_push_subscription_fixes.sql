-- Allow admins to read parent profiles' push subscriptions via student_parents joins.
-- Also fix a common typo if the column was created as push_subscription.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'push_subscription'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'web_push_subscription'
  ) then
    alter table public.profiles
      rename column push_subscription to web_push_subscription;
  end if;
end $$;

alter table public.profiles
  add column if not exists web_push_subscription jsonb;

-- Ensure admins can SELECT parent profiles (needed for push lookup)
drop policy if exists "Admins can read all profiles" on public.profiles;

create policy "Admins can read all profiles"
  on public.profiles
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can select student_parents" on public.student_parents;

create policy "Admins can select student_parents"
  on public.student_parents
  for select
  to authenticated
  using (public.is_admin());
