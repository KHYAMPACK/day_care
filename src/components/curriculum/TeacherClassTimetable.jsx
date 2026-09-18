import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { withSchoolFilter } from '../../lib/tenant';
import { CALENDAR_SELECT, addDaysIso, istanbulDateIso } from '../../lib/calendar';
import {
  academicWeekIndex,
  formatClassLabel,
  formatWeekRangeTr,
  loadSchoolClasses,
  weekRangeIso,
} from '../../lib/curriculum';
import { ATLAS_SLOT_COUNT, isSchoolDay } from '../../lib/atlasLessons';
import {
  TIMETABLE_WEEKDAYS,
  formatTimetableSubject,
  loadTimetableForWeek,
  rowsToTimetableGrid,
  timetableSubjectColor,
} from '../../lib/classWeekTimetable';
import { InlineError } from '../dashboardUi';
import { AnimatedView } from '../ui/AnimatedView';
import AtlasClassPicker from '../atlas/AtlasClassPicker';

export default function TeacherClassTimetable({ schoolId }) {
  const weekIndex = Math.max(1, academicWeekIndex(istanbulDateIso()));
  const { start: weekStart } = weekRangeIso(weekIndex);

  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [grid, setGrid] = useState(null);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!schoolId) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [schoolClasses, eventsRes] = await Promise.all([
          loadSchoolClasses(schoolId),
          withSchoolFilter(supabase.from('calendar_events').select(CALENDAR_SELECT), schoolId),
        ]);
        if (!mounted) return;
        setClasses(schoolClasses);
        if (eventsRes.error) throw eventsRes.error;
        setCalendarEvents(eventsRes.data ?? []);
      } catch (loadError) {
        if (mounted) setError(loadError);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId || !selectedClassId) {
      setGrid(null);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const rows = await loadTimetableForWeek(schoolId, selectedClassId, weekIndex);
        if (mounted) setGrid(rowsToTimetableGrid(rows));
      } catch (loadError) {
        if (mounted) setError(loadError);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [schoolId, selectedClassId, weekIndex]);

  const klass = classes.find((row) => row.id === selectedClassId) ?? null;

  if (loading) {
    return (
      <section className="director-panel">
        <p className="dash-hint">Program yükleniyor…</p>
      </section>
    );
  }

  if (!classes.length) {
    return (
      <section className="director-panel">
        <h2 className="dash-section-title">Program</h2>
        <p className="dash-hint">Henüz şube tanımlı değil.</p>
      </section>
    );
  }

  if (!selectedClassId) {
    return (
      <AnimatedView viewKey="schedule-classes" enterOnMount={false}>
        <section className="director-panel atlas-lessons">
          <header className="atlas-lessons__header">
            <h2 className="dash-section-title">Program</h2>
            <p className="dash-hint">
              Hafta {weekIndex} · {formatWeekRangeTr(weekIndex)}
            </p>
          </header>
          {error && <InlineError error={error} context="general" />}
          <AtlasClassPicker
            classes={classes}
            hint="Haftalık programı görmek için şube seçin."
            onSelectClass={setSelectedClassId}
          />
        </section>
      </AnimatedView>
    );
  }

  return (
    <AnimatedView viewKey={`schedule-${selectedClassId}`} enterOnMount={false}>
      <section className="director-panel atlas-lessons">
        <header className="atlas-lessons__header">
          <button
            type="button"
            className="demo-btn demo-btn--ghost atlas-lessons__back"
            onClick={() => setSelectedClassId(null)}
          >
            ← Şubeler
          </button>
          <h2 className="dash-section-title">
            {klass ? formatClassLabel(klass.grade, klass.name) : 'Program'}
          </h2>
          <p className="dash-hint">
            Hafta {weekIndex} · {formatWeekRangeTr(weekIndex)}
          </p>
        </header>

        {error && <InlineError error={error} context="general" />}

        {!grid ? (
          <p className="dash-hint">Program yükleniyor…</p>
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
      </section>
    </AnimatedView>
  );
}
