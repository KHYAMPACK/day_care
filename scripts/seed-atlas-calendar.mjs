/**
 * Replace ATLAS 2026–2027 calendar events from src/lib/atlasCalendar2026.js.
 *
 * Usage:
 *   npm run seed-atlas-calendar
 *   node scripts/seed-atlas-calendar.mjs
 *   node scripts/seed-atlas-calendar.mjs --school-code ATLASVIP
 *   node scripts/seed-atlas-calendar.mjs --all-schools
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ATLAS_CALENDAR_EVENTS,
  ATLAS_CALENDAR_SOURCE,
} from '../src/lib/atlasCalendar2026.js';
import { deriveAcademicWeeksFromCalendar } from './lib/academicWeeks.mjs';

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

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const schoolCode = readArg('--school-code');
const allSchools = hasFlag('--all-schools');
const academicWeeks = deriveAcademicWeeksFromCalendar(ATLAS_CALENDAR_EVENTS);

function calendarRowsForSchool(schoolId) {
  return ATLAS_CALENDAR_EVENTS.map((event) => ({
    school_id: schoolId,
    title: event.title,
    body: event.body ?? '',
    event_type: event.event_type,
    starts_on: event.starts_on,
    ends_on: event.ends_on ?? event.starts_on,
    starts_at: event.starts_at ?? null,
    audience_grades: event.audience_grades ?? null,
    notify: event.notify ?? true,
    source: ATLAS_CALENDAR_SOURCE,
  }));
}

async function resolveTargetSchools() {
  const { data, error } = await supabase.from('schools').select('id, name, school_code, features');
  if (error) throw error;

  if (schoolCode) {
    const match = (data ?? []).find((row) => row.school_code === schoolCode);
    if (!match) {
      throw new Error(`School not found for code ${schoolCode}`);
    }
    return [match];
  }

  if (allSchools) {
    return data ?? [];
  }

  const atlasSchools = (data ?? []).filter((row) => row.features?.atlas_schedule);
  if (!atlasSchools.length) {
    throw new Error(
      'No Atlas schools found (features.atlas_schedule). Pass --school-code ATLASVIP or --all-schools.'
    );
  }
  return atlasSchools;
}

async function syncAcademicWeeks(school) {
  if (!school.features?.atlas_schedule) return;

  const { error } = await supabase
    .from('schools')
    .update({
      features: {
        ...(school.features ?? {}),
        academic_weeks: academicWeeks,
      },
    })
    .eq('id', school.id);
  if (error) throw error;
}

async function reseedSchool(school) {
  const { error: deleteError } = await supabase
    .from('calendar_events')
    .delete()
    .eq('school_id', school.id)
    .eq('source', ATLAS_CALENDAR_SOURCE);
  if (deleteError) throw deleteError;

  const rows = calendarRowsForSchool(school.id);
  const { error: insertError } = await supabase.from('calendar_events').insert(rows);
  if (insertError) throw insertError;

  await syncAcademicWeeks(school);

  console.log(
    `Seeded ${rows.length} events for ${school.name ?? school.id}` +
      (school.school_code ? ` (${school.school_code})` : '') +
      ` · academic_weeks=${academicWeeks}`
  );
}

async function main() {
  const schools = await resolveTargetSchools();
  console.log(
    `Re-seeding ${ATLAS_CALENDAR_SOURCE} for ${schools.length} school(s) ` +
      `(${ATLAS_CALENDAR_EVENTS.length} events per school)\n`
  );

  for (const school of schools) {
    await reseedSchool(school);
  }

  console.log('\nDone.');
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
