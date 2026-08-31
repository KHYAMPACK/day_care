/**
 * Grant additional staff roles to an existing profile (multi-role support).
 *
 * Usage:
 *   node scripts/grant-staff-roles.mjs --school-code ATLASVIP --username emine.akbay --roles director,teacher --subject matematik
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const VALID_ROLES = new Set(['director', 'teacher', 'counselor', 'parent']);
const VALID_SUBJECTS = new Set(['matematik', 'fen', 'turkce', 'sosyal', 'ingilizce', 'din']);

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
    if (key === '--username') args.username = value;
    if (key === '--roles') args.roles = value;
    if (key === '--subject') args.subject = value;
  }
  return args;
}

loadEnv();

const {
  schoolId: argSchoolId,
  schoolCode,
  username,
  roles: rolesArg,
  subject,
} = parseArgs(process.argv);

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

if (!username?.trim() || !rolesArg?.trim()) {
  console.error(
    'Usage: node scripts/grant-staff-roles.mjs --school-code ATLASVIP --username emine.akbay --roles director,teacher --subject matematik'
  );
  process.exit(1);
}

if (!argSchoolId && !schoolCode) {
  console.error('Provide --school-id or --school-code');
  process.exit(1);
}

const roles = rolesArg
  .split(',')
  .map((role) => role.trim())
  .filter(Boolean);

for (const role of roles) {
  if (!VALID_ROLES.has(role)) {
    console.error(`Invalid role: ${role}`);
    process.exit(1);
  }
}

if (roles.includes('teacher') && subject && !VALID_SUBJECTS.has(subject)) {
  console.error(`Invalid subject: ${subject}`);
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

async function main() {
  const schoolId = await resolveSchoolId();
  const normalizedUsername = username.trim().toLowerCase();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, username, role, school_id')
    .eq('school_id', schoolId)
    .ilike('username', normalizedUsername)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) {
    throw new Error(`Profile not found: ${normalizedUsername} @ ${schoolCode ?? schoolId}`);
  }

  for (const role of roles) {
    const { error } = await supabase
      .from('profile_roles')
      .upsert({ profile_id: profile.id, role }, { onConflict: 'profile_id,role' });

    if (error && !/profile_roles|schema cache/i.test(error.message ?? '')) {
      throw error;
    }
  }

  if (roles.includes('teacher') && subject) {
    const { error: subjectError } = await supabase
      .from('profiles')
      .update({ subject_slug: subject, subject_id: null })
      .eq('id', profile.id);

    if (subjectError && !/subject_slug|schema cache/i.test(subjectError.message ?? '')) {
      throw subjectError;
    }
  }

  console.log('\nRoles granted:\n');
  console.log(`  Name:     ${profile.full_name}`);
  console.log(`  Username: ${profile.username}`);
  console.log(`  Roles:    ${roles.join(', ')}`);
  if (roles.includes('teacher') && subject) {
    console.log(`  Branş:    ${subject}`);
  }
  console.log('');
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
