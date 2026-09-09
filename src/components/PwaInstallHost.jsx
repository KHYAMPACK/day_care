import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTenant } from '../context/TenantContext';
import { MOTION_OVERLAY_MS, usePresence } from '../lib/motion';
import {
  clearCapturedInstallPrompt,
  clearInstallQueryIntent,
  getCapturedInstallPrompt,
  isInAppBrowser,
  isIosDevice,
  isStandaloneDisplay,
  subscribeAppInstalled,
  subscribeInstallPrompt,
  takeInstallQueryIntent,
} from '../lib/pwaInstall';
import { Icon, IconWell } from './ui/Icon';

const WAIT_FOR_PROMPT_MS = 2500;
const PwaInstallContext = createContext(null);

function getInstallMode({ installed, ios, inApp, canNativeInstall, waitingForPrompt }) {
  if (installed) return 'hidden';
  if (inApp) return 'inapp';
  if (ios) return 'ios';
  if (canNativeInstall) return 'native';
  if (waitingForPrompt) return 'waiting';
  return 'manual';
}

function usePwaInstallState() {
  const [installed, setInstalled] = useState(() => isStandaloneDisplay());
  const [deferredPrompt, setDeferredPrompt] = useState(() => getCapturedInstallPrompt());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [waitingForPrompt, setWaitingForPrompt] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const wantsInstall = takeInstallQueryIntent();
    if (!wantsInstall || isStandaloneDisplay()) return undefined;

    setSheetOpen(true);
    if (getCapturedInstallPrompt() || isIosDevice() || isInAppBrowser()) {
      return undefined;
    }

    setWaitingForPrompt(true);
    const timeoutId = window.setTimeout(() => setWaitingForPrompt(false), WAIT_FOR_PROMPT_MS);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const unsubscribePrompt = subscribeInstallPrompt((event) => {
      setDeferredPrompt(event);
      setWaitingForPrompt(false);
    });
    const unsubscribeInstalled = subscribeAppInstalled(() => {
      clearInstallQueryIntent();
      setInstalled(true);
      setDeferredPrompt(null);
      setSheetOpen(false);
    });

    const media = window.matchMedia('(display-mode: standalone)');
    function onDisplayMode() {
      if (media.matches) setInstalled(true);
    }
    media.addEventListener?.('change', onDisplayMode);

    return () => {
      unsubscribePrompt();
      unsubscribeInstalled();
      media.removeEventListener?.('change', onDisplayMode);
    };
  }, []);

  const ios = isIosDevice();
  const inApp = isInAppBrowser();
  const canNativeInstall = Boolean(deferredPrompt) && !installed;
  const mode = getInstallMode({
    installed,
    ios,
    inApp,
    canNativeInstall,
    waitingForPrompt,
  });
  const showInstallButton = !installed && (canNativeInstall || ios);

  const openInstallSheet = useCallback(() => {
    if (isStandaloneDisplay()) return;
    setSheetOpen(true);
  }, []);

  const closeInstallSheet = useCallback(() => {
    clearInstallQueryIntent();
    setSheetOpen(false);
    setWaitingForPrompt(false);
  }, []);

  const promptInstall = useCallback(async () => {
    const event = deferredPrompt;
    if (!event) return;

    setInstalling(true);
    try {
      event.prompt();
      await event.userChoice;
    } finally {
      clearCapturedInstallPrompt();
      clearInstallQueryIntent();
      setDeferredPrompt(null);
      setInstalling(false);
      setSheetOpen(false);
    }
  }, [deferredPrompt]);

  return useMemo(
    () => ({
      installed,
      mode,
      sheetOpen,
      installing,
      showInstallButton,
      canNativeInstall,
      openInstallSheet,
      closeInstallSheet,
      promptInstall,
    }),
    [
      installed,
      mode,
      sheetOpen,
      installing,
      showInstallButton,
      canNativeInstall,
      openInstallSheet,
      closeInstallSheet,
      promptInstall,
    ]
  );
}

function InstallBody({ mode, appName, host }) {
  if (mode === 'waiting') {
    return (
      <div className="pwa-install-wait">
        <div className="dash-spinner" aria-hidden="true" />
        <p className="app-dialog__lead">Yükleme hazırlanıyor…</p>
      </div>
    );
  }

  if (mode === 'inapp') {
    return (
      <p className="app-dialog__lead">
        Bu tarayıcıda yükleme desteklenmiyor. {appName} uygulamasını eklemek için sayfayı Safari
        veya Chrome’da açın: <strong>{host}</strong>
      </p>
    );
  }

  if (mode === 'ios') {
    return (
      <>
        <p className="app-dialog__lead">
          {appName} uygulamasını ana ekranınıza ekleyin. Giriş bilgileriniz aynı kalır.
        </p>
        <ol className="pwa-install-steps">
          <li>
            <span className="pwa-install-steps__n" aria-hidden="true">
              1
            </span>
            <span>
              Alttaki <strong>Paylaş</strong> düğmesine dokunun
            </span>
          </li>
          <li>
            <span className="pwa-install-steps__n" aria-hidden="true">
              2
            </span>
            <span>
              <strong>Ana Ekrana Ekle</strong>’yi seçin
            </span>
          </li>
          <li>
            <span className="pwa-install-steps__n" aria-hidden="true">
              3
            </span>
            <span>
              <strong>Ekle</strong>’ye dokunun
            </span>
          </li>
        </ol>
      </>
    );
  }

  if (mode === 'native') {
    return (
      <p className="app-dialog__lead">
        {appName} uygulamasını telefonunuza veya bilgisayarınıza ekleyin. Ana ekrandan açılır; giriş
        bilgileriniz aynı kalır.
      </p>
    );
  }

  return (
    <p className="app-dialog__lead">
      Tarayıcı menüsünden <strong>Uygulamayı yükle</strong> veya <strong>Ana ekrana ekle</strong>{' '}
      seçeneğini kullanın. Adres: <strong>{host}</strong>
    </p>
  );
}

function PwaInstallDialog({ open, mode, installing, onInstall, onClose }) {
  const { tenant } = useTenant();
  const titleId = useId();
  const closeRef = useRef(null);
  const present = usePresence(open, MOTION_OVERLAY_MS);
  const appName = tenant.resolved ? tenant.name : 'OkulTakip';
  const host = typeof window === 'undefined' ? '' : window.location.host;
  const nativeReady = mode === 'native';
  const waiting = mode === 'waiting';

  useEffect(() => {
    if (!present) return undefined;

    function onKeyDown(event) {
      if (event.key === 'Escape' && open && !installing && !waiting) {
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
  }, [present, open, installing, waiting, onClose]);

  if (!present) return null;

  return createPortal(
    <div
      className={`app-dialog${open ? '' : ' app-dialog--out'}`}
      role="presentation"
      onClick={open && !installing && !waiting ? onClose : undefined}
    >
      <div
        className="app-dialog__panel pwa-install-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pwa-install-dialog__head">
          <IconWell name="phone" variant="lavender" size={20} />
          <h2 id={titleId} className="app-dialog__title">
            Uygulamayı yükle
          </h2>
        </div>

        <div className="app-dialog__body">
          <InstallBody mode={mode} appName={appName} host={host} />
        </div>

        <div className={`app-dialog__actions${nativeReady ? '' : ' app-dialog__actions--single'}`}>
          {nativeReady ? (
            <>
              <button
                ref={closeRef}
                type="button"
                className="demo-btn"
                onClick={onClose}
                disabled={installing}
              >
                Şimdi değil
              </button>
              <button
                type="button"
                className="demo-btn demo-btn--primary"
                onClick={onInstall}
                disabled={installing}
              >
                {installing ? 'Yükleniyor…' : 'Yükle'}
              </button>
            </>
          ) : waiting ? (
            <button type="button" className="demo-btn" disabled>
              Lütfen bekleyin…
            </button>
          ) : (
            <button ref={closeRef} type="button" className="demo-btn demo-btn--primary" onClick={onClose}>
              {mode === 'ios' ? 'Anladım' : 'Kapat'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function PwaInstallProvider({ children }) {
  const value = usePwaInstallState();

  return (
    <PwaInstallContext.Provider value={value}>
      {children}
      <PwaInstallDialog
        open={value.sheetOpen && value.mode !== 'hidden'}
        mode={value.mode}
        installing={value.installing}
        onInstall={value.promptInstall}
        onClose={value.closeInstallSheet}
      />
    </PwaInstallContext.Provider>
  );
}

export function usePwaInstall() {
  const value = useContext(PwaInstallContext);
  if (!value) {
    throw new Error('usePwaInstall must be used within PwaInstallProvider');
  }
  return value;
}

export function PwaInstallAuthButton() {
  const { showInstallButton, openInstallSheet } = usePwaInstall();
  if (!showInstallButton) return null;

  return (
    <button type="button" className="auth-link pwa-install-auth-btn" onClick={openInstallSheet}>
      <Icon name="phone" size={16} />
      Uygulamayı yükle
    </button>
  );
}
