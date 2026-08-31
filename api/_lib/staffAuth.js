import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './webPush.js';

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

export function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getSupabaseAnon() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase anon credentials are not configured on the server');
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

export async function verifyDirector(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return { error: 'Unauthorized', status: 401 };
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return { error: 'Supabase is not configured on the server', status: 500 };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return { error: 'Invalid or expired session', status: 401 };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, primary_role, school_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.school_id) {
    return { error: 'Only directors can manage users', status: 403 };
  }

  const adminDb = getSupabaseAdmin().adminDb;
  const { data: roleRows, error: rolesError } = await adminDb
    .from('profile_roles')
    .select('role')
    .eq('profile_id', user.id)
    .eq('role', 'director');

  const isDirector =
    (!rolesError && (roleRows ?? []).length > 0) || profile.role === 'director';

  if (!isDirector) {
    return { error: 'Only directors can manage users', status: 403 };
  }

  return { profile, adminDb };
}

export async function verifyFullDirector(req) {
  const auth = await verifyDirector(req);
  if (auth.error) return auth;

  const { profile, adminDb } = auth;

  let isFull = profile.primary_role === 'director';

  if (!isFull) {
    const { data: row, error } = await adminDb
      .from('profiles')
      .select('primary_role')
      .eq('id', profile.id)
      .maybeSingle();

    if (error && !/primary_role|schema cache/i.test(error.message ?? '')) {
      return { error: error.message, status: 500 };
    }

    isFull = row?.primary_role === 'director';
  }

  if (!isFull) {
    return { error: 'Bu işlem yalnızca asıl müdür tarafından yapılabilir.', status: 403 };
  }

  return { profile, adminDb };
}

export async function generateUniqueUsername(adminDb, schoolId, fullName) {
  const base = slugifyFullName(fullName);
  let candidate = base;
  let suffix = 2;

  while (true) {
    const { data, error } = await adminDb
      .from('profiles')
      .select('id')
      .eq('school_id', schoolId)
      .ilike('username', candidate)
      .maybeSingle();

    if (error) throw error;
    if (!data) return candidate;

    candidate = `${base}${suffix}`;
    suffix += 1;
  }
}

export async function createStaffAuthUser(adminDb, { schoolId, fullName, role, username, pin }) {
  const loginEmail = buildLoginEmail(schoolId, username);

  const { data, error } = await adminDb.auth.admin.createUser({
    email: loginEmail,
    password: pin,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      school_id: schoolId,
      username,
      role,
    },
  });

  if (error) {
    if (error.message?.toLowerCase().includes('already registered')) {
      throw new Error('Bu kullanıcı adı zaten kayıtlı.');
    }
    throw error;
  }

  const userId = data.user.id;

  const { error: profileError } = await adminDb
    .from('profiles')
    .update({
      full_name: fullName,
      school_id: schoolId,
      role,
      primary_role: role,
      username,
      email: loginEmail,
      login_pin: pin,
    })
    .eq('id', userId);

  if (profileError) throw profileError;

  const { error: roleError } = await adminDb
    .from('profile_roles')
    .upsert({ profile_id: userId, role }, { onConflict: 'profile_id,role' });

  if (roleError && !/profile_roles|schema cache/i.test(roleError.message ?? '')) {
    throw roleError;
  }

  return userId;
}
