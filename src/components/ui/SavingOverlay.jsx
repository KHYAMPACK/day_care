import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { MOTION_OVERLAY_MS, usePresence } from '../../lib/motion';
import { Icon } from './Icon';

export function SavingOverlay({
  open,
  phase = 'loading',
  title = 'Kaydediliyor…',
  message = 'Lütfen sayfadan ayrılmayın.',
}) {
  const titleId = useId();
  const present = usePresence(open, MOTION_OVERLAY_MS);
  const isLoading = phase === 'loading';

  useEffect(() => {
    if (!present) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [present]);

  useEffect(() => {
    if (!open || !isLoading) return undefined;

    function onBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [open, isLoading]);

  if (!present) return null;

  return createPortal(
    <div
      className={`app-dialog saving-overlay${open ? '' : ' app-dialog--out'}`}
      role="presentation"
    >
      <div
        className={`app-dialog__panel saving-overlay__panel saving-overlay__panel--${phase}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={isLoading}
        aria-live="polite"
      >
        <div className="async-action-dialog__loading saving-overlay__body">
          {isLoading ? (
            <div className="dash-spinner saving-overlay__spinner" aria-hidden="true" />
          ) : (
            <div className="saving-overlay__success" aria-hidden="true">
              <Icon name="check" size={28} />
            </div>
          )}
          <h2 id={titleId} className="saving-overlay__title">
            {title}
          </h2>
          {message ? <p className="saving-overlay__message">{message}</p> : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
