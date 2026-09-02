import { useMemo } from 'react';
import {
  expandSubjectSchedule,
  resolvePlannedUnitForWeek,
} from '../../lib/curriculum';
import { Icon } from '../ui/Icon';

export default function WeeklySubjectOverview({
  subjects,
  unitsBySubject,
  weekPlans,
  grade,
  weekIndex,
  currentWeekIndex,
}) {
  const rows = useMemo(
    () =>
      subjects.map((subject) => {
        const subjectUnits = unitsBySubject.get(subject.id) ?? [];
        const planned = resolvePlannedUnitForWeek({
          weekPlans,
          units: subjectUnits,
          subjectId: subject.id,
          grade,
          weekIndex,
        });
        const schedule = expandSubjectSchedule(subjectUnits);
        const scheduleMatch = schedule.find(
          (row) => weekIndex >= row.spanStart && weekIndex <= row.spanEnd
        );

        return {
          subject,
          unitTitle: planned?.unit?.title ?? scheduleMatch?.unit?.title ?? null,
          source: planned?.source ?? (scheduleMatch ? 'duration' : null),
        };
      }),
    [subjects, unitsBySubject, weekPlans, grade, weekIndex]
  );

  if (!subjects.length) {
    return <p className="dash-hint">Bu sınıf için ders bulunamadı.</p>;
  }

  return (
    <ul className="cur-week-subject-list cur-week-subject-list--readonly">
      {rows.map(({ subject, unitTitle }) => (
        <li key={subject.id} className="cur-week-subject-row cur-week-subject-row--readonly">
          <span
            className="cur-week-subject-row__label"
            style={{ '--cur-subject': subject.color }}
          >
            <Icon name={subject.icon} size={16} /> {subject.name}
          </span>
          <span className="cur-week-subject-row__value">
            {unitTitle ?? 'Bu hafta için konu atanmadı'}
          </span>
          {weekIndex === currentWeekIndex ? (
            <span className="cur-week-subject-row__badge">Şu an</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
