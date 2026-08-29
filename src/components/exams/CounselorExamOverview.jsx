import { useEffect, useMemo, useState } from 'react';
import { loadExamSessions } from '../../lib/exams';
import {
  aggregateClassSubjectAverages,
  loadRankingsForSessions,
  loadSubjectResultsForSessions,
} from '../../lib/lgsExam';
import { formatClassLabel } from '../../lib/curriculum';
import ExamProgressChart from './ExamProgressChart';
import ExamRankingTable from './ExamRankingTable';
import { InlineError } from '../dashboardUi';

function schoolAverageNet(subjectResults) {
  const studentIds = new Set(subjectResults.map((r) => r.student_id));
  if (!studentIds.size) return null;
  const total = subjectResults.reduce((sum, row) => sum + (Number(row.net) || 0), 0);
  return Math.round((total / studentIds.size) * 100) / 100;
}

export default function CounselorExamOverview({ schoolId, students = [], classes = [] }) {
  const [sessions, setSessions] = useState([]);
  const [subjectResults, setSubjectResults] = useState([]);
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const sessionRows = await loadExamSessions(schoolId);
        const ids = sessionRows.map((s) => s.id);
        const [subjects, ranks] = await Promise.all([
          ids.length ? loadSubjectResultsForSessions(ids) : Promise.resolve([]),
          ids.length ? loadRankingsForSessions(ids) : Promise.resolve([]),
        ]);
        if (!mounted) return;
        setSessions(sessionRows);
        setSubjectResults(subjects);
        setRankings(ranks);
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

  const latestSession = sessions[0] ?? null;
  const latestSessionSubjects = useMemo(
    () => subjectResults.filter((r) => r.session_id === latestSession?.id),
    [subjectResults, latestSession?.id]
  );
  const latestRankings = useMemo(
    () => rankings.filter((r) => r.session_id === latestSession?.id),
    [rankings, latestSession?.id]
  );
  const classAvgs = useMemo(
    () => aggregateClassSubjectAverages(latestSessionSubjects, students),
    [latestSessionSubjects, students]
  );

  const schoolTrend = useMemo(() => {
    const bySession = new Map();
    for (const row of rankings) {
      if (!bySession.has(row.session_id)) {
        bySession.set(row.session_id, { nets: [], session: row.exam_sessions });
      }
      bySession.get(row.session_id).nets.push(Number(row.total_net) || 0);
    }
    return [...bySession.entries()]
      .map(([sessionId, bucket]) => {
        const avg =
          bucket.nets.length
            ? bucket.nets.reduce((a, b) => a + b, 0) / bucket.nets.length
            : 0;
        return {
          sessionId,
          title: bucket.session?.title ?? 'Sınav',
          heldOn: bucket.session?.held_on,
          totalNet: Math.round(avg * 100) / 100,
          lgsScore: Math.round((avg * 5.95 + 10) * 100) / 100,
        };
      })
      .sort((a, b) => (a.heldOn ?? '').localeCompare(b.heldOn ?? ''));
  }, [rankings]);

  const participantCount = useMemo(
    () => new Set(latestSessionSubjects.map((r) => r.student_id)).size,
    [latestSessionSubjects]
  );

  if (loading) {
    return <p className="dash-hint">Özet yükleniyor…</p>;
  }
  if (error) {
    return <InlineError error={error} context="calendar" />;
  }

  return (
    <>
      <header className="dash-header">
        <h1 className="dash-title">Deneme özeti</h1>
        <p className="dash-subtitle">Okul geneli gelişim ve son sınav performansı</p>
      </header>

      <section className="dash-card">
        <div className="staff-kpi-row">
          <article className="staff-kpi">
            <p className="staff-kpi__value">{sessions.length}</p>
            <p className="staff-kpi__label">Toplam oturum</p>
          </article>
          <article className="staff-kpi">
            <p className="staff-kpi__value">{participantCount}</p>
            <p className="staff-kpi__label">Son sınav katılım</p>
          </article>
          <article className="staff-kpi">
            <p className="staff-kpi__value">{schoolAverageNet(latestSessionSubjects) ?? '—'}</p>
            <p className="staff-kpi__label">Son sınav ort. net</p>
          </article>
          <article className="staff-kpi">
            <p className="staff-kpi__value">{students.length}</p>
            <p className="staff-kpi__label">Kayıtlı öğrenci</p>
          </article>
        </div>
      </section>

      <div className="staff-overview-grid">
        {schoolTrend.length > 1 ? (
          <section className="dash-card">
            <h2 className="dash-section-title">Okul ortalaması trendi</h2>
            <ExamProgressChart series={schoolTrend} />
          </section>
        ) : null}

        {latestSession ? (
          <section className="dash-card">
            <h2 className="dash-section-title">Şube ortalamaları — {latestSession.title}</h2>
            <ul className="exam-list">
              {classAvgs.map((row) => {
                const klass = classes.find((c) => c.id === row.classId);
                return (
                  <li key={row.classId}>
                    <strong>{klass ? formatClassLabel(klass.grade, klass.name) : 'Atanmamış'}</strong>
                    <span className="dash-hint">
                      {row.studentCount} öğr. · Ort. net {row.totalNet?.toFixed(2)} · LGS{' '}
                      {row.lgsScore != null ? Math.round(row.lgsScore) : '—'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : (
          <section className="dash-card">
            <p className="dash-hint">Henüz deneme sonucu yok. Denemeler sekmesinden oluşturup sonuç girin.</p>
          </section>
        )}
      </div>

      {latestSession ? (
        <section className="dash-card">
          <h2 className="dash-section-title">Son sınav sıralaması</h2>
          <ExamRankingTable rows={latestRankings} students={students} classes={classes} />
        </section>
      ) : null}
    </>
  );
}
