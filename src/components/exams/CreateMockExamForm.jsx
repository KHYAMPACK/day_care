import { useState } from 'react';
import { STUDENT_GRADES, formatStudentGrade } from '../../lib/calendar';
import { createMockExamEvent } from '../../lib/exams';
import {
  EXAM_PUBLISHER_OTHER,
  EXAM_PUBLISHERS,
  resolveExamPublisher,
} from '../../lib/examPublishers';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';
import { recordSchoolActivity } from '../../lib/activityLog';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function CreateMockExamForm({ schoolId, onCreated }) {
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [heldOn, setHeldOn] = useState('');
  const [audienceGrades, setAudienceGrades] = useState([8]);
  const [publisher, setPublisher] = useState(EXAM_PUBLISHERS[0]);
  const [customPublisher, setCustomPublisher] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  function toggleGrade(grade) {
    setAudienceGrades((current) =>
      current.includes(grade) ? current.filter((g) => g !== grade) : [...current, grade].sort((a, b) => a - b)
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!title.trim() || !heldOn) {
      setError(new Error('Başlık ve tarih zorunludur.'));
      return;
    }
    if (!audienceGrades.length) {
      setError(new Error('En az bir sınıf seçin.'));
      return;
    }
    const resolvedPublisher = resolveExamPublisher(publisher, customPublisher);
    if (!resolvedPublisher) {
      setError(new Error('Yayın seçin veya özel yayın adı girin.'));
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const { session } = await createMockExamEvent({
        schoolId,
        title,
        heldOn,
        audienceGrades,
        body,
        publisher: resolvedPublisher,
      });
      recordSchoolActivity(supabase, profile, {
        schoolId,
        category: 'exam',
        action: 'created',
        summary: `Deneme sınavı oluşturuldu: ${title.trim()}`,
        targetType: 'exam_session',
        targetId: session?.id ?? null,
      });
      setSuccess('Deneme oluşturuldu ve sonuç oturumu açıldı.');
      setTitle('');
      setHeldOn('');
      setBody('');
      setPublisher(EXAM_PUBLISHERS[0]);
      setCustomPublisher('');
      onCreated?.(session?.id);
    } catch (submitError) {
      setError(submitError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="dash-card">
      <h2 className="dash-section-title">Yeni deneme</h2>
      <p className="dash-hint">Takvim etkinliği ve sonuç oturumu birlikte oluşturulur.</p>
      {error && <InlineError error={error} context="calendar" />}
      {success && <SuccessMessage message={success} />}
      <form className="dash-form" onSubmit={handleSubmit}>
        <label className="dash-label">
          Başlık
          <input className="dash-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label className="dash-label">
          Tarih
          <input
            className="dash-input"
            type="date"
            value={heldOn}
            onChange={(e) => setHeldOn(e.target.value)}
            required
          />
        </label>
        <div className="dash-form__block">
          <p className="dash-label">Sınıflar</p>
          <div className="cur-assign-chips" role="group" aria-label="Sınıflar">
            {STUDENT_GRADES.map((grade) => (
              <button
                key={grade}
                type="button"
                className={`cur-assign-chip${audienceGrades.includes(grade) ? ' cur-assign-chip--active' : ''}`}
                onClick={() => toggleGrade(grade)}
              >
                {formatStudentGrade(grade)}
              </button>
            ))}
          </div>
        </div>
        <label className="dash-label">
          Yayın
          <select
            className="dash-input"
            value={publisher}
            onChange={(event) => setPublisher(event.target.value)}
            required
          >
            {EXAM_PUBLISHERS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        {publisher === EXAM_PUBLISHER_OTHER ? (
          <label className="dash-label">
            Yayın adı
            <input
              className="dash-input"
              value={customPublisher}
              onChange={(event) => setCustomPublisher(event.target.value)}
              placeholder="Örn. Yerel yayınevi"
              required
            />
          </label>
        ) : null}
        <label className="dash-label">
          Açıklama (opsiyonel)
          <textarea className="dash-input" rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <SendButton sending={saving} label="Deneme oluştur" sendingLabel="Oluşturuluyor…" />
      </form>
    </section>
  );
}
