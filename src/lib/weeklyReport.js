import { addDaysIso, eventVisibleForGrades, istanbulDateIso } from './calendar';
import {
  academicWeekIndex,
  formatClassLabel,
  formatWeekRangeTr,
  isPlaceholderUnitTitle,
  plannedUnitForWeek,
  weekRangeIso,
} from './curriculum';

export function lastCompletedWeekIndex(isoDate = istanbulDateIso()) {
  const current = academicWeekIndex(isoDate);
  const [year, month, day] = isoDate.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (weekday === 0) return current;
  return current - 1;
}

export function reportWeekIndex(isoDate = istanbulDateIso()) {
  const completed = lastCompletedWeekIndex(isoDate);
  if (completed >= 1) return completed;
  const current = academicWeekIndex(isoDate);
  return current >= 1 ? current : null;
}

function inIsoDateWindow(isoTimestamp, startOn, endOnExclusive) {
  if (!isoTimestamp) return false;
  const time = new Date(isoTimestamp).getTime();
  if (Number.isNaN(time)) return false;
  const start = Date.parse(`${startOn}T00:00:00+03:00`);
  const end = Date.parse(`${endOnExclusive}T00:00:00+03:00`);
  return time >= start && time < end;
}

export function buildStudentWeeklyReport({
  student,
  klass,
  weekIndex,
  subjects,
  units,
  progress,
  sessions,
  records,
  events,
  announcements,
  messages,
  weekNotes,
  today = istanbulDateIso(),
}) {
  if (!student) return null;

  const classLabel = klass ? formatClassLabel(klass.grade, klass.name) : '';
  const gradeSubjects = (subjects ?? []).filter((subject) => subject.grade === student.grade);
  const weekLabel = weekIndex ? formatWeekRangeTr(weekIndex) : null;
  const range = weekIndex ? weekRangeIso(weekIndex) : null;
  const weekEndExclusive = range ? addDaysIso(range.end, 1) : null;

  const konular = gradeSubjects
    .map((subject) => {
      const subjectUnits = (units ?? []).filter((unit) => unit.subject_id === subject.id);
      const planned = weekIndex ? plannedUnitForWeek({ units: subjectUnits, weekIndex }) : null;
      if (!planned?.unit || isPlaceholderUnitTitle(planned.unit.title)) return null;
      return {
        subjectName: subject.name,
        unitTitle: planned.unit.title,
        banner: `${planned.unit.title} · hafta ${planned.weekInSpan}/${planned.durationWeeks}`,
      };
    })
    .filter(Boolean);

  const moved = weekIndex
    ? (progress ?? [])
        .filter(
          (row) =>
            row.student_id === student.id &&
            inIsoDateWindow(row.updated_at, range.start, weekEndExclusive)
        )
        .map((row) => {
          const unit = (units ?? []).find((item) => item.id === row.unit_id);
          const subject = (subjects ?? []).find((item) => item.id === unit?.subject_id);
          if (!unit || isPlaceholderUnitTitle(unit.title)) return null;
          return {
            subjectName: subject?.name ?? 'Ders',
            unitTitle: unit.title,
            completed: Boolean(row.completed),
            questionsSolved: row.questions_solved ?? 0,
          };
        })
        .filter(Boolean)
    : [];

  const classSessions = (sessions ?? []).filter((session) => session.class_id === student.class_id);
  const presence = gradeSubjects
    .map((subject) => {
      const subjectSessions = classSessions.filter((session) => session.subject_id === subject.id);
      if (!subjectSessions.length) return null;
      const sessionIds = new Set(subjectSessions.map((session) => session.id));
      const presentCount = (records ?? []).filter(
        (record) =>
          record.student_id === student.id &&
          sessionIds.has(record.session_id) &&
          record.status === 'present'
      ).length;
      return {
        subjectName: subject.name,
        present: presentCount,
        total: subjectSessions.length,
      };
    })
    .filter(Boolean);

  const upcomingUntil = addDaysIso(today, 7);
  const upcoming = (events ?? []).filter((event) => {
    if (event.ends_on < today || event.starts_on > upcomingUntil) return false;
    return eventVisibleForGrades(event, student.grade != null ? [student.grade] : []);
  });

  const schoolNotes = weekIndex
    ? (announcements ?? []).filter((item) =>
        inIsoDateWindow(item.created_at, range.start, weekEndExclusive)
      )
    : [];

  const childNotes = weekIndex
    ? (messages ?? []).filter(
        (item) =>
          item.student_id === student.id &&
          inIsoDateWindow(item.created_at, range.start, weekEndExclusive)
      )
    : [];

  const curriculumNotes =
    weekIndex && student.class_id
      ? (weekNotes ?? [])
          .filter((row) => row.class_id === student.class_id && row.note?.trim())
          .map((row) => ({
            subjectName: row.curriculum_subjects?.name ?? 'Ders',
            note: row.note.trim(),
          }))
      : [];

  return {
    student,
    classLabel,
    weekIndex,
    weekLabel,
    isCurrentWeek: weekIndex === academicWeekIndex(today),
    konular,
    moved,
    presence,
    upcoming,
    schoolNotes,
    childNotes,
    curriculumNotes,
  };
}
