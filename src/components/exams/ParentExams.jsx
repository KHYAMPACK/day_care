import { useCallback, useEffect, useMemo, useState } from 'react';
import { istanbulDateIso, uniqueGrades } from '../../lib/calendar';
import { hasAtlasSchedule } from '../../lib/schoolFeatures';
import { resolveExamConfig } from '../../lib/examConfig';
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
import {
  buildProgressSeries,
  loadPublishedSubjectResultsForStudents,
  loadRankingsForStudents,
} from '../../lib/lgsExam';
import { getDemoParentExamPack } from '../../lib/examDemoData';
import { isDemoSchool } from '../../lib/parentDemoData';
import { InlineError } from '../dashboardUi';
import ParentExamReport from './ParentExamReport';
import ParentErrorReport from './ParentErrorReport';

export default function ParentExams({ students, schoolId, school, classes = [] }) {
  const [config, setConfig] = useState(() => resolveExamConfig(school));
  const [events, setEvents] = useState([]);
  const [subjectResults, setSubjectResults] = useState([]);
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const childGrades = useMemo(() => uniqueGrades(students), [students]);
  const studentIds = useMemo(() => students.map((student) => student.id), [students]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cfg = resolveExamConfig(school);
      const [calendarRows, subjectRows, rankingRows, legacyRows] = await Promise.all([
        loadExamCalendarEvents(schoolId, { includePast: false }),
        cfg.storeResults ? loadPublishedSubjectResultsForStudents(studentIds) : Promise.resolve([]),
        cfg.storeResults ? loadRankingsForStudents(studentIds) : Promise.resolve([]),
        cfg.storeResults ? loadPublishedResultsForStudents(studentIds) : Promise.resolve([]),
      ]);
      const resolvedRankings = rankingRows.length
        ? rankingRows
        : legacyRows.map((row) => ({
            session_id: row.session_id,
            student_id: row.student_id,
            total_net: row.net,
            lgs_score: row.score,
            exam_sessions: row.exam_sessions,
          }));

      const useDemoExams =
        !hasAtlasSchedule(school) &&
        isDemoSchool(school) &&
        cfg.storeResults &&
        resolvedRankings.length === 0 &&
        subjectRows.length === 0 &&
        students.length > 0;

      if (useDemoExams) {
        const pack = getDemoParentExamPack(students);
        setEvents(calendarRows);
        setSubjectResults(pack.subjectResults);
        setRankings(pack.rankings);
      } else {
        setEvents(calendarRows);
        setSubjectResults(subjectRows);
        setRankings(resolvedRankings);
      }
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [schoolId, studentIds, school, students]);

  useEffect(() => {
    setConfig(resolveExamConfig(school));
    load();
  }, [school, load]);

  const filtered = useMemo(
    () => filterExamEvents(events, { config, grades: childGrades }),
    [events, config, childGrades]
  );

  const { upcoming } = useMemo(
    () => splitExamsByTiming(filtered, istanbulDateIso()),
    [filtered]
  );

  const progressByChild = useMemo(() => {
    const map = new Map();
    for (const student of students) {
      const series = buildProgressSeries(rankings.filter((r) => r.student_id === student.id));
      map.set(student.id, series);
    }
    return map;
  }, [students, rankings]);

  const previewUpcoming = upcoming.slice(0, 3);

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
        <p className="dash-subtitle">Deneme takvimi · yayınlanan karneler</p>
      </header>

      {error && <InlineError error={error} context="calendar" />}

      {students.length === 0 ? (
        <section className="dash-card">
          <p className="dash-hint">Hesabınıza bağlı öğrenci yok.</p>
        </section>
      ) : (
        <>
          <details className="parent-upcoming" open={previewUpcoming.length > 0}>
            <summary className="parent-upcoming__summary">
              <span className="parent-upcoming__title">Yaklaşan sınavlar</span>
              <span className="parent-upcoming__count">{upcoming.length}</span>
            </summary>
            {!config.showCommonExams && !config.showMockExams ? (
              <p className="dash-hint">Sınav takibi henüz açılmadı.</p>
            ) : upcoming.length === 0 ? (
              <p className="dash-hint">Yaklaşan sınav yok.</p>
            ) : (
              <ul className="parent-upcoming__list">
                {previewUpcoming.map((event) => {
                  const iso = event.starts_on ?? event.held_on ?? '';
                  const day = iso.slice(8, 10).replace(/^0/, '') || '—';
                  const month = iso
                    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('tr-TR', {
                        timeZone: 'UTC',
                        month: 'short',
                      })
                    : '';
                  const kind = examKindFromEvent(event) === EXAM_KIND.common ? 'Ortak' : 'Deneme';
                  return (
                    <li key={event.id} className="parent-upcoming__card">
                      <time className="parent-upcoming__date" dateTime={iso || undefined}>
                        <span className="parent-upcoming__day">{day}</span>
                        <span className="parent-upcoming__month">{month}</span>
                      </time>
                      <div className="parent-upcoming__body">
                        <p className="parent-upcoming__name">{formatExamEventLabel(event)}</p>
                        <p className="parent-upcoming__when">{formatExamWhen(event)}</p>
                        <span className="parent-upcoming__kind">{kind}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </details>

          {config.storeResults ? (
            <section className="dash-card">
              <h2 className="dash-section-title">Sonuçlar</h2>
              {students.map((student) => {
                const klass = classes.find((c) => c.id === student.class_id);
                const hasData =
                  subjectResults.some((r) => r.student_id === student.id) ||
                  rankings.some((r) => r.student_id === student.id);
                if (!hasData) return null;
                return (
                  <div key={student.id} className="exam-child-block">
                    <ParentExamReport
                      student={student}
                      klass={klass}
                      subjectResults={subjectResults}
                      rankings={rankings}
                    />
                    {rankings
                      .filter((r) => r.student_id === student.id && r.exam_sessions?.answer_key_id)
                      .map((r) => (
                        <ParentErrorReport
                          key={`${student.id}-${r.session_id}`}
                          session={r.exam_sessions}
                          studentId={student.id}
                        />
                      ))}
                  </div>
                );
              })}
              {!students.some((student) =>
                rankings.some((r) => r.student_id === student.id)
              ) ? (
                <p className="dash-hint">Yayınlanmış sonuç yok.</p>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
