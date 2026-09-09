const PROMPT_EVENT = 'pwa:beforeinstallprompt';
const INSTALLED_EVENT = 'pwa:appinstalled';

let capturedPrompt = null;
let listenersBound = false;
let pendingInstallIntent = false;

export function captureInstallPromptEarly() {
  if (typeof window === 'undefined' || listenersBound) return;
  listenersBound = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    capturedPrompt = event;
    window.dispatchEvent(new Event(PROMPT_EVENT));
  });

  window.addEventListener('appinstalled', () => {
    capturedPrompt = null;
    window.dispatchEvent(new Event(INSTALLED_EVENT));
  });
}

export function getCapturedInstallPrompt() {
  return capturedPrompt;
}

export function clearCapturedInstallPrompt() {
  capturedPrompt = null;
}

export function subscribeInstallPrompt(onAvailable) {
  if (typeof window === 'undefined') return () => {};

  function handle() {
    onAvailable(getCapturedInstallPrompt());
  }

  window.addEventListener(PROMPT_EVENT, handle);
  return () => window.removeEventListener(PROMPT_EVENT, handle);
}

export function subscribeAppInstalled(onInstalled) {
  if (typeof window === 'undefined') return () => {};

  window.addEventListener(INSTALLED_EVENT, onInstalled);
  return () => window.removeEventListener(INSTALLED_EVENT, onInstalled);
}

export function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if (window.matchMedia('(display-mode: window-controls-overlay)').matches) return true;
  if (window.navigator.standalone === true) return true;
  return false;
}

export function isIosDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function isInAppBrowser() {
  if (typeof navigator === 'undefined') return false;
  return /FBAN|FBAV|Instagram|Line\/|WhatsApp|Twitter|Snapchat|TikTok|Pinterest/i.test(
    navigator.userAgent || ''
  );
}

export function takeInstallQueryIntent() {
  if (typeof window === 'undefined') return pendingInstallIntent;

  const url = new URL(window.location.href);
  if (url.searchParams.get('install') === '1') {
    pendingInstallIntent = true;
    url.searchParams.delete('install');
    const search = url.searchParams.toString();
    window.history.replaceState({}, '', `${url.pathname}${search ? `?${search}` : ''}${url.hash}`);
  }

  return pendingInstallIntent;
}

export function clearInstallQueryIntent() {
  pendingInstallIntent = false;
}
