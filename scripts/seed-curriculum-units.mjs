/**
 * Replace curriculum_units from Atlas weekly plan JSON.
 *
 * Usage:
 *   npm run seed-curriculum-units
 *   node scripts/seed-curriculum-units.mjs [path/to/units.json]
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const jsonPath = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : defaultJsonPath;
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
  console.log(`Loading curriculum from ${jsonPath}\n`);

  let seeded = 0;
  let skipped = 0;

  for (const block of payload) {
    const result = await seedBlock(block);
    if (result.skipped) skipped += 1;
    else if (result.seeded) seeded += 1;
  }

  console.log(`\nDone. ${seeded} subject(s) updated, ${skipped} skipped.`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
