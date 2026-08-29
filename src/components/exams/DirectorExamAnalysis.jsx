import { useEffect, useState } from 'react';
import {
  buildQuestionFrequencyReport,
  buildTopicAnalysis,
  loadQuestionsForAnswerKey,
  loadSessionStudentAnswers,
} from '../../lib/examAnalysis';
import { InlineError } from '../dashboardUi';

export default function DirectorExamAnalysis({ session, classStudentIds = [], embedded = false }) {
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!session?.id) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const answerRows = await loadSessionStudentAnswers(session.id);
        if (!mounted) return;
        setAnswers(answerRows);
        if (session.answer_key_id) {
          const q = await loadQuestionsForAnswerKey(session.answer_key_id);
          if (mounted) setQuestions(q);
        }
      } catch (loadError) {
        if (mounted) setError(loadError);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [session?.id, session?.answer_key_id]);

  if (!session) return null;
  if (loading) return <p className="dash-hint">Analiz yükleniyor…</p>;
  if (error) return <InlineError error={error} context="calendar" />;

  const frequency = buildQuestionFrequencyReport({ questions, answers, classStudentIds });
  const topics = buildTopicAnalysis({ questions, answers });

  if (!questions.length && !answers.length) {
    return (
      <p className="dash-hint">
        Soru/konu analizi için cevap anahtarı ve öğrenci cevapları gerekir (CSV import veya örnek klasör).
      </p>
    );
  }

  const shellClass = embedded ? 'exam-workspace-block' : 'dash-card';

  return (
    <div className={shellClass}>
      {!embedded ? (
        <h2 className="dash-section-title">Sınav analizi — {session.title}</h2>
      ) : null}
      <h3 className="exam-group__title">Konu zayıflıkları</h3>
      <ul className="exam-list">
        {topics.slice(0, 12).map((row) => (
          <li key={`${row.subject_code}-${row.topicLabel}`}>
            <strong>{row.topicLabel}</strong>
            <span className="dash-hint">Başarı {row.successRate}% · {row.attempts} deneme</span>
          </li>
        ))}
      </ul>
      <h3 className="exam-group__title">Soru frekansı (ilk 10)</h3>
      <ul className="exam-list">
        {frequency.slice(0, 10).map((row) => (
          <li key={row.question_index}>
            <strong>Soru {row.question_index}</strong>
            <span className="dash-hint">
              {row.topic_label ?? '—'} · Başarı {row.successRate}% · Boş {row.blankRate}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
