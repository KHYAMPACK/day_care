import { PLATFORM_GROUPS } from '../../lib/demoData';

const ROLE_CARDS = [
  {
    key: 'parent',
    icon: '👨‍👩‍👧',
    title: 'Veli',
    text: 'Çocuğunun günü cebinde: yoklama, yemek, uyku, fotoğraf, teslim, aidat.',
  },
  {
    key: 'teacher',
    icon: '👩‍🏫',
    title: 'Öğretmen',
    text: 'Sınıfı birkaç dokunuşla işler; veli anında görür. WhatsApp’a gerek kalmaz.',
  },
  {
    key: 'director',
    icon: '🏫',
    title: 'Müdür',
    text: 'Yoklama, tahsilat, personel ve raporlar tek panelde. Sunumda burayı açın.',
  },
];

export default function PlatformShowcase({ schoolName, onOpen }) {
  const name = schoolName || 'KreşTakip';
  const total = PLATFORM_GROUPS.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <section className="showcase">
      <header className="showcase-hero">
        <p className="demo-kicker">Kuruma özel sunum</p>
        <h2 className="showcase-hero__title">{name} platformu</h2>
        <p className="showcase-hero__lead">
          Ekid+, KresApp, Kreş Cepte ve e-Kreş’teki çekirdek modüller — veli, öğretmen ve müdür
          için tek uygulamada. Kartlara dokununca canlı demo açılır.
        </p>
        <div className="showcase-hero__stats">
          <span>
            <strong>{total}</strong> modül
          </span>
          <span>
            <strong>3</strong> rol
          </span>
          <span>
            <strong>Demo</strong> açık
          </span>
        </div>
      </header>

      <div className="showcase-roles">
        {ROLE_CARDS.map((role) => (
          <article key={role.key} className="showcase-role">
            <span aria-hidden="true">{role.icon}</span>
            <h3>{role.title}</h3>
            <p>{role.text}</p>
          </article>
        ))}
      </div>

      {PLATFORM_GROUPS.map((group) => (
        <section key={group.id} className="showcase-group">
          <header>
            <h3>{group.title}</h3>
            <p>{group.subtitle}</p>
          </header>
          <ul className="showcase-list">
            {group.items.map((item) => (
              <li key={item.id}>
                <button type="button" className="showcase-card" onClick={() => onOpen(item.id)}>
                  <span className="showcase-card__icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="showcase-card__body">
                    <strong>{item.title}</strong>
                    <span>{item.blurb}</span>
                  </span>
                  <span className="showcase-card__go">Demo</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
