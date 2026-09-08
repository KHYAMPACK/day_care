import { createPortal } from 'react-dom';
import StaffChangelogList from './StaffChangelogList';

export default function StaffWhatsNewDialog({
  entries = [],
  onDismiss,
  archive = false,
}) {
  if (!entries.length && !archive) return null;

  return createPortal(
    <div className="app-dialog" role="presentation" onClick={archive ? onDismiss : undefined}>
      <div
        className="app-dialog__panel staff-whats-new-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-whats-new-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="staff-whats-new-title" className="app-dialog__title">
          {archive ? 'Sürüm notları' : 'Yenilikler'}
        </h2>
        <p className="app-dialog__lead">
          {archive
            ? 'Paneldeki güncellemeler ve nasıl kullanılacakları. İstediğiniz zaman buradan bakabilirsiniz.'
            : 'Panelde yaptığımız son değişiklikler. Bu özeti bir kez görürsünüz; kapattıktan sonra Sürüm notları bölümünden tekrar açabilirsiniz.'}
        </p>

        <StaffChangelogList entries={entries} />

        <div className="app-dialog__actions">
          <button type="button" className="demo-btn demo-btn--primary" onClick={onDismiss}>
            {archive ? 'Kapat' : 'Anladım'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
