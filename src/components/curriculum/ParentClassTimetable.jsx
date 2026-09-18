import { useEffect, useMemo, useState } from 'react';
import {
  academicWeekIndex,
  formatClassLabel,
  formatWeekRangeTr,
  loadSchoolClasses,
  weekRangeIso,
} from '../../lib/curriculum';
import { addDaysIso, istanbulDateIso } from '../../lib/calendar';
import { ATLAS_SLOT_COUNT, isSchoolDay } from '../../lib/atlasLessons';
import {
  TIMETABLE_WEEKDAYS,
  formatTimetableSubject,
  loadTimetableForWeek,
  rowsToTimetableGrid,
  timetableSubjectColor,
} from '../../lib/classWeekTimetable';

function gridIsEmpty(grid) {
  if (!grid) return true;
  return TIMETABLE_WEEKDAYS.every((day) =>
    Array.from({ length: ATLAS_SLOT_COUNT }, (_, index) => !grid[day.id]?.[index + 1]).every(Boolean)
  );
}

export default function ParentClassTimetable({
  students = [],
  schoolId,
  calendarEvents = [],
}) {
  const weekIndex = Math.max(1, academicWeekIndex(istanbulDateIso()));
  const { start: weekStart } = weekRangeIso(weekIndex);
  const children = useMemo(
    () => (students ?? []).filter((row) => row.class_id),
    [students]
  );
  const classIds = useMemo(
    () => [...new Set(children.map((row) => row.class_id))],
    [children]
  );

  const [classes, setClasses] = useState([]);
  const [gridsByClass, setGridsByClass] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    let mounted = true;
    loadSchoolClasses(schoolId)
      .then((rows) => {
        if (mounted) setClasses(rows);
      })
      .catch(() => {
        if (mounted) setClasses([]);
      });
    return () => {
      mounted = false;
    };
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId || !classIds.length) {
      setGridsByClass({});
      return;
    }
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const entries = await Promise.all(
          classIds.map(async (classId) => {
            const rows = await loadTimetableForWeek(schoolId, classId, weekIndex);
            return [classId, rowsToTimetableGrid(rows)];
          })
        );
        if (mounted) setGridsByClass(Object.fromEntries(entries));
      } catch {
        if (mounted) setGridsByClass({});
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [schoolId, classIds, weekIndex]);

  if (!children.length) return null;

  const classById = new Map(classes.map((row) => [row.id, row]));

  return (
    <section className="parent-class-timetable dash-card">
      <h2 className="dash-section-title">Bu haftanın ders programı</h2>
      <p className="dash-hint">
        Hafta {weekIndex} · {formatWeekRangeTr(weekIndex)}
      </p>
      {loading ? <p className="dash-hint">Program yükleniyor…</p> : null}
      {children.map((child) => {
        const grid = gridsByClass[child.class_id];
        const klass = classById.get(child.class_id);
        const classLabel = klass
          ? formatClassLabel(klass.grade, klass.name)
          : formatClassLabel(child.grade, '');
        return (
          <article key={child.id} className="parent-class-timetable__child">
            <h3 className="parent-class-timetable__child-title">
              {child.full_name}
              {classLabel ? ` · ${classLabel}` : ''}
            </h3>
            {gridIsEmpty(grid) ? (
              <p className="dash-hint">Bu hafta için henüz program girilmedi.</p>
            ) : (
              <div className="class-week-timetable__table-wrap">
                <table className="class-week-timetable__table class-week-timetable__table--readonly">
                  <thead>
                    <tr>
                      <th>Gün</th>
                      {Array.from({ length: ATLAS_SLOT_COUNT }, (_, index) => (
                        <th key={index}>{index + 1}. ders</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {TIMETABLE_WEEKDAYS.map((day) => {
                      const iso = addDaysIso(weekStart, day.id - 1);
                      const holiday = !isSchoolDay(iso, calendarEvents);
                      return (
                        <tr
                          key={day.id}
                          className={holiday ? 'class-week-timetable__row--holiday' : ''}
                        >
                          <th scope="row">{day.shortLabel}</th>
                          {Array.from({ length: ATLAS_SLOT_COUNT }, (_, index) => {
                            const slot = index + 1;
                            const slug = grid[day.id]?.[slot];
                            const color = timetableSubjectColor(slug);
                            return (
                              <td
                                key={slot}
                                className={slug && !holiday ? 'class-week-timetable__cell--filled' : ''}
                                style={color ? { '--subj-color': color } : undefined}
                              >
                                {holiday ? (
                                  <span className="class-week-timetable__holiday-badge">Tatil</span>
                                ) : slug ? (
                                  formatTimetableSubject(slug)
                                ) : (
                                  <span className="class-week-timetable__empty">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
