-- Optional teacher notes per şube × ders × academic week.

create table if not exists public.curriculum_week_notes (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete restrict,
  class_id    uuid not null references public.classes (id) on delete cascade,
  subject_id  uuid not null references public.curriculum_subjects (id) on delete cascade,
  week_index  integer not null,
  note        text not null default '',
  updated_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint curriculum_week_notes_week_check check (week_index >= 1 and week_index <= 52),
  constraint curriculum_week_notes_unique unique (class_id, subject_id, week_index)
);

create index if not exists curriculum_week_notes_lookup_idx
  on public.curriculum_week_notes (class_id, subject_id, week_index);

create or replace function public.curriculum_week_notes_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists curriculum_week_notes_set_updated_at on public.curriculum_week_notes;
create trigger curriculum_week_notes_set_updated_at
  before insert or update on public.curriculum_week_notes
  for each row execute function public.curriculum_week_notes_touch_updated_at();

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
      and public.is_teacher()
  );
$$;

create or replace function public.parent_linked_to_class(target_class_id uuid)
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

alter table public.curriculum_week_notes enable row level security;

drop policy if exists "Staff and parents can read week notes" on public.curriculum_week_notes;
create policy "Staff and parents can read week notes"
  on public.curriculum_week_notes
  for select
  to authenticated
  using (
    public.class_in_my_school(class_id)
    and (
      public.is_director()
      or public.teacher_assigned_to_class_subject(class_id, subject_id)
      or public.parent_linked_to_class(class_id)
    )
  );

drop policy if exists "Staff can upsert week notes" on public.curriculum_week_notes;
create policy "Staff can upsert week notes"
  on public.curriculum_week_notes
  for insert
  to authenticated
  with check (
    public.class_in_my_school(class_id)
    and (
      public.is_director()
      or public.teacher_assigned_to_class_subject(class_id, subject_id)
    )
  );

drop policy if exists "Staff can update week notes" on public.curriculum_week_notes;
create policy "Staff can update week notes"
  on public.curriculum_week_notes
  for update
  to authenticated
  using (
    public.class_in_my_school(class_id)
    and (
      public.is_director()
      or public.teacher_assigned_to_class_subject(class_id, subject_id)
    )
  )
  with check (
    public.class_in_my_school(class_id)
    and (
      public.is_director()
      or public.teacher_assigned_to_class_subject(class_id, subject_id)
    )
  );

drop policy if exists "Directors can delete week notes" on public.curriculum_week_notes;
create policy "Directors can delete week notes"
  on public.curriculum_week_notes
  for delete
  to authenticated
  using (
    public.is_director()
    and public.class_in_my_school(class_id)
  );

grant select, insert, update, delete on public.curriculum_week_notes to authenticated;
