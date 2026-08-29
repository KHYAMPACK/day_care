-- Store current login PIN for director handoff (director-readable via existing profiles RLS)

alter table public.profiles
  add column if not exists login_pin text;

comment on column public.profiles.login_pin is
  'Current 6-digit login PIN; visible to school directors for credential handoff.';
