-- Pin the leftover-insert fallback to the sales demo school.
-- After extra schools (including İlk Memnun Kreş) are deleted, "oldest school"
-- must not silently become Atlas VIP.

create or replace function public.default_school_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.schools
  where school_code = 'DEMO123'
  limit 1;
$$;
