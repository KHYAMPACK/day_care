-- Atlas: teacher subject on profile; drop class-assignment requirement for Atlas logging.
-- Run after 029.

-- ---------------------------------------------------------------------------
-- Profile subject (director sets once per teacher)
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists subject_id uuid references public.curriculum_subjects (id) on delete set null;

create index if not exists profiles_subject_id_idx on public.profiles (subject_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.teacher_atlas_subject_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.subject_id
  from public.profiles p
  where p.id = auth.uid();
$$;

create or replace function public.teacher_can_log_atlas_session(
  target_class_id uuid,
  target_subject_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.classes c on c.id = target_class_id
    join public.curriculum_subjects cs on cs.id = target_subject_id
    where p.id = auth.uid()
      and p.subject_id = target_subject_id
      and c.school_id = p.school_id
      and c.grade = cs.grade
  );
$$;

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
    or public.teacher_can_log_atlas_session(target_class_id, target_subject_id)
    or public.parent_has_child_in_class(target_class_id);
$$;

create or replace function public.can_edit_atlas_session(target_session_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sess record;
begin
  select s.* into v_sess
  from public.atlas_lesson_sessions s
  where s.id = target_session_id;

  if v_sess.id is null then
    return false;
  end if;

  if public.is_director() then
    return true;
  end if;

  if v_sess.taken_by = auth.uid() then
    return public.teacher_can_log_atlas_session(v_sess.class_id, v_sess.subject_id);
  end if;

  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: save attendance — profile subject instead of teacher_assignments
-- ---------------------------------------------------------------------------

create or replace function public.save_atlas_lesson_attendance(
  p_class_id uuid,
  p_subject_id uuid,
  p_session_date date,
  p_slot_index smallint,
  p_week_index integer,
  p_unit_id uuid,
  p_records jsonb,
  p_session_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_caller_school uuid;
  v_session_id uuid;
  rec jsonb;
  v_student_id uuid;
  v_status text;
begin
  if p_session_date is null or p_slot_index is null then
    raise exception 'Tarih ve ders saati gerekli.';
  end if;

  if p_slot_index < 1 or p_slot_index > 4 then
    raise exception 'Ders saati 1–4 arasında olmalı.';
  end if;

  if p_week_index is null then
    raise exception 'Hafta bilgisi gerekli.';
  end if;

  if p_records is null or jsonb_typeof(p_records) is distinct from 'array' then
    raise exception 'Yoklama listesi gerekli.';
  end if;

  select c.school_id into v_school_id from public.classes c where c.id = p_class_id;
  if v_school_id is null then
    raise exception 'Şube bulunamadı.';
  end if;

  if not public.school_has_atlas_schedule(v_school_id) then
    raise exception 'Atlas ders modu bu okul için etkin değil.';
  end if;

  select p.school_id into v_caller_school from public.profiles p where p.id = auth.uid();
  if v_caller_school is distinct from v_school_id then
    raise exception 'Bu işlem için yetkiniz bulunmuyor.';
  end if;

  if not public.is_director() then
    if not public.teacher_can_log_atlas_session(p_class_id, p_subject_id) then
      raise exception 'Bu şube ve ders için yetkiniz yok. Müdürden branş ataması isteyin.';
    end if;
  end if;

  if p_session_id is not null then
    select id into v_session_id
    from public.atlas_lesson_sessions
    where id = p_session_id
      and taken_by = auth.uid()
      and class_id = p_class_id;

    if v_session_id is null and not public.is_director() then
      raise exception 'Bu oturumu düzenleyemezsiniz.';
    end if;
  end if;

  if v_session_id is null then
    insert into public.atlas_lesson_sessions (
      school_id, class_id, subject_id, slot_index, session_date,
      taken_by, week_index, unit_id
    )
    values (
      v_school_id, p_class_id, p_subject_id, p_slot_index, p_session_date,
      auth.uid(), p_week_index, p_unit_id
    )
    on conflict (class_id, session_date, slot_index)
    do update set
      subject_id = excluded.subject_id,
      taken_by = excluded.taken_by,
      week_index = excluded.week_index,
      unit_id = excluded.unit_id,
      updated_at = now()
    where public.can_edit_atlas_session(atlas_lesson_sessions.id)
    returning id into v_session_id;

    if v_session_id is null then
      select id into v_session_id
      from public.atlas_lesson_sessions
      where class_id = p_class_id
        and session_date = p_session_date
        and slot_index = p_slot_index;
      if v_session_id is null then
        raise exception 'Bu ders saati doldurulmuş veya düzenlenemiyor.';
      end if;
    end if;
  else
    update public.atlas_lesson_sessions
    set week_index = p_week_index,
        unit_id = p_unit_id,
        updated_at = now()
    where id = v_session_id;
  end if;

  delete from public.atlas_lesson_attendance where session_id = v_session_id;

  for rec in select * from jsonb_array_elements(p_records)
  loop
    v_student_id := (rec ->> 'student_id')::uuid;
    v_status := rec ->> 'status';
    if v_student_id is null or v_status is null then
      continue;
    end if;
    insert into public.atlas_lesson_attendance (session_id, student_id, status)
    values (v_session_id, v_student_id, v_status::public.attendance_status);
  end loop;

  return v_session_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: missed-day prompts — classes matching teacher profile subject grade
-- ---------------------------------------------------------------------------

create or replace function public.generate_atlas_missed_day_prompts(p_prompt_date date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher record;
  v_empty jsonb;
  v_count integer := 0;
  v_has_sessions boolean;
  v_class record;
  v_slot smallint;
  v_class_label text;
  v_subject_grade smallint;
begin
  for v_teacher in
    select p.id as teacher_id, p.school_id, p.subject_id
    from public.profiles p
    join public.schools s on s.id = p.school_id
    where public.school_has_atlas_schedule(p.school_id)
      and p.role = 'teacher'
      and p.subject_id is not null
  loop
    select cs.grade into v_subject_grade
    from public.curriculum_subjects cs
    where cs.id = v_teacher.subject_id;

    if v_subject_grade is null then
      continue;
    end if;

    if exists (
      select 1 from public.atlas_teacher_day_responses r
      where r.teacher_id = v_teacher.teacher_id
        and r.response_date = p_prompt_date
    ) then
      continue;
    end if;

    select exists (
      select 1 from public.atlas_lesson_sessions sess
      where sess.taken_by = v_teacher.teacher_id
        and sess.session_date = p_prompt_date
    ) into v_has_sessions;

    if v_has_sessions then
      continue;
    end if;

    v_empty := '[]'::jsonb;

    for v_class in
      select c.id as class_id, c.grade, c.name
      from public.classes c
      where c.school_id = v_teacher.school_id
        and c.grade = v_subject_grade
      order by c.name
    loop
      v_class_label := v_class.grade::text || '-' || v_class.name;
      for v_slot in 1..4 loop
        if not exists (
          select 1 from public.atlas_lesson_sessions s
          where s.class_id = v_class.class_id
            and s.session_date = p_prompt_date
            and s.slot_index = v_slot
        ) then
          v_empty := v_empty || jsonb_build_array(
            jsonb_build_object(
              'class_id', v_class.class_id,
              'slot_index', v_slot,
              'class_label', v_class_label
            )
          );
        end if;
      end loop;
    end loop;

    if jsonb_array_length(v_empty) = 0 then
      continue;
    end if;

    insert into public.atlas_teacher_missed_day_prompts (
      school_id, teacher_id, prompt_date, empty_slots, status
    )
    values (v_teacher.school_id, v_teacher.teacher_id, p_prompt_date, v_empty, 'pending')
    on conflict (teacher_id, prompt_date)
    do update set
      empty_slots = excluded.empty_slots,
      status = case
        when atlas_teacher_missed_day_prompts.status = 'resolved' then 'resolved'
        else 'pending'
      end
    where atlas_teacher_missed_day_prompts.status = 'pending';

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS — profile subject instead of teacher_assignments for Atlas
-- ---------------------------------------------------------------------------

drop policy if exists "Atlas sessions select" on public.atlas_lesson_sessions;
create policy "Atlas sessions select"
  on public.atlas_lesson_sessions for select to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and public.teacher_can_view_atlas_session(class_id, subject_id)
  );

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
          or public.teacher_can_log_atlas_session(sess.class_id, sess.subject_id)
          or public.is_parent_of_student(atlas_lesson_results.student_id)
        )
    )
  );

grant execute on function public.teacher_atlas_subject_id to authenticated;
grant execute on function public.teacher_can_log_atlas_session to authenticated;
grant execute on function public.teacher_can_view_atlas_session to authenticated;

-- ---------------------------------------------------------------------------
-- Demo seed: subject_id on demo teachers (Atlas)
-- ---------------------------------------------------------------------------

do $$
declare
  v_math5 uuid;
  v_fen5 uuid;
  v_turkce5 uuid;
  v_eng5 uuid;
  v_ayse uuid := 'a1000000-0000-4000-8000-000000000001';
  v_fatma uuid := 'a1000000-0000-4000-8000-000000000002';
  v_zeynep uuid := 'a1000000-0000-4000-8000-000000000003';
  v_murat uuid := 'a1000000-0000-4000-8000-000000000004';
begin
  select cs.id into v_math5 from public.curriculum_subjects cs where cs.grade = 5 and cs.slug = 'matematik';
  select cs.id into v_fen5 from public.curriculum_subjects cs where cs.grade = 5 and cs.slug = 'fen';
  select cs.id into v_turkce5 from public.curriculum_subjects cs where cs.grade = 5 and cs.slug = 'turkce';
  select cs.id into v_eng5 from public.curriculum_subjects cs where cs.grade = 5 and cs.slug = 'ingilizce';

  update public.profiles set subject_id = v_math5 where id = v_ayse and v_math5 is not null;
  update public.profiles set subject_id = v_fen5 where id = v_fatma and v_fen5 is not null;
  update public.profiles set subject_id = v_turkce5 where id = v_zeynep and v_turkce5 is not null;
  update public.profiles set subject_id = v_eng5 where id = v_murat and v_eng5 is not null;
end $$;
