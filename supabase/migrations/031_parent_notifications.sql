-- In-app parent notifications (weekly report ready, etc.)

create table if not exists public.parent_notifications (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id) on delete cascade,
  parent_id     uuid not null references public.profiles (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  kind          text not null default 'weekly_report',
  week_index    int not null,
  title         text not null,
  body          text not null default '',
  read_at       timestamptz,
  push_sent_at  timestamptz,
  created_at    timestamptz not null default now(),
  constraint parent_notifications_kind_week_unique
    unique (parent_id, student_id, kind, week_index)
);

create index if not exists parent_notifications_parent_unread_idx
  on public.parent_notifications (parent_id, read_at)
  where read_at is null;

create index if not exists parent_notifications_parent_created_idx
  on public.parent_notifications (parent_id, created_at desc);

alter table public.parent_notifications enable row level security;

drop policy if exists "Parents can select own notifications" on public.parent_notifications;
create policy "Parents can select own notifications"
  on public.parent_notifications for select to authenticated
  using (parent_id = auth.uid());

drop policy if exists "Parents can update own notifications" on public.parent_notifications;
create policy "Parents can update own notifications"
  on public.parent_notifications for update to authenticated
  using (parent_id = auth.uid())
  with check (parent_id = auth.uid());

grant select, update on public.parent_notifications to authenticated;
