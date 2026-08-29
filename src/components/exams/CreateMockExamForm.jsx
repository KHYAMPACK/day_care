import { useState } from 'react';
import { STUDENT_GRADES, formatStudentGrade } from '../../lib/calendar';
import { createMockExamEvent } from '../../lib/exams';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';

export default function CreateMockExamForm({ schoolId, onCreated }) {
  const [title, setTitle] = useState('');
  const [heldOn, setHeldOn] = useState('');
  const [audienceGrades, setAudienceGrades] = useState([8]);
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
      });
      setSuccess('Deneme oluşturuldu ve sonuç oturumu açıldı.');
      setTitle('');
      setHeldOn('');
      setBody('');
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
        <fieldset className="dash-fieldset">
          <legend className="dash-label">Sınıflar</legend>
          <div className="cal-grade-picks">
            {STUDENT_GRADES.map((grade) => (
              <label key={grade} className="cal-grade-pick">
                <input
                  type="checkbox"
                  checked={audienceGrades.includes(grade)}
                  onChange={() => toggleGrade(grade)}
                />
                {formatStudentGrade(grade)}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="dash-label">
          Açıklama (opsiyonel)
          <textarea className="dash-input" rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <SendButton sending={saving} label="Deneme oluştur" sendingLabel="Oluşturuluyor…" />
      </form>
    </section>
  );
}
