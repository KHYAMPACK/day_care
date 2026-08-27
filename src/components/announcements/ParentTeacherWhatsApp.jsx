import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { InlineError } from '../dashboardUi';
import { firstName } from '../../lib/demoData';
import { Avatar } from '../ui/Avatar';
import {
  formatPhoneDisplay,
  groupContactsByTeacher,
  isValidWhatsAppPhone,
  whatsappUrl,
} from '../../lib/announcements';

export default function ParentTeacherWhatsApp() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadContacts() {
      setLoading(true);
      setError(null);

      const { data, error: loadError } = await supabase.rpc('get_parent_teacher_contacts');

      if (!mounted) return;

      if (loadError) {
        setError(loadError);
        setContacts([]);
        setLoading(false);
        return;
      }

      setContacts(groupContactsByTeacher(data ?? []));
      setLoading(false);
    }

    loadContacts();

    return () => {
      mounted = false;
    };
  }, []);

  function openWhatsApp(contact) {
    if (!isValidWhatsAppPhone(contact.phone)) return;
    const names = contact.students.map((student) => student.full_name);
    window.open(whatsappUrl(contact.phone, names), '_blank', 'noopener,noreferrer');
  }

  return (
    <section className="demo-stack">
      <header className="dash-header">
        <h1 className="dash-title">Öğretmene yaz</h1>
        <p className="dash-subtitle">
          Özel konular için öğretmeninizin WhatsApp’ına gidersiniz. Sınıf duyuruları Duyurular
          modülündedir.
        </p>
      </header>

      {error && <InlineError error={error} context="parent" />}

      {loading ? (
        <p className="dash-hint">Öğretmenler yükleniyor…</p>
      ) : contacts.length === 0 ? (
        <p className="dash-hint">
          Henüz çocuğunuza atanmış bir öğretmen yok. Okul müdüründen eşleştirme isteyin.
        </p>
      ) : (
        <ul className="wa-contact-list">
          {contacts.map((contact) => {
            const canMessage = isValidWhatsAppPhone(contact.phone);
            const childLabel = contact.students
              .map((student) => firstName(student.full_name, student.full_name))
              .join(', ');

            return (
              <li key={contact.teacherId}>
                <article className="dash-card wa-contact">
                  <div className="wa-contact__info">
                    <h2 className="dash-section-title">
                      <Avatar name={contact.fullName ?? 'Öğretmen'} size={32} />
                      {contact.fullName ?? 'Öğretmen'}
                    </h2>
                    <p className="dash-hint">{childLabel} öğretmeni</p>
                    {canMessage ? (
                      <p className="demo-meta">{formatPhoneDisplay(contact.phone)}</p>
                    ) : (
                      <p className="dash-hint">Öğretmen henüz numara eklemedi.</p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="demo-btn demo-btn--primary wa-contact__btn"
                    disabled={!canMessage}
                    onClick={() => openWhatsApp(contact)}
                  >
                    WhatsApp’tan yaz
                  </button>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
