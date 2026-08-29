import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { withSchoolFilter } from '../../lib/tenant';
import { notifyParentsForMessage } from '../../lib/sendPush';
import { useAuth } from '../../context/AuthContext';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';
import { formatRelativeTimeTr } from '../../utils/formatTime';
import {
  ANNOUNCEMENT_SELECT,
  announcementCreatePayload,
  announcementPushBody,
  announcementUpdatePayload,
  formatPhoneDisplay,
  isValidWhatsAppPhone,
  normalizePhone,
  sortAnnouncements,
} from '../../lib/announcements';

import TeacherParentMessages from '../messages/TeacherParentMessages';

export default function TeacherAnnouncements({
  profile,
  schoolId,
  students = [],
  templates = [],
  enableParentMessages = false,
}) {
  const { refreshProfile } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [phoneInput, setPhoneInput] = useState(formatPhoneDisplay(profile?.phone) || '');
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneError, setPhoneError] = useState(null);
  const [phoneSuccess, setPhoneSuccess] = useState(null);

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: loadError } = await withSchoolFilter(
      supabase
        .from('announcements')
        .select(ANNOUNCEMENT_SELECT)
        .eq('author_id', profile.id)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false }),
      schoolId
    );

    if (loadError) {
      setError(loadError);
      setAnnouncements([]);
      setLoading(false);
      return;
    }

    setAnnouncements(sortAnnouncements(data ?? []));
    setLoading(false);
  }, [profile.id, schoolId]);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  useEffect(() => {
    setPhoneInput(formatPhoneDisplay(profile?.phone) || '');
  }, [profile?.phone]);

  function resetComposer() {
    setTitle('');
    setBody('');
    setPinned(false);
    setEditingId(null);
  }

  function startEdit(item) {
    setEditingId(item.id);
    setTitle(item.title);
    setBody(item.body);
    setPinned(Boolean(item.pinned));
    setSuccess(null);
    setError(null);
  }

  async function handleSaveAnnouncement(event) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle || !trimmedBody) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (editingId) {
        const { error: updateError } = await withSchoolFilter(
          supabase
            .from('announcements')
            .update(announcementUpdatePayload({ title: trimmedTitle, body: trimmedBody, pinned }))
            .eq('id', editingId)
            .eq('author_id', profile.id),
          schoolId
        );
        if (updateError) throw updateError;
        setSuccess('Duyuru güncellendi.');
      } else {
        const { error: insertError } = await supabase.from('announcements').insert(
          announcementCreatePayload({
            schoolId,
            authorId: profile.id,
            title: trimmedTitle,
            body: trimmedBody,
            pinned,
          })
        );
        if (insertError) throw insertError;

        const studentIds = students.map((student) => student.id);
        if (studentIds.length > 0) {
          try {
            await notifyParentsForMessage({
              targetType: 'all',
              students,
              studentIds,
              body: announcementPushBody(trimmedTitle, trimmedBody),
            });
          } catch (pushError) {
            console.warn('Announcement push failed', pushError);
          }
        }

        setSuccess('Duyuru yayınlandı. Veliler bildirim alacak.');
      }

      resetComposer();
      await loadAnnouncements();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(`“${item.title}” duyurusunu silmek istiyor musunuz?`)) {
      return;
    }

    setError(null);
    setSuccess(null);

    const { error: deleteError } = await withSchoolFilter(
      supabase.from('announcements').delete().eq('id', item.id).eq('author_id', profile.id),
      schoolId
    );

    if (deleteError) {
      setError(deleteError);
      return;
    }

    if (editingId === item.id) {
      resetComposer();
    }
    setSuccess('Duyuru silindi.');
    await loadAnnouncements();
  }

  async function handleSavePhone(event) {
    event.preventDefault();
    const trimmed = phoneInput.trim();

    if (trimmed && !isValidWhatsAppPhone(trimmed)) {
      setPhoneError(new Error('Lütfen geçerli bir Türkiye cep numarası girin. Örnek: 0532 123 45 67'));
      setPhoneSuccess(null);
      return;
    }

    setPhoneSaving(true);
    setPhoneError(null);
    setPhoneSuccess(null);

    const payload = trimmed ? normalizePhone(trimmed) : null;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ phone: payload })
      .eq('id', profile.id);

    setPhoneSaving(false);

    if (updateError) {
      setPhoneError(updateError);
      return;
    }

    setPhoneInput(payload ? formatPhoneDisplay(payload) : '');
    setPhoneSuccess(
      payload
        ? 'WhatsApp numaranız kaydedildi. Veliler Mesaj sekmesinden size yazabilir.'
        : 'WhatsApp numarası kaldırıldı.'
    );
    await refreshProfile?.();
  }

  return (
    <section className="demo-stack">
      <header className="dash-header">
        <h1 className="dash-title">Duyurular</h1>
        <p className="dash-subtitle">
          Sınıfınıza yayınlayın. Atanan öğrencilerin velileri okur; cevap yazamaz.
        </p>
      </header>

      <form className="dash-form dash-card" onSubmit={handleSavePhone}>
        <h2 className="dash-section-title">WhatsApp numaram</h2>
        <p className="dash-hint">
          Veliler özel konu için sizi WhatsApp’tan bulur. Numara yoksa buton görünmez.
        </p>
        <label className="dash-label">
          Cep telefonu
          <input
            className="dash-input"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phoneInput}
            onChange={(event) => {
              setPhoneInput(event.target.value);
              setPhoneError(null);
              setPhoneSuccess(null);
            }}
            placeholder="0532 123 45 67"
          />
        </label>
        {phoneError && <InlineError error={phoneError} context="general" />}
        {phoneSuccess && <SuccessMessage message={phoneSuccess} />}
        <SendButton
          sending={phoneSaving}
          label="Numarayı kaydet"
          sendingLabel="Kaydediliyor…"
        />
      </form>

      <form className="dash-form dash-card" onSubmit={handleSaveAnnouncement}>
        <h2 className="dash-section-title">{editingId ? 'Duyuruyu düzenle' : 'Yeni duyuru'}</h2>
        <label className="dash-label">
          Başlık
          <input
            className="dash-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Cuma pijama partisi"
            required
          />
        </label>
        <label className="dash-label">
          Metin
          <textarea
            className="dash-textarea"
            rows={4}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Velilere iletmek istediğiniz duyuru…"
            required
          />
        </label>
        <label className="ann-check">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(event) => setPinned(event.target.checked)}
          />
          Üstte sabitle
        </label>
        {error && <InlineError error={error} context="general" />}
        {success && <SuccessMessage message={success} />}
        <div className="ann-actions">
          <SendButton
            sending={saving}
            disabled={!title.trim() || !body.trim()}
            label={editingId ? 'Değişiklikleri kaydet' : 'Duyuruyu yayınla'}
            sendingLabel={editingId ? 'Kaydediliyor…' : 'Yayınlanıyor…'}
          />
          {editingId && (
            <button type="button" className="demo-btn" onClick={resetComposer}>
              Vazgeç
            </button>
          )}
        </div>
      </form>

      {enableParentMessages ? (
        <TeacherParentMessages
          profile={profile}
          schoolId={schoolId}
          students={students}
          templates={templates}
        />
      ) : null}

      {loading ? (
        <p className="dash-hint">Duyurular yükleniyor…</p>
      ) : announcements.length === 0 ? (
        <p className="dash-hint">Henüz duyuru yok. İlk sınıf duyurusunu yukarıdan yazın.</p>
      ) : (
        announcements.map((item) => (
          <article
            key={item.id}
            className={`dash-card${item.pinned ? ' demo-card-pinned' : ''}`}
          >
            <div className="demo-row-between">
              <h2 className="dash-section-title">{item.title}</h2>
              {item.pinned && <span className="demo-pill demo-pill--lavender">Sabit</span>}
            </div>
            <p className="dash-hint">{item.body}</p>
            <p className="demo-meta">{formatRelativeTimeTr(item.created_at)}</p>
            <div className="ann-actions">
              <button type="button" className="demo-btn" onClick={() => startEdit(item)}>
                Düzenle
              </button>
              <button
                type="button"
                className="demo-btn demo-btn--danger"
                onClick={() => handleDelete(item)}
              >
                Sil
              </button>
            </div>
          </article>
        ))
      )}
    </section>
  );
}
