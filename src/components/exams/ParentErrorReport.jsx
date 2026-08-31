import { useEffect, useMemo, useState } from 'react';
import {
  buildErrorReport,
  loadSessionStudentAnswers,
  loadQuestionsForAnswerKey,
} from '../../lib/examAnalysis';
import { groupErrorReportByTopic } from '../../lib/studentGaps';
import { InlineError } from '../dashboardUi';

export default function ParentErrorReport({ session, studentId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!session?.id || !studentId) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const [answers, questions] = await Promise.all([
          loadSessionStudentAnswers(session.id),
          session.answer_key_id
            ? loadQuestionsForAnswerKey(session.answer_key_id)
            : Promise.resolve([]),
        ]);
        if (!mounted) return;
        setItems(buildErrorReport({ questions, answers, studentId }));
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

  const grouped = useMemo(() => groupErrorReportByTopic(items), [items]);

  if (!session) return null;
  if (loading) return <p className="dash-hint">Hata karnesi yükleniyor…</p>;
  if (error) return <InlineError error={error} context="calendar" />;

  if (!items.length) {
    return (
      <p className="dash-hint">
        Soru bazlı hata karnesi için cevap anahtarı ve optik import gerekir.
      </p>
    );
  }

  return (
    <section className="dash-card">
      <h3 className="dash-section-title">Hata karnesi — {session.title}</h3>
      <ul className="exam-list student-gap-grouped-list">
        {grouped.map((group) => (
          <li key={group.topicLabel} className="student-gap-group">
            <div className="student-gap-group__head">
              <strong>{group.topicLabel}</strong>
              <span className="dash-hint">
                {group.wrong ? `${group.wrong} yanlış` : ''}
                {group.wrong && group.blank ? ' · ' : ''}
                {group.blank ? `${group.blank} boş` : ''}
              </span>
            </div>
            <ul className="student-gap-group__items">
              {group.items.map((item) => (
                <li key={item.questionIndex}>
                  Soru {item.questionIndex}
                  <span className="dash-hint">
                    {item.status === 'blank' ? 'Boş' : `Yanlış (${item.choice})`}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
