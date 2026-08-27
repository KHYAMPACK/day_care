-- Announcement center + teacher WhatsApp contact number.
-- Teachers broadcast to assigned students; parents read-only.
-- Parents reach teachers via wa.me using profiles.phone (not a full profile read).

alter table public.profiles
  add column if not exists phone text;

alter table public.profiles
  drop constraint if exists profiles_phone_digits_check;

alter table public.profiles
  add constraint profiles_phone_digits_check
  check (phone is null or phone ~ '^[0-9]{10,15}$');

-- ---------------------------------------------------------------------------
-- announcements
-- ---------------------------------------------------------------------------

create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete restrict,
  author_id   uuid not null references public.profiles (id) on delete restrict,
  author_name text not null default 'Öğretmen',
  title       text not null,
  body        text not null,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index announcements_school_feed_idx
  on public.announcements (school_id, pinned desc, created_at desc);

create index announcements_author_id_idx
  on public.announcements (author_id);

create or replace function public.announcements_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger announcements_set_updated_at
  before update on public.announcements
  for each row execute function public.announcements_touch_updated_at();

create or replace function public.announcements_set_author_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_name text;
begin
  select coalesce(nullif(trim(p.full_name), ''), 'Öğretmen')
    into resolved_name
  from public.profiles p
  where p.id = new.author_id;

  new.author_name := coalesce(resolved_name, 'Öğretmen');
  return new;
end;
$$;

create trigger announcements_fill_author_name
  before insert or update of author_id on public.announcements
  for each row execute function public.announcements_set_author_name();

create or replace function public.parent_can_read_announcement(target public.announcements)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.student_parents sp
    join public.teacher_students ts on ts.student_id = sp.student_id
    where sp.parent_id = auth.uid()
      and ts.teacher_id = target.author_id
  );
$$;

alter table public.announcements enable row level security;

create policy "Assigned teachers parents and directors can select announcements"
  on public.announcements
  for select
  to authenticated
  using (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (
      public.is_director()
      or author_id = auth.uid()
      or public.parent_can_read_announcement(announcements)
    )
  );

create policy "Teachers can insert own announcements"
  on public.announcements
  for insert
  to authenticated
  with check (
    school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and author_id = auth.uid()
    and (
      public.is_teacher()
      or public.is_director()
    )
  );

create policy "Teachers can update own announcements"
  on public.announcements
  for update
  to authenticated
  using (
    public.is_teacher()
    and author_id = auth.uid()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  )
  with check (
    public.is_teacher()
    and author_id = auth.uid()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

create policy "Teachers can delete own announcements"
  on public.announcements
  for delete
  to authenticated
  using (
    public.is_teacher()
    and author_id = auth.uid()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

create policy "Directors can manage school announcements"
  on public.announcements
  for all
  to authenticated
  using (
    public.is_director()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  )
  with check (
    public.is_director()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

grant select, insert, update, delete on public.announcements to authenticated;

alter table public.announcements replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.announcements;
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Parent teacher contacts (narrow columns; no email / push subscription)
-- ---------------------------------------------------------------------------

create or replace function public.get_parent_teacher_contacts()
returns table (
  teacher_id uuid,
  full_name text,
  phone text,
  student_id uuid,
  student_full_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ts.teacher_id,
    p.full_name,
    p.phone,
    s.id as student_id,
    s.full_name as student_full_name
  from public.student_parents sp
  join public.students s on s.id = sp.student_id
  join public.teacher_students ts on ts.student_id = sp.student_id
  join public.profiles p on p.id = ts.teacher_id
  where sp.parent_id = auth.uid()
    and p.role = 'teacher'
    and s.school_id = (
      select pr.school_id
      from public.profiles pr
      where pr.id = auth.uid()
    )
  order by p.full_name, s.full_name;
$$;

revoke all on function public.get_parent_teacher_contacts() from public;
grant execute on function public.get_parent_teacher_contacts() to authenticated;
