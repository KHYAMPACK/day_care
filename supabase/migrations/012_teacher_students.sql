-- Assign students to teachers (director-managed class roster)

create table public.teacher_students (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint teacher_students_teacher_student_unique unique (teacher_id, student_id)
);

create index teacher_students_teacher_id_idx on public.teacher_students (teacher_id);
create index teacher_students_student_id_idx on public.teacher_students (student_id);

create or replace function public.enforce_teacher_students_teacher_role()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where id = new.teacher_id
      and role = 'teacher'
  ) then
    raise exception 'teacher_id must reference a profile with role ''teacher''';
  end if;

  return new;
end;
$$;

create trigger teacher_students_enforce_teacher_role
  before insert or update on public.teacher_students
  for each row execute function public.enforce_teacher_students_teacher_role();

alter table public.teacher_students enable row level security;

create policy "Directors can manage teacher_students"
  on public.teacher_students
  for all
  to authenticated
  using (public.is_director())
  with check (public.is_director());

create policy "Teachers can read own teacher_students"
  on public.teacher_students
  for select
  to authenticated
  using (teacher_id = auth.uid() and public.is_teacher());

-- ---------------------------------------------------------------------------
-- RLS helpers & policy updates: teachers see only assigned students/messages
-- ---------------------------------------------------------------------------

create or replace function public.is_teacher_of_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teacher_students ts
    where ts.student_id = target_student_id
      and ts.teacher_id = auth.uid()
      and public.is_teacher()
  );
$$;

drop policy if exists "Staff can select students" on public.students;
drop policy if exists "Teachers can select assigned students" on public.students;
drop policy if exists "Directors and assigned teachers can select students" on public.students;

create policy "Directors and assigned teachers can select students"
  on public.students
  for select
  to authenticated
  using (
    public.is_director()
    or public.is_teacher_of_student(students.id)
  );

drop policy if exists "Staff can insert students" on public.students;
drop policy if exists "Staff can update students" on public.students;
drop policy if exists "Staff can delete students" on public.students;

drop policy if exists "Staff can select messages" on public.messages;
drop policy if exists "Staff can insert messages" on public.messages;
drop policy if exists "Staff can update messages" on public.messages;
drop policy if exists "Staff can delete messages" on public.messages;
drop policy if exists "Teachers can select assigned student messages" on public.messages;
drop policy if exists "Teachers can insert messages for assigned students" on public.messages;

create policy "Teachers and directors can select messages"
  on public.messages
  for select
  to authenticated
  using (
    public.is_director()
    or (
      public.is_teacher()
      and student_id is not null
      and public.is_teacher_of_student(student_id)
    )
  );

create policy "Teachers can insert messages for assigned students"
  on public.messages
  for insert
  to authenticated
  with check (
    public.is_director()
    or (
      public.is_teacher()
      and student_id is not null
      and group_id is null
      and author_id = auth.uid()
      and public.is_teacher_of_student(student_id)
    )
  );
