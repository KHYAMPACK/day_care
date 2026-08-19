import { useMemo, useState } from 'react';
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_ORDER,
  DEMO_ANNOUNCEMENTS,
  DEMO_AWARDS,
  DEMO_BIRTHDAYS,
  DEMO_BUS_STOPS,
  DEMO_CHAT_MESSAGES,
  DEMO_CHAT_THREADS,
  DEMO_EVENTS,
  DEMO_FORMS,
  DEMO_GALLERY,
  DEMO_GROWTH,
  DEMO_HOMEWORK,
  DEMO_LEDGER,
  DEMO_MEDS,
  DEMO_MEETINGS,
  DEMO_MENU_WEEK,
  DEMO_NEWSLETTER,
  DEMO_PAYMENTS,
  DEMO_PREREG,
  DEMO_REPORTS,
  DEMO_SCHEDULE,
  DEMO_SHIFTS,
  DEMO_SURVEY,
  DEMO_TOILET,
  buildDayTimeline,
  buildRoster,
} from '../../lib/demoData';

function ActionBar({ children }) {
  return <div className="demo-actions">{children}</div>;
}

function Pill({ tint, children }) {
  return <span className={`demo-pill demo-pill--${tint}`}>{children}</span>;
}

export function ParentDayTimeline({ childName, onOpen }) {
  const events = buildDayTimeline(childName);

  return (
    <section className="demo-day">
      <header className="demo-day__head">
        <div>
          <p className="demo-kicker">Bugün</p>
          <h2 className="demo-day__title">{childName} — günü</h2>
        </div>
        <span className="demo-live">Canlı</span>
      </header>

      <div className="demo-chip-row" role="list">
        {[
          { id: 'attendance', label: 'Yoklama', icon: '✅' },
          { id: 'meals', label: 'Yemek', icon: '🍽️' },
          { id: 'sleep', label: 'Uyku', icon: '🌙' },
          { id: 'toilet', label: 'Tuvalet', icon: '🚽' },
          { id: 'gallery', label: 'Galeri', icon: '📸' },
          { id: 'pickup', label: 'Teslim', icon: '🚪' },
        ].map((chip) => (
          <button
            key={chip.id}
            type="button"
            className="demo-chip"
            onClick={() => onOpen(chip.id)}
          >
            <span aria-hidden="true">{chip.icon}</span>
            {chip.label}
          </button>
        ))}
      </div>

      <ol className="demo-rail">
        {events.map((event) => (
          <li key={event.id} className="demo-rail__item">
            <span className="demo-rail__time">{event.time}</span>
            <span className={`demo-rail__bead demo-rail__bead--${event.tint}`} aria-hidden="true">
              {event.icon}
            </span>
            <div className="demo-rail__card">
              <strong>{event.title}</strong>
              <p>{event.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TeacherClassHome({ students, onOpen, notify }) {
  const roster = useMemo(() => buildRoster(students), [students]);
  const present = roster.filter((row) => row.status === 'present' || row.status === 'late').length;
  const late = roster.filter((row) => row.status === 'late').length;
  const absent = roster.filter((row) => row.status === 'absent').length;

  return (
    <section className="demo-stack">
      <div className="demo-stat-row">
        <article className="demo-stat demo-stat--mint">
          <span>Gelen</span>
          <strong>{present}</strong>
        </article>
        <article className="demo-stat demo-stat--peach">
          <span>Geç</span>
          <strong>{late}</strong>
        </article>
        <article className="demo-stat demo-stat--rose">
          <span>Gelmedi</span>
          <strong>{absent}</strong>
        </article>
      </div>

      <div className="demo-quick">
        {[
          { id: 'attendance', label: 'Yoklama al', icon: '✅' },
          { id: 'meals', label: 'Yemek işaretle', icon: '🍽️' },
          { id: 'gallery', label: 'Fotoğraf paylaş', icon: '📸' },
          { id: 'sleep', label: 'Uyku başlat', icon: '🌙' },
        ].map((item) => (
          <button key={item.id} type="button" className="demo-quick__btn" onClick={() => onOpen(item.id)}>
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      <div className="dash-card">
        <h2 className="dash-section-title">Sınıf notu</h2>
        <p className="dash-hint">
          Papatya sınıfı sabah bahçede başladı, ardından parmak boyasına geçti. Öğle uykusu 12:50’de
          açıldı.
        </p>
        <ActionBar>
          <button type="button" className="demo-btn demo-btn--primary" onClick={() => notify('Sınıf notu velilere iletildi.')}>
            Velilere gönder
          </button>
        </ActionBar>
      </div>
    </section>
  );
}

function GalleryScreen({ role, notify }) {
  return (
    <section className="demo-stack">
      {role !== 'parent' && (
        <ActionBar>
          <button type="button" className="demo-btn demo-btn--primary" onClick={() => notify('Fotoğraf seçici açıldı (demo).')}>
            Fotoğraf ekle
          </button>
        </ActionBar>
      )}
      <ul className="demo-gallery">
        {DEMO_GALLERY.map((photo) => (
          <li key={photo.id} className="demo-gallery__item">
            <img src={photo.src} alt={photo.title} />
            <div className="demo-gallery__meta">
              <strong>{photo.title}</strong>
              <span>{photo.time}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChatScreen({ childName, notify }) {
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState(DEMO_CHAT_MESSAGES);
  const thread = DEMO_CHAT_THREADS.find((item) => item.id === activeId);

  if (!thread) {
    return (
      <ul className="demo-thread-list">
        {DEMO_CHAT_THREADS.map((item) => (
          <li key={item.id}>
            <button type="button" className="demo-thread" onClick={() => setActiveId(item.id)}>
              <span className="demo-avatar" aria-hidden="true">
                {item.name.slice(0, 1)}
              </span>
              <span className="demo-thread__body">
                <span className="demo-thread__row">
                  <strong>{item.name}</strong>
                  <time>{item.time}</time>
                </span>
                <span className="demo-thread__preview">{item.preview}</span>
              </span>
              {item.unread > 0 && <span className="demo-unread">{item.unread}</span>}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setMessages((current) => [
      ...current,
      { id: `local-${Date.now()}`, from: 'me', text, time: 'şimdi' },
    ]);
    setDraft('');
    notify('Mesaj iletildi (demo).');
  }

  return (
    <section className="demo-chat">
      <button type="button" className="demo-chat-back" onClick={() => setActiveId(null)}>
        ← Konuşmalar
      </button>
      <p className="dash-hint">
        {thread.name} · {childName} hakkında
      </p>
      <ul className="demo-bubbles">
        {messages.map((message) => (
          <li
            key={message.id}
            className={`demo-bubble demo-bubble--${message.from === 'me' ? 'me' : 'them'}`}
          >
            <p>{message.text}</p>
            <time>{message.time}</time>
          </li>
        ))}
      </ul>
      <form className="demo-composer" onSubmit={sendMessage}>
        <input
          className="dash-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Mesaj yazın…"
          aria-label="Mesaj"
        />
        <button className="demo-btn demo-btn--primary" type="submit">
          Gönder
        </button>
      </form>
    </section>
  );
}

function AnnouncementsScreen({ role, notify }) {
  return (
    <section className="demo-stack">
      {role !== 'parent' && (
        <ActionBar>
          <button type="button" className="demo-btn demo-btn--primary" onClick={() => notify('Yeni duyuru taslağı açıldı (demo).')}>
            Duyuru yaz
          </button>
        </ActionBar>
      )}
      {DEMO_ANNOUNCEMENTS.map((item) => (
        <article key={item.id} className={`dash-card${item.pinned ? ' demo-card-pinned' : ''}`}>
          <div className="demo-row-between">
            <h2 className="dash-section-title">{item.title}</h2>
            {item.pinned && <Pill tint="lavender">Sabit</Pill>}
          </div>
          <p className="dash-hint">{item.body}</p>
          <p className="demo-meta">
            {item.author} · {item.time}
          </p>
        </article>
      ))}
    </section>
  );
}

function ReportScreen({ childName, role, notify }) {
  return (
    <section className="demo-stack">
      <article className="dash-card">
        <h2 className="dash-section-title">{childName} — günlük karne</h2>
        <ul className="demo-score">
          <li>
            <span>Ruh hali</span>
            <strong>😊 Neşeli</strong>
          </li>
          <li>
            <span>Katılım</span>
            <strong>Yüksek</strong>
          </li>
          <li>
            <span>Yemek</span>
            <strong>Tabağını bitirdi</strong>
          </li>
          <li>
            <span>Uyku</span>
            <strong>1s 30dk</strong>
          </li>
        </ul>
        <p className="dash-hint">
          Arkadaşlarıyla paylaşmayı sevdi, parmak boyasında uzun süre odaklandı. Tuvaletini
          hatırlatınca kendi gitti.
        </p>
        {role !== 'parent' && (
          <ActionBar>
            <button type="button" className="demo-btn demo-btn--primary" onClick={() => notify('Karne veliye gönderildi.')}>
              Veliye gönder
            </button>
          </ActionBar>
        )}
      </article>
    </section>
  );
}

function AttendanceScreen({ students, role, notify }) {
  const [rows, setRows] = useState(() => buildRoster(students));
  const canEdit = role !== 'parent';

  function cycleStatus(id) {
    if (!canEdit) return;
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row;
        const index = ATTENDANCE_ORDER.indexOf(row.status);
        const next = ATTENDANCE_ORDER[(index + 1) % ATTENDANCE_ORDER.length];
        return {
          ...row,
          status: next,
          time: next === 'present' || next === 'late' ? row.time === '—' ? '09:00' : row.time : '—',
        };
      })
    );
  }

  const present = rows.filter((row) => row.status === 'present' || row.status === 'late').length;

  return (
    <section className="demo-stack">
      <div className="demo-stat-row">
        <article className="demo-stat demo-stat--mint">
          <span>Gelen</span>
          <strong>{present}</strong>
        </article>
        <article className="demo-stat demo-stat--sky">
          <span>Toplam</span>
          <strong>{rows.length}</strong>
        </article>
      </div>
      <ul className="demo-people">
        {rows.map((row) => {
          const stamp = ATTENDANCE_LABELS[row.status];
          return (
            <li key={row.id}>
              <button
                type="button"
                className="demo-person"
                onClick={() => cycleStatus(row.id)}
                disabled={!canEdit}
              >
                <span className="demo-avatar" aria-hidden="true">
                  {row.name.slice(0, 1)}
                </span>
                <span className="demo-person__info">
                  <strong>{row.name}</strong>
                  <span>
                    {row.group} · {row.time}
                  </span>
                </span>
                <Pill tint={stamp.tint}>{stamp.label}</Pill>
              </button>
            </li>
          );
        })}
      </ul>
      {canEdit && (
        <ActionBar>
          <button type="button" className="demo-btn demo-btn--primary" onClick={() => notify('Yoklama velilere bildirildi.')}>
            Yoklamayı bildir
          </button>
        </ActionBar>
      )}
    </section>
  );
}

function MealsScreen({ childName, role, notify }) {
  const portions = [
    { id: 'n1', label: 'Çorba', value: 'İyi yedi' },
    { id: 'n2', label: 'Ana yemek', value: 'Tabağını bitirdi' },
    { id: 'n3', label: 'Meyve', value: 'Yarısını yedi' },
  ];

  return (
    <section className="demo-stack">
      <article className="dash-card">
        <h2 className="dash-section-title">Bugün · {childName}</h2>
        <ul className="demo-score">
          {portions.map((item) => (
            <li key={item.id}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </li>
          ))}
        </ul>
        {role !== 'parent' && (
          <ActionBar>
            <button type="button" className="demo-btn demo-btn--primary" onClick={() => notify('Yemek kaydı güncellendi.')}>
              Kaydet
            </button>
          </ActionBar>
        )}
      </article>
      {DEMO_MENU_WEEK.map((day) => (
        <article key={day.day} className={`dash-card${day.today ? ' demo-card-pinned' : ''}`}>
          <div className="demo-row-between">
            <h2 className="dash-section-title">{day.day}</h2>
            {day.today && <Pill tint="peach">Bugün</Pill>}
          </div>
          <p className="dash-hint">{day.items.join(' · ')}</p>
          {day.allergens?.length > 0 && (
            <p className="demo-meta">Alerjen: {day.allergens.join(', ')}</p>
          )}
        </article>
      ))}
    </section>
  );
}

function SleepScreen({ childName, role, notify }) {
  return (
    <section className="demo-stack">
      <article className="dash-card">
        <h2 className="dash-section-title">{childName} — öğle uykusu</h2>
        <ul className="demo-score">
          <li>
            <span>Başlangıç</span>
            <strong>12:50</strong>
          </li>
          <li>
            <span>Bitiş</span>
            <strong>14:20</strong>
          </li>
          <li>
            <span>Süre</span>
            <strong>1s 30dk</strong>
          </li>
        </ul>
        <p className="dash-hint">Sakin geçti, uyanınca su içti ve kitaba oturdu.</p>
        {role !== 'parent' && (
          <ActionBar>
            <button type="button" className="demo-btn demo-btn--primary" onClick={() => notify('Uyku kaydı işaretlendi.')}>
              Uyku bitir
            </button>
          </ActionBar>
        )}
      </article>
    </section>
  );
}

function HealthScreen({ childName, role, notify }) {
  return (
    <section className="demo-stack">
      <article className="dash-card">
        <h2 className="dash-section-title">Sağlık özeti</h2>
        <ul className="demo-score">
          <li>
            <span>Ateş</span>
            <strong>36.6°</strong>
          </li>
          <li>
            <span>Ruh hali</span>
            <strong>İyi</strong>
          </li>
          <li>
            <span>Not</span>
            <strong>Şikâyet yok</strong>
          </li>
        </ul>
        <p className="dash-hint">{childName} gün boyu enerjikti. Alerji belirtisi gözlenmedi.</p>
        {role !== 'parent' && (
          <ActionBar>
            <button type="button" className="demo-btn demo-btn--primary" onClick={() => notify('Sağlık notu kaydedildi.')}>
              Not ekle
            </button>
          </ActionBar>
        )}
      </article>
    </section>
  );
}

function MedicineScreen({ role, notify }) {
  const [meds, setMeds] = useState(DEMO_MEDS);

  function toggle(id) {
    if (role === 'parent') return;
    setMeds((current) => current.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
    notify('İlaç kaydı güncellendi.');
  }

  return (
    <section className="demo-stack">
      <ul className="demo-people">
        {meds.map((item) => (
          <li key={item.id}>
            <button type="button" className="demo-person" onClick={() => toggle(item.id)} disabled={role === 'parent'}>
              <span className="demo-avatar" aria-hidden="true">
                💊
              </span>
              <span className="demo-person__info">
                <strong>{item.name}</strong>
                <span>
                  {item.dose} · {item.time}
                </span>
              </span>
              <Pill tint={item.done ? 'mint' : 'peach'}>{item.done ? 'Verildi' : 'Bekliyor'}</Pill>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PaymentsScreen({ notify, role }) {
  return (
    <section className="demo-stack">
      {DEMO_PAYMENTS.map((item) => (
        <article key={item.id} className="dash-card">
          <div className="demo-row-between">
            <h2 className="dash-section-title">{item.title}</h2>
            <Pill tint={item.status === 'paid' ? 'mint' : 'peach'}>
              {item.status === 'paid' ? 'Ödendi' : 'Açık'}
            </Pill>
          </div>
          <p className="demo-amount">{item.amount}</p>
          <p className="demo-meta">Vade: {item.due}</p>
          {item.status !== 'paid' && role === 'parent' && (
            <ActionBar>
              <button type="button" className="demo-btn demo-btn--primary" onClick={() => notify('Ödeme ekranı açıldı (demo).')}>
                Öde
              </button>
            </ActionBar>
          )}
        </article>
      ))}
    </section>
  );
}

function GrowthScreen({ childName }) {
  const maxHeight = Math.max(...DEMO_GROWTH.map((row) => row.height));

  return (
    <section className="demo-stack">
      <article className="dash-card">
        <h2 className="dash-section-title">{childName} — boy / kilo</h2>
        <p className="dash-hint">Son ölçüm: 97 cm · 14.3 kg</p>
        <div className="demo-bars" aria-hidden="true">
          {DEMO_GROWTH.map((row) => (
            <div key={row.month} className="demo-bars__col">
              <div className="demo-bars__track">
                <span style={{ height: `${(row.height / maxHeight) * 100}%` }} />
              </div>
              <small>{row.month}</small>
            </div>
          ))}
        </div>
        <ul className="demo-score">
          {DEMO_GROWTH.slice(-3).map((row) => (
            <li key={row.month}>
              <span>{row.month}</span>
              <strong>
                {row.height} cm · {row.weight} kg
              </strong>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}

function BusScreen({ childName }) {
  return (
    <section className="demo-stack">
      <div className="demo-map" aria-hidden="true">
        <div className="demo-map__road demo-map__road--h" />
        <div className="demo-map__road demo-map__road--v" />
        <div className="demo-map__park" />
        <div className="demo-map__school">🏫</div>
        <div className="demo-map__bus">🚌</div>
      </div>
      <article className="dash-card">
        <h2 className="dash-section-title">Papatya hattı</h2>
        <p className="dash-hint">{childName} için tahmini varış 08:18.</p>
        <ol className="demo-stops">
          {DEMO_BUS_STOPS.map((stop) => (
            <li key={stop.id} className={stop.current ? 'demo-stops__current' : undefined}>
              <span>{stop.time}</span>
              <strong>{stop.name}</strong>
              <Pill tint={stop.done ? 'mint' : stop.current ? 'peach' : 'sky'}>
                {stop.done ? 'Geçti' : stop.current ? 'Yolda' : 'Sırada'}
              </Pill>
            </li>
          ))}
        </ol>
      </article>
    </section>
  );
}

function CalendarScreen({ role, notify }) {
  return (
    <section className="demo-stack">
      {role !== 'parent' && (
        <ActionBar>
          <button type="button" className="demo-btn demo-btn--primary" onClick={() => notify('Etkinlik taslağı açıldı (demo).')}>
            Etkinlik ekle
          </button>
        </ActionBar>
      )}
      {DEMO_EVENTS.map((event) => (
        <article key={event.id} className="demo-event">
          <div className="demo-event__date">{event.date}</div>
          <div>
            <strong>{event.title}</strong>
            <p>
              {event.time} · {event.place}
            </p>
          </div>
        </article>
      ))}
    </section>
  );
}

function SurveyScreen({ notify }) {
  const [voted, setVoted] = useState(null);
  const [options, setOptions] = useState(DEMO_SURVEY.options);
  const total = options.reduce((sum, option) => sum + option.votes, 0);

  function vote(id) {
    if (voted) return;
    setOptions((current) =>
      current.map((option) => (option.id === id ? { ...option, votes: option.votes + 1 } : option))
    );
    setVoted(id);
    notify('Oyunuz kaydedildi.');
  }

  return (
    <section className="demo-stack">
      <article className="dash-card">
        <h2 className="dash-section-title">{DEMO_SURVEY.title}</h2>
        <ul className="demo-survey">
          {options.map((option) => {
            const percent = Math.round((option.votes / total) * 100);
            return (
              <li key={option.id}>
                <button type="button" className="demo-survey__btn" onClick={() => vote(option.id)} disabled={Boolean(voted)}>
                  <span className="demo-row-between">
                    <strong>{option.label}</strong>
                    <span>{percent}%</span>
                  </span>
                  <span className="demo-survey__bar">
                    <span style={{ width: `${percent}%` }} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </article>
    </section>
  );
}

function AwardsScreen({ childName, role, notify }) {
  return (
    <section className="demo-stack">
      {role !== 'parent' && (
        <ActionBar>
          <button type="button" className="demo-btn demo-btn--primary" onClick={() => notify('Yıldız eklendi.')}>
            Yıldız ver
          </button>
        </ActionBar>
      )}
      {DEMO_AWARDS.map((award) => (
        <article key={award.id} className="dash-card">
          <h2 className="dash-section-title">
            {'⭐'.repeat(award.stars)} {award.title}
          </h2>
          <p className="dash-hint">
            {childName} — {award.note}
          </p>
        </article>
      ))}
    </section>
  );
}

function BellScreen({ childName, notify }) {
  const [state, setState] = useState('idle');

  function ring(next, message) {
    setState(next);
    notify(message);
  }

  const statusLabel = {
    idle: 'Bekleniyor',
    coming: 'Veli yolda — öğretmen hazırlıyor',
    door: 'Kapıda — bahçeye indirin',
    other: 'Yetkili başka kişi alacak',
    ready: 'Hazır — karekod ile teslim',
  }[state];

  return (
    <section className="demo-stack">
      <article className="dash-card demo-bell">
        <p className="demo-kicker">Güvenli teslim</p>
        <h2 className="dash-section-title">{childName} kapıda mı?</h2>
        <p className="dash-hint">
          Kreş Cepte / e-Kreş tarzı akış: yoldayım, kapıdayım, başka biri alacak. Öğretmen
          hazırlar, teslim karekod ile kapanır.
        </p>
        <div className="demo-bell__status">{statusLabel}</div>
        <ActionBar>
          <button type="button" className="demo-btn demo-btn--primary" onClick={() => ring('coming', 'Yoldayım bildirimi gitti.')}>
            Yoldayım
          </button>
          <button type="button" className="demo-btn" onClick={() => ring('door', 'Kapıdayım bildirimi gitti.')}>
            Kapıdayım
          </button>
          <button type="button" className="demo-btn" onClick={() => ring('other', 'Yetkili kişi kaydı alındı.')}>
            Başka biri alacak
          </button>
        </ActionBar>
      </article>
      <article className="dash-card demo-qr-card">
        <div className="demo-qr" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div>
          <h2 className="dash-section-title">Karekodlu teslim</h2>
          <p className="dash-hint">Öğretmen okutunca teslim kaydı kapanır, veliye onay düşer.</p>
          <ActionBar>
            <button type="button" className="demo-btn demo-btn--primary" onClick={() => ring('ready', 'Teslim karekodu doğrulandı (demo).')}>
              Karekodu okut
            </button>
          </ActionBar>
        </div>
      </article>
    </section>
  );
}

function ToiletScreen({ childName, role, notify }) {
  return (
    <section className="demo-stack">
      <article className="dash-card">
        <h2 className="dash-section-title">{childName} — tuvalet</h2>
        <p className="dash-hint">2–3 yaş rutini. Islaklık yok, gün sakin geçti.</p>
        <ul className="demo-score">
          {DEMO_TOILET.map((row) => (
            <li key={row.id}>
              <span>{row.time}</span>
              <strong>{row.note}</strong>
            </li>
          ))}
        </ul>
        {role !== 'parent' && (
          <ActionBar>
            <button type="button" className="demo-btn demo-btn--primary" onClick={() => notify('Tuvalet kaydı eklendi.')}>
              Kayıt ekle
            </button>
          </ActionBar>
        )}
      </article>
    </section>
  );
}

function ScheduleScreen() {
  return (
    <section className="demo-stack">
      {DEMO_SCHEDULE.map((slot) => (
        <article key={slot.time} className="demo-event">
          <div className="demo-event__date">{slot.time}</div>
          <div>
            <strong>{slot.title}</strong>
            <p>{slot.place}</p>
          </div>
        </article>
      ))}
    </section>
  );
}

function HomeworkScreen({ role, notify }) {
  const [items, setItems] = useState(DEMO_HOMEWORK);

  function toggle(id) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
    notify('Ödev durumu güncellendi.');
  }

  return (
    <section className="demo-stack">
      {role !== 'parent' && (
        <ActionBar>
          <button type="button" className="demo-btn demo-btn--primary" onClick={() => notify('Ödev taslağı açıldı (demo).')}>
            Ödev paylaş
          </button>
        </ActionBar>
      )}
      {items.map((item) => (
        <article key={item.id} className="dash-card">
          <div className="demo-row-between">
            <h2 className="dash-section-title">{item.title}</h2>
            <Pill tint={item.done ? 'mint' : 'peach'}>{item.done ? 'Tamam' : `Son: ${item.due}`}</Pill>
          </div>
          <p className="dash-hint">{item.note}</p>
          <ActionBar>
            <button type="button" className="demo-btn" onClick={() => toggle(item.id)}>
              {item.done ? 'Geri al' : 'Tamamlandı işaretle'}
            </button>
          </ActionBar>
        </article>
      ))}
    </section>
  );
}

function BirthdaysScreen({ notify }) {
  return (
    <section className="demo-stack">
      {DEMO_BIRTHDAYS.map((row) => (
        <article key={row.id} className="demo-event">
          <div className="demo-event__date">🎂</div>
          <div>
            <strong>{row.name}</strong>
            <p>
              {row.date} · {row.group} · {row.when}
            </p>
          </div>
          <button type="button" className="demo-btn" onClick={() => notify('Kutlama notu sınıfa düştü.')}>
            Kutla
          </button>
        </article>
      ))}
    </section>
  );
}

function NewsletterScreen({ notify }) {
  return (
    <section className="demo-stack">
      <article className="dash-card">
        <p className="demo-kicker">Aylık özet</p>
        <h2 className="dash-section-title">{DEMO_NEWSLETTER.title}</h2>
        <p className="dash-hint">{DEMO_NEWSLETTER.body}</p>
        <p className="demo-meta">Ek: {DEMO_NEWSLETTER.file}</p>
        <ActionBar>
          <button type="button" className="demo-btn demo-btn--primary" onClick={() => notify('Bülten velilere iletildi (demo).')}>
            Velilere gönder
          </button>
        </ActionBar>
      </article>
    </section>
  );
}

function ShiftsScreen() {
  return (
    <section className="demo-stack">
      <ul className="demo-people">
        {DEMO_SHIFTS.map((row) => (
          <li key={row.id}>
            <div className="demo-person">
              <span className="demo-avatar" aria-hidden="true">
                {row.name.slice(0, 1)}
              </span>
              <span className="demo-person__info">
                <strong>{row.name}</strong>
                <span>
                  {row.role} · {row.hours}
                </span>
              </span>
              <Pill tint={row.status === 'Görevde' ? 'mint' : 'peach'}>{row.status}</Pill>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReportsScreen() {
  return (
    <section className="demo-stack">
      <div className="demo-stat-row demo-stat-row--wrap">
        {DEMO_REPORTS.map((item, index) => {
          const tints = ['mint', 'sky', 'peach', 'rose'];
          return (
            <article key={item.id} className={`demo-stat demo-stat--${tints[index % tints.length]}`}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.hint}</small>
            </article>
          );
        })}
      </div>
      <article className="dash-card">
        <h2 className="dash-section-title">Bu ayın özeti</h2>
        <p className="dash-hint">
          Devam yüksek, üç veliye aidat hatırlatması gitti, Papatya sınıfı 28 fotoğraf paylaştı.
          Sunumda bu kartları “yönetici tek bakışta görür” diye gösterebilirsiniz.
        </p>
      </article>
    </section>
  );
}

function MeetingScreen({ notify }) {
  return (
    <section className="demo-stack">
      {DEMO_MEETINGS.map((item) => (
        <article key={item.id} className="dash-card">
          <h2 className="dash-section-title">{item.title}</h2>
          <p className="dash-hint">
            {item.when} · {item.who}
          </p>
          <ActionBar>
            <button type="button" className="demo-btn demo-btn--primary" onClick={() => notify('Toplantı bağlantısı kopyalandı (demo).')}>
              Katıl
            </button>
          </ActionBar>
        </article>
      ))}
    </section>
  );
}

function FormsScreen({ notify }) {
  const [forms, setForms] = useState(DEMO_FORMS);

  function sign(id) {
    setForms((current) =>
      current.map((form) => (form.id === id ? { ...form, status: 'signed' } : form))
    );
    notify('Form onaylandı.');
  }

  return (
    <section className="demo-stack">
      <ul className="demo-people">
        {forms.map((form) => (
          <li key={form.id}>
            <div className="demo-person">
              <span className="demo-avatar" aria-hidden="true">
                📋
              </span>
              <span className="demo-person__info">
                <strong>{form.title}</strong>
                <span>{form.status === 'signed' ? 'Onaylandı' : 'İmza bekliyor'}</span>
              </span>
              {form.status === 'pending' ? (
                <button type="button" className="demo-btn demo-btn--primary" onClick={() => sign(form.id)}>
                  Onayla
                </button>
              ) : (
                <Pill tint="mint">Tamam</Pill>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AccountingScreen({ notify }) {
  return (
    <section className="demo-stack">
      <div className="demo-stat-row demo-stat-row--wrap">
        {DEMO_LEDGER.map((item) => (
          <article key={item.id} className={`demo-stat demo-stat--${item.tint}`}>
            <span>{item.label}</span>
            <strong>{item.amount}</strong>
          </article>
        ))}
      </div>
      <article className="dash-card">
        <h2 className="dash-section-title">Son hareketler</h2>
        <ul className="demo-score">
          <li>
            <span>Ayşe Özdemir · Eylül</span>
            <strong>₺4.500</strong>
          </li>
          <li>
            <span>M. Mercan · Eylül</span>
            <strong>₺4.500</strong>
          </li>
          <li>
            <span>S. Kaya · eşleşme bekliyor</span>
            <strong>₺2.250</strong>
          </li>
        </ul>
        <ActionBar>
          <button type="button" className="demo-btn demo-btn--primary" onClick={() => notify('Banka senkronu çalıştırıldı (demo).')}>
            Bankayı senkronize et
          </button>
        </ActionBar>
      </article>
    </section>
  );
}

function PreregScreen({ notify }) {
  return (
    <section className="demo-stack">
      <ActionBar>
        <button type="button" className="demo-btn demo-btn--primary" onClick={() => notify('Ön kayıt linki kopyalandı (demo).')}>
          Kayıt linkini kopyala
        </button>
      </ActionBar>
      <ul className="demo-people">
        {DEMO_PREREG.map((row) => (
          <li key={row.id}>
            <div className="demo-person">
              <span className="demo-avatar" aria-hidden="true">
                {row.name.slice(0, 1)}
              </span>
              <span className="demo-person__info">
                <strong>{row.name}</strong>
                <span>
                  {row.age} · {row.date}
                </span>
              </span>
              <Pill tint={row.status === 'Onaylandı' ? 'mint' : 'peach'}>{row.status}</Pill>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DemoScreen({ id, role, childName, students, notify }) {
  const name = childName || 'Elif';

  switch (id) {
    case 'gallery':
      return <GalleryScreen role={role} notify={notify} />;
    case 'chat':
      return <ChatScreen childName={name} notify={notify} />;
    case 'announcements':
      return <AnnouncementsScreen role={role} notify={notify} />;
    case 'report':
      return <ReportScreen childName={name} role={role} notify={notify} />;
    case 'attendance':
      return <AttendanceScreen students={students} role={role} notify={notify} />;
    case 'meals':
      return <MealsScreen childName={name} role={role} notify={notify} />;
    case 'sleep':
      return <SleepScreen childName={name} role={role} notify={notify} />;
    case 'health':
      return <HealthScreen childName={name} role={role} notify={notify} />;
    case 'medicine':
      return <MedicineScreen role={role} notify={notify} />;
    case 'payments':
      return <PaymentsScreen role={role} notify={notify} />;
    case 'growth':
      return <GrowthScreen childName={name} />;
    case 'bus':
      return <BusScreen childName={name} />;
    case 'calendar':
      return <CalendarScreen role={role} notify={notify} />;
    case 'survey':
      return <SurveyScreen notify={notify} />;
    case 'awards':
      return <AwardsScreen childName={name} role={role} notify={notify} />;
    case 'bell':
    case 'pickup':
      return <BellScreen childName={name} notify={notify} />;
    case 'toilet':
      return <ToiletScreen childName={name} role={role} notify={notify} />;
    case 'schedule':
      return <ScheduleScreen />;
    case 'homework':
      return <HomeworkScreen role={role} notify={notify} />;
    case 'birthdays':
      return <BirthdaysScreen notify={notify} />;
    case 'newsletter':
      return <NewsletterScreen notify={notify} />;
    case 'shifts':
      return <ShiftsScreen />;
    case 'reports':
      return <ReportsScreen />;
    case 'meeting':
      return <MeetingScreen notify={notify} />;
    case 'forms':
      return <FormsScreen notify={notify} />;
    case 'accounting':
      return <AccountingScreen notify={notify} />;
    case 'prereg':
      return <PreregScreen notify={notify} />;
    default:
      return <p className="dash-hint">Bu modül yakında.</p>;
  }
}
