-- Rehberlik çizelgeleri: haftalık soru takip, konu/kaynak matrisi, çalışma programı.

create or replace function public.counselor_can_manage_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students s
    join public.profiles p on p.id = auth.uid()
    where s.id = target_student_id
      and s.school_id = p.school_id
      and (public.is_director() or public.is_counselor())
  );
$$;

-- ---------------------------------------------------------------------------
-- Weekly guidance header
-- ---------------------------------------------------------------------------

create table if not exists public.counselor_guidance_weeks (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  week_index    smallint not null,
  academic_year text not null,
  notes         text,
  updated_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint counselor_guidance_weeks_week_check check (week_index between 1 and 52),
  constraint counselor_guidance_weeks_unique unique (school_id, student_id, week_index, academic_year)
);

create index if not exists counselor_guidance_weeks_student_idx
  on public.counselor_guidance_weeks (student_id, week_index desc);

-- ---------------------------------------------------------------------------
-- Soru takip satırları
-- ---------------------------------------------------------------------------

create table if not exists public.counselor_weekly_question_rows (
  id                uuid primary key default gen_random_uuid(),
  week_id           uuid not null references public.counselor_guidance_weeks (id) on delete cascade,
  subject_code      text,
  topic_label       text,
  source_name       text,
  target_count      smallint,
  solved_count      smallint,
  correct_count     smallint,
  wrong_count       smallint,
  blank_count       smallint,
  completion_status text not null default 'not_done',
  sort_order        smallint not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint counselor_weekly_question_rows_status_check
    check (completion_status in ('done', 'not_done', 'partial'))
);

create index if not exists counselor_weekly_question_rows_week_idx
  on public.counselor_weekly_question_rows (week_id, sort_order);

-- ---------------------------------------------------------------------------
-- Konu / kaynak matrisi (öğrenci geneli, haftadan bağımsız)
-- ---------------------------------------------------------------------------

create table if not exists public.counselor_topic_resource_cells (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  subject_id    uuid not null references public.curriculum_subjects (id) on delete cascade,
  topic_key     text not null,
  topic_label   text not null,
  resource_name text not null,
  status        text not null default 'not_started',
  updated_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint counselor_topic_resource_cells_status_check
    check (status in ('not_started', 'in_progress', 'done')),
  constraint counselor_topic_resource_cells_unique
    unique (student_id, subject_id, topic_key, resource_name)
);

create index if not exists counselor_topic_resource_cells_student_idx
  on public.counselor_topic_resource_cells (student_id, subject_id);

-- ---------------------------------------------------------------------------
-- Haftalık çalışma programı blokları
-- ---------------------------------------------------------------------------

create table if not exists public.counselor_study_schedule_blocks (
  id           uuid primary key default gen_random_uuid(),
  week_id      uuid not null references public.counselor_guidance_weeks (id) on delete cascade,
  day_of_week  smallint not null,
  start_time   time not null,
  end_time     time not null,
  label        text not null,
  subject_code text,
  is_done      boolean not null default false,
  sort_order   smallint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint counselor_study_schedule_blocks_day_check check (day_of_week between 1 and 7)
);

create index if not exists counselor_study_schedule_blocks_week_idx
  on public.counselor_study_schedule_blocks (week_id, day_of_week, sort_order);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.counselor_guidance_weeks enable row level security;
alter table public.counselor_weekly_question_rows enable row level security;
alter table public.counselor_topic_resource_cells enable row level security;
alter table public.counselor_study_schedule_blocks enable row level security;

create policy "Counselor guidance weeks select"
  on public.counselor_guidance_weeks for select to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (
      public.is_director()
      or public.is_counselor()
      or public.is_teacher_of_student(student_id)
    )
  );

create policy "Counselor guidance weeks write"
  on public.counselor_guidance_weeks for all to authenticated
  using (
    public.counselor_can_manage_student(student_id)
  )
  with check (
    public.counselor_can_manage_student(student_id)
  );

create policy "Counselor question rows select"
  on public.counselor_weekly_question_rows for select to authenticated
  using (
    exists (
      select 1 from public.counselor_guidance_weeks w
      where w.id = week_id
        and w.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
        and (
          public.is_director()
          or public.is_counselor()
          or public.is_teacher_of_student(w.student_id)
        )
    )
  );

create policy "Counselor question rows write"
  on public.counselor_weekly_question_rows for all to authenticated
  using (
    exists (
      select 1 from public.counselor_guidance_weeks w
      where w.id = week_id
        and public.counselor_can_manage_student(w.student_id)
    )
  )
  with check (
    exists (
      select 1 from public.counselor_guidance_weeks w
      where w.id = week_id
        and public.counselor_can_manage_student(w.student_id)
    )
  );

create policy "Counselor topic resource select"
  on public.counselor_topic_resource_cells for select to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (
      public.is_director()
      or public.is_counselor()
      or public.is_teacher_of_student(student_id)
    )
  );

create policy "Counselor topic resource write"
  on public.counselor_topic_resource_cells for all to authenticated
  using (public.counselor_can_manage_student(student_id))
  with check (public.counselor_can_manage_student(student_id));

create policy "Counselor schedule blocks select"
  on public.counselor_study_schedule_blocks for select to authenticated
  using (
    exists (
      select 1 from public.counselor_guidance_weeks w
      where w.id = week_id
        and w.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
        and (
          public.is_director()
          or public.is_counselor()
          or public.is_teacher_of_student(w.student_id)
        )
    )
  );

create policy "Counselor schedule blocks write"
  on public.counselor_study_schedule_blocks for all to authenticated
  using (
    exists (
      select 1 from public.counselor_guidance_weeks w
      where w.id = week_id
        and public.counselor_can_manage_student(w.student_id)
    )
  )
  with check (
    exists (
      select 1 from public.counselor_guidance_weeks w
      where w.id = week_id
        and public.counselor_can_manage_student(w.student_id)
    )
  );

grant execute on function public.counselor_can_manage_student to authenticated;
