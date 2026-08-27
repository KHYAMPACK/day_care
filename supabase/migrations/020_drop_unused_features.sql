-- Remove notebook, surveys, trips, consent PIN, and legal-acceptance tables.
-- Historical migrations are left intact.

-- ---------------------------------------------------------------------------
-- Realtime (ignore if the table was never added to the publication)
-- ---------------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime drop table public.surveys;
exception
  when undefined_object then null;
  when undefined_table then null;
end $$;

do $$
begin
  alter publication supabase_realtime drop table public.survey_responses;
exception
  when undefined_object then null;
  when undefined_table then null;
end $$;

-- ---------------------------------------------------------------------------
-- Tables (CASCADE drops policies and table-local triggers)
-- ---------------------------------------------------------------------------

drop table if exists public.trip_consent_events cascade;
drop table if exists public.trip_consents cascade;
drop table if exists public.trip_students cascade;
drop table if exists public.trips cascade;

drop table if exists public.survey_responses cascade;
drop table if exists public.survey_students cascade;
drop table if exists public.survey_options cascade;
drop table if exists public.surveys cascade;

drop table if exists public.notebook_entries cascade;

drop table if exists public.legal_acceptances cascade;
drop table if exists public.consent_pins cascade;

-- ---------------------------------------------------------------------------
-- Profile PIN column and leftover functions
-- ---------------------------------------------------------------------------

drop trigger if exists profiles_protect_consent_pin on public.profiles;
alter table public.profiles drop column if exists consent_pin_updated_at;

drop function if exists public.protect_consent_pin_updated_at() cascade;
drop function if exists public.trips_touch_updated_at() cascade;
drop function if exists public.protect_open_trip_content() cascade;
drop function if exists public.trip_consents_touch_updated_at() cascade;
drop function if exists public.protect_frozen_consent_details() cascade;
drop function if exists public.trip_visible_to_user(uuid) cascade;
drop function if exists public.can_staff_manage_trip_student(uuid) cascade;

drop function if exists public.surveys_touch_updated_at() cascade;
drop function if exists public.protect_open_survey_content() cascade;
drop function if exists public.protect_survey_options_when_published() cascade;
drop function if exists public.protect_survey_students_when_published() cascade;
drop function if exists public.survey_responses_touch_updated_at() cascade;
drop function if exists public.protect_survey_response_keys() cascade;
drop function if exists public.survey_visible_to_user(uuid) cascade;
drop function if exists public.can_staff_manage_survey_student(uuid) cascade;
drop function if exists public.survey_option_counts(uuid) cascade;

drop function if exists public.notebook_entries_touch_updated_at() cascade;
drop function if exists public.protect_notebook_entry_columns() cascade;

drop function if exists public.legal_acceptances_stamp() cascade;
