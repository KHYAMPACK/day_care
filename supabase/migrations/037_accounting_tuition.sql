-- Per-student tuition billing + payment cycles (director-managed, parent read-only).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'accounting_tuition_status'
  ) then
    create type public.accounting_tuition_status as enum ('pending', 'paid', 'overdue');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Student billing config
-- ---------------------------------------------------------------------------

create table if not exists public.accounting_student_billing (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools (id) on delete restrict,
  student_id          uuid not null references public.students (id) on delete cascade,
  monthly_amount      numeric(12, 2) not null,
  billing_start_date  date not null,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint accounting_student_billing_student_unique unique (student_id),
  constraint accounting_student_billing_amount_positive check (monthly_amount > 0)
);

create index if not exists accounting_student_billing_school_idx
  on public.accounting_student_billing (school_id, is_active);

-- ---------------------------------------------------------------------------
-- Tuition cycles (one row per student per dönem)
-- ---------------------------------------------------------------------------

create table if not exists public.accounting_tuition_cycles (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid not null references public.schools (id) on delete restrict,
  student_id            uuid not null references public.students (id) on delete cascade,
  period_start          date not null,
  period_end            date not null,
  due_date              date not null,
  amount                numeric(12, 2) not null,
  status                public.accounting_tuition_status not null default 'pending',
  paid_at               timestamptz,
  recorded_by           uuid references public.profiles (id) on delete set null,
  reminder_sent_at      timestamptz,
  overdue_notified_at   timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint accounting_tuition_cycles_student_due_unique unique (student_id, due_date),
  constraint accounting_tuition_cycles_amount_positive check (amount > 0),
  constraint accounting_tuition_cycles_period_range check (period_end >= period_start)
);

create index if not exists accounting_tuition_cycles_school_due_idx
  on public.accounting_tuition_cycles (school_id, due_date desc);

create index if not exists accounting_tuition_cycles_student_status_idx
  on public.accounting_tuition_cycles (student_id, status, due_date desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create or replace function public.accounting_tuition_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists accounting_student_billing_set_updated_at on public.accounting_student_billing;
create trigger accounting_student_billing_set_updated_at
  before update on public.accounting_student_billing
  for each row execute function public.accounting_tuition_touch_updated_at();

drop trigger if exists accounting_tuition_cycles_set_updated_at on public.accounting_tuition_cycles;
create trigger accounting_tuition_cycles_set_updated_at
  before update on public.accounting_tuition_cycles
  for each row execute function public.accounting_tuition_touch_updated_at();

-- ---------------------------------------------------------------------------
-- parent_notifications extension
-- ---------------------------------------------------------------------------

alter table public.parent_notifications
  add column if not exists tuition_cycle_id uuid
    references public.accounting_tuition_cycles (id) on delete cascade;

create unique index if not exists parent_notifications_tuition_reminder_unique_idx
  on public.parent_notifications (parent_id, student_id, kind, tuition_cycle_id)
  where kind = 'tuition_reminder' and tuition_cycle_id is not null;

create unique index if not exists parent_notifications_tuition_overdue_unique_idx
  on public.parent_notifications (parent_id, student_id, kind, tuition_cycle_id)
  where kind = 'tuition_overdue' and tuition_cycle_id is not null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.accounting_student_billing enable row level security;
alter table public.accounting_tuition_cycles enable row level security;

drop policy if exists "Directors manage student billing" on public.accounting_student_billing;
create policy "Directors manage student billing"
  on public.accounting_student_billing
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

drop policy if exists "Directors manage tuition cycles" on public.accounting_tuition_cycles;
create policy "Directors manage tuition cycles"
  on public.accounting_tuition_cycles
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

drop policy if exists "Parents read linked student tuition cycles" on public.accounting_tuition_cycles;
create policy "Parents read linked student tuition cycles"
  on public.accounting_tuition_cycles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_parents sp
      where sp.student_id = accounting_tuition_cycles.student_id
        and sp.parent_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.accounting_student_billing to authenticated;
grant select, insert, update, delete on public.accounting_tuition_cycles to authenticated;
