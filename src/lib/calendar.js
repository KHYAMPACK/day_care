import { formatGradeLabel } from './atlasCalendar2026.js';

export const CALENDAR_SELECT =
  'id, school_id, title, body, event_type, starts_on, ends_on, starts_at, audience_grades, notify, source, created_at, updated_at';

export const CALENDAR_EVENT_TYPES = [
  { id: 'holiday', label: 'Tatil', icon: 'sun' },
  { id: 'common_exam', label: 'Ortak sınav', icon: 'file' },
  { id: 'exam', label: 'Deneme', icon: 'file' },
  { id: 'camp', label: 'Kamp', icon: 'tent' },
  { id: 'school_start', label: 'Açılış', icon: 'school' },
  { id: 'school_end', label: 'Kapanış', icon: 'backpack' },
  { id: 'course_start', label: 'Kurs', icon: 'book' },
  { id: 'parent_meeting', label: 'Veli toplantısı', icon: 'users' },
  { id: 'activity', label: 'Etkinlik', icon: 'sparkle' },
  { id: 'important_day', label: 'Önemli gün', icon: 'star' },
];

export const STUDENT_GRADES = [5, 6, 7, 8];

const TYPE_META = Object.fromEntries(CALENDAR_EVENT_TYPES.map((item) => [item.id, item]));

export function getCalendarTypeMeta(eventType) {
  return TYPE_META[eventType] ?? { id: eventType, label: 'Etkinlik', icon: 'calendar' };
}

export function istanbulDateIso(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function addDaysIso(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, '0');
  const d = String(next.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatCalendarDateTr(isoDate) {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('tr-TR', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatCalendarRangeTr(startsOn, endsOn) {
  if (!endsOn || endsOn === startsOn) {
    return formatCalendarDateTr(startsOn);
  }
  return `${formatCalendarDateTr(startsOn)} – ${formatCalendarDateTr(endsOn)}`;
}

export function formatStartsAtTr(startsAt) {
  if (!startsAt) return null;
  return String(startsAt).slice(0, 5);
}

export function eventVisibleForGrades(event, grades) {
  if (!event.audience_grades || event.audience_grades.length === 0) {
    return true;
  }
  if (!grades || grades.length === 0) {
    return false;
  }
  return event.audience_grades.some((grade) => grades.includes(grade));
}

export function uniqueGrades(students) {
  return [
    ...new Set(
      (students ?? [])
        .map((student) => student.grade)
        .filter((grade) => Number.isInteger(grade))
    ),
  ].sort((a, b) => a - b);
}

export function formatStudentGrade(grade) {
  if (!Number.isInteger(grade)) return null;
  return `${grade}. sınıf`;
}

export function buildReminderBody(event) {
  const range =
    event.ends_on && event.ends_on !== event.starts_on
      ? ` (${formatCalendarRangeTr(event.starts_on, event.ends_on)})`
      : '';
  const time = formatStartsAtTr(event.starts_at);
  const timeSuffix = time ? ` (saat ${time})` : '';
  const grades = event.audience_grades?.length
    ? ` ${formatGradeLabel(event.audience_grades)}`
    : '';

  switch (event.event_type) {
    case 'common_exam': {
      const subject = event.exam_subject ?? event.title;
      return `Yarın${grades} ${subject} ortak sınavı var${timeSuffix}.`;
    }
    case 'exam':
      return `Yarın${grades} deneme sınavı var${timeSuffix}.`;
    case 'holiday':
      return event.ends_on && event.ends_on !== event.starts_on
        ? `Yarın ${event.title} başlıyor${range}.`
        : `Yarın ${event.title}.`;
    case 'camp':
      return `Yarın ${event.title} başlıyor${range}.`;
    case 'parent_meeting':
    case 'activity':
      return `Yarın ${event.title} var.`;
    case 'school_start':
    case 'course_start':
    case 'school_end':
      return `Yarın ${event.title}.`;
    default:
      return `Yarın ${event.title}${timeSuffix}.`;
  }
}
