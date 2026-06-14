-- Parents need read access to their children, groups, and junction rows.
-- Realtime must be enabled on messages for live feed updates.

drop policy if exists "Parents can read own student_parents" on public.student_parents;
drop policy if exists "Parents can read linked students" on public.students;
drop policy if exists "Parents can read own student_groups" on public.student_groups;
drop policy if exists "Parents can read linked groups" on public.groups;

create policy "Parents can read own student_parents"
  on public.student_parents
  for select
  to authenticated
  using (parent_id = auth.uid());

create policy "Parents can read linked students"
  on public.students
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_parents sp
      where sp.student_id = students.id
        and sp.parent_id = auth.uid()
    )
  );

create policy "Parents can read own student_groups"
  on public.student_groups
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_parents sp
      where sp.student_id = student_groups.student_id
        and sp.parent_id = auth.uid()
    )
  );

create policy "Parents can read linked groups"
  on public.groups
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_groups sg
      join public.student_parents sp on sp.student_id = sg.student_id
      where sg.group_id = groups.id
        and sp.parent_id = auth.uid()
    )
  );

-- Required for Supabase Realtime INSERT payloads on messages
alter table public.messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;
