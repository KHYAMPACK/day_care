-- Digital izin kağıdı: trips, frozen consents, append-only evidence, aydınlatma, optional PIN.

-- ---------------------------------------------------------------------------
-- PIN columns (hash is never writable by the client)
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists consent_pin_updated_at timestamptz;

create table public.consent_pins (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  pin_hash    text not null,
  updated_at  timestamptz not null default now()
);

alter table public.consent_pins enable row level security;

create or replace function public.protect_consent_pin_updated_at()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  new.consent_pin_updated_at := old.consent_pin_updated_at;
  return new;
end;
$$;

drop trigger if exists profiles_protect_consent_pin on public.profiles;

create trigger profiles_protect_consent_pin
  before update on public.profiles
  for each row execute function public.protect_consent_pin_updated_at();

-- ---------------------------------------------------------------------------
-- Aydınlatma acceptances (writes go through the API so IP is server-captured)
-- ---------------------------------------------------------------------------

create table public.legal_acceptances (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  document_key      text not null,
  document_version  text not null,
  accepted_at       timestamptz not null default now(),
  ip_address        text,
  user_agent        text,

  constraint legal_acceptances_user_doc_unique unique (user_id, document_key, document_version)
);

create index legal_acceptances_user_id_idx on public.legal_acceptances (user_id);

alter table public.legal_acceptances enable row level security;

create policy "Users can read own legal acceptances"
  on public.legal_acceptances
  for select
  to authenticated
  using (user_id = auth.uid());

grant select on public.legal_acceptances to authenticated;

-- ---------------------------------------------------------------------------
-- Trips
-- ---------------------------------------------------------------------------

create table public.trips (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id) on delete restrict,
  title         text not null,
  location      text,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  transport     text,
  cost_text     text,
  details       text,
  consent_text  text not null,
  deadline_at   timestamptz,
  status        text not null default 'draft'
                  check (status in ('draft', 'open', 'closed', 'cancelled')),
  created_by    uuid not null references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index trips_school_starts_idx on public.trips (school_id, starts_at desc);
create index trips_school_status_idx on public.trips (school_id, status);

create or replace function public.trips_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trips_set_updated_at
  before update on public.trips
  for each row execute function public.trips_touch_updated_at();

create or replace function public.protect_open_trip_content()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'draft' then
    return new;
  end if;

  new.title := old.title;
  new.location := old.location;
  new.starts_at := old.starts_at;
  new.ends_at := old.ends_at;
  new.transport := old.transport;
  new.cost_text := old.cost_text;
  new.details := old.details;
  new.consent_text := old.consent_text;
  new.deadline_at := old.deadline_at;
  new.school_id := old.school_id;
  new.created_by := old.created_by;

  if new.status = 'draft' then
    new.status := old.status;
  end if;

  return new;
end;
$$;

create trigger trips_protect_open_content
  before update on public.trips
  for each row execute function public.protect_open_trip_content();

create table public.trip_students (
  trip_id     uuid not null references public.trips (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (trip_id, student_id)
);

create index trip_students_student_id_idx on public.trip_students (student_id);

create table public.trip_consents (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null references public.trips (id) on delete cascade,
  student_id      uuid not null references public.students (id) on delete cascade,
  school_id       uuid not null references public.schools (id) on delete restrict,
  decision        text check (decision is null or decision in ('approved', 'declined')),
  method          text check (method is null or method in ('in_app', 'paper')),
  parent_id       uuid references public.profiles (id) on delete set null,
  event_details   jsonb,
  payload_hash    text,
  security_log    jsonb,
  recorded_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint trip_consents_trip_student_unique unique (trip_id, student_id)
);

create index trip_consents_trip_id_idx on public.trip_consents (trip_id);
create index trip_consents_student_id_idx on public.trip_consents (student_id);

create or replace function public.trip_consents_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trip_consents_set_updated_at
  before update on public.trip_consents
  for each row execute function public.trip_consents_touch_updated_at();

create or replace function public.protect_frozen_consent_details()
returns trigger
language plpgsql
as $$
begin
  new.trip_id := old.trip_id;
  new.student_id := old.student_id;
  new.school_id := old.school_id;

  if old.event_details is not null then
    new.event_details := old.event_details;
  end if;

  return new;
end;
$$;

create trigger trip_consents_protect_event_details
  before update on public.trip_consents
  for each row execute function public.protect_frozen_consent_details();

create table public.trip_consent_events (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  student_id  uuid references public.students (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null
                check (action in (
                  'published',
                  'approved',
                  'declined',
                  'paper_signed',
                  'reminder_sent',
                  'cancelled',
                  'closed'
                )),
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index trip_consent_events_trip_id_idx
  on public.trip_consent_events (trip_id, created_at desc);

create index trip_consent_events_student_id_idx
  on public.trip_consent_events (student_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Visibility helper
-- ---------------------------------------------------------------------------

create or replace function public.trip_visible_to_user(target_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trips t
    where t.id = target_trip_id
      and t.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
      and (
        public.is_director()
        or t.created_by = auth.uid()
        or (
          public.is_teacher()
          and exists (
            select 1
            from public.trip_students ts
            where ts.trip_id = t.id
              and public.is_teacher_of_student(ts.student_id)
          )
        )
        or (
          t.status <> 'draft'
          and exists (
            select 1
            from public.trip_students ts
            join public.student_parents sp on sp.student_id = ts.student_id
            where ts.trip_id = t.id
              and sp.parent_id = auth.uid()
          )
        )
      )
  );
$$;

create or replace function public.can_staff_manage_trip_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_director() or public.is_teacher_of_student(target_student_id);
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.trips enable row level security;
alter table public.trip_students enable row level security;
alter table public.trip_consents enable row level security;
alter table public.trip_consent_events enable row level security;

create policy "Visible trips can be selected"
  on public.trips
  for select
  to authenticated
  using (public.trip_visible_to_user(id));

create policy "Staff can insert draft trips"
  on public.trips
  for insert
  to authenticated
  with check (
    public.is_staff()
    and created_by = auth.uid()
    and status = 'draft'
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

create policy "Staff can update own-school trips"
  on public.trips
  for update
  to authenticated
  using (
    public.is_staff()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (
      public.is_director()
      or created_by = auth.uid()
      or public.trip_visible_to_user(id)
    )
  )
  with check (
    public.is_staff()
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
  );

create policy "Staff can delete draft trips"
  on public.trips
  for delete
  to authenticated
  using (
    public.is_staff()
    and status = 'draft'
    and school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    and (public.is_director() or created_by = auth.uid())
  );

create policy "Visible trip students can be selected"
  on public.trip_students
  for select
  to authenticated
  using (public.trip_visible_to_user(trip_id));

create policy "Staff can insert trip students they manage"
  on public.trip_students
  for insert
  to authenticated
  with check (
    public.can_staff_manage_trip_student(student_id)
    and exists (
      select 1
      from public.trips t
      where t.id = trip_id
        and t.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
        and t.status in ('draft', 'open')
        and exists (
          select 1
          from public.students s
          where s.id = student_id
            and s.school_id = t.school_id
        )
    )
  );

create policy "Staff can delete trip students on drafts"
  on public.trip_students
  for delete
  to authenticated
  using (
    public.can_staff_manage_trip_student(student_id)
    and exists (
      select 1
      from public.trips t
      where t.id = trip_id
        and t.status = 'draft'
        and t.school_id = (select p.school_id from public.profiles p where p.id = auth.uid())
    )
  );

create policy "Visible trip consents can be selected"
  on public.trip_consents
  for select
  to authenticated
  using (public.trip_visible_to_user(trip_id));

create policy "Visible trip consent events can be selected"
  on public.trip_consent_events
  for select
  to authenticated
  using (public.trip_visible_to_user(trip_id));

create policy "Staff can insert operational trip events"
  on public.trip_consent_events
  for insert
  to authenticated
  with check (
    public.is_staff()
    and actor_id = auth.uid()
    and action in ('published', 'cancelled', 'reminder_sent', 'closed')
    and public.trip_visible_to_user(trip_id)
  );

grant select, insert, update, delete on public.trips to authenticated;
grant select, insert, delete on public.trip_students to authenticated;
grant select on public.trip_consents to authenticated;
grant select, insert on public.trip_consent_events to authenticated;
grant all on public.consent_pins to service_role;
grant insert, update on public.legal_acceptances to service_role;
grant insert, update, select on public.trip_consents to service_role;
grant insert on public.trip_consent_events to service_role;
