-- Yoklama sessions + duration_weeks pacing. Run after 022 and 023.

-- ---------------------------------------------------------------------------
-- Catalog: unit span in academic weeks
-- ---------------------------------------------------------------------------

alter table public.curriculum_units
  add column if not exists duration_weeks smallint not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'curriculum_units_duration_check'
  ) then
    alter table public.curriculum_units
      add constraint curriculum_units_duration_check
      check (duration_weeks between 1 and 20);
  end if;
end $$;

-- 5. sınıf Türkçe: replace 6 placeholders with the 12-week konu calendar.
delete from public.curriculum_units
where subject_id in (
  select id from public.curriculum_subjects where grade = 5 and slug = 'turkce'
);

insert into public.curriculum_units (subject_id, title, sort_order, sections, duration_weeks)
select
  s.id,
  v.title,
  v.sort_order,
  '[]'::jsonb,
  v.duration_weeks
from public.curriculum_subjects s
cross join (
  values
    (1,  'Sözcükte Anlam', 2),
    (2,  'Cümlede Anlam', 2),
    (3,  'Deyim ve Atasözleri', 2),
    (4,  'Paragrafta Anlam', 6),
    (5,  'Hikaye', 3),
    (6,  'Şiir ve Söz Sanatları', 3),
    (7,  'İsimler', 3),
    (8,  'Sıfatlar', 4),
    (9,  'Zamirler', 4),
    (10, 'Yazım - Noktalama', 3),
    (11, 'Görsel Okuma', 2),
    (12, 'Sözel Mantık', 2)
) as v(sort_order, title, duration_weeks)
where s.grade = 5
  and s.slug = 'turkce';

-- Parents need şube labels on the weekly digest.
drop policy if exists "Parents can select own child classes" on public.classes;
create policy "Parents can select own child classes"
  on public.classes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.students s
      join public.student_parents sp on sp.student_id = s.id
      where s.class_id = classes.id
        and sp.parent_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'attendance_status'
  ) then
    create type public.attendance_status as enum ('present', 'absent');
  end if;
end $$;

create table if not exists public.attendance_sessions (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete restrict,
  class_id    uuid not null references public.classes (id) on delete cascade,
  subject_id  uuid not null references public.curriculum_subjects (id) on delete restrict,
  taken_on    date not null,
  taken_by    uuid references public.profiles (id) on delete set null,
  week_index  integer not null,
  unit_id     uuid references public.curriculum_units (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint attendance_sessions_class_subject_date_unique unique (class_id, subject_id, taken_on)
);

create index if not exists attendance_sessions_school_date_idx
  on public.attendance_sessions (school_id, taken_on);

create index if not exists attendance_sessions_class_subject_idx
  on public.attendance_sessions (class_id, subject_id, taken_on);

create table if not exists public.attendance_records (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.attendance_sessions (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  status      public.attendance_status not null,

  constraint attendance_records_session_student_unique unique (session_id, student_id)
);

create index if not exists attendance_records_student_idx
  on public.attendance_records (student_id);

create index if not exists attendance_records_session_idx
  on public.attendance_records (session_id);

create or replace function public.attendance_sessions_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists attendance_sessions_set_updated_at on public.attendance_sessions;
create trigger attendance_sessions_set_updated_at
  before update on public.attendance_sessions
  for each row execute function public.attendance_sessions_touch_updated_at();

create or replace function public.teacher_assigned_to_class_subject(
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
    from public.teacher_assignments ta
    where ta.class_id = target_class_id
      and ta.subject_id = target_subject_id
      and ta.teacher_id = auth.uid()
  );
$$;

create or replace function public.parent_has_child_in_class(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students s
    join public.student_parents sp on sp.student_id = s.id
    where s.class_id = target_class_id
      and sp.parent_id = auth.uid()
  );
$$;

alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;

drop policy if exists "Staff and parents can select attendance sessions" on public.attendance_sessions;
create policy "Staff and parents can select attendance sessions"
  on public.attendance_sessions
  for select
  to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (
      public.is_director()
      or public.teacher_assigned_to_class_subject(class_id, subject_id)
      or public.parent_has_child_in_class(class_id)
    )
  );

drop policy if exists "Staff can insert attendance sessions" on public.attendance_sessions;
create policy "Staff can insert attendance sessions"
  on public.attendance_sessions
  for insert
  to authenticated
  with check (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (
      public.is_director()
      or public.teacher_assigned_to_class_subject(class_id, subject_id)
    )
  );

drop policy if exists "Staff can update attendance sessions" on public.attendance_sessions;
create policy "Staff can update attendance sessions"
  on public.attendance_sessions
  for update
  to authenticated
  using (
    public.is_director()
    or public.teacher_assigned_to_class_subject(class_id, subject_id)
  )
  with check (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (
      public.is_director()
      or public.teacher_assigned_to_class_subject(class_id, subject_id)
    )
  );

drop policy if exists "Staff can delete attendance sessions" on public.attendance_sessions;
create policy "Staff can delete attendance sessions"
  on public.attendance_sessions
  for delete
  to authenticated
  using (
    public.is_director()
    or public.teacher_assigned_to_class_subject(class_id, subject_id)
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
          public.is_director()
          or public.teacher_assigned_to_class_subject(sess.class_id, sess.subject_id)
          or public.is_parent_of_student(attendance_records.student_id)
        )
    )
  );

drop policy if exists "Staff can insert attendance records" on public.attendance_records;
create policy "Staff can insert attendance records"
  on public.attendance_records
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.attendance_sessions sess
      where sess.id = session_id
        and sess.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
        and (
          public.is_director()
          or public.teacher_assigned_to_class_subject(sess.class_id, sess.subject_id)
        )
    )
  );

drop policy if exists "Staff can update attendance records" on public.attendance_records;
create policy "Staff can update attendance records"
  on public.attendance_records
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.attendance_sessions sess
      where sess.id = session_id
        and (
          public.is_director()
          or public.teacher_assigned_to_class_subject(sess.class_id, sess.subject_id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.attendance_sessions sess
      where sess.id = session_id
        and (
          public.is_director()
          or public.teacher_assigned_to_class_subject(sess.class_id, sess.subject_id)
        )
    )
  );

drop policy if exists "Staff can delete attendance records" on public.attendance_records;
create policy "Staff can delete attendance records"
  on public.attendance_records
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.attendance_sessions sess
      where sess.id = session_id
        and (
          public.is_director()
          or public.teacher_assigned_to_class_subject(sess.class_id, sess.subject_id)
        )
    )
  );

grant select, insert, update, delete on public.attendance_sessions to authenticated;
grant select, insert, update, delete on public.attendance_records to authenticated;
grant usage on type public.attendance_status to authenticated;

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
set search_path = public
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
    if not exists (
      select 1
      from public.teacher_assignments ta
      where ta.teacher_id = auth.uid()
        and ta.class_id = p_class_id
        and ta.subject_id = p_subject_id
        and public.is_teacher()
    ) then
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

grant execute on function public.teacher_assigned_to_class_subject(uuid, uuid) to authenticated;
grant execute on function public.parent_has_child_in_class(uuid) to authenticated;
grant execute on function public.save_class_attendance(uuid, uuid, date, integer, uuid, jsonb) to authenticated;
