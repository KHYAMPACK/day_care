/**
 * Create a director account with username + 6-digit PIN for a school.
 *
 * Usage:
 *   node scripts/create-director.mjs --school-id <uuid> --name "Müdür Adı"
 *   node scripts/create-director.mjs --school-code DEMO123 --name "Müdür Adı"
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnv() {
  const envPath = resolve(root, '.env');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--school-id') args.schoolId = value;
    if (key === '--school-code') args.schoolCode = value;
    if (key === '--name') args.name = value;
    if (key === '--username') args.username = value;
  }
  return args;
}

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

function slugifyFullName(fullName) {
  let slug = String(fullName ?? '')
    .trim()
    .split('')
    .map((char) => TR_CHAR_MAP[char] ?? char)
    .join('')
    .toLowerCase();

  slug = slug.replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
  return slug || 'user';
}

function buildLoginEmail(schoolId, username) {
  return `${username.toLowerCase()}@${schoolId}.login.internal`;
}

function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

loadEnv();

const { schoolId: argSchoolId, schoolCode, name, username: argUsername } = parseArgs(process.argv);
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

if (!name?.trim()) {
  console.error('Usage: node scripts/create-director.mjs --school-code DEMO123 --name "Müdür Adı"');
  process.exit(1);
}

if (!argSchoolId && !schoolCode) {
  console.error('Provide --school-id or --school-code');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function resolveSchoolId() {
  if (argSchoolId) return argSchoolId;

  const { data, error } = await supabase
    .from('schools')
    .select('id, name')
    .eq('school_code', schoolCode)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`School not found for code ${schoolCode}`);
  return data.id;
}

async function generateUniqueUsername(schoolId, fullName, preferred) {
  const base = preferred?.trim() || slugifyFullName(fullName);
  let candidate = base;
  let suffix = 2;

  while (true) {
    const { data, error } = await supabase
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

async function main() {
  const schoolId = await resolveSchoolId();
  const fullName = name.trim();
  const username = await generateUniqueUsername(schoolId, fullName, argUsername);
  const pin = generatePin();
  const loginEmail = buildLoginEmail(schoolId, username);

  const { data, error } = await supabase.auth.admin.createUser({
    email: loginEmail,
    password: pin,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      school_id: schoolId,
      username,
      role: 'director',
    },
  });

  if (error) throw error;

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      school_id: schoolId,
      role: 'director',
      username,
      email: loginEmail,
      login_pin: pin,
    })
    .eq('id', data.user.id);

  if (profileError) throw profileError;

  console.log('\nDirector account created:\n');
  console.log(`  Name:     ${fullName}`);
  console.log(`  Username: ${username}`);
  console.log(`  PIN:      ${pin}`);
  console.log(`  School:   ${schoolId}`);
  console.log('\nShare username + PIN with the director for login on the school domain.\n');
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
