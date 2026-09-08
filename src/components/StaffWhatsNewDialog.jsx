import { createPortal } from 'react-dom';

function formatPublishedDate(iso) {
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

export default function StaffWhatsNewDialog({ entries = [], onDismiss }) {
  if (!entries.length) return null;

  return createPortal(
    <div className="app-dialog" role="presentation">
      <div
        className="app-dialog__panel staff-whats-new-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-whats-new-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="staff-whats-new-title" className="app-dialog__title">
          Yenilikler
        </h2>
        <p className="app-dialog__lead">
          Panelde yaptığımız son değişiklikler. Bu özeti bir kez görürsünüz; kapattıktan sonra tekrar
          gösterilmez.
        </p>

        <div className="staff-whats-new-dialog__releases">
          {entries.map((entry) => (
            <section key={entry.id} className="staff-whats-new-release">
              <header className="staff-whats-new-release__header">
                <h3 className="staff-whats-new-release__title">{entry.title}</h3>
                {entry.publishedOn ? (
                  <time className="staff-whats-new-release__date" dateTime={entry.publishedOn}>
                    {formatPublishedDate(entry.publishedOn)}
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

        <div className="app-dialog__actions">
          <button type="button" className="demo-btn demo-btn--primary" onClick={onDismiss}>
            Anladım
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
