-- Lock school branding columns from director/authenticated updates.
-- Service role (scripts, admin) can still set branding at school creation.

create or replace function public.schools_lock_branding_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    new.logo_url := old.logo_url;
    new.primary_color := old.primary_color;
    new.secondary_color := old.secondary_color;
    new.custom_domain := old.custom_domain;
  end if;
  return new;
end;
$$;

drop trigger if exists schools_lock_branding_columns_trigger on public.schools;
create trigger schools_lock_branding_columns_trigger
  before update on public.schools
  for each row
  execute function public.schools_lock_branding_columns();
