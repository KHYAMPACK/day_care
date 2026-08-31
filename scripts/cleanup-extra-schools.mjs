/**
 * Delete every school except DEMO123 and ATLASVIP (and all of their data).
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env
 *
 * Usage:
 *   npm run cleanup-extra-schools              # dry-run (default)
 *   node scripts/cleanup-extra-schools.mjs --execute
 *
 * Apply supabase/migrations/047–049 before running. Never touches
 * curriculum_subjects / curriculum_units. Aborts if a keep school is missing.
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

const KEEP_CODES = ['DEMO123', 'ATLASVIP'];
const SKIPPABLE_ERROR_CODES = new Set(['42P01', 'PGRST205', '42703']);
const ID_CHUNK = 100;
const execute = process.argv.includes('--execute');

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function countEq(table, column, values) {
  if (!values.length) return 0;
  let total = 0;
  for (const group of chunk(values, ID_CHUNK)) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .in(column, group);
    if (error) {
      if (SKIPPABLE_ERROR_CODES.has(error.code)) return null;
      throw error;
    }
    total += count ?? 0;
  }
  return total;
}

async function countSchoolRows(table, schoolIds) {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .in('school_id', schoolIds);
  if (!error) return count ?? 0;
  if (SKIPPABLE_ERROR_CODES.has(error.code)) return null;
  if (/column .*school_id/i.test(error.message ?? '')) return null;
  throw error;
}

async function deleteIn(table, column, values) {
  if (!values.length) return;
  for (const group of chunk(values, ID_CHUNK)) {
    const { error } = await supabase.from(table).delete().in(column, group);
    if (!error) continue;
    if (SKIPPABLE_ERROR_CODES.has(error.code)) return;
    throw error;
  }
}

async function deleteBySchool(table, schoolIds) {
  const { error } = await supabase.from(table).delete().in('school_id', schoolIds);
  if (!error) return;
  if (SKIPPABLE_ERROR_CODES.has(error.code)) return;
  throw error;
}

async function idsForSchool(table, schoolIds) {
  const { data, error } = await supabase.from(table).select('id').in('school_id', schoolIds);
  if (error) {
    if (SKIPPABLE_ERROR_CODES.has(error.code)) return [];
    throw error;
  }
  return (data ?? []).map((row) => row.id);
}

async function loadKeepAndExtra() {
  const { data: schools, error } = await supabase
    .from('schools')
    .select('id, name, school_code, custom_domain, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;

  const all = schools ?? [];
  const keep = all.filter((row) => KEEP_CODES.includes(row.school_code));
  const extra = all.filter((row) => !KEEP_CODES.includes(row.school_code));
  const missing = KEEP_CODES.filter((code) => !keep.some((row) => row.school_code === code));

  return { all, keep, extra, missing };
}

function printSchool(label, row) {
  console.log(
    `  ${label}: ${row.name}  code=${row.school_code}  id=${row.id}` +
      (row.custom_domain ? `  domain=${row.custom_domain}` : '')
  );
}

async function reportCounts(extraIds, profileIds, studentIds) {
  console.log('\nRow counts for extra schools (null = table missing):');

  const { count: profileCount, error: profileError } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .in('school_id', extraIds);
  if (profileError) throw profileError;
  console.log(`  profiles.school_id: ${profileCount ?? 0}`);

  for (const table of [
    'students',
    'classes',
    'lesson_sessions',
    'attendance_sessions',
    'exam_sessions',
    'homework_assignments',
    'messages',
    'announcements',
    'calendar_events',
    'accounting_expenses',
  ]) {
    const n = await countSchoolRows(table, extraIds);
    console.log(`  ${table}.school_id: ${n === null ? '—' : n}`);
  }

  const parentLinks = await countEq('student_parents', 'student_id', studentIds);
  console.log(`  student_parents (via students): ${parentLinks === null ? '—' : parentLinks}`);

  const roles = await countEq('profile_roles', 'profile_id', profileIds);
  console.log(`  profile_roles (via profiles): ${roles === null ? '—' : roles}`);
}

async function purgeExtraSchools(extra) {
  const extraIds = extra.map((row) => row.id);
  const profileIds = await idsForSchool('profiles', extraIds);
  const studentIds = await idsForSchool('students', extraIds);
  const classIds = await idsForSchool('classes', extraIds);
  const lessonSessionIds = await idsForSchool('lesson_sessions', extraIds);
  const attendanceSessionIds = await idsForSchool('attendance_sessions', extraIds);
  const examSessionIds = await idsForSchool('exam_sessions', extraIds);
  const answerKeyIds = await idsForSchool('exam_answer_keys', extraIds);
  const homeworkAssignmentIds = await idsForSchool('homework_assignments', extraIds);
  const homeworkBookIds = await idsForSchool('homework_books', extraIds);
  const guidanceWeekIds = await idsForSchool('counselor_guidance_weeks', extraIds);
  const calendarEventIds = await idsForSchool('calendar_events', extraIds);

  console.log(`\nPurging ${extra.length} school(s), ${profileIds.length} profile(s), ${studentIds.length} student(s)…`);

  await deleteIn('lesson_attendance', 'session_id', lessonSessionIds);
  await deleteIn('lesson_results', 'session_id', lessonSessionIds);
  await deleteIn('attendance_records', 'session_id', attendanceSessionIds);
  await deleteIn('exam_student_answers', 'session_id', examSessionIds);
  await deleteIn('exam_questions', 'answer_key_id', answerKeyIds);
  await deleteIn('exam_student_results', 'session_id', examSessionIds);
  await deleteIn('exam_subject_results', 'session_id', examSessionIds);
  await deleteIn('exam_session_rankings', 'session_id', examSessionIds);

  if (examSessionIds.length) {
    const { error: nullKeys } = await supabase
      .from('exam_sessions')
      .update({ answer_key_id: null })
      .in('id', examSessionIds);
    if (nullKeys && !SKIPPABLE_ERROR_CODES.has(nullKeys.code) && !/answer_key_id|schema cache/i.test(nullKeys.message ?? '')) {
      throw nullKeys;
    }
  }

  await deleteIn('homework_results', 'assignment_id', homeworkAssignmentIds);
  await deleteIn('homework_assignment_tests', 'assignment_id', homeworkAssignmentIds);
  await deleteIn('homework_assignment_students', 'assignment_id', homeworkAssignmentIds);
  await deleteIn('counselor_weekly_question_rows', 'week_id', guidanceWeekIds);
  await deleteIn('counselor_study_schedule_blocks', 'week_id', guidanceWeekIds);
  await deleteIn('calendar_notification_log', 'event_id', calendarEventIds);
  await deleteIn('student_parents', 'student_id', studentIds);
  await deleteIn('student_parents', 'parent_id', profileIds);
  await deleteIn('teacher_students', 'student_id', studentIds);
  await deleteIn('teacher_students', 'teacher_id', profileIds);
  await deleteIn('teacher_assignments', 'class_id', classIds);
  await deleteIn('teacher_assignments', 'teacher_id', profileIds);
  await deleteIn('student_groups', 'student_id', studentIds);
  await deleteIn('profile_roles', 'profile_id', profileIds);
  await deleteIn('messages', 'author_id', profileIds);
  await deleteIn('announcements', 'author_id', profileIds);

  await deleteBySchool('homework_book_grants', extraIds);
  await deleteBySchool('homework_assignments', extraIds);
  await deleteIn('homework_book_tests', 'book_id', homeworkBookIds);
  await deleteIn('homework_book_topics', 'book_id', homeworkBookIds);
  await deleteBySchool('homework_books', extraIds);

  await deleteBySchool('lesson_sessions', extraIds);
  await deleteBySchool('teacher_day_responses', extraIds);
  await deleteBySchool('teacher_missed_day_prompts', extraIds);
  await deleteBySchool('assessment_types', extraIds);
  await deleteBySchool('attendance_sessions', extraIds);
  await deleteBySchool('exam_answer_keys', extraIds);
  await deleteBySchool('exam_sessions', extraIds);

  const { error: topicParent } = await supabase
    .from('exam_topics')
    .update({ parent_id: null })
    .in('school_id', extraIds);
  if (topicParent && !SKIPPABLE_ERROR_CODES.has(topicParent.code) && !/parent_id|schema cache/i.test(topicParent.message ?? '')) {
    throw topicParent;
  }
  await deleteBySchool('exam_topics', extraIds);

  await deleteBySchool('parent_notifications', extraIds);
  await deleteBySchool('accounting_budget_lines', extraIds);
  await deleteBySchool('accounting_expenses', extraIds);
  await deleteBySchool('accounting_tuition_cycles', extraIds);
  await deleteBySchool('accounting_student_billing', extraIds);
  await deleteBySchool('accounting_budget_periods', extraIds);
  await deleteBySchool('accounting_suppliers', extraIds);
  await deleteBySchool('accounting_expense_categories', extraIds);
  await deleteBySchool('counselor_guidance_weeks', extraIds);
  await deleteBySchool('counselor_topic_resource_cells', extraIds);
  await deleteBySchool('curriculum_week_plans', extraIds);
  await deleteBySchool('student_unit_progress', extraIds);
  await deleteBySchool('curriculum_week_notes', extraIds);
  await deleteBySchool('calendar_events', extraIds);
  await deleteBySchool('announcements', extraIds);
  await deleteBySchool('messages', extraIds);
  await deleteBySchool('message_templates', extraIds);
  await deleteBySchool('school_activity_logs', extraIds);
  await deleteBySchool('classes', extraIds);
  await deleteBySchool('students', extraIds);

  for (const profileId of profileIds) {
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(profileId);
    if (deleteUserError) {
      console.warn(`auth delete ${profileId}: ${deleteUserError.message}`);
      const { error: profileError } = await supabase.from('profiles').delete().eq('id', profileId);
      if (profileError) throw profileError;
    }
  }

  const leftoverProfiles = await idsForSchool('profiles', extraIds);
  if (leftoverProfiles.length) {
    await deleteIn('profiles', 'id', leftoverProfiles);
  }

  const { error: schoolError } = await supabase.from('schools').delete().in('id', extraIds);
  if (schoolError) throw schoolError;
}

async function main() {
  console.log(execute ? 'EXECUTE: deleting extra schools\n' : 'DRY-RUN (pass --execute to delete)\n');

  const { keep, extra, missing } = await loadKeepAndExtra();

  if (missing.length) {
    console.error(`Keep school(s) missing: ${missing.join(', ')}. Aborting.`);
    process.exit(1);
  }

  console.log('Keep:');
  for (const row of keep) printSchool('keep', row);

  if (extra.length === 0) {
    console.log('\nNo extra schools. Nothing to do.');
    return;
  }

  console.log('\nDelete:');
  for (const row of extra) printSchool('drop', row);

  const extraIds = extra.map((row) => row.id);
  const profileIds = await idsForSchool('profiles', extraIds);
  const studentIds = await idsForSchool('students', extraIds);
  await reportCounts(extraIds, profileIds, studentIds);

  if (!execute) {
    console.log('\nRe-run with --execute to delete the schools listed above.');
    return;
  }

  await purgeExtraSchools(extra);

  const after = await loadKeepAndExtra();
  if (after.missing.length) {
    console.error(`Keep school(s) missing after purge: ${after.missing.join(', ')}`);
    process.exit(1);
  }
  if (after.extra.length) {
    console.error('Extra schools still present:');
    for (const row of after.extra) printSchool('left', row);
    process.exit(1);
  }

  console.log('\nRemaining schools:');
  for (const row of after.keep) printSchool('keep', row);
  console.log('\nCleanup complete.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
