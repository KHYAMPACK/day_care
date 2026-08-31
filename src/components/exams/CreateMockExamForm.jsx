import { useState } from 'react';
import { createMockExamEvent } from '../../lib/exams';
import {
  EXAM_PUBLISHER_OTHER,
  EXAM_PUBLISHERS,
  resolveExamPublisher,
} from '../../lib/examPublishers';
import { normalizeAudienceGradesForSave } from '../../lib/calendar';
import { InlineError } from '../dashboardUi';
import { recordSchoolActivity } from '../../lib/activityLog';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { AsyncActionDialog } from '../ui/AsyncActionDialog';
import AudienceGradeCheckboxes from '../ui/AudienceGradeCheckboxes';
import { useAsyncAction } from '../../hooks/useAsyncAction';

export default function CreateMockExamForm({ schoolId, onCreated }) {
  const { profile } = useAuth();
  const { asyncAction, closeAsyncAction, runAsyncAction } = useAsyncAction();
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [heldOn, setHeldOn] = useState('');
  const [audienceGrades, setAudienceGrades] = useState([]);
  const [publisher, setPublisher] = useState(EXAM_PUBLISHERS[0]);
  const [customPublisher, setCustomPublisher] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState(null);

  function resetFormFields() {
    setTitle('');
    setHeldOn('');
    setAudienceGrades([]);
    setBody('');
    setPublisher(EXAM_PUBLISHERS[0]);
    setCustomPublisher('');
  }

  function handleSubmit(event) {
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

    setError(null);

    runAsyncAction({
      title: 'Deneme oluştur',
      loadingLabel: 'Oluşturuluyor…',
      successMessage: 'Deneme oluşturuldu ve sonuç oturumu açıldı.',
      skipConfirm: true,
      runFn: async () => {
        const normalizedGrades = normalizeAudienceGradesForSave(audienceGrades);
        const { session } = await createMockExamEvent({
          schoolId,
          title,
          heldOn,
          audienceGrades: normalizedGrades ?? audienceGrades,
          body,
          publisher: resolvedPublisher,
        });
        return session;
      },
      onSuccess: async (session) => {
        recordSchoolActivity(supabase, profile, {
          schoolId,
          category: 'exam',
          action: 'created',
          summary: `Deneme sınavı oluşturuldu: ${title.trim()}`,
          targetType: 'exam_session',
          targetId: session?.id ?? null,
        });
        resetFormFields();
        setFormOpen(false);
        onCreated?.(session?.id);
      },
    });
  }

  return (
    <>
      <details
        className="cal-collapsible-form dash-card"
        open={formOpen}
        onToggle={(event) => setFormOpen(event.currentTarget.open)}
      >
        <summary className="cal-collapsible-form__summary">
          <span className="cal-collapsible-form__chevron" aria-hidden="true" />
          <span className="dash-section-title">Yeni deneme</span>
        </summary>

        <div className="cal-collapsible-form__body">
          <p className="dash-hint">Takvim etkinliği ve sonuç oturumu birlikte oluşturulur.</p>
          {error ? <InlineError error={error} context="calendar" /> : null}
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
            <AudienceGradeCheckboxes
              value={audienceGrades}
              onChange={setAudienceGrades}
              label="Sınıflar"
              hint="Birden fazla sınıf seçebilirsiniz. Tüm sınıflar seçiliyken tüm okul hedeflenir."
              requireSelection
            />
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
            <button type="submit" className="demo-btn demo-btn--primary">
              Deneme oluştur
            </button>
          </form>
        </div>
      </details>

      <AsyncActionDialog
        open={Boolean(asyncAction)}
        phase={asyncAction?.phase ?? 'confirm'}
        title={asyncAction?.title}
        message={asyncAction?.message}
        confirmLabel={asyncAction?.confirmLabel}
        loadingLabel={asyncAction?.loadingLabel}
        successTitle={asyncAction?.successTitle}
        credentials={asyncAction?.credentials}
        error={asyncAction?.error}
        errorContext="calendar"
        onConfirm={asyncAction?.onConfirm}
        onClose={closeAsyncAction}
      />
    </>
  );
}
