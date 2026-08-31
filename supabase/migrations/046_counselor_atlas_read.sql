-- Counselors: read Atlas sessions/results/attendance for school-wide guidance dossier.

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
    or public.parent_has_child_in_class(target_class_id);
$$;

drop policy if exists "Atlas attendance select" on public.atlas_lesson_attendance;
create policy "Atlas attendance select"
  on public.atlas_lesson_attendance for select to authenticated
  using (
    exists (
      select 1 from public.atlas_lesson_sessions sess
      where sess.id = session_id
        and sess.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
        and (
          public.is_director()
          or public.is_counselor()
          or public.teacher_can_log_atlas_session(sess.class_id, sess.subject_id)
          or public.is_parent_of_student(atlas_lesson_attendance.student_id)
        )
    )
  );

drop policy if exists "Atlas results select" on public.atlas_lesson_results;
create policy "Atlas results select"
  on public.atlas_lesson_results for select to authenticated
  using (
    exists (
      select 1 from public.atlas_lesson_sessions sess
      where sess.id = session_id
        and sess.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
        and (
          public.is_director()
          or public.is_counselor()
          or public.teacher_can_log_atlas_session(sess.class_id, sess.subject_id)
          or public.is_parent_of_student(atlas_lesson_results.student_id)
        )
    )
  );
