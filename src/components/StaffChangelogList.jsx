export function formatChangelogDate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${iso}T12:00:00`));
  } catch {
    return iso;
  }
}

export default function StaffChangelogList({ entries = [] }) {
  if (!entries.length) {
    return <p className="dash-hint">Şu an görüntülenecek sürüm notu yok.</p>;
  }

  return (
    <div className="staff-whats-new-dialog__releases">
      {entries.map((entry) => (
        <section key={entry.id} className="staff-whats-new-release">
          <header className="staff-whats-new-release__header">
            <h3 className="staff-whats-new-release__title">{entry.title}</h3>
            {entry.publishedOn ? (
              <time className="staff-whats-new-release__date" dateTime={entry.publishedOn}>
                {formatChangelogDate(entry.publishedOn)}
              </time>
            ) : null}
          </header>
          {entry.intro ? <p className="dash-hint staff-whats-new-release__intro">{entry.intro}</p> : null}

          <div className="staff-whats-new-release__items">
            {entry.items.map((item) => (
              <article key={item.title} className="staff-whats-new-item">
                <h4 className="staff-whats-new-item__title">{item.title}</h4>
                {item.summary ? <p className="staff-whats-new-item__summary">{item.summary}</p> : null}
                {item.steps?.length ? (
                  <div className="staff-whats-new-item__how">
                    <p className="staff-whats-new-item__how-label">Nasıl kullanılır?</p>
                    <ol className="staff-whats-new-item__steps">
                      {item.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
