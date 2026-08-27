import { useCallback, useEffect, useMemo, useState } from 'react';
import { istanbulDateIso, uniqueGrades } from '../../lib/calendar';
import {
  EXAM_KIND,
  examKindFromEvent,
  filterExamEvents,
  formatExamEventLabel,
  formatExamWhen,
  loadExamCalendarEvents,
  loadPublishedResultsForStudents,
  splitExamsByTiming,
} from '../../lib/exams';
import { readExamDemoConfig } from '../../lib/examDemoConfig';
import { InlineError } from '../dashboardUi';

export default function ParentExams({ students, schoolId }) {
  const [config, setConfig] = useState(() => readExamDemoConfig());
  const [events, setEvents] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const childGrades = useMemo(() => uniqueGrades(students), [students]);
  const studentIds = useMemo(() => students.map((student) => student.id), [students]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [calendarRows, resultRows] = await Promise.all([
        loadExamCalendarEvents(schoolId, { includePast: false }),
        readExamDemoConfig().storeResults
          ? loadPublishedResultsForStudents(studentIds)
          : Promise.resolve([]),
      ]);
      setEvents(calendarRows);
      setResults(resultRows);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [schoolId, studentIds]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function sync() {
      setConfig(readExamDemoConfig());
      load();
    }
    window.addEventListener('exam-demo-config', sync);
    return () => window.removeEventListener('exam-demo-config', sync);
  }, [load]);

  const filtered = useMemo(
    () => filterExamEvents(events, { config, grades: childGrades }),
    [events, config, childGrades]
  );

  const { upcoming } = useMemo(
    () => splitExamsByTiming(filtered, istanbulDateIso()),
    [filtered]
  );

  const resultsByChild = useMemo(() => {
    if (!config.storeResults) return [];
    return students.map((student) => ({
      student,
      items: results
        .filter((row) => row.student_id === student.id)
        .map((row) => ({
          id: row.id,
          title: row.exam_sessions?.title ?? 'Sınav',
          heldOn: row.exam_sessions?.held_on,
          kind: row.exam_sessions?.kind,
          net: row.net,
        }))
        .sort((a, b) => (b.heldOn ?? '').localeCompare(a.heldOn ?? '')),
    }));
  }, [students, results, config.storeResults]);

  if (loading) {
    return (
      <section className="dash-card">
        <p className="dash-hint">Sınavlar yükleniyor…</p>
      </section>
    );
  }

  return (
    <>
      <header className="dash-header">
        <h1 className="dash-title">Sınavlar</h1>
        <p className="dash-subtitle">Ortak sınav ve deneme takvimi · yayınlanan netler</p>
      </header>

      {error && <InlineError error={error} context="calendar" />}

      {students.length === 0 ? (
        <section className="dash-card">
          <p className="dash-hint">Hesabınıza bağlı öğrenci yok.</p>
        </section>
      ) : (
        <>
          <section className="dash-card">
            <h2 className="dash-section-title">Yaklaşan</h2>
            {!config.showCommonExams && !config.showMockExams ? (
              <p className="dash-hint">Sınav takibi henüz açılmadı.</p>
            ) : upcoming.length === 0 ? (
              <p className="dash-hint">Yaklaşan sınav yok.</p>
            ) : (
              <ul className="exam-list">
                {upcoming.map((event) => (
                  <li key={event.id}>
                    <strong>{formatExamEventLabel(event)}</strong>
                    <span className="dash-hint">
                      {formatExamWhen(event)}
                      {examKindFromEvent(event) === EXAM_KIND.common ? ' · Ortak' : ' · Deneme'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {config.storeResults ? (
            <section className="dash-card">
              <h2 className="dash-section-title">Sonuçlar</h2>
              {resultsByChild.every((group) => group.items.length === 0) ? (
                <p className="dash-hint">Yayınlanmış sonuç yok.</p>
              ) : (
                resultsByChild.map(({ student, items }) =>
                  items.length === 0 ? null : (
                    <div key={student.id} className="exam-child-block">
                      <h3 className="dash-section-title">{student.full_name}</h3>
                      <ul className="exam-list">
                        {items.map((item) => (
                          <li key={item.id}>
                            <strong>{item.title}</strong>
                            <span className="dash-hint">
                              {item.heldOn ? formatExamWhen({ starts_on: item.heldOn }) : ''}
                              {item.net != null ? ` · Net: ${item.net}` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                )
              )}
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
