-- Aile İletişim Defteri: one row per student per school day.
-- Teacher fills school page; parent fills home habits. Triggers keep the two sides from overwriting each other.

create table public.notebook_entries (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools (id) on delete restrict,
  student_id          uuid not null references public.students (id) on delete cascade,
  entry_date          date not null,

  breakfast           text check (breakfast is null or breakfast in ('all', 'little', 'none')),
  lunch               text check (lunch is null or lunch in ('all', 'little', 'none')),
  snack               text check (snack is null or snack in ('all', 'little', 'none')),
  rest                text check (rest is null or rest in ('slept', 'rested', 'none')),
  activities          jsonb not null default '{}'::jsonb,
  teacher_note        text,
  teacher_id          uuid references public.profiles (id) on delete set null,
  teacher_updated_at  timestamptz,

  habits              jsonb not null default '{}'::jsonb,
  parent_note         text,
  parent_id           uuid references public.profiles (id) on delete set null,
  parent_updated_at   timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint notebook_entries_student_date_unique unique (school_id, student_id, entry_date)
);

create index notebook_entries_school_date_idx
  on public.notebook_entries (school_id, entry_date);

create index notebook_entries_student_date_idx
  on public.notebook_entries (student_id, entry_date desc);

create or replace function public.notebook_entries_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger notebook_entries_set_updated_at
  before update on public.notebook_entries
  for each row execute function public.notebook_entries_touch_updated_at();

create or replace function public.protect_notebook_entry_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_parent_of_student(old.student_id) and not public.is_staff() then
    new.breakfast := old.breakfast;
    new.lunch := old.lunch;
    new.snack := old.snack;
    new.rest := old.rest;
    new.activities := old.activities;
    new.teacher_note := old.teacher_note;
    new.teacher_id := old.teacher_id;
    new.teacher_updated_at := old.teacher_updated_at;
    new.school_id := old.school_id;
    new.student_id := old.student_id;
    new.entry_date := old.entry_date;
    new.parent_id := auth.uid();
    new.parent_updated_at := now();
  elsif public.is_teacher() then
    new.habits := old.habits;
    new.parent_note := old.parent_note;
    new.parent_id := old.parent_id;
    new.parent_updated_at := old.parent_updated_at;
    new.school_id := old.school_id;
    new.student_id := old.student_id;
    new.entry_date := old.entry_date;
    new.teacher_id := auth.uid();
    new.teacher_updated_at := now();
  end if;

  return new;
end;
$$;

create trigger notebook_entries_protect_columns
  before update on public.notebook_entries
  for each row execute function public.protect_notebook_entry_columns();

alter table public.notebook_entries enable row level security;

create policy "Notebook select for assigned teacher parent or director"
  on public.notebook_entries
  for select
  to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (
      public.is_director()
      or public.is_teacher_of_student(student_id)
      or public.is_parent_of_student(student_id)
    )
  );

create policy "Teachers can insert notebook school pages"
  on public.notebook_entries
  for insert
  to authenticated
  with check (
    public.is_teacher()
    and teacher_id = auth.uid()
    and public.is_teacher_of_student(student_id)
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and exists (
      select 1
      from public.students s
      where s.id = student_id
        and s.school_id = notebook_entries.school_id
    )
  );

create policy "Parents can insert notebook home pages"
  on public.notebook_entries
  for insert
  to authenticated
  with check (
    public.is_parent_of_student(student_id)
    and not public.is_staff()
    and parent_id = auth.uid()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and exists (
      select 1
      from public.students s
      where s.id = student_id
        and s.school_id = notebook_entries.school_id
    )
  );

create policy "Teachers can update notebook school pages"
  on public.notebook_entries
  for update
  to authenticated
  using (
    public.is_teacher()
    and public.is_teacher_of_student(student_id)
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  )
  with check (
    public.is_teacher()
    and public.is_teacher_of_student(student_id)
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

create policy "Parents can update notebook home pages"
  on public.notebook_entries
  for update
  to authenticated
  using (
    public.is_parent_of_student(student_id)
    and not public.is_staff()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  )
  with check (
    public.is_parent_of_student(student_id)
    and not public.is_staff()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

grant select, insert, update on public.notebook_entries to authenticated;
