-- Fix regression: 036_counselor_role.sql recreated the students SELECT policy
-- and dropped the is_teacher_of_class_student() branch that 022_curriculum.sql
-- had added (and 040/056 kept refining). The legacy teacher_students table is
-- unused (0 rows for every teacher at every school), so once that branch was
-- dropped, teachers could still see their şubeler (classes policy still checks
-- teacher_assigned_to_class) but could no longer see any student inside them —
-- loadClassRoster() came back empty and the UI reported "Bu şubede öğrenci yok."

drop policy if exists "Directors counselors and assigned teachers can select students" on public.students;

create policy "Directors counselors and assigned teachers can select students"
  on public.students
  for select
  to authenticated
  using (
    public.is_director()
    or public.is_counselor()
    or public.is_teacher_of_student(students.id)
    or public.is_teacher_of_class_student(students.id)
  );

notify pgrst, 'reload schema';
