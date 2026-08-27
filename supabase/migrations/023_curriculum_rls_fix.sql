-- Break RLS recursion between classes and teacher_assignments (PostgREST 500).

create or replace function public.class_in_my_school(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    join public.profiles p on p.id = auth.uid()
    where c.id = target_class_id
      and c.school_id = p.school_id
  );
$$;

create or replace function public.teacher_assigned_to_class(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teacher_assignments ta
    where ta.class_id = target_class_id
      and ta.teacher_id = auth.uid()
  );
$$;

drop policy if exists "School members can select classes" on public.classes;
create policy "School members can select classes"
  on public.classes
  for select
  to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (
      public.is_director()
      or public.teacher_assigned_to_class(classes.id)
    )
  );

drop policy if exists "Directors can manage teacher_assignments" on public.teacher_assignments;
create policy "Directors can manage teacher_assignments"
  on public.teacher_assignments
  for all
  to authenticated
  using (
    public.is_director()
    and public.class_in_my_school(class_id)
  )
  with check (
    public.is_director()
    and public.class_in_my_school(class_id)
  );
