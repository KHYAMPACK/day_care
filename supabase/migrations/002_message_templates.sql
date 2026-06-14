-- Custom message templates for admin quick-fill

create table public.message_templates (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger message_templates_set_updated_at
  before update on public.message_templates
  for each row execute function public.set_updated_at();

alter table public.message_templates enable row level security;

create policy "Admins can select message templates"
  on public.message_templates
  for select
  to authenticated
  using (public.is_admin());

create policy "Admins can insert message templates"
  on public.message_templates
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update message templates"
  on public.message_templates
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete message templates"
  on public.message_templates
  for delete
  to authenticated
  using (public.is_admin());

insert into public.message_templates (title, body) values
  ('Pickup reminder', 'Please remember to pick up your child by 5:30 PM today.'),
  ('Field trip tomorrow', 'Reminder: we have a field trip tomorrow. Please send your child with a packed lunch and comfortable shoes.'),
  ('Illness notice', 'A child in your child''s group was reported ill today. Please monitor your child for symptoms and keep them home if unwell.');
