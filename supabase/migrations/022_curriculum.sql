-- Şubeler, subject-teacher assignments, Derslig catalog, weekly plans, class progress.

-- ---------------------------------------------------------------------------
-- classes (şube)
-- ---------------------------------------------------------------------------

create table if not exists public.classes (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools (id) on delete restrict,
  grade      smallint not null,
  name       text not null,
  created_at timestamptz not null default now(),

  constraint classes_grade_check check (grade in (5, 6, 7, 8)),
  constraint classes_name_check check (char_length(btrim(name)) between 1 and 8),
  constraint classes_school_grade_name_unique unique (school_id, grade, name)
);

create index if not exists classes_school_grade_idx
  on public.classes (school_id, grade);

alter table public.students
  add column if not exists class_id uuid references public.classes (id) on delete set null;

create index if not exists students_class_id_idx
  on public.students (class_id);

create or replace function public.students_sync_grade_from_class()
returns trigger
language plpgsql
as $$
begin
  if new.class_id is not null then
    select c.grade into new.grade
    from public.classes c
    where c.id = new.class_id;
  end if;
  return new;
end;
$$;

drop trigger if exists students_set_grade_from_class on public.students;
create trigger students_set_grade_from_class
  before insert or update of class_id
  on public.students
  for each row execute function public.students_sync_grade_from_class();

-- ---------------------------------------------------------------------------
-- Global Derslig catalog
-- ---------------------------------------------------------------------------

create table if not exists public.curriculum_subjects (
  id         uuid primary key default gen_random_uuid(),
  grade      smallint not null,
  slug       text not null,
  name       text not null,
  color      text not null,
  icon       text not null,
  sort_order smallint not null,

  constraint curriculum_subjects_grade_check check (grade in (5, 6, 7, 8)),
  constraint curriculum_subjects_slug_unique unique (grade, slug)
);

create table if not exists public.curriculum_units (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references public.curriculum_subjects (id) on delete cascade,
  title       text not null,
  sort_order  smallint not null,
  sections    jsonb not null default '[]'::jsonb,

  constraint curriculum_units_subject_order_unique unique (subject_id, sort_order)
);

create index if not exists curriculum_units_subject_idx
  on public.curriculum_units (subject_id, sort_order);

-- ---------------------------------------------------------------------------
-- Teacher ↔ şube ↔ ders
-- ---------------------------------------------------------------------------

create table if not exists public.teacher_assignments (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.profiles (id) on delete cascade,
  class_id    uuid not null references public.classes (id) on delete cascade,
  subject_id  uuid not null references public.curriculum_subjects (id) on delete restrict,
  created_at  timestamptz not null default now(),

  constraint teacher_assignments_teacher_class_subject_unique unique (teacher_id, class_id, subject_id),
  constraint teacher_assignments_class_subject_unique unique (class_id, subject_id)
);

create index if not exists teacher_assignments_teacher_idx
  on public.teacher_assignments (teacher_id);

create index if not exists teacher_assignments_class_idx
  on public.teacher_assignments (class_id);

create or replace function public.enforce_teacher_assignment()
returns trigger
language plpgsql
as $$
declare
  v_role public.user_role;
  v_teacher_school uuid;
  v_class_school uuid;
  v_class_grade smallint;
  v_subject_grade smallint;
begin
  select p.role, p.school_id
  into v_role, v_teacher_school
  from public.profiles p
  where p.id = new.teacher_id;

  if v_role is distinct from 'teacher' then
    raise exception 'teacher_id must reference a profile with role ''teacher''';
  end if;

  select c.school_id, c.grade
  into v_class_school, v_class_grade
  from public.classes c
  where c.id = new.class_id;

  select cs.grade
  into v_subject_grade
  from public.curriculum_subjects cs
  where cs.id = new.subject_id;

  if v_teacher_school is distinct from v_class_school then
    raise exception 'Öğretmen ve şube aynı okula ait olmalıdır.';
  end if;

  if v_class_grade is distinct from v_subject_grade then
    raise exception 'Ders, şubenin sınıf düzeyi ile eşleşmelidir.';
  end if;

  return new;
end;
$$;

drop trigger if exists teacher_assignments_enforce on public.teacher_assignments;
create trigger teacher_assignments_enforce
  before insert or update on public.teacher_assignments
  for each row execute function public.enforce_teacher_assignment();

-- ---------------------------------------------------------------------------
-- Weekly pacing (staff only) + per-student progress
-- ---------------------------------------------------------------------------

create table if not exists public.curriculum_week_plans (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete restrict,
  grade       smallint not null,
  week_index  integer not null,
  unit_id     uuid not null references public.curriculum_units (id) on delete cascade,
  created_at  timestamptz not null default now(),

  constraint curriculum_week_plans_grade_check check (grade in (5, 6, 7, 8)),
  constraint curriculum_week_plans_week_check check (week_index between 1 and 52),
  constraint curriculum_week_plans_unique unique (school_id, grade, week_index, unit_id)
);

create index if not exists curriculum_week_plans_school_week_idx
  on public.curriculum_week_plans (school_id, grade, week_index);

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'curriculum_progress_source'
  ) then
    create type public.curriculum_progress_source as enum ('class', 'override');
  end if;
end $$;

create table if not exists public.student_unit_progress (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete restrict,
  student_id        uuid not null references public.students (id) on delete cascade,
  unit_id           uuid not null references public.curriculum_units (id) on delete cascade,
  completed         boolean not null default false,
  questions_solved  integer not null default 0,
  source            public.curriculum_progress_source not null default 'class',
  updated_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint student_unit_progress_questions_check check (questions_solved >= 0),
  constraint student_unit_progress_student_unit_unique unique (student_id, unit_id)
);

create index if not exists student_unit_progress_student_idx
  on public.student_unit_progress (student_id);

create index if not exists student_unit_progress_unit_idx
  on public.student_unit_progress (unit_id);

create or replace function public.student_unit_progress_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists student_unit_progress_set_updated_at on public.student_unit_progress;
create trigger student_unit_progress_set_updated_at
  before update on public.student_unit_progress
  for each row execute function public.student_unit_progress_touch_updated_at();

create or replace function public.student_unit_progress_set_updated_by()
returns trigger
language plpgsql
as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists student_unit_progress_set_updated_by on public.student_unit_progress;
create trigger student_unit_progress_set_updated_by
  before insert on public.student_unit_progress
  for each row execute function public.student_unit_progress_set_updated_by();

-- ---------------------------------------------------------------------------
-- Helpers + RLS
-- ---------------------------------------------------------------------------

create or replace function public.class_in_my_school(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    join public.profiles p on p.id = auth.uid()
    where c.id = target_class_id
      and c.school_id = p.school_id
  );
$$;

create or replace function public.teacher_assigned_to_class(target_class_id uuid)
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
      and ta.teacher_id = auth.uid()
  );
$$;

create or replace function public.is_teacher_of_class_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students s
    join public.teacher_assignments ta on ta.class_id = s.class_id
    where s.id = target_student_id
      and ta.teacher_id = auth.uid()
      and public.is_teacher()
  );
$$;

create or replace function public.teacher_can_write_unit_progress(
  target_student_id uuid,
  target_unit_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students s
    join public.teacher_assignments ta
      on ta.class_id = s.class_id
     and ta.teacher_id = auth.uid()
    join public.curriculum_units cu
      on cu.id = target_unit_id
     and cu.subject_id = ta.subject_id
    where s.id = target_student_id
      and public.is_teacher()
  );
$$;

drop policy if exists "Directors and assigned teachers can select students" on public.students;
create policy "Directors and assigned teachers can select students"
  on public.students
  for select
  to authenticated
  using (
    public.is_director()
    or public.is_teacher_of_student(students.id)
    or public.is_teacher_of_class_student(students.id)
  );

alter table public.classes enable row level security;
alter table public.curriculum_subjects enable row level security;
alter table public.curriculum_units enable row level security;
alter table public.teacher_assignments enable row level security;
alter table public.curriculum_week_plans enable row level security;
alter table public.student_unit_progress enable row level security;

drop policy if exists "School members can select classes" on public.classes;
create policy "School members can select classes"
  on public.classes
  for select
  to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (
      public.is_director()
      or public.teacher_assigned_to_class(classes.id)
    )
  );

drop policy if exists "Directors can insert classes" on public.classes;
create policy "Directors can insert classes"
  on public.classes
  for insert
  to authenticated
  with check (
    public.is_director()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "Directors can update classes" on public.classes;
create policy "Directors can update classes"
  on public.classes
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

drop policy if exists "Directors can delete classes" on public.classes;
create policy "Directors can delete classes"
  on public.classes
  for delete
  to authenticated
  using (
    public.is_director()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "Authenticated can select curriculum subjects" on public.curriculum_subjects;
create policy "Authenticated can select curriculum subjects"
  on public.curriculum_subjects
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated can select curriculum units" on public.curriculum_units;
create policy "Authenticated can select curriculum units"
  on public.curriculum_units
  for select
  to authenticated
  using (true);

drop policy if exists "Directors can manage teacher_assignments" on public.teacher_assignments;
create policy "Directors can manage teacher_assignments"
  on public.teacher_assignments
  for all
  to authenticated
  using (
    public.is_director()
    and public.class_in_my_school(class_id)
  )
  with check (
    public.is_director()
    and public.class_in_my_school(class_id)
  );

drop policy if exists "Teachers can select own teacher_assignments" on public.teacher_assignments;
create policy "Teachers can select own teacher_assignments"
  on public.teacher_assignments
  for select
  to authenticated
  using (teacher_id = auth.uid() and public.is_teacher());

drop policy if exists "Staff can select week plans" on public.curriculum_week_plans;
create policy "Staff can select week plans"
  on public.curriculum_week_plans
  for select
  to authenticated
  using (
    public.is_staff()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "Directors can insert week plans" on public.curriculum_week_plans;
create policy "Directors can insert week plans"
  on public.curriculum_week_plans
  for insert
  to authenticated
  with check (
    public.is_director()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "Directors can delete week plans" on public.curriculum_week_plans;
create policy "Directors can delete week plans"
  on public.curriculum_week_plans
  for delete
  to authenticated
  using (
    public.is_director()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "Parents and staff can select unit progress" on public.student_unit_progress;
create policy "Parents and staff can select unit progress"
  on public.student_unit_progress
  for select
  to authenticated
  using (
    public.is_director()
    or public.is_parent_of_student(student_id)
    or public.teacher_can_write_unit_progress(student_id, unit_id)
    or public.is_teacher_of_class_student(student_id)
  );

drop policy if exists "Staff can insert unit progress" on public.student_unit_progress;
create policy "Staff can insert unit progress"
  on public.student_unit_progress
  for insert
  to authenticated
  with check (
    (
      public.is_director()
      or public.teacher_can_write_unit_progress(student_id, unit_id)
    )
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "Staff can update unit progress" on public.student_unit_progress;
create policy "Staff can update unit progress"
  on public.student_unit_progress
  for update
  to authenticated
  using (
    public.is_director()
    or public.teacher_can_write_unit_progress(student_id, unit_id)
  )
  with check (
    public.is_director()
    or public.teacher_can_write_unit_progress(student_id, unit_id)
  );

drop policy if exists "Directors can delete unit progress" on public.student_unit_progress;
create policy "Directors can delete unit progress"
  on public.student_unit_progress
  for delete
  to authenticated
  using (public.is_director());

grant select, insert, update, delete on public.classes to authenticated;
grant select on public.curriculum_subjects to authenticated;
grant select on public.curriculum_units to authenticated;
grant select, insert, update, delete on public.teacher_assignments to authenticated;
grant select, insert, delete on public.curriculum_week_plans to authenticated;
grant select, insert, update, delete on public.student_unit_progress to authenticated;
grant usage on type public.curriculum_progress_source to authenticated;

-- ---------------------------------------------------------------------------
-- Class apply RPC
-- ---------------------------------------------------------------------------

create or replace function public.apply_unit_progress_to_class(
  p_class_id uuid,
  p_unit_id uuid,
  p_completed boolean,
  p_questions_solved integer
)
returns integer
language plpgsql
security definer
set search_path = public
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
    if not exists (
      select 1
      from public.teacher_assignments ta
      where ta.teacher_id = auth.uid()
        and ta.class_id = p_class_id
        and ta.subject_id = v_subject_id
        and public.is_teacher()
    ) then
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

grant execute on function public.apply_unit_progress_to_class(uuid, uuid, boolean, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Seed catalog
-- ---------------------------------------------------------------------------

insert into public.curriculum_subjects (grade, slug, name, color, icon, sort_order)
select
  g.grade,
  d.slug,
  d.name,
  d.color,
  d.icon,
  d.sort_order
from generate_series(5, 8) as g(grade)
cross join (
  values
    ('matematik', 'Matematik', '#e11d48', '📐', 1),
    ('fen', 'Fen Bilimleri', '#ea580c', '🧪', 2),
    ('turkce', 'Türkçe', '#ca8a04', '📚', 3),
    ('sosyal', 'Sosyal Bilgiler', '#0284c7', '🌍', 4),
    ('ingilizce', 'İngilizce', '#0d9488', '💬', 5),
    ('din', 'Din Kültürü ve Ahlak Bilgisi', '#1e3a8a', '📖', 6)
) as d(slug, name, color, icon, sort_order)
on conflict (grade, slug) do nothing;

do $$
declare
  subj record;
  counts jsonb := '{"matematik":13,"fen":7,"turkce":6,"sosyal":6,"ingilizce":23,"din":5}'::jsonb;
  named jsonb := '{
    "5-matematik": [
      {"title":"Geometrik Şekiller","sections":["Temel Geometrik Kavramlar ve Çizimler","Açıların Ölçüsü","Çokgenler"]},
      {"title":"Sayılar ve Nicelikler"}
    ]
  }'::jsonb;
  n integer;
  i integer;
  key text;
  item jsonb;
  title text;
  sections jsonb;
begin
  for subj in select * from public.curriculum_subjects loop
    n := coalesce((counts ->> subj.slug)::integer, 6);
    key := subj.grade::text || '-' || subj.slug;
    for i in 1..n loop
      item := named -> key -> (i - 1);
      if item is not null then
        title := item ->> 'title';
        sections := coalesce(item -> 'sections', '[]'::jsonb);
      else
        title := 'Ünite ' || i;
        sections := '[]'::jsonb;
      end if;

      insert into public.curriculum_units (subject_id, title, sort_order, sections)
      values (subj.id, title, i, sections)
      on conflict (subject_id, sort_order) do nothing;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Demo şubeler + assignments (safe if demo school / teachers missing)
-- ---------------------------------------------------------------------------

do $$
declare
  v_school_id uuid;
  v_class_ids uuid[] := '{}';
  v_class_id uuid;
  v_student record;
  v_index integer := 0;
  v_class_count integer;
  v_math5 uuid;
  v_fen5 uuid;
  v_fen6 uuid;
  v_turkce5 uuid;
  v_eng5 uuid;
  v_ayse uuid := 'a1000000-0000-4000-8000-000000000001';
  v_fatma uuid := 'a1000000-0000-4000-8000-000000000002';
  v_zeynep uuid := 'a1000000-0000-4000-8000-000000000003';
  v_murat uuid := 'a1000000-0000-4000-8000-000000000004';
begin
  select id into v_school_id
  from public.schools
  where school_code = 'DEMO123'
  limit 1;

  if v_school_id is null then
    return;
  end if;

  insert into public.classes (school_id, grade, name)
  values
    (v_school_id, 5, 'A'),
    (v_school_id, 5, 'B'),
    (v_school_id, 6, 'A'),
    (v_school_id, 7, 'A'),
    (v_school_id, 8, 'A')
  on conflict (school_id, grade, name) do nothing;

  select array_agg(c.id order by c.grade, c.name)
  into v_class_ids
  from public.classes c
  where c.school_id = v_school_id;

  v_class_count := coalesce(array_length(v_class_ids, 1), 0);
  if v_class_count = 0 then
    return;
  end if;

  for v_student in
    select s.id
    from public.students s
    where s.school_id = v_school_id
    order by s.full_name
  loop
    v_class_id := v_class_ids[(v_index % v_class_count) + 1];
    update public.students
    set class_id = v_class_id
    where id = v_student.id
      and class_id is null;
    v_index := v_index + 1;
  end loop;

  select cs.id into v_math5 from public.curriculum_subjects cs where cs.grade = 5 and cs.slug = 'matematik';
  select cs.id into v_fen5 from public.curriculum_subjects cs where cs.grade = 5 and cs.slug = 'fen';
  select cs.id into v_fen6 from public.curriculum_subjects cs where cs.grade = 6 and cs.slug = 'fen';
  select cs.id into v_turkce5 from public.curriculum_subjects cs where cs.grade = 5 and cs.slug = 'turkce';
  select cs.id into v_eng5 from public.curriculum_subjects cs where cs.grade = 5 and cs.slug = 'ingilizce';

  if exists (select 1 from public.profiles p where p.id = v_ayse and p.role = 'teacher') and v_math5 is not null then
    insert into public.teacher_assignments (teacher_id, class_id, subject_id)
    select v_ayse, c.id, v_math5
    from public.classes c
    where c.school_id = v_school_id and c.grade = 5
    on conflict do nothing;
  end if;

  if exists (select 1 from public.profiles p where p.id = v_fatma and p.role = 'teacher') and v_fen5 is not null then
    insert into public.teacher_assignments (teacher_id, class_id, subject_id)
    select v_fatma, c.id, v_fen5
    from public.classes c
    where c.school_id = v_school_id and c.grade = 5 and c.name = 'A'
    on conflict do nothing;
  end if;

  if exists (select 1 from public.profiles p where p.id = v_fatma and p.role = 'teacher') and v_fen6 is not null then
    insert into public.teacher_assignments (teacher_id, class_id, subject_id)
    select v_fatma, c.id, v_fen6
    from public.classes c
    where c.school_id = v_school_id and c.grade = 6 and c.name = 'A'
    on conflict do nothing;
  end if;

  if exists (select 1 from public.profiles p where p.id = v_zeynep and p.role = 'teacher') and v_turkce5 is not null then
    insert into public.teacher_assignments (teacher_id, class_id, subject_id)
    select v_zeynep, c.id, v_turkce5
    from public.classes c
    where c.school_id = v_school_id and c.grade = 5 and c.name = 'A'
    on conflict do nothing;
  end if;

  if exists (select 1 from public.profiles p where p.id = v_murat and p.role = 'teacher') and v_eng5 is not null then
    insert into public.teacher_assignments (teacher_id, class_id, subject_id)
    select v_murat, c.id, v_eng5
    from public.classes c
    where c.school_id = v_school_id and c.grade = 5 and c.name = 'A'
    on conflict do nothing;
  end if;
end $$;
