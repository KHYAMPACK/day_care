import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './webPush.js';
import { buildLoginEmail, normalizeUsername, slugifyFullName } from '../../src/lib/staffUsers.js';

export { buildLoginEmail, normalizeUsername, slugifyFullName };

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
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();

  if (profileError || profile?.role !== 'director' || !profile?.school_id) {
    return { error: 'Only directors can manage users', status: 403 };
  }

  return { profile, adminDb: getSupabaseAdmin().adminDb };
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
      username,
      email: loginEmail,
      login_pin: pin,
    })
    .eq('id', userId);

  if (profileError) throw profileError;

  return userId;
}
