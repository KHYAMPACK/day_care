import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

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

  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event) {
      if (event.key === 'Escape' && !confirming) {
        onCancel?.();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, confirming, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      className="app-dialog"
      role="presentation"
      onClick={confirming ? undefined : onCancel}
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
