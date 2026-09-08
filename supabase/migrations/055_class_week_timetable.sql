-- Per-class weekly 4-slot timetable (Atlas). One subject per weekday + slot.

create table if not exists public.class_week_timetable (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id) on delete restrict,
  class_id      uuid not null references public.classes (id) on delete cascade,
  week_index    smallint not null,
  weekday       smallint not null,
  slot_index    smallint not null,
  subject_slug  text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint class_week_timetable_week_check check (week_index between 1 and 52),
  constraint class_week_timetable_weekday_check check (weekday between 1 and 7),
  constraint class_week_timetable_slot_check check (slot_index between 1 and 4),
  constraint class_week_timetable_subject_check check (
    subject_slug in ('matematik', 'turkce', 'fen', 'sosyal', 'ingilizce', 'din')
  ),
  constraint class_week_timetable_unique unique (school_id, class_id, week_index, weekday, slot_index)
);

create index if not exists class_week_timetable_class_week_idx
  on public.class_week_timetable (class_id, week_index);

create index if not exists class_week_timetable_school_week_idx
  on public.class_week_timetable (school_id, week_index);

create or replace function public.class_week_timetable_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists class_week_timetable_set_updated_at on public.class_week_timetable;
create trigger class_week_timetable_set_updated_at
  before update on public.class_week_timetable
  for each row execute function public.class_week_timetable_touch_updated_at();

alter table public.class_week_timetable enable row level security;

drop policy if exists "School members can select class week timetable" on public.class_week_timetable;
create policy "School members can select class week timetable"
  on public.class_week_timetable
  for select
  to authenticated
  using (
    public.class_in_my_school(class_id)
    and (
      public.is_staff()
      or public.parent_linked_to_class(class_id)
    )
  );

drop policy if exists "Directors and counselors can insert class week timetable" on public.class_week_timetable;
create policy "Directors and counselors can insert class week timetable"
  on public.class_week_timetable
  for insert
  to authenticated
  with check (
    public.class_in_my_school(class_id)
    and (public.is_director() or public.is_counselor())
  );

drop policy if exists "Directors and counselors can update class week timetable" on public.class_week_timetable;
create policy "Directors and counselors can update class week timetable"
  on public.class_week_timetable
  for update
  to authenticated
  using (
    public.class_in_my_school(class_id)
    and (public.is_director() or public.is_counselor())
  )
  with check (
    public.class_in_my_school(class_id)
    and (public.is_director() or public.is_counselor())
  );

drop policy if exists "Directors and counselors can delete class week timetable" on public.class_week_timetable;
create policy "Directors and counselors can delete class week timetable"
  on public.class_week_timetable
  for delete
  to authenticated
  using (
    public.class_in_my_school(class_id)
    and (public.is_director() or public.is_counselor())
  );

grant select, insert, update, delete on public.class_week_timetable to authenticated;

notify pgrst, 'reload schema';
