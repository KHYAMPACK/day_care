-- LGS deneme sınavı: ders bazlı sonuçlar, sıralama, öğrenci numarası.
--
-- Depends on 026_exams.sql when using supabase migration order.
-- Bootstrap below ensures exam_sessions exists if 026 was skipped (e.g. manual SQL run).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'exam_kind') then
    create type public.exam_kind as enum ('common', 'mock');
  end if;
end $$;

create table if not exists public.exam_sessions (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete restrict,
  kind              public.exam_kind not null,
  calendar_event_id uuid references public.calendar_events (id) on delete set null,
  title             text not null,
  held_on           date not null,
  audience_grades   smallint[],
  results_enabled   boolean not null default true,
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

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
-- LGS extensions
-- ---------------------------------------------------------------------------

alter table public.students
  add column if not exists student_number text;

create index if not exists students_school_number_idx
  on public.students (school_id, student_number)
  where student_number is not null;

alter table public.exam_sessions
  add column if not exists exam_format text not null default 'lgs_full',
  add column if not exists publisher text,
  add column if not exists answer_key_id uuid,
  add column if not exists total_participants integer;

alter table public.exam_sessions
  drop constraint if exists exam_sessions_format_check;

alter table public.exam_sessions
  add constraint exam_sessions_format_check
  check (exam_format in ('lgs_full', 'single_subject', 'custom'));

create table if not exists public.exam_subject_results (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.exam_sessions (id) on delete cascade,
  student_id      uuid not null references public.students (id) on delete cascade,
  subject_code    text not null,
  question_count  smallint not null,
  correct_count   smallint not null default 0,
  wrong_count     smallint not null default 0,
  blank_count     smallint not null default 0,
  net             numeric(6, 2) not null default 0,
  score           numeric(8, 2),
  updated_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint exam_subject_results_unique unique (session_id, student_id, subject_code),
  constraint exam_subject_results_subject_check check (
    subject_code in ('turkce', 'matematik', 'fen', 'inkilap', 'din', 'ingilizce')
  ),
  constraint exam_subject_results_counts_check check (
    correct_count >= 0
    and wrong_count >= 0
    and blank_count >= 0
    and question_count >= 0
    and (correct_count + wrong_count + blank_count) <= question_count
  )
);

create index if not exists exam_subject_results_session_idx
  on public.exam_subject_results (session_id);

create index if not exists exam_subject_results_student_idx
  on public.exam_subject_results (student_id);

create table if not exists public.exam_session_rankings (
  session_id    uuid not null references public.exam_sessions (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  total_net     numeric(6, 2) not null default 0,
  total_correct smallint not null default 0,
  total_wrong   smallint not null default 0,
  total_blank   smallint not null default 0,
  lgs_score     numeric(8, 2),
  school_rank   integer,
  grade_rank    integer,
  class_rank    integer,
  computed_at   timestamptz not null default now(),

  primary key (session_id, student_id)
);

create index if not exists exam_session_rankings_session_school_idx
  on public.exam_session_rankings (session_id, school_rank);

create or replace function public.exam_subject_results_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists exam_subject_results_set_updated_at on public.exam_subject_results;
create trigger exam_subject_results_set_updated_at
  before insert or update on public.exam_subject_results
  for each row execute function public.exam_subject_results_touch_updated_at();

create or replace function public.compute_exam_rankings(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
begin
  select es.school_id into v_school_id
  from public.exam_sessions es
  where es.id = p_session_id;

  if v_school_id is null then
    raise exception 'Sınav oturumu bulunamadı.';
  end if;

  delete from public.exam_session_rankings where session_id = p_session_id;

  insert into public.exam_session_rankings (
    session_id,
    student_id,
    total_net,
    total_correct,
    total_wrong,
    total_blank,
    lgs_score,
    school_rank,
    grade_rank,
    class_rank,
    computed_at
  )
  with subject_totals as (
    select
      esr.session_id,
      esr.student_id,
      coalesce(sum(esr.net), 0)::numeric(6, 2) as total_net,
      coalesce(sum(esr.correct_count), 0)::smallint as total_correct,
      coalesce(sum(esr.wrong_count), 0)::smallint as total_wrong,
      coalesce(sum(esr.blank_count), 0)::smallint as total_blank
    from public.exam_subject_results esr
    where esr.session_id = p_session_id
    group by esr.session_id, esr.student_id
  ),
  legacy_totals as (
    select
      esr.session_id,
      esr.student_id,
      coalesce(esr.net, 0)::numeric(6, 2) as total_net,
      0::smallint as total_correct,
      0::smallint as total_wrong,
      0::smallint as total_blank
    from public.exam_student_results esr
    where esr.session_id = p_session_id
      and esr.subject is null
      and esr.net is not null
      and not exists (
        select 1 from subject_totals st where st.student_id = esr.student_id
      )
  ),
  totals as (
    select * from subject_totals
    union all
    select * from legacy_totals
  ),
  scored as (
    select
      t.*,
      round((t.total_net * 5.95 + 10)::numeric, 2) as lgs_score
    from totals t
  ),
  ranked as (
    select
      s.*,
      rank() over (order by s.total_net desc nulls last, s.student_id) as school_rank,
      rank() over (
        partition by st.grade
        order by s.total_net desc nulls last, s.student_id
      ) as grade_rank,
      rank() over (
        partition by st.class_id
        order by s.total_net desc nulls last, s.student_id
      ) as class_rank
    from scored s
    join public.students st on st.id = s.student_id
    where st.school_id = v_school_id
  )
  select
    session_id,
    student_id,
    total_net,
    total_correct,
    total_wrong,
    total_blank,
    lgs_score,
    school_rank::integer,
    grade_rank::integer,
    class_rank::integer,
    now()
  from ranked;

  insert into public.exam_student_results (session_id, student_id, subject, net, score)
  select
    r.session_id,
    r.student_id,
    null,
    r.total_net,
    r.lgs_score
  from public.exam_session_rankings r
  where r.session_id = p_session_id
  on conflict (session_id, student_id, subject)
  do update set
    net = excluded.net,
    score = excluded.score,
    updated_at = now();
end;
$$;

grant execute on function public.compute_exam_rankings(uuid) to authenticated;

alter table public.exam_subject_results enable row level security;
alter table public.exam_session_rankings enable row level security;

drop policy if exists "Staff can read exam subject results" on public.exam_subject_results;
create policy "Staff can read exam subject results"
  on public.exam_subject_results for select to authenticated
  using (
    exists (
      select 1 from public.exam_sessions es
      join public.profiles p on p.id = auth.uid()
      where es.id = exam_subject_results.session_id
        and es.school_id = p.school_id
        and (public.is_director() or public.is_teacher())
    )
  );

drop policy if exists "Staff can manage exam subject results" on public.exam_subject_results;
create policy "Staff can manage exam subject results"
  on public.exam_subject_results for all to authenticated
  using (
    exists (
      select 1 from public.exam_sessions es
      join public.profiles p on p.id = auth.uid()
      where es.id = exam_subject_results.session_id
        and es.school_id = p.school_id
        and (public.is_director() or public.is_teacher())
    )
  )
  with check (
    exists (
      select 1 from public.exam_sessions es
      join public.profiles p on p.id = auth.uid()
      where es.id = exam_subject_results.session_id
        and es.school_id = p.school_id
        and (public.is_director() or public.is_teacher())
    )
  );

drop policy if exists "Parents read published exam subject results" on public.exam_subject_results;
create policy "Parents read published exam subject results"
  on public.exam_subject_results for select to authenticated
  using (
    public.is_parent_of_student(student_id)
    and exists (
      select 1 from public.exam_sessions es
      where es.id = exam_subject_results.session_id
        and es.published_at is not null
    )
  );

drop policy if exists "Staff can read exam rankings" on public.exam_session_rankings;
create policy "Staff can read exam rankings"
  on public.exam_session_rankings for select to authenticated
  using (
    exists (
      select 1 from public.exam_sessions es
      join public.profiles p on p.id = auth.uid()
      where es.id = exam_session_rankings.session_id
        and es.school_id = p.school_id
        and (public.is_director() or public.is_teacher())
    )
  );

drop policy if exists "Parents read published exam rankings" on public.exam_session_rankings;
create policy "Parents read published exam rankings"
  on public.exam_session_rankings for select to authenticated
  using (
    public.is_parent_of_student(student_id)
    and exists (
      select 1 from public.exam_sessions es
      where es.id = exam_session_rankings.session_id
        and es.published_at is not null
    )
  );

grant select, insert, update, delete on public.exam_subject_results to authenticated;
grant select on public.exam_session_rankings to authenticated;

update public.schools
set features = coalesce(features, '{}'::jsonb) || '{
  "exam_results": true,
  "exam_detailed_entry": true,
  "exam_show_common": true,
  "exam_show_mock": true,
  "exam_mock_results": true,
  "exam_common_results": false
}'::jsonb;
