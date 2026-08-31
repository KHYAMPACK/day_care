/**
 * Reset DEMO123 to a single demo teacher with full feature access.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env
 *
 * Usage: npm run reset-demo-teacher
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

const DEMO_SCHOOL_CODE = 'DEMO123';

const DEMO_FEATURES = {
  atlas_schedule: true,
  homework_tracking: true,
  accounting: true,
  exam_results: true,
  exam_import: true,
  exam_detailed_entry: true,
};

const DEMO_TEACHER = {
  full_name: 'Ayşe Yılmaz',
  username: 'demo.ogretmen',
  pin: '123456',
  phone: '5321234567',
  subject_slug: 'matematik',
};

const DEMO_CLASSES = [
  { grade: 5, name: 'A' },
  { grade: 5, name: 'B' },
  { grade: 6, name: 'A' },
  { grade: 7, name: 'A' },
  { grade: 8, name: 'A' },
];

const SKIPPABLE_ERROR_CODES = new Set(['42P01', 'PGRST205', '42703']);

async function deleteWhere(table, column, value) {
  const { error } = await supabase.from(table).delete().eq(column, value);
  if (!error) return;
  if (SKIPPABLE_ERROR_CODES.has(error.code)) return;
  console.warn(`cleanup ${table}.${column}:`, error.message);
}

async function cleanupTeacherReferences(userId) {
  await deleteWhere('lesson_sessions', 'taken_by', userId);
  await deleteWhere('homework_assignments', 'created_by', userId);
  await deleteWhere('surveys', 'created_by', userId);
  await deleteWhere('trips', 'created_by', userId);
  await deleteWhere('teacher_students', 'teacher_id', userId);
  await deleteWhere('teacher_assignments', 'teacher_id', userId);
  await deleteWhere('teacher_day_responses', 'teacher_id', userId);
  await deleteWhere('teacher_missed_day_prompts', 'teacher_id', userId);
  await deleteWhere('messages', 'author_id', userId);
  await deleteWhere('announcements', 'author_id', userId);
}

function buildLoginEmail(schoolId, username) {
  return `${username.toLowerCase()}@${schoolId}.login.internal`;
}

async function getDemoSchool() {
  const { data, error } = await supabase
    .from('schools')
    .select('id, name, school_code, features')
    .eq('school_code', DEMO_SCHOOL_CODE)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error(`Demo school ${DEMO_SCHOOL_CODE} not found. Run npm run seed-demo first.`);
  }
  return data;
}

async function enableAllFeatures(school) {
  const nextFeatures = { ...(school.features ?? {}), ...DEMO_FEATURES };
  const { error } = await supabase
    .from('schools')
    .update({ features: nextFeatures })
    .eq('id', school.id);

  if (error) throw error;
  console.log('Enabled all demo features on school.');
}

async function ensureClasses(schoolId) {
  for (const cls of DEMO_CLASSES) {
    const { error } = await supabase.from('classes').upsert(
      { school_id: schoolId, grade: cls.grade, name: cls.name },
      { onConflict: 'school_id,grade,name', ignoreDuplicates: true }
    );
    if (error && error.code !== '23505') throw error;
  }

  const { data: classes, error: listError } = await supabase
    .from('classes')
    .select('id, grade, name')
    .eq('school_id', schoolId)
    .order('grade')
    .order('name');

  if (listError) throw listError;
  console.log(`Ensured ${classes.length} classes.`);
  return classes;
}

async function distributeStudentsToClasses(schoolId, classIds) {
  if (classIds.length === 0) return;

  const { data: students, error } = await supabase
    .from('students')
    .select('id, class_id')
    .eq('school_id', schoolId)
    .order('full_name');

  if (error) throw error;
  if ((students ?? []).length === 0) {
    console.log('No students in demo school — skipping class assignment.');
    return [];
  }

  let index = 0;
  for (const student of students) {
    if (student.class_id) continue;
    const classId = classIds[index % classIds.length];
    const { error: updateError } = await supabase
      .from('students')
      .update({ class_id: classId })
      .eq('id', student.id);
    if (updateError) throw updateError;
    index += 1;
  }

  return students.map((row) => row.id);
}

async function deleteAllTeachers(schoolId) {
  const { data: teachers, error } = await supabase
    .from('profiles')
    .select('id, full_name, username')
    .eq('school_id', schoolId)
    .eq('role', 'teacher');

  if (error) throw error;

  if ((teachers ?? []).length === 0) {
    console.log('No existing teachers to delete.');
    return;
  }

  for (const teacher of teachers) {
    await cleanupTeacherReferences(teacher.id);
    const { error: deleteError } = await supabase.auth.admin.deleteUser(teacher.id);
    if (deleteError) {
      console.warn(`Could not delete auth user ${teacher.username}:`, deleteError.message);
      await supabase.from('profiles').delete().eq('id', teacher.id);
    } else {
      console.log(`Deleted teacher: ${teacher.full_name} (${teacher.username})`);
    }
  }
}

async function findUserIdByLoginEmail(schoolId, username) {
  const loginEmail = buildLoginEmail(schoolId, username);
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((user) => user.email?.toLowerCase() === loginEmail.toLowerCase())?.id ?? null;
}

async function updateTeacherBrans(userId, loginEmail, schoolId) {
  const baseProfile = {
    full_name: DEMO_TEACHER.full_name,
    email: loginEmail,
    role: 'teacher',
    school_id: schoolId,
    username: DEMO_TEACHER.username,
    login_pin: DEMO_TEACHER.pin,
    phone: DEMO_TEACHER.phone,
  };

  let { error } = await supabase
    .from('profiles')
    .update({
      ...baseProfile,
      subject_slug: DEMO_TEACHER.subject_slug,
      subject_id: null,
    })
    .eq('id', userId);

  if (error && /subject_slug|schema cache/i.test(error.message ?? '')) {
    console.warn(
      'profiles.subject_slug not found — apply supabase/migrations/040_teacher_subject_slug.sql in Supabase SQL editor.'
    );
    const { data: subject } = await supabase
      .from('curriculum_subjects')
      .select('id')
      .eq('grade', 5)
      .eq('slug', DEMO_TEACHER.subject_slug)
      .maybeSingle();

    ({ error } = await supabase
      .from('profiles')
      .update({
        ...baseProfile,
        subject_id: subject?.id ?? null,
      })
      .eq('id', userId));
  }

  if (error) throw error;
}

async function createDemoTeacher(schoolId) {
  const loginEmail = buildLoginEmail(schoolId, DEMO_TEACHER.username);
  let userId = await findUserIdByLoginEmail(schoolId, DEMO_TEACHER.username);

  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: loginEmail,
      password: DEMO_TEACHER.pin,
      email_confirm: true,
      user_metadata: {
        full_name: DEMO_TEACHER.full_name,
        school_id: schoolId,
        username: DEMO_TEACHER.username,
        role: 'teacher',
      },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`Created teacher: ${DEMO_TEACHER.full_name} (${DEMO_TEACHER.username})`);
  } else {
    await supabase.auth.admin.updateUserById(userId, {
      password: DEMO_TEACHER.pin,
      email: loginEmail,
    });
    console.log(`Updated existing teacher account: ${DEMO_TEACHER.username}`);
  }

  await updateTeacherBrans(userId, loginEmail, schoolId);

  return { userId };
}

async function assignAllStudents(teacherId, schoolId) {
  const { data: students, error } = await supabase
    .from('students')
    .select('id')
    .eq('school_id', schoolId);

  if (error) throw error;
  if ((students ?? []).length === 0) return;

  const { error: clearError } = await supabase
    .from('teacher_students')
    .delete()
    .eq('teacher_id', teacherId);
  if (clearError) throw clearError;

  const rows = students.map((student) => ({
    teacher_id: teacherId,
    student_id: student.id,
  }));

  const { error: insertError } = await supabase.from('teacher_students').insert(rows);
  if (insertError) throw insertError;

  console.log(`Assigned all ${students.length} students to demo teacher.`);
}

async function main() {
  console.log('Resetting demo school to single teacher…\n');

  const school = await getDemoSchool();
  console.log(`School: ${school.name} (${school.school_code})\n`);

  await enableAllFeatures(school);
  const classes = await ensureClasses(school.id);
  const classIds = classes.map((row) => row.id);
  await distributeStudentsToClasses(school.id, classIds);

  await deleteAllTeachers(school.id);

  const { userId } = await createDemoTeacher(school.id);
  await assignAllStudents(userId, school.id);

  console.log('\nDemo teacher reset complete.');
  console.log('\nLogin (username + PIN):');
  console.log(`  Teacher: ${DEMO_TEACHER.username} / ${DEMO_TEACHER.pin}`);
  console.log('\nThis teacher has:');
  console.log(`  • Branş: ${DEMO_TEACHER.subject_slug} (grades 5–8)`);
  console.log('  • All students linked');
  console.log('  • Atlas, homework, exams, and accounting enabled on school');
}

main().catch((error) => {
  console.error('\nReset failed:', error.message ?? error);
  process.exit(1);
});
