-- School activity logs: append-only audit trail for staff actions (director Kayıtlar tab).

create table if not exists public.school_activity_logs (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_role  text not null check (actor_role in ('director', 'teacher', 'counselor', 'system')),
  category    text not null,
  action      text not null,
  summary     text not null,
  target_type text,
  target_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists school_activity_logs_school_created_idx
  on public.school_activity_logs (school_id, created_at desc);

create index if not exists school_activity_logs_school_category_created_idx
  on public.school_activity_logs (school_id, category, created_at desc);

alter table public.school_activity_logs enable row level security;

drop policy if exists "Directors read school activity logs" on public.school_activity_logs;
create policy "Directors read school activity logs"
  on public.school_activity_logs
  for select
  to authenticated
  using (
    public.is_director()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "Staff insert own school activity logs" on public.school_activity_logs;
create policy "Staff insert own school activity logs"
  on public.school_activity_logs
  for insert
  to authenticated
  with check (
    actor_id = auth.uid()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (
      public.is_director()
      or public.is_teacher()
      or public.is_counselor()
    )
  );

grant select, insert on public.school_activity_logs to authenticated;
