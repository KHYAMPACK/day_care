import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MOTION_OVERLAY_MS, usePresence } from '../../lib/motion';

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Onayla',
  cancelLabel = 'İptal',
  confirming = false,
  onConfirm,
  onCancel,
}) {
  const titleId = useId();
  const cancelRef = useRef(null);
  const present = usePresence(open, MOTION_OVERLAY_MS);

  useEffect(() => {
    if (!present) return undefined;

    function onKeyDown(event) {
      if (event.key === 'Escape' && open && !confirming) {
        onCancel?.();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (open) cancelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [present, open, confirming, onCancel]);

  if (!present) return null;

  return createPortal(
    <div
      className={`app-dialog${open ? '' : ' app-dialog--out'}`}
      role="presentation"
      onClick={open && !confirming ? onCancel : undefined}
    >
      <div
        className="app-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="app-dialog__title">
          {title}
        </h2>
        <div className="app-dialog__body">{children}</div>
        <div className="app-dialog__actions">
          <button
            ref={cancelRef}
            type="button"
            className="demo-btn"
            onClick={onCancel}
            disabled={confirming}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="demo-btn demo-btn--primary"
            onClick={onConfirm}
            disabled={confirming}
          >
            {confirming ? `${confirmLabel}…` : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
