-- Rehberlikçi (counselor) role: school-wide student read + exam/calendar management.

alter type public.user_role add value if not exists 'counselor';

create or replace function public.is_counselor()
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
      and role = 'counselor'
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
      and role in ('teacher', 'director', 'counselor')
  );
$$;

create or replace function public.can_manage_exams()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_director() or public.is_counselor();
$$;

-- students: counselors see all students in their school
drop policy if exists "Directors and assigned teachers can select students" on public.students;

create policy "Directors counselors and assigned teachers can select students"
  on public.students
  for select
  to authenticated
  using (
    public.is_director()
    or public.is_counselor()
    or public.is_teacher_of_student(students.id)
  );

-- calendar_events: counselors can manage (deneme creation)
drop policy if exists "Directors can insert calendar events" on public.calendar_events;
create policy "Directors and counselors can insert calendar events"
  on public.calendar_events
  for insert
  to authenticated
  with check (
    (public.is_director() or public.is_counselor())
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "Directors can update calendar events" on public.calendar_events;
create policy "Directors and counselors can update calendar events"
  on public.calendar_events
  for update
  to authenticated
  using (
    (public.is_director() or public.is_counselor())
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  )
  with check (
    (public.is_director() or public.is_counselor())
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "Directors can delete calendar events" on public.calendar_events;
create policy "Directors and counselors can delete calendar events"
  on public.calendar_events
  for delete
  to authenticated
  using (
    (public.is_director() or public.is_counselor())
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

-- exam_sessions (026 bootstrap policies if present)
drop policy if exists "Staff can manage exam sessions" on public.exam_sessions;
create policy "Exam staff can manage exam sessions"
  on public.exam_sessions
  for all
  to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and public.can_manage_exams()
  )
  with check (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and public.can_manage_exams()
  );

drop policy if exists "Staff can read all exam results" on public.exam_student_results;
drop policy if exists "Staff can manage exam results" on public.exam_student_results;

create policy "Exam staff can read all exam results"
  on public.exam_student_results
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.exam_sessions es
      join public.profiles p on p.id = auth.uid()
      where es.id = exam_student_results.session_id
        and es.school_id = p.school_id
        and public.can_manage_exams()
    )
  );

create policy "Exam staff can manage exam results"
  on public.exam_student_results
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.exam_sessions es
      join public.profiles p on p.id = auth.uid()
      where es.id = exam_student_results.session_id
        and es.school_id = p.school_id
        and public.can_manage_exams()
    )
  )
  with check (
    exists (
      select 1
      from public.exam_sessions es
      join public.profiles p on p.id = auth.uid()
      where es.id = exam_student_results.session_id
        and es.school_id = p.school_id
        and public.can_manage_exams()
    )
  );

-- exam_subject_results + rankings (032)
drop policy if exists "Staff can read exam subject results" on public.exam_subject_results;
drop policy if exists "Staff can manage exam subject results" on public.exam_subject_results;
drop policy if exists "Staff can read exam rankings" on public.exam_session_rankings;

create policy "Exam staff can read exam subject results"
  on public.exam_subject_results for select to authenticated
  using (
    exists (
      select 1 from public.exam_sessions es
      join public.profiles p on p.id = auth.uid()
      where es.id = exam_subject_results.session_id
        and es.school_id = p.school_id
        and public.can_manage_exams()
    )
  );

create policy "Exam staff can manage exam subject results"
  on public.exam_subject_results for all to authenticated
  using (
    exists (
      select 1 from public.exam_sessions es
      join public.profiles p on p.id = auth.uid()
      where es.id = exam_subject_results.session_id
        and es.school_id = p.school_id
        and public.can_manage_exams()
    )
  )
  with check (
    exists (
      select 1 from public.exam_sessions es
      join public.profiles p on p.id = auth.uid()
      where es.id = exam_subject_results.session_id
        and es.school_id = p.school_id
        and public.can_manage_exams()
    )
  );

create policy "Exam staff can read exam rankings"
  on public.exam_session_rankings for select to authenticated
  using (
    exists (
      select 1 from public.exam_sessions es
      join public.profiles p on p.id = auth.uid()
      where es.id = exam_session_rankings.session_id
        and es.school_id = p.school_id
        and public.can_manage_exams()
    )
  );

-- exam answer keys (033) — topics stay director-only for catalog edits
drop policy if exists "Staff manage exam answer keys" on public.exam_answer_keys;
drop policy if exists "Staff manage exam questions" on public.exam_questions;
drop policy if exists "Staff manage exam student answers" on public.exam_student_answers;

create policy "Exam staff manage exam answer keys"
  on public.exam_answer_keys for all to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and public.can_manage_exams()
  )
  with check (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and public.can_manage_exams()
  );

create policy "Exam staff manage exam questions"
  on public.exam_questions for all to authenticated
  using (
    exists (
      select 1 from public.exam_answer_keys ak
      join public.profiles p on p.id = auth.uid()
      where ak.id = exam_questions.answer_key_id
        and ak.school_id = p.school_id
        and public.can_manage_exams()
    )
  )
  with check (
    exists (
      select 1 from public.exam_answer_keys ak
      join public.profiles p on p.id = auth.uid()
      where ak.id = exam_questions.answer_key_id
        and ak.school_id = p.school_id
        and public.can_manage_exams()
    )
  );

create policy "Exam staff manage exam student answers"
  on public.exam_student_answers for all to authenticated
  using (
    exists (
      select 1 from public.exam_sessions es
      join public.profiles p on p.id = auth.uid()
      where es.id = exam_student_answers.session_id
        and es.school_id = p.school_id
        and public.can_manage_exams()
    )
  )
  with check (
    exists (
      select 1 from public.exam_sessions es
      join public.profiles p on p.id = auth.uid()
      where es.id = exam_student_answers.session_id
        and es.school_id = p.school_id
        and public.can_manage_exams()
    )
  );

grant execute on function public.is_counselor() to authenticated;
grant execute on function public.can_manage_exams() to authenticated;
