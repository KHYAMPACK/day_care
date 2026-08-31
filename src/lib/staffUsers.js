const TR_CHAR_MAP = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  Ç: 'c',
  Ğ: 'g',
  İ: 'i',
  I: 'i',
  Ö: 'o',
  Ş: 's',
  Ü: 'u',
};

export function normalizeUsername(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

export function slugifyFullName(fullName) {
  let slug = String(fullName ?? '')
    .trim()
    .split('')
    .map((char) => TR_CHAR_MAP[char] ?? char)
    .join('')
    .toLowerCase();

  slug = slug.replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
  return slug || 'user';
}

export function buildLoginEmail(schoolId, username) {
  const normalized = normalizeUsername(username);
  if (!schoolId || !normalized) {
    throw new Error('Okul ve kullanıcı adı gerekli.');
  }
  return `${normalized}@${schoolId}.login.internal`;
}

import { supabase } from './supabase';

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function staffApiRequest(path, body) {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.');
  }

  const response = await fetch(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? 'İşlem başarısız oldu.');
  }
  return payload;
}

export function addStaffRole(payload) {
  return staffApiRequest('/api/staff', { action: 'add-role', ...payload });
}

export function removeStaffRole(payload) {
  return staffApiRequest('/api/staff', { action: 'remove-role', ...payload });
}

export function createStaffUser(payload) {
  return staffApiRequest('/api/staff', { action: 'create', ...payload });
}

export function resetStaffPin(userId) {
  return staffApiRequest('/api/staff', { action: 'reset-pin', user_id: userId });
}

export function deleteStaffUser(userId) {
  return staffApiRequest('/api/staff', { action: 'delete', user_id: userId });
}
