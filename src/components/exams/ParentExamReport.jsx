import { useMemo } from 'react';
import { formatCalendarDateTr } from '../../lib/calendar';
import { formatClassLabel } from '../../lib/curriculum';
import {
  buildProgressSeries,
  buildStudentExamCard,
  groupSubjectResultsByStudent,
  LGS_SUBJECTS,
} from '../../lib/lgsExam';
import ExamProgressChart, { ExamSubjectBars } from './ExamProgressChart';

export default function ParentExamReport({ student, klass, subjectResults, rankings }) {
  const bySession = useMemo(() => {
    const studentSubjects = (subjectResults ?? []).filter((r) => r.student_id === student?.id);
    const studentRankings = (rankings ?? []).filter((r) => r.student_id === student?.id);
    const subjectMap = groupSubjectResultsByStudent(studentSubjects);
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
        const session = subjectRows[0]?.exam_sessions ?? studentRankings.find((r) => r.session_id === sessionId)?.exam_sessions;
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
