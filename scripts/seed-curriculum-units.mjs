/**
 * Replace curriculum_units from Atlas weekly plan JSON.
 *
 * Usage:
 *   npm run seed-curriculum-units
 *   node scripts/seed-curriculum-units.mjs [path/to/units.json]
 *   node scripts/seed-curriculum-units.mjs --sync-week-plans
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ATLAS_CALENDAR_EVENTS } from '../src/lib/atlasCalendar2026.js';
import {
  ACADEMIC_YEAR_ANCHOR,
  deriveAcademicWeeksFromCalendar,
} from './lib/academicWeeks.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const defaultJsonPath = resolve(root, 'data/curriculum/atlas-weekly-units.json');

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

const jsonArg = process.argv.slice(2).find((arg) => !arg.startsWith('--') && arg.endsWith('.json'));
const jsonPath = jsonArg ? resolve(process.cwd(), jsonArg) : defaultJsonPath;
const syncWeekPlans = process.argv.includes('--sync-week-plans');
const ACADEMIC_WEEKS = deriveAcademicWeeksFromCalendar(ATLAS_CALENDAR_EVENTS);

function clampDurationWeeks(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(20, parsed));
}

function weekAssignmentsFromUnits(units) {
  const ordered = [...(units ?? [])].sort(
    (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0)
  );
  const assignments = [];
  let cursor = 1;

  for (const unit of ordered) {
    const durationWeeks = clampDurationWeeks(unit.duration_weeks);
    const spanEnd = cursor + durationWeeks - 1;
    for (let week = cursor; week <= Math.min(spanEnd, ACADEMIC_WEEKS); week += 1) {
      assignments.push({ weekIndex: week, unitId: unit.id });
    }
    cursor = spanEnd + 1;
  }

  return assignments;
}

async function syncWeekPlansForSubject({ schoolId, grade, subjectId }) {
  const { data: units, error: unitsError } = await supabase
    .from('curriculum_units')
    .select('id, sort_order, duration_weeks')
    .eq('subject_id', subjectId)
    .order('sort_order', { ascending: true });
  if (unitsError) throw unitsError;

  const assignments = weekAssignmentsFromUnits(units ?? []);
  const { error: deleteError } = await supabase
    .from('curriculum_week_plans')
    .delete()
    .eq('school_id', schoolId)
    .eq('grade', grade)
    .eq('subject_id', subjectId);
  if (deleteError) throw deleteError;

  if (!assignments.length) return 0;

  const rows = assignments.map((row) => ({
    school_id: schoolId,
    grade,
    week_index: row.weekIndex,
    subject_id: subjectId,
    unit_id: row.unitId,
  }));

  const { error: insertError } = await supabase.from('curriculum_week_plans').insert(rows);
  if (insertError) throw insertError;
  return rows.length;
}

async function syncAllWeekPlans() {
  const { data: schools, error: schoolsError } = await supabase.from('schools').select('id, name');
  if (schoolsError) throw schoolsError;

  const { data: subjects, error: subjectsError } = await supabase
    .from('curriculum_subjects')
    .select('id, grade, name');
  if (subjectsError) throw subjectsError;

  let totalRows = 0;
  for (const school of schools ?? []) {
    for (const subject of subjects ?? []) {
      const count = await syncWeekPlansForSubject({
        schoolId: school.id,
        grade: subject.grade,
        subjectId: subject.id,
      });
      totalRows += count;
    }
    console.log(`Week plans synced for ${school.name ?? school.id}`);
  }

  console.log(`\nWeek plan sync complete — ${totalRows} rows across ${schools?.length ?? 0} school(s).`);
}

async function syncAtlasAcademicWeeks() {
  const { data: schools, error } = await supabase
    .from('schools')
    .select('id, name, features');
  if (error) throw error;

  let updated = 0;
  for (const school of schools ?? []) {
    if (!school.features?.atlas_schedule) continue;
    const { error: updateError } = await supabase
      .from('schools')
      .update({
        features: {
          ...(school.features ?? {}),
          academic_weeks: ACADEMIC_WEEKS,
        },
      })
      .eq('id', school.id);
    if (updateError) throw updateError;
    updated += 1;
    console.log(`Academic weeks set to ${ACADEMIC_WEEKS} for ${school.name ?? school.id}`);
  }

  if (!updated) {
    console.log('No Atlas schools found — skipped academic_weeks sync.');
  }
}
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const payload = JSON.parse(readFileSync(jsonPath, 'utf8'));

async function countLinkedRows(unitIds) {
  if (!unitIds.length) return { progress: 0, weekPlans: 0 };

  const [progressRes, weekPlansRes] = await Promise.all([
    supabase.from('student_unit_progress').select('id', { count: 'exact', head: true }).in('unit_id', unitIds),
    supabase.from('curriculum_week_plans').select('id', { count: 'exact', head: true }).in('unit_id', unitIds),
  ]);

  return {
    progress: progressRes.count ?? 0,
    weekPlans: weekPlansRes.count ?? 0,
  };
}

async function seedBlock(block) {
  if (block.skip) {
    console.log(`Skip: ${block.grade}. sınıf ${block.slug} (already seeded)`);
    return { skipped: true };
  }

  if (block.temporary) {
    console.warn(
      `Warning: ${block.grade}. sınıf ${block.slug} geçici içerik — resmi dağılım gelince güncellenecek.`
    );
  }

  const { data: subject, error: subjectError } = await supabase
    .from('curriculum_subjects')
    .select('id, name')
    .eq('grade', block.grade)
    .eq('slug', block.slug)
    .maybeSingle();

  if (subjectError) throw subjectError;
  if (!subject) {
    console.warn(`Subject not found: grade ${block.grade} slug ${block.slug}`);
    return { missing: true };
  }

  if (block.subjectName && block.subjectName !== subject.name) {
    const { error: renameError } = await supabase
      .from('curriculum_subjects')
      .update({ name: block.subjectName })
      .eq('id', subject.id);
    if (renameError) throw renameError;
    console.log(`Renamed subject: ${block.grade}. sınıf ${block.slug} → ${block.subjectName}`);
  }

  const { data: existingUnits, error: existingError } = await supabase
    .from('curriculum_units')
    .select('id')
    .eq('subject_id', subject.id);
  if (existingError) throw existingError;

  const existingIds = (existingUnits ?? []).map((row) => row.id);
  if (existingIds.length) {
    const linked = await countLinkedRows(existingIds);
    if (linked.progress > 0 || linked.weekPlans > 0) {
      console.warn(
        `  Replacing ${existingIds.length} units — will cascade ${linked.progress} progress + ${linked.weekPlans} week plan rows`
      );
    }

    const { error: deleteError } = await supabase
      .from('curriculum_units')
      .delete()
      .eq('subject_id', subject.id);
    if (deleteError) throw deleteError;
  }

  const rows = (block.units ?? []).map((unit, index) => ({
    subject_id: subject.id,
    title: unit.title,
    sort_order: index + 1,
    sections: unit.sections ?? [],
    duration_weeks: unit.duration_weeks ?? 1,
  }));

  if (!rows.length) {
    console.warn(`No units for grade ${block.grade} slug ${block.slug}`);
    return { empty: true };
  }

  const { error: insertError } = await supabase.from('curriculum_units').insert(rows);
  if (insertError) throw insertError;

  const totalWeeks = rows.reduce((sum, row) => sum + row.duration_weeks, 0);
  const label = block.subjectName ?? subject.name;
  console.log(`Seeded: ${block.grade}. sınıf ${label} — ${rows.length} ünite, ${totalWeeks} hafta`);
  return { seeded: rows.length, totalWeeks };
}

async function main() {
  console.log(`Loading curriculum from ${jsonPath}`);
  console.log(
    `Academic year: ${ACADEMIC_WEEKS} weeks (calendar anchor ${ACADEMIC_YEAR_ANCHOR})\n`
  );

  let seeded = 0;
  let skipped = 0;

  for (const block of payload) {
    const result = await seedBlock(block);
    if (result.skipped) skipped += 1;
    else if (result.seeded) seeded += 1;
  }

  console.log(`\nDone. ${seeded} subject(s) updated, ${skipped} skipped.`);

  if (syncWeekPlans) {
    console.log('\nSyncing curriculum_week_plans from unit durations…');
    await syncAllWeekPlans();
    await syncAtlasAcademicWeeks();
  } else {
    console.log('\nTip: run with --sync-week-plans to rebuild haftalık eşlemeler for all schools.');
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
