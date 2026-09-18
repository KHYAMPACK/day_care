-- school_activity_logs only had a SELECT policy for directors. logSchoolActivity() inserts
-- with .select('id').single(), which requires Postgres to read the row back (RETURNING).
-- Teachers/counselors had no SELECT policy at all, so every teacher/counselor-authored
-- insert failed RLS (42501) despite passing its own WITH CHECK — confirmed live: 100% of
-- existing rows were director-authored, and recordSchoolActivity() silently swallows the
-- error. Adding a narrow "own rows" SELECT policy fixes the read-back without exposing the
-- rest of the log feed (the audit UI itself stays director-only).

drop policy if exists "Staff read own school activity logs" on public.school_activity_logs;
create policy "Staff read own school activity logs"
  on public.school_activity_logs
  for select
  to authenticated
  using (
    actor_id = auth.uid()
  );

notify pgrst, 'reload schema';
