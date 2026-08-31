-- Rename atlas_* lesson-module tables to generic names (metadata only; rows stay put).
-- Recreate plpgsql functions whose source still hardcodes the old table names.
-- Compatibility views keep old PostgREST paths working until 048 drops them.
-- Run after 046. Do not edit historical 029/030/040/046 files.

-- ---------------------------------------------------------------------------
-- Rename tables (skip if already renamed)
-- ---------------------------------------------------------------------------

do $$
declare
  pair text[];
  old_name text;
  new_name text;
  old_is_table boolean;
  new_exists boolean;
  pairs text[][] := array[
    array['atlas_lesson_sessions', 'lesson_sessions'],
    array['atlas_lesson_attendance', 'lesson_attendance'],
    array['atlas_lesson_results', 'lesson_results'],
    array['atlas_teacher_day_responses', 'teacher_day_responses'],
    array['atlas_teacher_missed_day_prompts', 'teacher_missed_day_prompts']
  ];
begin
  foreach pair slice 1 in array pairs
  loop
    old_name := pair[1];
    new_name := pair[2];

    select exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = old_name and c.relkind = 'r'
    ) into old_is_table;

    select exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = new_name
    ) into new_exists;

    if old_is_table and new_exists then
      raise exception 'Cannot rename public.%: public.% already exists', old_name, new_name;
    elsif old_is_table then
      execute format('alter table public.%I rename to %I', old_name, new_name);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Recreate functions (latest bodies from 030 / 029 / 040, new table names)
-- ---------------------------------------------------------------------------

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
  from public.lesson_sessions s
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
    from public.lesson_sessions
    where id = p_session_id
      and taken_by = auth.uid()
      and class_id = p_class_id;

    if v_session_id is null and not public.is_director() then
      raise exception 'Bu oturumu düzenleyemezsiniz.';
    end if;
  end if;

  if v_session_id is null then
    insert into public.lesson_sessions (
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
    where public.can_edit_atlas_session(lesson_sessions.id)
    returning id into v_session_id;

    if v_session_id is null then
      select id into v_session_id
      from public.lesson_sessions
      where class_id = p_class_id
        and session_date = p_session_date
        and slot_index = p_slot_index;
      if v_session_id is null then
        raise exception 'Bu ders saati doldurulmuş veya düzenlenemiyor.';
      end if;
    end if;
  else
    update public.lesson_sessions
    set week_index = p_week_index,
        unit_id = p_unit_id,
        updated_at = now()
    where id = v_session_id;
  end if;

  delete from public.lesson_attendance where session_id = v_session_id;

  for rec in select * from jsonb_array_elements(p_records)
  loop
    v_student_id := (rec ->> 'student_id')::uuid;
    v_status := rec ->> 'status';
    if v_student_id is null or v_status is null then
      continue;
    end if;
    insert into public.lesson_attendance (session_id, student_id, status)
    values (v_session_id, v_student_id, v_status::public.attendance_status);
  end loop;

  return v_session_id;
end;
$$;

create or replace function public.save_atlas_lesson_activity(
  p_session_id uuid,
  p_lesson_type public.atlas_lesson_type,
  p_assessment_type_id uuid default null,
  p_questions_total integer default null,
  p_results jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sess record;
  rec jsonb;
  v_student_id uuid;
  v_wrong integer;
  v_blank integer;
  v_total integer;
begin
  select * into v_sess from public.lesson_sessions where id = p_session_id;
  if v_sess.id is null then
    raise exception 'Oturum bulunamadı.';
  end if;

  if not public.can_edit_atlas_session(p_session_id) then
    raise exception 'Bu oturumu düzenleyemezsiniz.';
  end if;

  if p_lesson_type = 'practice' then
    if p_questions_total is null or p_questions_total < 1 then
      raise exception 'Test için soru sayısı gerekli.';
    end if;
    if p_assessment_type_id is null then
      raise exception 'Değerlendirme türü gerekli.';
    end if;
  end if;

  update public.lesson_sessions
  set lesson_type = p_lesson_type,
      assessment_type_id = case when p_lesson_type = 'practice' then p_assessment_type_id else null end,
      questions_total = case when p_lesson_type = 'practice' then p_questions_total else null end,
      activity_completed_at = now(),
      activity_dismissed_at = null,
      updated_at = now()
  where id = p_session_id;

  delete from public.lesson_results where session_id = p_session_id;

  if p_lesson_type = 'practice' then
    v_total := p_questions_total;
    for rec in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb))
    loop
      v_student_id := (rec ->> 'student_id')::uuid;
      v_wrong := coalesce((rec ->> 'wrong_count')::integer, 0);
      v_blank := coalesce((rec ->> 'blank_count')::integer, 0);
      if v_student_id is null then continue; end if;
      if v_wrong + v_blank > v_total then
        raise exception 'Yanlış + boş toplamı soru sayısını aşamaz.';
      end if;
      if not exists (
        select 1 from public.lesson_attendance a
        where a.session_id = p_session_id
          and a.student_id = v_student_id
          and a.status = 'present'
      ) then
        continue;
      end if;
      insert into public.lesson_results (session_id, student_id, wrong_count, blank_count)
      values (p_session_id, v_student_id, v_wrong, v_blank);
    end loop;
  end if;

  return p_session_id;
end;
$$;

create or replace function public.dismiss_atlas_lesson_activity(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_atlas_session(p_session_id) then
    raise exception 'Bu oturumu düzenleyemezsiniz.';
  end if;

  update public.lesson_sessions
  set lesson_type = 'lecture',
      assessment_type_id = null,
      questions_total = null,
      activity_completed_at = now(),
      activity_dismissed_at = now(),
      updated_at = now()
  where id = p_session_id;

  delete from public.lesson_results where session_id = p_session_id;

  return p_session_id;
end;
$$;

create or replace function public.save_atlas_teacher_day_response(p_response_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
begin
  select school_id into v_school_id from public.profiles where id = auth.uid();
  if v_school_id is null then
    raise exception 'Okul bulunamadı.';
  end if;

  insert into public.teacher_day_responses (school_id, teacher_id, response_date, response)
  values (v_school_id, auth.uid(), p_response_date, 'was_absent')
  on conflict (teacher_id, response_date) do nothing;

  update public.teacher_missed_day_prompts
  set status = 'resolved', resolved_at = now()
  where teacher_id = auth.uid()
    and prompt_date = p_response_date
    and status = 'pending';
end;
$$;

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
begin
  for v_teacher in
    select p.id as teacher_id, p.school_id, p.subject_slug, p.subject_id
    from public.profiles p
    join public.schools s on s.id = p.school_id
    where public.school_has_atlas_schedule(p.school_id)
      and p.role = 'teacher'
      and (p.subject_slug is not null or p.subject_id is not null)
  loop
    if exists (
      select 1 from public.teacher_day_responses r
      where r.teacher_id = v_teacher.teacher_id
        and r.response_date = p_prompt_date
    ) then
      continue;
    end if;

    select exists (
      select 1 from public.lesson_sessions sess
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
        and (
          v_teacher.subject_slug is not null
          or c.grade = (
            select cs.grade
            from public.curriculum_subjects cs
            where cs.id = v_teacher.subject_id
          )
        )
      order by c.grade, c.name
    loop
      v_class_label := v_class.grade::text || '-' || v_class.name;
      for v_slot in 1..4 loop
        if not exists (
          select 1 from public.lesson_sessions s
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

    insert into public.teacher_missed_day_prompts (
      school_id, teacher_id, prompt_date, empty_slots, status
    )
    values (v_teacher.school_id, v_teacher.teacher_id, p_prompt_date, v_empty, 'pending')
    on conflict (teacher_id, prompt_date)
    do update set
      empty_slots = excluded.empty_slots,
      status = case
        when teacher_missed_day_prompts.status = 'resolved' then 'resolved'
        else 'pending'
      end
    where teacher_missed_day_prompts.status = 'pending';

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Re-bind RLS to the renamed tables (latest 030/046 rules, new relation names)
-- ---------------------------------------------------------------------------

drop policy if exists "Atlas sessions select" on public.lesson_sessions;
create policy "Atlas sessions select"
  on public.lesson_sessions for select to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and public.teacher_can_view_atlas_session(class_id, subject_id)
  );

drop policy if exists "Atlas sessions insert" on public.lesson_sessions;
create policy "Atlas sessions insert"
  on public.lesson_sessions for insert to authenticated
  with check (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (public.is_director() or taken_by = auth.uid())
  );

drop policy if exists "Atlas sessions update" on public.lesson_sessions;
create policy "Atlas sessions update"
  on public.lesson_sessions for update to authenticated
  using (public.can_edit_atlas_session(id))
  with check (school_id = (select p.school_id from public.profiles p where p.id = auth.uid()));

drop policy if exists "Atlas attendance select" on public.lesson_attendance;
create policy "Atlas attendance select"
  on public.lesson_attendance for select to authenticated
  using (
    exists (
      select 1 from public.lesson_sessions sess
      where sess.id = session_id
        and sess.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
        and (
          public.is_director()
          or public.is_counselor()
          or public.teacher_can_log_atlas_session(sess.class_id, sess.subject_id)
          or public.is_parent_of_student(lesson_attendance.student_id)
        )
    )
  );

drop policy if exists "Atlas attendance write" on public.lesson_attendance;
create policy "Atlas attendance write"
  on public.lesson_attendance for all to authenticated
  using (
    exists (
      select 1 from public.lesson_sessions sess
      where sess.id = session_id and public.can_edit_atlas_session(sess.id)
    )
  )
  with check (
    exists (
      select 1 from public.lesson_sessions sess
      where sess.id = session_id and public.can_edit_atlas_session(sess.id)
    )
  );

drop policy if exists "Atlas results select" on public.lesson_results;
create policy "Atlas results select"
  on public.lesson_results for select to authenticated
  using (
    exists (
      select 1 from public.lesson_sessions sess
      where sess.id = session_id
        and sess.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
        and (
          public.is_director()
          or public.is_counselor()
          or public.teacher_can_log_atlas_session(sess.class_id, sess.subject_id)
          or public.is_parent_of_student(lesson_results.student_id)
        )
    )
  );

drop policy if exists "Atlas results write" on public.lesson_results;
create policy "Atlas results write"
  on public.lesson_results for all to authenticated
  using (
    exists (
      select 1 from public.lesson_sessions sess
      where sess.id = session_id and public.can_edit_atlas_session(sess.id)
    )
  )
  with check (
    exists (
      select 1 from public.lesson_sessions sess
      where sess.id = session_id and public.can_edit_atlas_session(sess.id)
    )
  );

drop policy if exists "Teachers select own day responses" on public.teacher_day_responses;
create policy "Teachers select own day responses"
  on public.teacher_day_responses for select to authenticated
  using (teacher_id = auth.uid() or public.is_director());

drop policy if exists "Teachers insert own day responses" on public.teacher_day_responses;
create policy "Teachers insert own day responses"
  on public.teacher_day_responses for insert to authenticated
  with check (teacher_id = auth.uid());

drop policy if exists "Teachers select own missed prompts" on public.teacher_missed_day_prompts;
create policy "Teachers select own missed prompts"
  on public.teacher_missed_day_prompts for select to authenticated
  using (teacher_id = auth.uid() or public.is_director());

drop policy if exists "Teachers update own missed prompts" on public.teacher_missed_day_prompts;
create policy "Teachers update own missed prompts"
  on public.teacher_missed_day_prompts for update to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Updatable aliases so old .from('atlas_*') clients keep working
-- security_invoker: underlying table RLS still applies as the current user
-- ---------------------------------------------------------------------------

drop view if exists public.atlas_lesson_sessions;
drop view if exists public.atlas_lesson_attendance;
drop view if exists public.atlas_lesson_results;
drop view if exists public.atlas_teacher_day_responses;
drop view if exists public.atlas_teacher_missed_day_prompts;

create view public.atlas_lesson_sessions
  with (security_invoker = true)
  as select * from public.lesson_sessions;

create view public.atlas_lesson_attendance
  with (security_invoker = true)
  as select * from public.lesson_attendance;

create view public.atlas_lesson_results
  with (security_invoker = true)
  as select * from public.lesson_results;

create view public.atlas_teacher_day_responses
  with (security_invoker = true)
  as select * from public.teacher_day_responses;

create view public.atlas_teacher_missed_day_prompts
  with (security_invoker = true)
  as select * from public.teacher_missed_day_prompts;

grant select, insert, update, delete on public.lesson_sessions to authenticated;
grant select, insert, update, delete on public.lesson_attendance to authenticated;
grant select, insert, update, delete on public.lesson_results to authenticated;
grant select, insert on public.teacher_day_responses to authenticated;
grant select, update on public.teacher_missed_day_prompts to authenticated;

grant select, insert, update, delete on public.atlas_lesson_sessions to authenticated;
grant select, insert, update, delete on public.atlas_lesson_attendance to authenticated;
grant select, insert, update, delete on public.atlas_lesson_results to authenticated;
grant select, insert on public.atlas_teacher_day_responses to authenticated;
grant select, update on public.atlas_teacher_missed_day_prompts to authenticated;

notify pgrst, 'reload schema';
