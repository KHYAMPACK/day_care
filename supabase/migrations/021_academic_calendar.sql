-- Academic calendar (ATLAS 2026–2027) + student grade for deneme targeting.

-- ---------------------------------------------------------------------------
-- students.grade
-- ---------------------------------------------------------------------------

alter table public.students
  add column if not exists grade smallint;

alter table public.students
  drop constraint if exists students_grade_check;

alter table public.students
  add constraint students_grade_check
  check (grade is null or grade in (5, 6, 7, 8));

-- ---------------------------------------------------------------------------
-- calendar_events
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'calendar_event_type'
  ) then
    create type public.calendar_event_type as enum (
      'holiday',
      'exam',
      'camp',
      'school_start',
      'school_end',
      'course_start',
      'parent_meeting',
      'activity',
      'important_day'
    );
  end if;
end $$;

create table if not exists public.calendar_events (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools (id) on delete restrict,
  title            text not null,
  body             text not null default '',
  event_type       public.calendar_event_type not null,
  starts_on        date not null,
  ends_on          date not null,
  starts_at        time,
  audience_grades  smallint[],
  notify           boolean not null default true,
  source           text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint calendar_events_range_check check (ends_on >= starts_on),
  constraint calendar_events_grades_check check (
    audience_grades is null
    or audience_grades <@ array[5, 6, 7, 8]::smallint[]
  )
);

create index if not exists calendar_events_school_starts_idx
  on public.calendar_events (school_id, starts_on);

create index if not exists calendar_events_notify_idx
  on public.calendar_events (starts_on)
  where notify = true;

create or replace function public.calendar_events_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists calendar_events_set_updated_at on public.calendar_events;
create trigger calendar_events_set_updated_at
  before update on public.calendar_events
  for each row execute function public.calendar_events_touch_updated_at();

-- ---------------------------------------------------------------------------
-- notification log (cron dedupe)
-- ---------------------------------------------------------------------------

create table if not exists public.calendar_notification_log (
  event_id   uuid not null references public.calendar_events (id) on delete cascade,
  notify_on  date not null,
  sent_at    timestamptz not null default now(),
  primary key (event_id, notify_on)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

create or replace function public.parent_visible_grades()
returns smallint[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct s.grade), '{}'::smallint[])
  from public.student_parents sp
  join public.students s on s.id = sp.student_id
  where sp.parent_id = auth.uid()
    and s.grade is not null;
$$;

alter table public.calendar_events enable row level security;
alter table public.calendar_notification_log enable row level security;

drop policy if exists "School members can select calendar events" on public.calendar_events;
create policy "School members can select calendar events"
  on public.calendar_events
  for select
  to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (
      public.is_staff()
      or audience_grades is null
      or audience_grades && public.parent_visible_grades()
    )
  );

drop policy if exists "Directors can insert calendar events" on public.calendar_events;
create policy "Directors can insert calendar events"
  on public.calendar_events
  for insert
  to authenticated
  with check (
    public.is_director()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "Directors can update calendar events" on public.calendar_events;
create policy "Directors can update calendar events"
  on public.calendar_events
  for update
  to authenticated
  using (
    public.is_director()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  )
  with check (
    public.is_director()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "Directors can delete calendar events" on public.calendar_events;
create policy "Directors can delete calendar events"
  on public.calendar_events
  for delete
  to authenticated
  using (
    public.is_director()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

grant select, insert, update, delete on public.calendar_events to authenticated;
grant select on public.calendar_notification_log to authenticated;
grant usage on type public.calendar_event_type to authenticated;

-- ---------------------------------------------------------------------------
-- Seed ATLAS 2026–2027 for every school (skip rows that already exist)
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
  source
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
  'atlas-2026-2027'
from public.schools s
cross join (
  values
      ('Kurs başlıyor', 'ATLAS kursu başlıyor.', 'course_start', '2026-09-07'::date, '2026-09-07'::date, null::time, null::smallint[], true),
      ('Okul açılıyor', '2026–2027 eğitim öğretim yılı birinci dönemi başlıyor.', 'school_start', '2026-09-14'::date, '2026-09-14'::date, null::time, null::smallint[], true),
      ('8. sınıf deneme sınavı', '8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2026-09-12'::date, '2026-09-12'::date, '10:00'::time, ARRAY[8]::smallint[], true),
      ('5, 6, 7 ve 8. sınıf deneme sınavı', '5, 6, 7 ve 8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2026-09-19'::date, '2026-09-19'::date, '10:00'::time, ARRAY[5,6,7,8]::smallint[], true),
      ('1. veli toplantısı', 'Birinci dönem veli toplantısı.', 'parent_meeting', '2026-09-26'::date, '2026-09-26'::date, null::time, null::smallint[], true),
      ('Psikolojik Danışmanlar Günü', 'Psikolojik Danışmanlar Günü.', 'important_day', '2026-09-30'::date, '2026-09-30'::date, null::time, null::smallint[], false),
      ('8. sınıf deneme sınavı', '8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2026-10-03'::date, '2026-10-03'::date, '10:00'::time, ARRAY[8]::smallint[], true),
      ('7. ve 8. sınıf deneme sınavı', '7. ve 8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2026-10-10'::date, '2026-10-10'::date, '10:00'::time, ARRAY[7,8]::smallint[], true),
      ('5, 6 ve 8. sınıf deneme sınavı', '5, 6 ve 8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2026-10-17'::date, '2026-10-17'::date, '10:00'::time, ARRAY[5,6,8]::smallint[], true),
      ('7. ve 8. sınıf deneme sınavı', '7. ve 8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2026-10-24'::date, '2026-10-24'::date, '10:00'::time, ARRAY[7,8]::smallint[], true),
      ('Cumhuriyet Bayramı', '29 Ekim Cumhuriyet Bayramı. Kurum tatil.', 'holiday', '2026-10-29'::date, '2026-10-29'::date, null::time, null::smallint[], true),
      ('8. sınıf deneme sınavı', '8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2026-10-31'::date, '2026-10-31'::date, '10:00'::time, ARRAY[8]::smallint[], true),
      ('5, 6, 7 ve 8. sınıf deneme sınavı', '5, 6, 7 ve 8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2026-11-07'::date, '2026-11-07'::date, '10:00'::time, ARRAY[5,6,7,8]::smallint[], true),
      ('Atatürk''ü Anma Günü', '10 Kasım Atatürk''ü Anma Günü.', 'important_day', '2026-11-10'::date, '2026-11-10'::date, null::time, null::smallint[], false),
      ('Ara tatil', 'Birinci dönem ara tatili. Kurum 13–22 Kasım arasında kapalıdır.', 'holiday', '2026-11-13'::date, '2026-11-22'::date, null::time, null::smallint[], true),
      ('8. sınıf deneme sınavı', '8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2026-11-16'::date, '2026-11-18'::date, '10:00'::time, ARRAY[8]::smallint[], true),
      ('Okul açılıyor', 'Ara tatil sonrası dersler başlıyor. 23 Kasım Fibonacci Günü.', 'school_start', '2026-11-23'::date, '2026-11-23'::date, null::time, null::smallint[], true),
      ('Fibonacci Günü', 'Fibonacci Günü.', 'important_day', '2026-11-23'::date, '2026-11-23'::date, null::time, null::smallint[], false),
      ('Öğretmenler Günü', '24 Kasım Öğretmenler Günü.', 'important_day', '2026-11-24'::date, '2026-11-24'::date, null::time, null::smallint[], false),
      ('7. ve 8. sınıf deneme sınavı', '7. ve 8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2026-11-28'::date, '2026-11-28'::date, '10:00'::time, ARRAY[7,8]::smallint[], true),
      ('5, 6 ve 8. sınıf deneme sınavı', '5, 6 ve 8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2026-12-05'::date, '2026-12-05'::date, '10:00'::time, ARRAY[5,6,8]::smallint[], true),
      ('7. ve 8. sınıf deneme sınavı', '7. ve 8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2026-12-12'::date, '2026-12-12'::date, '10:00'::time, ARRAY[7,8]::smallint[], true),
      ('Yılbaşı çekilişi', 'Yılbaşı çekilişi (ücret sınırlamalı).', 'activity', '2026-12-18'::date, '2026-12-18'::date, null::time, null::smallint[], true),
      ('8. sınıf deneme sınavı', '8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2026-12-19'::date, '2026-12-19'::date, '10:00'::time, ARRAY[8]::smallint[], true),
      ('8. sınıf deneme sınavı', '8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2026-12-26'::date, '2026-12-26'::date, '10:00'::time, ARRAY[8]::smallint[], true),
      ('Hediyeleşme', 'Yıl sonu hediyeleşme.', 'activity', '2026-12-30'::date, '2026-12-30'::date, null::time, null::smallint[], true),
      ('Yılbaşı gecesi', 'Yılbaşı gecesi. Kurum tatil.', 'holiday', '2026-12-31'::date, '2026-12-31'::date, null::time, null::smallint[], true),
      ('Yılbaşı tatili', 'Yılbaşı tatili. Kurum tatil.', 'holiday', '2027-01-01'::date, '2027-01-03'::date, null::time, null::smallint[], true),
      ('5, 6, 7 ve 8. sınıf deneme sınavı', '5, 6, 7 ve 8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2027-01-09'::date, '2027-01-09'::date, '10:00'::time, ARRAY[5,6,7,8]::smallint[], true),
      ('8. sınıf deneme sınavı', '8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2027-01-16'::date, '2027-01-16'::date, '10:00'::time, ARRAY[8]::smallint[], true),
      ('Dönem bitişi', 'Birinci dönem sona eriyor.', 'school_end', '2027-01-22'::date, '2027-01-22'::date, null::time, null::smallint[], true),
      ('8. sınıf deneme sınavı', '8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2027-01-29'::date, '2027-01-29'::date, '10:00'::time, ARRAY[8]::smallint[], true),
      ('Yarıyıl tatili', 'Kurum yarıyıl tatili. 2. dönem 8 Şubat’ta başlar.', 'holiday', '2027-02-01'::date, '2027-02-07'::date, null::time, null::smallint[], true),
      ('2. dönem başlangıcı', 'İkinci dönem başlıyor. Aynı gün Ramazan başlangıcı.', 'school_start', '2027-02-08'::date, '2027-02-08'::date, null::time, null::smallint[], true),
      ('Ramazan başlangıcı', 'Ramazan ayı başlıyor.', 'important_day', '2027-02-08'::date, '2027-02-08'::date, null::time, null::smallint[], false),
      ('5, 6, 7 ve 8. sınıf deneme sınavı', '5, 6, 7 ve 8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2027-02-13'::date, '2027-02-13'::date, '10:00'::time, ARRAY[5,6,7,8]::smallint[], true),
      ('8. sınıf deneme sınavı', '8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2027-02-20'::date, '2027-02-20'::date, '10:00'::time, ARRAY[8]::smallint[], true),
      ('8. sınıf deneme sınavı', '8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2027-02-27'::date, '2027-02-27'::date, '10:00'::time, ARRAY[8]::smallint[], true),
      ('2. dönem ara tatili ve Ramazan Bayramı', 'Ara tatil 5 Mart’ta başlar. 8 Mart arife ve Kadınlar Günü, 9–11 Mart Ramazan Bayramı, 14 Mart tatil bitişi.', 'holiday', '2027-03-05'::date, '2027-03-14'::date, null::time, null::smallint[], true),
      ('Bayramlaşma', 'Bayramlaşma etkinliği.', 'activity', '2027-03-05'::date, '2027-03-05'::date, null::time, null::smallint[], false),
      ('7. ve 8. sınıf deneme sınavı', '7. ve 8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2027-03-06'::date, '2027-03-06'::date, '10:00'::time, ARRAY[7,8]::smallint[], true),
      ('Kadınlar Günü', '8 Mart Dünya Kadınlar Günü.', 'important_day', '2027-03-08'::date, '2027-03-08'::date, null::time, null::smallint[], false),
      ('Pi Günü ve Doktorlar Günü', '14 Mart Pi Günü ve Doktorlar Günü.', 'important_day', '2027-03-14'::date, '2027-03-14'::date, null::time, null::smallint[], false),
      ('Okul başlıyor', 'Ara tatil sonrası dersler başlıyor.', 'school_start', '2027-03-15'::date, '2027-03-15'::date, null::time, null::smallint[], true),
      ('5, 6, 7 ve 8. sınıf deneme sınavı', '5, 6, 7 ve 8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2027-03-20'::date, '2027-03-20'::date, '10:00'::time, ARRAY[5,6,7,8]::smallint[], true),
      ('2. veli toplantısı', 'İkinci dönem veli toplantısı.', 'parent_meeting', '2027-03-27'::date, '2027-03-27'::date, null::time, null::smallint[], true),
      ('8. sınıf deneme sınavı', '8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2027-04-03'::date, '2027-04-03'::date, '10:00'::time, ARRAY[8]::smallint[], true),
      ('7. ve 8. sınıf deneme sınavı', '7. ve 8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2027-04-10'::date, '2027-04-10'::date, '10:00'::time, ARRAY[7,8]::smallint[], true),
      ('Polis Haftası', 'Polis Haftası.', 'important_day', '2027-04-10'::date, '2027-04-10'::date, null::time, null::smallint[], false),
      ('5, 6 ve 8. sınıf deneme sınavı', '5, 6 ve 8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2027-04-17'::date, '2027-04-17'::date, '10:00'::time, ARRAY[5,6,8]::smallint[], true),
      ('Ulusal Egemenlik ve Çocuk Bayramı', '23 Nisan Ulusal Egemenlik ve Çocuk Bayramı. Kurum tatil.', 'holiday', '2027-04-23'::date, '2027-04-23'::date, null::time, null::smallint[], true),
      ('8. sınıf deneme sınavı', '8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2027-04-24'::date, '2027-04-24'::date, '10:00'::time, ARRAY[8]::smallint[], true),
      ('Emek ve Dayanışma Günü', '1 Mayıs Emek ve Dayanışma Günü. Kurum tatil.', 'holiday', '2027-05-01'::date, '2027-05-01'::date, null::time, null::smallint[], true),
      ('5, 6, 7 ve 8. sınıf deneme sınavı', '5, 6, 7 ve 8. sınıf deneme sınavı. 8. sınıf sınavı saat 10:00''da başlar.', 'exam', '2027-05-08'::date, '2027-05-08'::date, '10:00'::time, ARRAY[5,6,7,8]::smallint[], true),
      ('Dünya Kadın Matematikçiler Günü', '12 Mayıs Dünya Kadın Matematikçiler Günü.', 'important_day', '2027-05-12'::date, '2027-05-12'::date, null::time, null::smallint[], false),
      ('Bayramlaşma', 'Kurban Bayramı öncesi bayramlaşma.', 'activity', '2027-05-14'::date, '2027-05-14'::date, null::time, null::smallint[], true),
      ('Kurban Bayramı', '15 Mayıs arefe, 16–19 Mayıs Kurban Bayramı. 19 Mayıs aynı zamanda Atatürk’ü Anma, Gençlik ve Spor Bayramı.', 'holiday', '2027-05-15'::date, '2027-05-19'::date, null::time, null::smallint[], true),
      ('8. sınıf deneme ve konu tekrarı kampı', 'Mayıs–Haziran sarı günleri 8. sınıfların deneme, soru çözümü ve konu tekrarı kampıdır. Ara sınıflar derslere devam eder.', 'camp', '2027-05-20'::date, '2027-06-11'::date, null::time, ARRAY[8]::smallint[], true),
      ('5, 6 ve 7. sınıf deneme sınavı', '5, 6 ve 7. sınıf deneme sınavı.', 'exam', '2027-06-05'::date, '2027-06-05'::date, null::time, ARRAY[5,6,7]::smallint[], true),
      ('Okulların kapanması', '2026–2027 eğitim öğretim yılı sona eriyor.', 'school_end', '2027-06-25'::date, '2027-06-25'::date, null::time, null::smallint[], true),
      ('Yaz kursu açılıyor', 'Yaz kursu başlıyor.', 'course_start', '2027-07-05'::date, '2027-07-05'::date, null::time, null::smallint[], true),
      ('Demokrasi Bayramı', '15 Temmuz Demokrasi ve Millî Birlik Günü. Kurum tatil.', 'holiday', '2027-07-15'::date, '2027-07-15'::date, null::time, null::smallint[], true),
      ('Zafer Bayramı', '30 Ağustos Zafer Bayramı. Kurum tatil.', 'holiday', '2027-08-30'::date, '2027-08-30'::date, null::time, null::smallint[], true)
) as catalog(title, body, event_type, starts_on, ends_on, starts_at, audience_grades, notify)
where not exists (
  select 1
  from public.calendar_events existing
  where existing.school_id = s.id
    and existing.source = 'atlas-2026-2027'
    and existing.title = catalog.title
    and existing.starts_on = catalog.starts_on
);
