-- Exam tracking: MEB ortak sınavlar + deneme sonuçları.

-- ---------------------------------------------------------------------------
-- calendar_event_type: common_exam
-- ---------------------------------------------------------------------------

alter type public.calendar_event_type add value if not exists 'common_exam';

alter table public.calendar_events
  add column if not exists exam_kind text,
  add column if not exists exam_subject text,
  add column if not exists exam_term smallint,
  add column if not exists exam_round smallint;

alter table public.calendar_events
  drop constraint if exists calendar_events_exam_term_check;

alter table public.calendar_events
  add constraint calendar_events_exam_term_check
  check (exam_term is null or exam_term in (1, 2));

alter table public.calendar_events
  drop constraint if exists calendar_events_exam_round_check;

alter table public.calendar_events
  add constraint calendar_events_exam_round_check
  check (exam_round is null or exam_round in (1, 2));

alter table public.calendar_events
  drop constraint if exists calendar_events_exam_kind_check;

alter table public.calendar_events
  add constraint calendar_events_exam_kind_check
  check (exam_kind is null or exam_kind in ('common', 'mock'));

-- ---------------------------------------------------------------------------
-- exam_sessions + exam_student_results
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'exam_kind') then
    create type public.exam_kind as enum ('common', 'mock');
  end if;
end $$;

create table if not exists public.exam_sessions (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools (id) on delete restrict,
  kind             public.exam_kind not null,
  calendar_event_id uuid references public.calendar_events (id) on delete set null,
  title            text not null,
  held_on          date not null,
  audience_grades  smallint[],
  results_enabled  boolean not null default true,
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint exam_sessions_grades_check check (
    audience_grades is null
    or audience_grades <@ array[5, 6, 7, 8]::smallint[]
  )
);

create index if not exists exam_sessions_school_held_idx
  on public.exam_sessions (school_id, held_on desc);

create index if not exists exam_sessions_calendar_idx
  on public.exam_sessions (calendar_event_id)
  where calendar_event_id is not null;

create table if not exists public.exam_student_results (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.exam_sessions (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  subject     text,
  net         numeric(6, 2),
  score       numeric(6, 2),
  note        text,
  updated_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint exam_student_results_unique unique (session_id, student_id, subject)
);

create index if not exists exam_student_results_session_idx
  on public.exam_student_results (session_id);

create index if not exists exam_student_results_student_idx
  on public.exam_student_results (student_id);

create or replace function public.exam_sessions_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists exam_sessions_set_updated_at on public.exam_sessions;
create trigger exam_sessions_set_updated_at
  before update on public.exam_sessions
  for each row execute function public.exam_sessions_touch_updated_at();

create or replace function public.exam_student_results_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists exam_student_results_set_updated_at on public.exam_student_results;
create trigger exam_student_results_set_updated_at
  before insert or update on public.exam_student_results
  for each row execute function public.exam_student_results_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.exam_sessions enable row level security;
alter table public.exam_student_results enable row level security;

drop policy if exists "School members can select exam sessions" on public.exam_sessions;
create policy "School members can select exam sessions"
  on public.exam_sessions
  for select
  to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "Staff can manage exam sessions" on public.exam_sessions;
create policy "Staff can manage exam sessions"
  on public.exam_sessions
  for all
  to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (public.is_director() or public.is_teacher())
  )
  with check (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (public.is_director() or public.is_teacher())
  );

drop policy if exists "Staff can read all exam results" on public.exam_student_results;
create policy "Staff can read all exam results"
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
        and (public.is_director() or public.is_teacher())
    )
  );

drop policy if exists "Parents read published exam results" on public.exam_student_results;
create policy "Parents read published exam results"
  on public.exam_student_results
  for select
  to authenticated
  using (
    public.is_parent_of_student(student_id)
    and exists (
      select 1
      from public.exam_sessions es
      where es.id = exam_student_results.session_id
        and es.published_at is not null
    )
  );

drop policy if exists "Staff can manage exam results" on public.exam_student_results;
create policy "Staff can manage exam results"
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
        and (public.is_director() or public.is_teacher())
    )
  )
  with check (
    exists (
      select 1
      from public.exam_sessions es
      join public.profiles p on p.id = auth.uid()
      where es.id = exam_student_results.session_id
        and es.school_id = p.school_id
        and (public.is_director() or public.is_teacher())
    )
  );

grant select, insert, update, delete on public.exam_sessions to authenticated;
grant select, insert, update, delete on public.exam_student_results to authenticated;

-- ---------------------------------------------------------------------------
-- Seed MEB ortak sınav events (idempotent)
-- ---------------------------------------------------------------------------

insert into public.calendar_events (
  school_id,
  title,
  body,
  event_type,
  starts_on,
  ends_on,
  starts_at,
  audience_grades,
  notify,
  source,
  exam_kind,
  exam_subject,
  exam_term,
  exam_round
)
select
  s.id,
  catalog.title,
  catalog.body,
  catalog.event_type::public.calendar_event_type,
  catalog.starts_on,
  catalog.ends_on,
  catalog.starts_at,
  catalog.audience_grades,
  catalog.notify,
  'meb-2026',
  catalog.exam_kind,
  catalog.exam_subject,
  catalog.exam_term,
  catalog.exam_round
from public.schools s
cross join (
  values
    ('7. sınıf Türkçe ortak yazılı', 'MEB ülke geneli ortak yazılı sınavı — 1. dönem 1. yazılı.', 'common_exam', '2025-11-04'::date, '2025-11-04'::date, null::time, ARRAY[7]::smallint[], true, 'common', 'Türkçe', 1::smallint, 1::smallint),
    ('8. sınıf Türkçe ortak yazılı', 'MEB ülke geneli ortak yazılı sınavı — 1. dönem 1. yazılı.', 'common_exam', '2025-11-05'::date, '2025-11-05'::date, null::time, ARRAY[8]::smallint[], true, 'common', 'Türkçe', 1::smallint, 1::smallint),
    ('6. sınıf Türkçe ortak yazılı', 'MEB ülke geneli ortak yazılı sınavı — 2. dönem 1. yazılı.', 'common_exam', '2026-04-07'::date, '2026-04-07'::date, null::time, ARRAY[6]::smallint[], true, 'common', 'Türkçe', 2::smallint, 1::smallint),
    ('6. ve 8. sınıf Matematik ortak yazılı', 'MEB ülke geneli ortak yazılı sınavı — 2. dönem 1. yazılı.', 'common_exam', '2026-04-08'::date, '2026-04-08'::date, null::time, ARRAY[6,8]::smallint[], true, 'common', 'Matematik', 2::smallint, 1::smallint),
    ('7. sınıf Matematik ortak yazılı', 'MEB ülke geneli ortak yazılı sınavı — 2. dönem 2. yazılı.', 'common_exam', '2026-06-02'::date, '2026-06-02'::date, null::time, ARRAY[7]::smallint[], true, 'common', 'Matematik', 2::smallint, 2::smallint),
    ('İOKBS (Bursluluk Sınavı)', 'İlköğretim ve Ortaöğretim Kurumları Bursluluk Sınavı.', 'common_exam', '2026-04-26'::date, '2026-04-26'::date, null::time, ARRAY[5,6,7,8]::smallint[], true, 'common', 'İOKBS', null::smallint, null::smallint),
    ('LGS (Merkezî Sınav)', 'Liselere Geçiş Sistemi kapsamında merkezî sınav.', 'common_exam', '2026-06-14'::date, '2026-06-14'::date, null::time, ARRAY[8]::smallint[], true, 'common', 'LGS', null::smallint, null::smallint),
    ('7. sınıf Türkçe ortak yazılı', 'MEB ülke geneli ortak yazılı sınavı — 1. dönem 1. yazılı.', 'common_exam', '2026-11-03'::date, '2026-11-03'::date, null::time, ARRAY[7]::smallint[], true, 'common', 'Türkçe', 1::smallint, 1::smallint),
    ('8. sınıf Türkçe ortak yazılı', 'MEB ülke geneli ortak yazılı sınavı — 1. dönem 1. yazılı.', 'common_exam', '2026-11-04'::date, '2026-11-04'::date, null::time, ARRAY[8]::smallint[], true, 'common', 'Türkçe', 1::smallint, 1::smallint)
) as catalog(title, body, event_type, starts_on, ends_on, starts_at, audience_grades, notify, exam_kind, exam_subject, exam_term, exam_round)
where not exists (
  select 1
  from public.calendar_events existing
  where existing.school_id = s.id
    and existing.source = 'meb-2026'
    and existing.title = catalog.title
    and existing.starts_on = catalog.starts_on
);

-- Mark existing deneme events as mock kind
update public.calendar_events
set exam_kind = 'mock'
where event_type = 'exam'
  and exam_kind is null;
