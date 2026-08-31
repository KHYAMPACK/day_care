-- Drop atlas_* compatibility views created in 047.
-- Apply after the app uses lesson_* / teacher_* table names (same deploy as the JS update is fine).
-- Does nothing if 047 was not applied or views were already dropped.

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'atlas_lesson_sessions'
      and c.relkind = 'v'
  ) then
    drop view public.atlas_lesson_sessions;
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'atlas_lesson_attendance'
      and c.relkind = 'v'
  ) then
    drop view public.atlas_lesson_attendance;
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'atlas_lesson_results'
      and c.relkind = 'v'
  ) then
    drop view public.atlas_lesson_results;
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'atlas_teacher_day_responses'
      and c.relkind = 'v'
  ) then
    drop view public.atlas_teacher_day_responses;
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'atlas_teacher_missed_day_prompts'
      and c.relkind = 'v'
  ) then
    drop view public.atlas_teacher_missed_day_prompts;
  end if;
end $$;

notify pgrst, 'reload schema';
