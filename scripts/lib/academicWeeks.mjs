/** Calendar week helpers for scripts (no app imports). */

export const ACADEMIC_YEAR_ANCHOR = '2026-09-14';
export const MAX_ACADEMIC_WEEKS = 52;

function parseIsoUtc(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function mondayOfWeekContaining(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  date.setUTCDate(date.getUTCDate() + offset);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function academicWeekIndex(isoDate, anchor = ACADEMIC_YEAR_ANCHOR) {
  const week1Monday = mondayOfWeekContaining(anchor);
  const thisMonday = mondayOfWeekContaining(isoDate);
  const days = (parseIsoUtc(thisMonday) - parseIsoUtc(week1Monday)) / 86400000;
  return Math.floor(days / 7) + 1;
}

export function deriveAcademicWeeksFromCalendar(events, anchor = ACADEMIC_YEAR_ANCHOR) {
  const schoolEnds = (events ?? [])
    .filter((event) => event.event_type === 'school_end')
    .map((event) => event.ends_on ?? event.starts_on)
    .filter((iso) => iso && iso >= anchor)
    .sort();
  const lastEnd = schoolEnds.at(-1);
  if (!lastEnd) return MAX_ACADEMIC_WEEKS;
  return Math.max(1, Math.min(MAX_ACADEMIC_WEEKS, academicWeekIndex(lastEnd, anchor)));
}
