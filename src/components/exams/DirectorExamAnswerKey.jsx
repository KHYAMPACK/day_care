import { useCallback, useEffect, useState } from 'react';
import { LGS_SUBJECTS } from '../../lib/lgsExam';
import {
  loadAnswerKeys,
  loadQuestionsForAnswerKey,
  parseAnswerKeyJson,
  saveAnswerKeyWithQuestions,
} from '../../lib/examAnalysis';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';

function emptyQuestions() {
  const rows = [];
  let globalIndex = 0;
  for (const subject of LGS_SUBJECTS) {
    for (let i = 1; i <= subject.questions; i += 1) {
      globalIndex += 1;
      rows.push({
        question_index: globalIndex,
        subject_code: subject.code,
        booklet_a_no: i,
        booklet_b_no: i,
        correct_choice: '',
        topic_label: '',
      });
    }
  }
  return rows;
}

export default function DirectorExamAnswerKey({ schoolId, sessions = [], embedded = false }) {
  const [keys, setKeys] = useState([]);
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [questions, setQuestions] = useState(() => emptyQuestions());
  const [title, setTitle] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await loadAnswerKeys(schoolId);
      setKeys(rows);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedKeyId) return;
    (async () => {
      try {
        const rows = await loadQuestionsForAnswerKey(selectedKeyId);
        if (rows.length) setQuestions(rows);
      } catch (loadError) {
        setError(loadError);
      }
    })();
  }, [selectedKeyId]);

  function patchQuestion(index, field, value) {
    setQuestions((current) =>
      current.map((row) =>
        row.question_index === index ? { ...row, [field]: value.toUpperCase?.() ?? value } : row
      )
    );
  }

  function handleImportJson() {
    try {
      const parsed = parseAnswerKeyJson(jsonText);
      if (parsed.length) setQuestions(parsed);
      setSuccess('Cevap anahtarı JSON içe aktarıldı.');
    } catch (importError) {
      setError(importError);
    }
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await saveAnswerKeyWithQuestions({
        schoolId,
        sessionId: sessionId || null,
        title: title || 'Cevap anahtarı',
        questions,
      });
      setSuccess('Cevap anahtarı kaydedildi.');
      setTitle('');
      setSessionId('');
      setQuestions(emptyQuestions());
      await load();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="dash-hint">Cevap anahtarları yükleniyor…</p>;

  const shellClass = embedded ? 'exam-workspace-block' : 'dash-card';

  return (
    <div className={shellClass}>
      {!embedded ? <h2 className="dash-section-title">Cevap anahtarı</h2> : null}
      <p className="dash-hint">90 soru · konu etiketi · JSON import. Örnek yayınevi dosyası gelince otomatik parser eklenecek.</p>
      {error && <InlineError error={error} context="calendar" />}
      {success && <SuccessMessage message={success} />}

      {keys.length ? (
        <label className="dash-label">
          Kayıtlı anahtarlar
          <select className="dash-input" value={selectedKeyId} onChange={(e) => setSelectedKeyId(e.target.value)}>
            <option value="">Yeni anahtar</option>
            {keys.map((key) => (
              <option key={key.id} value={key.id}>
                {key.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <form className="dash-form" onSubmit={handleSave}>
        <label className="dash-label">
          Başlık
          <input className="dash-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label className="dash-label">
          Sınav oturumu (opsiyonel)
          <select className="dash-input" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            <option value="">Bağlama</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} · {s.held_on}
              </option>
            ))}
          </select>
        </label>

        <label className="dash-label">
          JSON import
          <textarea className="dash-input" rows={4} value={jsonText} onChange={(e) => setJsonText(e.target.value)} placeholder='[{"question_index":1,"correct_choice":"B","topic_label":"Paragraf"}]' />
        </label>
        <button type="button" className="demo-btn" onClick={handleImportJson}>
          JSON uygula
        </button>

        <div className="exam-grid-wrap exam-answer-key-grid">
          <table className="exam-entry-grid">
            <thead>
              <tr>
                <th>#</th>
                <th>Ders</th>
                <th>A</th>
                <th>B</th>
                <th>CVP</th>
                <th>Konu</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <tr key={q.question_index}>
                  <td>{q.question_index}</td>
                  <td>{q.subject_code}</td>
                  <td>{q.booklet_a_no}</td>
                  <td>{q.booklet_b_no}</td>
                  <td>
                    <input
                      className="exam-cell-input"
                      maxLength={1}
                      value={q.correct_choice ?? ''}
                      onChange={(e) => patchQuestion(q.question_index, 'correct_choice', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="exam-cell-input exam-cell-input--wide"
                      value={q.topic_label ?? ''}
                      onChange={(e) => patchQuestion(q.question_index, 'topic_label', e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <SendButton sending={saving} label="Cevap anahtarını kaydet" sendingLabel="Kaydediliyor…" />
      </form>
    </div>
  );
}
