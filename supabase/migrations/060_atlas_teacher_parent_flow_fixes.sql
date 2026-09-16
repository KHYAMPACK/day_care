-- save_class_attendance, apply_unit_progress_to_class and get_parent_teacher_contacts
-- checked public.teacher_assignments directly instead of using
-- public.teacher_teaches_class_subject(), the helper that already accounts for Atlas
-- VIP's "any teacher with a matching subject_slug teaches every şube of that grade"
-- model (see 040_teacher_subject_slug.sql). In practice these three currently work for
-- Atlas VIP only because a client-side job (ensureTeachersAssignedToAllClasses) silently
-- backfills teacher_assignments rows whenever the director's staff page loads — and its
-- errors are only console.warn'd, not surfaced. If that backfill ever misses a teacher or
-- fails quietly, attendance saving, curriculum progress marking, and the parent "contact
-- teacher" list (ParentTeacherWhatsApp.jsx) would all silently break for Atlas schools,
-- the same failure shape as the şube roster bug this session already fixed. Switching
-- these to the shared helper removes that dependency.

create or replace function public.save_class_attendance(
  p_class_id uuid,
  p_subject_id uuid,
  p_taken_on date,
  p_week_index integer,
  p_unit_id uuid,
  p_records jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_school_id uuid;
  v_caller_school uuid;
  v_session_id uuid;
  rec jsonb;
  v_student_id uuid;
  v_status text;
  i integer;
begin
  if p_taken_on is null then
    raise exception 'Tarih gerekli.';
  end if;

  if p_week_index is null then
    raise exception 'Hafta bilgisi gerekli.';
  end if;

  if p_records is null or jsonb_typeof(p_records) is distinct from 'array' then
    raise exception 'Yoklama listesi gerekli.';
  end if;

  select c.school_id into v_school_id
  from public.classes c
  where c.id = p_class_id;

  if v_school_id is null then
    raise exception 'Şube bulunamadı.';
  end if;

  select p.school_id into v_caller_school
  from public.profiles p
  where p.id = auth.uid();

  if v_caller_school is distinct from v_school_id then
    raise exception 'Bu işlem için yetkiniz bulunmuyor.';
  end if;

  if not public.is_director() then
    if not public.teacher_teaches_class_subject(p_class_id, p_subject_id) then
      raise exception 'Bu şube ve ders için atamanız yok.';
    end if;
  end if;

  if p_unit_id is not null then
    if not exists (
      select 1
      from public.curriculum_units cu
      where cu.id = p_unit_id
        and cu.subject_id = p_subject_id
    ) then
      raise exception 'Ünite bu derse ait değil.';
    end if;
  end if;

  insert into public.attendance_sessions (
    school_id,
    class_id,
    subject_id,
    taken_on,
    taken_by,
    week_index,
    unit_id
  )
  values (
    v_school_id,
    p_class_id,
    p_subject_id,
    p_taken_on,
    auth.uid(),
    p_week_index,
    p_unit_id
  )
  on conflict (class_id, subject_id, taken_on) do update
    set
      taken_by = excluded.taken_by,
      week_index = excluded.week_index,
      unit_id = excluded.unit_id,
      updated_at = now()
  returning id into v_session_id;

  if jsonb_array_length(p_records) > 0 then
    for i in 0 .. jsonb_array_length(p_records) - 1 loop
      rec := p_records -> i;
      v_student_id := (rec ->> 'student_id')::uuid;
      v_status := rec ->> 'status';

      if v_status is distinct from 'present' and v_status is distinct from 'absent' then
        raise exception 'Geçersiz yoklama durumu.';
      end if;

      if not exists (
        select 1
        from public.students s
        where s.id = v_student_id
          and s.class_id = p_class_id
      ) then
        raise exception 'Öğrenci bu şubede değil.';
      end if;

      insert into public.attendance_records (session_id, student_id, status)
      values (v_session_id, v_student_id, v_status::public.attendance_status)
      on conflict (session_id, student_id) do update
        set status = excluded.status;
    end loop;
  end if;

  delete from public.attendance_records ar
  where ar.session_id = v_session_id
    and not exists (
      select 1
      from jsonb_array_elements(p_records) rec
      where (rec ->> 'student_id')::uuid = ar.student_id
    );

  return v_session_id;
end;
$$;

create or replace function public.apply_unit_progress_to_class(
  p_class_id uuid,
  p_unit_id uuid,
  p_completed boolean,
  p_questions_solved integer
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_school_id uuid;
  v_subject_id uuid;
  v_caller_school uuid;
  v_count integer := 0;
begin
  if p_questions_solved is null or p_questions_solved < 0 then
    raise exception 'Soru sayısı 0 veya daha büyük olmalıdır.';
  end if;

  select cu.subject_id into v_subject_id
  from public.curriculum_units cu
  where cu.id = p_unit_id;

  if v_subject_id is null then
    raise exception 'Ünite bulunamadı.';
  end if;

  select c.school_id into v_school_id
  from public.classes c
  where c.id = p_class_id;

  if v_school_id is null then
    raise exception 'Şube bulunamadı.';
  end if;

  select p.school_id into v_caller_school
  from public.profiles p
  where p.id = auth.uid();

  if v_caller_school is distinct from v_school_id then
    raise exception 'Bu işlem için yetkiniz bulunmuyor.';
  end if;

  if not public.is_director() then
    if not public.teacher_teaches_class_subject(p_class_id, v_subject_id) then
      raise exception 'Bu şube ve ders için atamanız yok.';
    end if;
  end if;

  insert into public.student_unit_progress (
    school_id,
    student_id,
    unit_id,
    completed,
    questions_solved,
    source,
    updated_by
  )
  select
    v_school_id,
    s.id,
    p_unit_id,
    p_completed,
    p_questions_solved,
    'class',
    auth.uid()
  from public.students s
  where s.class_id = p_class_id
  on conflict (student_id, unit_id) do update
    set
      completed = excluded.completed,
      questions_solved = excluded.questions_solved,
      source = 'class',
      updated_by = excluded.updated_by,
      updated_at = now()
    where public.student_unit_progress.source is distinct from 'override';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

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
    )
  order by p.full_name, s.full_name;
$$;

notify pgrst, 'reload schema';
