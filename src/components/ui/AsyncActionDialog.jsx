import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatAppError } from '../../lib/errorMessages';
import { MOTION_OVERLAY_MS, usePresence } from '../../lib/motion';

export function AsyncActionDialog({
  open,
  phase = 'confirm',
  title,
  message,
  confirmLabel = 'Onayla',
  loadingLabel = 'İşleniyor…',
  successTitle = 'Başarılı',
  errorTitle = 'İşlem başarısız',
  credentials = null,
  error = null,
  onConfirm,
  onClose,
}) {
  const titleId = useId();
  const closeRef = useRef(null);
  const present = usePresence(open, MOTION_OVERLAY_MS);
  const isBusy = phase === 'loading';
  const isResult = phase === 'success' || phase === 'error';

  useEffect(() => {
    if (!present) return undefined;

    function onKeyDown(event) {
      if (event.key === 'Escape' && open && !isBusy) {
        onClose?.();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (open) closeRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [present, open, isBusy, onClose]);

  if (!present) return null;

  async function copyValue(value) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // ignore
    }
  }

  const panelTitle =
    phase === 'success' ? successTitle : phase === 'error' ? errorTitle : title;

  return createPortal(
    <div
      className={`app-dialog${open ? '' : ' app-dialog--out'}`}
      role="presentation"
      onClick={open && !isBusy ? onClose : undefined}
    >
      <div
        className="app-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="app-dialog__title">
          {panelTitle}
        </h2>

        <div className="app-dialog__body">
          {phase === 'loading' ? (
            <div className="async-action-dialog__loading">
              <div className="dash-spinner" aria-hidden="true" />
              <p>{loadingLabel}</p>
            </div>
          ) : null}

          {phase === 'confirm' && message ? <p>{message}</p> : null}

          {phase === 'success' ? (
            <>
              {message ? <p>{message}</p> : null}
              {credentials ? (
                <dl className="credentials-list">
                  <div className="credentials-row">
                    <dt>Kullanıcı adı</dt>
                    <dd>
                      <code>{credentials.username}</code>
                      <button
                        type="button"
                        className="demo-btn demo-btn--ghost"
                        onClick={() => copyValue(credentials.username)}
                      >
                        Kopyala
                      </button>
                    </dd>
                  </div>
                  <div className="credentials-row">
                    <dt>PIN</dt>
                    <dd>
                      <code>{credentials.pin}</code>
                      <button
                        type="button"
                        className="demo-btn demo-btn--ghost"
                        onClick={() => copyValue(credentials.pin)}
                      >
                        Kopyala
                      </button>
                    </dd>
                  </div>
                </dl>
              ) : null}
            </>
          ) : null}

          {phase === 'error' ? (
            <p className="async-action-dialog__error">
              {formatAppError(error, 'general')}
            </p>
          ) : null}
        </div>

        <div className="app-dialog__actions">
          {phase === 'confirm' ? (
            <>
              <button
                ref={closeRef}
                type="button"
                className="demo-btn"
                onClick={onClose}
              >
                İptal
              </button>
              <button
                type="button"
                className="demo-btn demo-btn--primary"
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            </>
          ) : null}

          {isResult ? (
            <button
              ref={closeRef}
              type="button"
              className="demo-btn demo-btn--primary"
              onClick={onClose}
            >
              Tamam
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
