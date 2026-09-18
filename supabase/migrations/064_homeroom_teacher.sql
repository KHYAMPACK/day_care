-- Sınıf öğretmeni (homeroom teacher): a tag on an existing subject teacher, not a new
-- role. One class has at most one homeroom teacher; one teacher can be homeroom teacher
-- of several classes. Optional — a class can have none.
--
-- Grants, for the homeroom teacher's own class(es) only:
--   - read access to the class's students, cross-subject attendance/lesson data,
--     curriculum week notes and unit progress (view-only — writing stays subject-scoped
--     via the existing teacher_assigned_to_class_subject-style checks)
--   - the same guidance workbook (weekly questions, study schedule, topic-resource
--     tracking) and student gaps/dossier tooling counselors already have, scoped to
--     their class instead of the whole school
--   - exam result reports (view-only; creating/managing denemeler stays director/
--     counselor-only via can_manage_exams())
--   - being counted as a class contact point for parents, and as an announcement
--     recipient path even when they don't personally teach a subject there

alter table public.classes
  add column if not exists homeroom_teacher_id uuid references public.profiles (id) on delete set null;

create index if not exists classes_homeroom_teacher_idx
  on public.classes (homeroom_teacher_id)
  where homeroom_teacher_id is not null;

create or replace function public.is_homeroom_teacher_of_class(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.classes c
    where c.id = target_class_id
      and c.homeroom_teacher_id = auth.uid()
  );
$$;

create or replace function public.is_homeroom_teacher_of_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.students s
    where s.id = target_student_id
      and public.is_homeroom_teacher_of_class(s.class_id)
  );
$$;

grant execute on function public.is_homeroom_teacher_of_class(uuid) to authenticated;
grant execute on function public.is_homeroom_teacher_of_student(uuid) to authenticated;

-- classes: homeroom teacher can see their own class row
drop policy if exists "School members can select classes" on public.classes;
create policy "School members can select classes"
  on public.classes
  for select
  to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (is_director() or teacher_assigned_to_class(id) or is_homeroom_teacher_of_class(id))
  );

-- students: homeroom teacher can see their class roster
drop policy if exists "Directors counselors and assigned teachers can select students" on public.students;
create policy "Directors counselors and assigned teachers can select students"
  on public.students
  for select
  to authenticated
  using (
    is_director()
    or is_counselor()
    or is_teacher_of_student(id)
    or is_teacher_of_class_student(id)
    or is_homeroom_teacher_of_student(id)
  );

-- attendance_sessions / attendance_records: cross-subject read for the homeroom class
drop policy if exists "Staff and parents can select attendance sessions" on public.attendance_sessions;
create policy "Staff and parents can select attendance sessions"
  on public.attendance_sessions
  for select
  to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (
      is_director()
      or teacher_assigned_to_class_subject(class_id, subject_id)
      or is_homeroom_teacher_of_class(class_id)
      or parent_has_child_in_class(class_id)
    )
  );

drop policy if exists "Staff and parents can select attendance records" on public.attendance_records;
create policy "Staff and parents can select attendance records"
  on public.attendance_records
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.attendance_sessions sess
      where sess.id = attendance_records.session_id
        and sess.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
        and (
          is_director()
          or teacher_assigned_to_class_subject(sess.class_id, sess.subject_id)
          or is_homeroom_teacher_of_class(sess.class_id)
          or is_parent_of_student(attendance_records.student_id)
        )
    )
  );

-- lesson_sessions (Atlas): teacher_can_view_atlas_session already backs the select policy
create or replace function public.teacher_can_view_atlas_session(
  target_class_id uuid,
  target_subject_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_director()
    or public.is_counselor()
    or public.teacher_can_log_atlas_session(target_class_id, target_subject_id)
    or public.is_homeroom_teacher_of_class(target_class_id)
    or public.parent_has_child_in_class(target_class_id);
$$;

-- lesson_attendance (Atlas): select policy inlines its own OR-list
drop policy if exists "Atlas attendance select" on public.lesson_attendance;
create policy "Atlas attendance select"
  on public.lesson_attendance
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.lesson_sessions sess
      where sess.id = lesson_attendance.session_id
        and sess.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
        and (
          is_director()
          or is_counselor()
          or teacher_can_log_atlas_session(sess.class_id, sess.subject_id)
          or is_homeroom_teacher_of_class(sess.class_id)
          or is_parent_of_student(lesson_attendance.student_id)
        )
    )
  );

-- curriculum_week_notes: cross-subject read for the homeroom class
drop policy if exists "Staff and parents can read week notes" on public.curriculum_week_notes;
create policy "Staff and parents can read week notes"
  on public.curriculum_week_notes
  for select
  to authenticated
  using (
    class_in_my_school(class_id)
    and (
      is_director()
      or teacher_assigned_to_class_subject(class_id, subject_id)
      or is_homeroom_teacher_of_class(class_id)
      or parent_linked_to_class(class_id)
    )
  );

-- student_unit_progress: cross-subject read for the homeroom class
drop policy if exists "Parents and staff can select unit progress" on public.student_unit_progress;
create policy "Parents and staff can select unit progress"
  on public.student_unit_progress
  for select
  to authenticated
  using (
    is_director()
    or is_parent_of_student(student_id)
    or teacher_can_write_unit_progress(student_id, unit_id)
    or is_teacher_of_class_student(student_id)
    or is_homeroom_teacher_of_student(student_id)
  );

-- Guidance workbook: extend counselor_can_manage_student so a homeroom teacher can use
-- the same write policies (counselor_guidance_weeks, counselor_topic_resource_cells
-- directly; counselor_weekly_question_rows and counselor_study_schedule_blocks through
-- their join to counselor_guidance_weeks) for their own class's students. Denemeler
-- (exam session creation) stays on can_manage_exams(), untouched.
create or replace function public.counselor_can_manage_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.students s
    join public.profiles p on p.id = auth.uid()
    where s.id = target_student_id
      and s.school_id = p.school_id
      and (
        public.is_director()
        or public.is_counselor()
        or public.is_homeroom_teacher_of_student(target_student_id)
      )
  );
$$;

-- Guidance workbook select policies: add the homeroom read path alongside the existing
-- is_teacher_of_student() one (a narrower, separate teacher_students-based check).
drop policy if exists "Counselor guidance weeks select" on public.counselor_guidance_weeks;
create policy "Counselor guidance weeks select"
  on public.counselor_guidance_weeks
  for select
  to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (
      is_director()
      or is_counselor()
      or is_teacher_of_student(student_id)
      or is_homeroom_teacher_of_student(student_id)
    )
  );

drop policy if exists "Counselor topic resource select" on public.counselor_topic_resource_cells;
create policy "Counselor topic resource select"
  on public.counselor_topic_resource_cells
  for select
  to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (
      is_director()
      or is_counselor()
      or is_teacher_of_student(student_id)
      or is_homeroom_teacher_of_student(student_id)
    )
  );

drop policy if exists "Counselor question rows select" on public.counselor_weekly_question_rows;
create policy "Counselor question rows select"
  on public.counselor_weekly_question_rows
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.counselor_guidance_weeks w
      where w.id = counselor_weekly_question_rows.week_id
        and w.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
        and (
          is_director()
          or is_counselor()
          or is_teacher_of_student(w.student_id)
          or is_homeroom_teacher_of_student(w.student_id)
        )
    )
  );

drop policy if exists "Counselor schedule blocks select" on public.counselor_study_schedule_blocks;
create policy "Counselor schedule blocks select"
  on public.counselor_study_schedule_blocks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.counselor_guidance_weeks w
      where w.id = counselor_study_schedule_blocks.week_id
        and w.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
        and (
          is_director()
          or is_counselor()
          or is_teacher_of_student(w.student_id)
          or is_homeroom_teacher_of_student(w.student_id)
        )
    )
  );

-- Announcements: a homeroom teacher's posts reach their class's parents even if they
-- don't personally teach a subject there.
create or replace function public.parent_can_read_announcement(target public.announcements)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.student_parents sp
    join public.students s on s.id = sp.student_id
    join public.classes c on c.id = s.class_id
    where sp.parent_id = auth.uid()
      and s.class_id is not null
      and (
        exists (
          select 1
          from public.teacher_assignments ta
          where ta.class_id = s.class_id
            and ta.teacher_id = target.author_id
        )
        or c.homeroom_teacher_id = target.author_id
      )
  );
$$;

-- Parents' "contact teacher" list: include the homeroom teacher even without a
-- subject-slug/grade match or an explicit teacher_assignments row.
create or replace function public.get_parent_teacher_contacts()
returns table(teacher_id uuid, full_name text, phone text, student_id uuid, student_full_name text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select distinct
    p.id as teacher_id,
    p.full_name,
    p.phone,
    s.id as student_id,
    s.full_name as student_full_name
  from public.student_parents sp
  join public.students s on s.id = sp.student_id
  join public.classes c on c.id = s.class_id
  join public.profiles p on p.role = 'teacher' and p.school_id = s.school_id
  where sp.parent_id = auth.uid()
    and s.class_id is not null
    and s.school_id = (
      select pr.school_id
      from public.profiles pr
      where pr.id = auth.uid()
    )
    and (
      exists (
        select 1
        from public.teacher_assignments ta
        where ta.teacher_id = p.id
          and ta.class_id = s.class_id
      )
      or (
        p.subject_slug is not null
        and exists (
          select 1
          from public.curriculum_subjects cs
          where cs.slug = p.subject_slug
            and cs.grade = c.grade
        )
      )
      or c.homeroom_teacher_id = p.id
    )
  order by p.full_name, s.full_name;
$$;

notify pgrst, 'reload schema';
