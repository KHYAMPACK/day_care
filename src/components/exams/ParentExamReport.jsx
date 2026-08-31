import { useEffect, useMemo, useState } from 'react';
import { formatCalendarDateTr } from '../../lib/calendar';
import { formatClassLabel } from '../../lib/curriculum';
import {
  buildProgressSeries,
  buildStudentExamCard,
  LGS_SUBJECTS,
} from '../../lib/lgsExam';
import {
  loadQuestionsForAnswerKey,
  loadSessionStudentAnswers,
} from '../../lib/examAnalysis';
import { buildStudentTopicAnalysis } from '../../lib/studentGaps';
import { StudentWeakTopicsSummary } from '../gaps/StudentGapPanel';
import ExamProgressChart, { ExamSubjectBars } from './ExamProgressChart';
import { InlineError } from '../dashboardUi';

function SessionWeakTopics({ session, studentId }) {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!session?.id || !session?.answer_key_id || !studentId) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [answers, questions] = await Promise.all([
          loadSessionStudentAnswers(session.id),
          loadQuestionsForAnswerKey(session.answer_key_id),
        ]);
        if (!mounted) return;
        setTopics(
          buildStudentTopicAnalysis({ questions, answers, studentId }).filter(
            (row) => row.wrong + row.blank > 0
          )
        );
      } catch (loadError) {
        if (mounted) setError(loadError);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [session?.id, session?.answer_key_id, studentId]);

  if (!session?.answer_key_id) return null;
  if (loading) return <p className="dash-hint">Konu analizi yükleniyor…</p>;
  if (error) return <InlineError error={error} context="calendar" />;
  if (!topics.length) return null;

  return <StudentWeakTopicsSummary topics={topics} limit={5} />;
}

export default function ParentExamReport({ student, klass, subjectResults, rankings }) {
  const bySession = useMemo(() => {
    const studentSubjects = (subjectResults ?? []).filter((r) => r.student_id === student?.id);
    const studentRankings = (rankings ?? []).filter((r) => r.student_id === student?.id);
    const sessionIds = new Set([
      ...studentSubjects.map((r) => r.exam_sessions?.id ?? r.session_id),
      ...studentRankings.map((r) => r.session_id),
    ]);

    return [...sessionIds]
      .filter(Boolean)
      .map((sessionId) => {
        const subjectRows = studentSubjects.filter(
          (r) => (r.exam_sessions?.id ?? r.session_id) === sessionId
        );
        const session =
          subjectRows[0]?.exam_sessions ??
          studentRankings.find((r) => r.session_id === sessionId)?.exam_sessions;
        const ranking = studentRankings.find((r) => r.session_id === sessionId);
        return buildStudentExamCard({
          session,
          subjectRows,
          ranking,
        });
      })
      .sort((a, b) => (b.heldOn ?? '').localeCompare(a.heldOn ?? ''));
  }, [student?.id, subjectResults, rankings]);

  const progressSeries = useMemo(
    () => buildProgressSeries((rankings ?? []).filter((r) => r.student_id === student?.id)),
    [rankings, student?.id]
  );

  if (!student) return null;

  return (
    <div className="exam-parent-report">
      <header className="exam-parent-report__header">
        <h3>{student.full_name}</h3>
        {klass ? <p className="dash-hint">{formatClassLabel(klass.grade, klass.name)}</p> : null}
      </header>

      {progressSeries.length > 1 ? (
        <section className="dash-card exam-parent-report__trend">
          <h4 className="dash-section-title">Gelişim</h4>
          <ExamProgressChart series={progressSeries} />
          <p className="dash-hint">LGS puanları tahminidir.</p>
        </section>
      ) : null}

      {bySession.length === 0 ? (
        <p className="dash-hint">Yayınlanmış deneme sonucu yok.</p>
      ) : (
        bySession.map((card) => (
          <section key={card.sessionId} className="dash-card exam-report-card">
            <div className="exam-report-card__head">
              <div>
                <strong>{card.title}</strong>
                <span className="dash-hint">
                  {card.heldOn ? formatCalendarDateTr(card.heldOn) : ''}
                </span>
              </div>
              <div className="exam-report-card__scores">
                <span>Net {card.totalNet?.toFixed?.(2) ?? card.totalNet}</span>
                <span>LGS {card.lgsScore != null ? Math.round(card.lgsScore) : '—'}</span>
              </div>
            </div>

            {(card.schoolRank || card.classRank) && (
              <p className="exam-report-card__ranks">
                Kurumda {card.schoolRank ?? '—'} · Sınıfta {card.classRank ?? '—'}
              </p>
            )}

            <ExamSubjectBars subjects={card.subjects} />

            <SessionWeakTopics
              session={subjectResults.find((row) => row.exam_sessions?.id === card.sessionId)?.exam_sessions ??
                rankings.find((row) => row.session_id === card.sessionId)?.exam_sessions}
              studentId={student.id}
            />

            <details className="exam-report-card__details">
              <summary>D/Y/B detayı</summary>
              <table className="exam-mini-table">
                <thead>
                  <tr>
                    <th>Ders</th>
                    <th>D</th>
                    <th>Y</th>
                    <th>B</th>
                    <th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {LGS_SUBJECTS.map((def) => {
                    const row = card.subjects.find((s) => s.code === def.code);
                    return (
                      <tr key={def.code}>
                        <td>{def.label}</td>
                        <td>{row?.correct ?? '—'}</td>
                        <td>{row?.wrong ?? '—'}</td>
                        <td>{row?.blank ?? '—'}</td>
                        <td>{row?.net != null ? Number(row.net).toFixed(2) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </details>
          </section>
        ))
      )}
    </div>
  );
}
