import { useEffect, useState } from 'react';

const CONTEXT_TITLES = {
  auth: 'Giriş yapılamadı',
  profile: 'Profil yüklenemedi',
  admin: 'Panel yüklenemedi',
  parent: 'Akış yüklenemedi',
  send: 'Mesaj gönderilemedi',
  push: 'Bildirim gönderilemedi',
  subscribe: 'Bildirim açılamadı',
  general: 'Bir sorun oluştu',
};

const FRIENDLY_PREFIXES = [
  'Mesaj',
  'Lütfen',
  'Bildirim',
  'Profil',
  'Bağlantı',
  'Giriş',
  'Hesap',
  'Oturum',
  'Push',
  'Anlık',
  'Veli',
  'Grup',
  'Öğrenci',
  'Şifre',
  'E-posta',
  'No push',
  'Mesaj kaydedildi',
];

function getRawMessage(error) {
  if (!error) return '';
  if (typeof error === 'string') return error.trim();
  return (error.message ?? '').trim();
}

function isOffline(error, raw) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;

  const lower = raw.toLowerCase();
  return (
    lower.includes('failed to fetch') ||
    lower.includes('load failed') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('net::err_') ||
    lower.includes('err_internet_disconnected') ||
    lower.includes('the internet connection appears to be offline') ||
    (error?.name === 'TypeError' && lower.includes('fetch'))
  );
}

function isAuthError(raw) {
  const lower = raw.toLowerCase();
  return (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid_credentials') ||
    lower.includes('email not confirmed') ||
    lower.includes('user already registered') ||
    lower.includes('invalid email') ||
    lower.includes('weak password') ||
    lower.includes('jwt expired') ||
    lower.includes('invalid or expired session')
  );
}

function isPermissionError(raw) {
  const lower = raw.toLowerCase();
  return (
    lower.includes('permission denied') ||
    lower.includes('row-level security') ||
    lower.includes('not authorized') ||
    lower.includes('forbidden') ||
    lower.includes('only admins')
  );
}

function isAlreadyFriendly(raw) {
  if (!raw) return false;
  if (FRIENDLY_PREFIXES.some((prefix) => raw.startsWith(prefix))) return true;
  if (!/[A-Za-z]{5,}/.test(raw)) return true;
  return false;
}

function mapAuthMessage(raw) {
  const lower = raw.toLowerCase();
  if (lower.includes('invalid login') || lower.includes('invalid_credentials')) {
    return 'E-posta veya şifre hatalı.';
  }
  if (lower.includes('email not confirmed')) {
    return 'E-posta adresinizi onaylamanız gerekiyor.';
  }
  if (lower.includes('user already registered')) {
    return 'Bu e-posta adresi zaten kayıtlı.';
  }
  if (lower.includes('weak password')) {
    return 'Şifre en az 6 karakter olmalıdır.';
  }
  return 'Giriş bilgilerinizi kontrol edip tekrar deneyin.';
}

function mapSubscribeMessage(raw) {
  const lower = raw.toLowerCase();
  if (lower.includes('izni verilmedi') || lower.includes('permission denied') || lower.includes('notallowed')) {
    return 'Bildirim izni verilmedi. Tarayıcı ayarlarından izin verebilirsiniz.';
  }
  if (lower.includes('desteklemiyor')) {
    return 'Bu cihaz veya tarayıcı anlık bildirimleri desteklemiyor.';
  }
  if (lower.includes('vapid')) {
    return 'Bildirim ayarları henüz yapılandırılmamış. Kreş yöneticinize bildirin.';
  }
  if (lower.includes('oturum')) {
    return 'Oturumunuz sona ermiş olabilir. Çıkış yapıp tekrar giriş yapın.';
  }
  return 'Anlık bildirimler açılamadı. Lütfen tekrar deneyin.';
}

function mapPushMessage(raw) {
  const lower = raw.toLowerCase();
  if (lower.includes('oturum')) {
    return 'Bildirim göndermek için oturumunuz gerekli.';
  }
  if (lower.includes('only admins') || lower.includes('forbidden')) {
    return 'Bu işlem yalnızca yöneticiler içindir.';
  }
  return 'Anlık bildirim gönderilemedi.';
}

export function formatAppError(error, context = 'general') {
  const raw = getRawMessage(error);

  if (isAlreadyFriendly(raw) && !isOffline(error, raw)) {
    return {
      type: 'info',
      title: null,
      message: raw,
      icon: '💭',
    };
  }

  if (isOffline(error, raw)) {
    return {
      type: 'offline',
      title: 'İnternet bağlantısı yok',
      message: 'Bağlantınızı kontrol edin ve tekrar deneyin.',
      icon: '📡',
    };
  }

  if (isAuthError(raw)) {
    return {
      type: 'auth',
      title: CONTEXT_TITLES.auth,
      message: mapAuthMessage(raw),
      icon: '🔐',
    };
  }

  if (isPermissionError(raw)) {
    return {
      type: 'permission',
      title: CONTEXT_TITLES[context] ?? CONTEXT_TITLES.general,
      message: 'Bu işlem için yetkiniz bulunmuyor.',
      icon: '🌸',
    };
  }

  if (context === 'subscribe') {
    return {
      type: 'general',
      title: CONTEXT_TITLES.subscribe,
      message: mapSubscribeMessage(raw),
      icon: '🔔',
    };
  }

  if (context === 'push') {
    return {
      type: 'general',
      title: CONTEXT_TITLES.push,
      message: isOffline(error, raw) ? 'Bağlantınızı kontrol edin ve tekrar deneyin.' : mapPushMessage(raw),
      icon: '📱',
    };
  }

  return {
    type: 'general',
    title: CONTEXT_TITLES[context] ?? CONTEXT_TITLES.general,
    message: 'Bir şeyler ters gitti. Lütfen biraz sonra tekrar deneyin.',
    icon: '🌿',
  };
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine
  );

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return online;
}
