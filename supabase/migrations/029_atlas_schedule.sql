-- Atlas flexible schedule: 4-slot lessons, assessment types, alerts.
-- Run after 028.

-- ---------------------------------------------------------------------------
-- School feature flag
-- ---------------------------------------------------------------------------

alter table public.schools
  add column if not exists features jsonb not null default '{}'::jsonb;

-- Enable for demo school (Atlas testing)
update public.schools
set features = coalesce(features, '{}'::jsonb) || '{"atlas_schedule": true}'::jsonb
where school_code = 'DEMO123';

-- ---------------------------------------------------------------------------
-- Co-teachers: multiple teachers per class × subject
-- ---------------------------------------------------------------------------

alter table public.teacher_assignments
  drop constraint if exists teacher_assignments_class_subject_unique;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'atlas_lesson_type') then
    create type public.atlas_lesson_type as enum ('lecture', 'practice');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assessment types (director-configurable)
-- ---------------------------------------------------------------------------

create table if not exists public.assessment_types (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  name        text not null,
  slug        text not null,
  sort_order  smallint not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint assessment_types_school_slug_unique unique (school_id, slug)
);

create index if not exists assessment_types_school_idx
  on public.assessment_types (school_id, sort_order);

-- ---------------------------------------------------------------------------
-- Atlas lesson sessions
-- ---------------------------------------------------------------------------

create table if not exists public.atlas_lesson_sessions (
  id                   uuid primary key default gen_random_uuid(),
  school_id            uuid not null references public.schools (id) on delete restrict,
  class_id             uuid not null references public.classes (id) on delete cascade,
  subject_id           uuid not null references public.curriculum_subjects (id) on delete restrict,
  slot_index           smallint not null,
  session_date         date not null,
  taken_by             uuid not null references public.profiles (id) on delete restrict,
  week_index           integer not null,
  unit_id              uuid references public.curriculum_units (id) on delete set null,
  lesson_type          public.atlas_lesson_type,
  assessment_type_id   uuid references public.assessment_types (id) on delete set null,
  questions_total      integer,
  activity_completed_at timestamptz,
  activity_dismissed_at timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint atlas_lesson_sessions_slot_check check (slot_index between 1 and 4),
  constraint atlas_lesson_sessions_class_date_slot_unique unique (class_id, session_date, slot_index),
  constraint atlas_lesson_sessions_questions_nonneg check (questions_total is null or questions_total >= 0)
);

create index if not exists atlas_lesson_sessions_school_date_idx
  on public.atlas_lesson_sessions (school_id, session_date);

create index if not exists atlas_lesson_sessions_class_date_idx
  on public.atlas_lesson_sessions (class_id, session_date);

create index if not exists atlas_lesson_sessions_taken_by_date_idx
  on public.atlas_lesson_sessions (taken_by, session_date);

create index if not exists atlas_lesson_sessions_week_idx
  on public.atlas_lesson_sessions (school_id, week_index);

create table if not exists public.atlas_lesson_attendance (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.atlas_lesson_sessions (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  status      public.attendance_status not null,

  constraint atlas_lesson_attendance_session_student_unique unique (session_id, student_id)
);

create index if not exists atlas_lesson_attendance_session_idx
  on public.atlas_lesson_attendance (session_id);

create table if not exists public.atlas_lesson_results (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.atlas_lesson_sessions (id) on delete cascade,
  student_id   uuid not null references public.students (id) on delete cascade,
  wrong_count  integer not null default 0,
  blank_count  integer not null default 0,

  constraint atlas_lesson_results_session_student_unique unique (session_id, student_id),
  constraint atlas_lesson_results_wrong_nonneg check (wrong_count >= 0),
  constraint atlas_lesson_results_blank_nonneg check (blank_count >= 0)
);

create table if not exists public.atlas_teacher_day_responses (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id) on delete cascade,
  teacher_id    uuid not null references public.profiles (id) on delete cascade,
  response_date date not null,
  response      text not null default 'was_absent',
  created_at    timestamptz not null default now(),

  constraint atlas_teacher_day_responses_unique unique (teacher_id, response_date)
);

create table if not exists public.atlas_teacher_missed_day_prompts (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools (id) on delete cascade,
  teacher_id   uuid not null references public.profiles (id) on delete cascade,
  prompt_date  date not null,
  empty_slots  jsonb not null default '[]'::jsonb,
  status       text not null default 'pending',
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,

  constraint atlas_teacher_missed_day_prompts_unique unique (teacher_id, prompt_date),
  constraint atlas_teacher_missed_day_prompts_status_check check (status in ('pending', 'resolved'))
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.atlas_lesson_sessions_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists atlas_lesson_sessions_set_updated_at on public.atlas_lesson_sessions;
create trigger atlas_lesson_sessions_set_updated_at
  before update on public.atlas_lesson_sessions
  for each row execute function public.atlas_lesson_sessions_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.school_has_atlas_schedule(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (s.features ->> 'atlas_schedule')::boolean from public.schools s where s.id = target_school_id),
    false
  );
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
    return public.teacher_assigned_to_class_subject(v_sess.class_id, v_sess.subject_id);
  end if;

  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: save attendance (Step A)
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
    if not exists (
      select 1 from public.teacher_assignments ta
      where ta.teacher_id = auth.uid()
        and ta.class_id = p_class_id
        and ta.subject_id = p_subject_id
    ) then
      raise exception 'Bu şube ve ders için atamanız yok.';
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
-- RPC: save activity (Step B)
-- ---------------------------------------------------------------------------

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
  select * into v_sess from public.atlas_lesson_sessions where id = p_session_id;
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

  update public.atlas_lesson_sessions
  set lesson_type = p_lesson_type,
      assessment_type_id = case when p_lesson_type = 'practice' then p_assessment_type_id else null end,
      questions_total = case when p_lesson_type = 'practice' then p_questions_total else null end,
      activity_completed_at = now(),
      activity_dismissed_at = null,
      updated_at = now()
  where id = p_session_id;

  delete from public.atlas_lesson_results where session_id = p_session_id;

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
        select 1 from public.atlas_lesson_attendance a
        where a.session_id = p_session_id
          and a.student_id = v_student_id
          and a.status = 'present'
      ) then
        continue;
      end if;
      insert into public.atlas_lesson_results (session_id, student_id, wrong_count, blank_count)
      values (p_session_id, v_student_id, v_wrong, v_blank);
    end loop;
  end if;

  return p_session_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: dismiss activity → Konu Anlatımı
-- ---------------------------------------------------------------------------

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

  update public.atlas_lesson_sessions
  set lesson_type = 'lecture',
      assessment_type_id = null,
      questions_total = null,
      activity_completed_at = now(),
      activity_dismissed_at = now(),
      updated_at = now()
  where id = p_session_id;

  delete from public.atlas_lesson_results where session_id = p_session_id;

  return p_session_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: teacher was absent (missed-day prompt)
-- ---------------------------------------------------------------------------

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

  insert into public.atlas_teacher_day_responses (school_id, teacher_id, response_date, response)
  values (v_school_id, auth.uid(), p_response_date, 'was_absent')
  on conflict (teacher_id, response_date) do nothing;

  update public.atlas_teacher_missed_day_prompts
  set status = 'resolved', resolved_at = now()
  where teacher_id = auth.uid()
    and prompt_date = p_response_date
    and status = 'pending';
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: generate missed-day prompts (cron @ 20:00 Istanbul)
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
begin
  for v_teacher in
    select distinct ta.teacher_id, p.school_id
    from public.teacher_assignments ta
    join public.profiles p on p.id = ta.teacher_id
    join public.schools s on s.id = p.school_id
    where public.school_has_atlas_schedule(p.school_id)
      and p.role = 'teacher'
  loop
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
      select distinct ta.class_id, c.grade, c.name
      from public.teacher_assignments ta
      join public.classes c on c.id = ta.class_id
      where ta.teacher_id = v_teacher.teacher_id
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

-- Seed default assessment types for Atlas schools
insert into public.assessment_types (school_id, name, slug, sort_order)
select s.id, v.name, v.slug, v.sort_order
from public.schools s
cross join (
  values ('Quiz', 'quiz', 1), ('Konu Ölçme', 'konu_olcme', 2)
) as v(name, slug, sort_order)
where public.school_has_atlas_schedule(s.id)
on conflict (school_id, slug) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.assessment_types enable row level security;
alter table public.atlas_lesson_sessions enable row level security;
alter table public.atlas_lesson_attendance enable row level security;
alter table public.atlas_lesson_results enable row level security;
alter table public.atlas_teacher_day_responses enable row level security;
alter table public.atlas_teacher_missed_day_prompts enable row level security;

drop policy if exists "Staff can select assessment types" on public.assessment_types;
create policy "Staff can select assessment types"
  on public.assessment_types for select to authenticated
  using (school_id = (select p.school_id from public.profiles p where p.id = auth.uid()));

drop policy if exists "Directors manage assessment types" on public.assessment_types;
create policy "Directors manage assessment types"
  on public.assessment_types for all to authenticated
  using (public.is_director() and school_id = (select p.school_id from public.profiles p where p.id = auth.uid()))
  with check (public.is_director() and school_id = (select p.school_id from public.profiles p where p.id = auth.uid()));

drop policy if exists "Atlas sessions select" on public.atlas_lesson_sessions;
create policy "Atlas sessions select"
  on public.atlas_lesson_sessions for select to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (
      public.is_director()
      or public.teacher_assigned_to_class_subject(class_id, subject_id)
      or public.parent_has_child_in_class(class_id)
    )
  );

drop policy if exists "Atlas sessions insert" on public.atlas_lesson_sessions;
create policy "Atlas sessions insert"
  on public.atlas_lesson_sessions for insert to authenticated
  with check (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (public.is_director() or taken_by = auth.uid())
  );

drop policy if exists "Atlas sessions update" on public.atlas_lesson_sessions;
create policy "Atlas sessions update"
  on public.atlas_lesson_sessions for update to authenticated
  using (public.can_edit_atlas_session(id))
  with check (school_id = (select p.school_id from public.profiles p where p.id = auth.uid()));

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
          or public.teacher_assigned_to_class_subject(sess.class_id, sess.subject_id)
          or public.is_parent_of_student(atlas_lesson_attendance.student_id)
        )
    )
  );

drop policy if exists "Atlas attendance write" on public.atlas_lesson_attendance;
create policy "Atlas attendance write"
  on public.atlas_lesson_attendance for all to authenticated
  using (
    exists (
      select 1 from public.atlas_lesson_sessions sess
      where sess.id = session_id and public.can_edit_atlas_session(sess.id)
    )
  )
  with check (
    exists (
      select 1 from public.atlas_lesson_sessions sess
      where sess.id = session_id and public.can_edit_atlas_session(sess.id)
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
          or public.teacher_assigned_to_class_subject(sess.class_id, sess.subject_id)
          or public.is_parent_of_student(atlas_lesson_results.student_id)
        )
    )
  );

drop policy if exists "Atlas results write" on public.atlas_lesson_results;
create policy "Atlas results write"
  on public.atlas_lesson_results for all to authenticated
  using (
    exists (
      select 1 from public.atlas_lesson_sessions sess
      where sess.id = session_id and public.can_edit_atlas_session(sess.id)
    )
  )
  with check (
    exists (
      select 1 from public.atlas_lesson_sessions sess
      where sess.id = session_id and public.can_edit_atlas_session(sess.id)
    )
  );

drop policy if exists "Teachers select own day responses" on public.atlas_teacher_day_responses;
create policy "Teachers select own day responses"
  on public.atlas_teacher_day_responses for select to authenticated
  using (teacher_id = auth.uid() or public.is_director());

drop policy if exists "Teachers insert own day responses" on public.atlas_teacher_day_responses;
create policy "Teachers insert own day responses"
  on public.atlas_teacher_day_responses for insert to authenticated
  with check (teacher_id = auth.uid());

drop policy if exists "Teachers select own missed prompts" on public.atlas_teacher_missed_day_prompts;
create policy "Teachers select own missed prompts"
  on public.atlas_teacher_missed_day_prompts for select to authenticated
  using (teacher_id = auth.uid() or public.is_director());

drop policy if exists "Teachers update own missed prompts" on public.atlas_teacher_missed_day_prompts;
create policy "Teachers update own missed prompts"
  on public.atlas_teacher_missed_day_prompts for update to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

grant select, insert, update, delete on public.assessment_types to authenticated;
grant select, insert, update, delete on public.atlas_lesson_sessions to authenticated;
grant select, insert, update, delete on public.atlas_lesson_attendance to authenticated;
grant select, insert, update, delete on public.atlas_lesson_results to authenticated;
grant select, insert on public.atlas_teacher_day_responses to authenticated;
grant select, update on public.atlas_teacher_missed_day_prompts to authenticated;

grant execute on function public.save_atlas_lesson_attendance to authenticated;
grant execute on function public.save_atlas_lesson_activity to authenticated;
grant execute on function public.dismiss_atlas_lesson_activity to authenticated;
grant execute on function public.save_atlas_teacher_day_response to authenticated;
grant execute on function public.generate_atlas_missed_day_prompts to authenticated;
