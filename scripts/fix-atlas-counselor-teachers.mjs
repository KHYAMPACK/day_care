/**
 * Fix Atlas VIP rehberlikçi staff: ensure teacher role + legacy profiles.role
 * + assign to every class (Atlas all-şube access).
 *
 * Usage: node scripts/fix-atlas-counselor-teachers.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureTeachersAssignedToAllClasses } from '../api/_lib/atlasTeacherClasses.js';
import { isRehberlikBranch } from '../src/lib/teacherBranches.js';

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

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function legacyRoleFromRoles(roles) {
  if (roles.includes('director')) return 'director';
  if (roles.includes('teacher')) return 'teacher';
  if (roles.includes('counselor')) return 'counselor';
  if (roles.includes('parent')) return 'parent';
  return 'parent';
}

const { data: school, error: schoolError } = await supabase
  .from('schools')
  .select('id, name, school_code')
  .or('school_code.eq.ATLASVIP,name.ilike.%Atlas VIP%')
  .maybeSingle();

if (schoolError) throw schoolError;
if (!school) throw new Error('Atlas school not found');

const { data: profiles, error: profilesError } = await supabase
  .from('profiles')
  .select('id, full_name, username, role, primary_role, subject_slug')
  .eq('school_id', school.id);

if (profilesError) throw profilesError;

const ids = (profiles ?? []).map((row) => row.id);
const { data: roleRows, error: rolesError } = await supabase
  .from('profile_roles')
  .select('profile_id, role')
  .in('profile_id', ids);

if (rolesError) throw rolesError;

const rolesById = new Map();
for (const row of roleRows ?? []) {
  const list = rolesById.get(row.profile_id) ?? [];
  list.push(row.role);
  rolesById.set(row.profile_id, list);
}

const targets = (profiles ?? []).filter((profile) => {
  const roles = rolesById.get(profile.id) ?? [];
  const isCounselor = roles.includes('counselor') || profile.role === 'counselor';
  const isRehberlik = isRehberlikBranch(profile.subject_slug);
  return isCounselor || isRehberlik;
});

console.log(`School: ${school.name} (${school.school_code})`);
console.log(`Counselor / rehberlik profiles: ${targets.length}`);

for (const profile of targets) {
  const roles = new Set(rolesById.get(profile.id) ?? []);
  if (profile.role === 'counselor') roles.add('counselor');

  if (!roles.has('teacher')) {
    const { error } = await supabase
      .from('profile_roles')
      .upsert({ profile_id: profile.id, role: 'teacher' }, { onConflict: 'profile_id,role' });
    if (error) throw error;
    roles.add('teacher');
    console.log(`+ teacher role → ${profile.full_name} (${profile.username})`);
  }

  if (!profile.subject_slug) {
    const { error } = await supabase
      .from('profiles')
      .update({ subject_slug: 'rehberlik', subject_id: null })
      .eq('id', profile.id);
    if (error) throw error;
    console.log(`+ subject rehberlik → ${profile.full_name}`);
  }

  const legacy = legacyRoleFromRoles([...roles]);
  if (profile.role !== legacy) {
    const { error } = await supabase.from('profiles').update({ role: legacy }).eq('id', profile.id);
    if (error) throw error;
    console.log(`~ legacy role ${profile.role} → ${legacy} for ${profile.full_name}`);
  }

  // Old enforce_teacher_assignment only accepts profiles.role = teacher.
  // Temporarily set teacher for assignment insert when legacy is director.
  if (legacy !== 'teacher') {
    const { error } = await supabase
      .from('profiles')
      .update({ role: 'teacher' })
      .eq('id', profile.id);
    if (error) throw error;
  }

  const result = await ensureTeachersAssignedToAllClasses(supabase, {
    schoolId: school.id,
    teacherIds: [profile.id],
  });
  console.log(`assignments +${result.inserted} → ${profile.full_name}`);

  if (legacy !== 'teacher') {
    const { error } = await supabase.from('profiles').update({ role: legacy }).eq('id', profile.id);
    if (error) throw error;
  }
}

console.log('Done.');
