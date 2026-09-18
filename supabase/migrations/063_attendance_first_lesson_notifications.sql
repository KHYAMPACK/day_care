-- Parent push notification for the first lesson of the day's attendance (present or
-- absent). Existing parent_notifications kinds dedupe per exam/homework/tuition id or
-- per academic week; this one is per calendar day instead, since "first lesson" can come
-- from either attendance flow (Atlas lesson_sessions slot 1, or the classic
-- attendance_sessions table, which has no slot concept) and the only thing both flows
-- share is a session_date. The actual "is this really the first lesson" check and the
-- push itself run in api/attendance-notify.js (service role), same pattern as
-- api/homework-notify.js; this migration just adds the column and its dedupe index.

alter table public.parent_notifications
  add column if not exists session_date date;

create unique index if not exists parent_notifications_attendance_first_lesson_unique_idx
  on public.parent_notifications (parent_id, student_id, kind, session_date)
  where kind = 'attendance_first_lesson' and session_date is not null;

notify pgrst, 'reload schema';
