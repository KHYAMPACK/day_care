-- Per-school custom domain for branded subdomain routing (e.g. veli.atlasegitimkurumu.com)

alter table public.schools
  add column if not exists custom_domain text;

create unique index if not exists schools_custom_domain_unique_idx
  on public.schools (custom_domain)
  where custom_domain is not null;

-- Normalize domain on write: lowercase hostname, no scheme/path
create or replace function public.normalize_custom_domain(p_domain text)
returns text
language plpgsql
immutable
as $$
declare
  v text;
begin
  v := lower(btrim(coalesce(p_domain, '')));
  if v = '' then
    return null;
  end if;

  v := regexp_replace(v, '^https?://', '');
  v := split_part(v, '/', 1);
  v := split_part(v, ':', 1);
  v := regexp_replace(v, '\.$', '');

  if v = '' then
    return null;
  end if;

  return v;
end;
$$;

create or replace function public.schools_normalize_custom_domain()
returns trigger
language plpgsql
as $$
begin
  new.custom_domain := public.normalize_custom_domain(new.custom_domain);
  return new;
end;
$$;

drop trigger if exists schools_normalize_custom_domain_trigger on public.schools;

create trigger schools_normalize_custom_domain_trigger
  before insert or update of custom_domain on public.schools
  for each row
  execute function public.schools_normalize_custom_domain();

-- Public lookup for tenant branding (anon + authenticated)
create or replace function public.resolve_school_by_domain(p_host text)
returns table (
  id uuid,
  name text,
  logo_url text,
  primary_color text,
  secondary_color text,
  custom_domain text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.name,
    s.logo_url,
    s.primary_color,
    s.secondary_color,
    s.custom_domain
  from public.schools s
  where s.custom_domain = public.normalize_custom_domain(p_host)
  limit 1;
$$;

revoke all on function public.resolve_school_by_domain(text) from public;
grant execute on function public.resolve_school_by_domain(text) to anon, authenticated;
