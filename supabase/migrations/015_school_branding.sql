-- Per-school branding: logo and theme colors

alter table public.schools
  add column if not exists logo_url text,
  add column if not exists primary_color text,
  add column if not exists secondary_color text;
