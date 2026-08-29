-- Run this ALONE in Supabase SQL Editor first, then run 026_exams.sql.
-- PostgreSQL cannot use a new enum value in the same transaction it was added.

alter type public.calendar_event_type add value if not exists 'common_exam';
