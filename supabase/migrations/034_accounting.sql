-- Institutional accounting (director-only): expense ledger, suppliers, budget planning.
-- No payment processing — management notebook only.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'accounting_procurement_status'
  ) then
    create type public.accounting_procurement_status as enum (
      'none',
      'requested',
      'ordered',
      'received'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Expense categories
-- ---------------------------------------------------------------------------

create table if not exists public.accounting_expense_categories (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete restrict,
  name        text not null,
  sort_order  smallint not null default 0,
  color       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint accounting_expense_categories_school_name_unique unique (school_id, name)
);

create index if not exists accounting_expense_categories_school_idx
  on public.accounting_expense_categories (school_id, sort_order);

-- ---------------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------------

create table if not exists public.accounting_suppliers (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id) on delete restrict,
  name          text not null,
  contact_name  text,
  phone         text,
  email         text,
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint accounting_suppliers_school_name_unique unique (school_id, name)
);

create index if not exists accounting_suppliers_school_active_idx
  on public.accounting_suppliers (school_id, is_active, name);

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------

create table if not exists public.accounting_expenses (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools (id) on delete restrict,
  category_id         uuid not null references public.accounting_expense_categories (id) on delete restrict,
  supplier_id         uuid references public.accounting_suppliers (id) on delete set null,
  class_id            uuid references public.classes (id) on delete set null,
  title               text not null,
  description         text,
  amount              numeric(12, 2) not null,
  expense_date        date not null,
  procurement_status  public.accounting_procurement_status not null default 'none',
  reference_no        text,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint accounting_expenses_amount_positive check (amount > 0)
);

create index if not exists accounting_expenses_school_date_idx
  on public.accounting_expenses (school_id, expense_date desc);

create index if not exists accounting_expenses_category_idx
  on public.accounting_expenses (school_id, category_id, expense_date desc);

create index if not exists accounting_expenses_supplier_idx
  on public.accounting_expenses (school_id, supplier_id);

-- ---------------------------------------------------------------------------
-- Budget periods + lines
-- ---------------------------------------------------------------------------

create table if not exists public.accounting_budget_periods (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete restrict,
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint accounting_budget_periods_date_range check (end_date >= start_date),
  constraint accounting_budget_periods_school_name_unique unique (school_id, name)
);

create index if not exists accounting_budget_periods_school_idx
  on public.accounting_budget_periods (school_id, start_date desc);

create table if not exists public.accounting_budget_lines (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools (id) on delete restrict,
  period_id       uuid not null references public.accounting_budget_periods (id) on delete cascade,
  category_id     uuid not null references public.accounting_expense_categories (id) on delete restrict,
  planned_amount  numeric(12, 2) not null default 0,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint accounting_budget_lines_period_category_unique unique (period_id, category_id),
  constraint accounting_budget_lines_planned_nonneg check (planned_amount >= 0)
);

create index if not exists accounting_budget_lines_period_idx
  on public.accounting_budget_lines (period_id, category_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create or replace function public.accounting_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'accounting_expense_categories',
    'accounting_suppliers',
    'accounting_expenses',
    'accounting_budget_periods',
    'accounting_budget_lines'
  ]
  loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', tbl, tbl);
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function public.accounting_touch_updated_at()',
      tbl,
      tbl
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS — director only
-- ---------------------------------------------------------------------------

alter table public.accounting_expense_categories enable row level security;
alter table public.accounting_suppliers enable row level security;
alter table public.accounting_expenses enable row level security;
alter table public.accounting_budget_periods enable row level security;
alter table public.accounting_budget_lines enable row level security;

-- Categories
drop policy if exists "Directors manage accounting categories" on public.accounting_expense_categories;
create policy "Directors manage accounting categories"
  on public.accounting_expense_categories
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

-- Suppliers
drop policy if exists "Directors manage accounting suppliers" on public.accounting_suppliers;
create policy "Directors manage accounting suppliers"
  on public.accounting_suppliers
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

-- Expenses
drop policy if exists "Directors manage accounting expenses" on public.accounting_expenses;
create policy "Directors manage accounting expenses"
  on public.accounting_expenses
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

-- Budget periods
drop policy if exists "Directors manage accounting budget periods" on public.accounting_budget_periods;
create policy "Directors manage accounting budget periods"
  on public.accounting_budget_periods
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

-- Budget lines
drop policy if exists "Directors manage accounting budget lines" on public.accounting_budget_lines;
create policy "Directors manage accounting budget lines"
  on public.accounting_budget_lines
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

grant select, insert, update, delete on public.accounting_expense_categories to authenticated;
grant select, insert, update, delete on public.accounting_suppliers to authenticated;
grant select, insert, update, delete on public.accounting_expenses to authenticated;
grant select, insert, update, delete on public.accounting_budget_periods to authenticated;
grant select, insert, update, delete on public.accounting_budget_lines to authenticated;
