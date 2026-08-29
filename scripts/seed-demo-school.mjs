/**
 * One-time / repeatable demo seed for sales presentations.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env
 *
 * Usage: npm run seed-demo
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

const DEMO_SCHOOL = {
  name: 'Yıldızlar Demo Kreşi',
  school_code: 'DEMO123',
};

const DEMO_TEACHER = {
  full_name: 'Ayşe Yılmaz',
  username: 'demo.ogretmen',
  phone: '5321234567',
  subject_slug: 'matematik',
};

const DEMO_FEATURES = {
  atlas_schedule: true,
  homework_tracking: true,
  accounting: true,
  exam_results: true,
  exam_import: true,
  exam_detailed_entry: true,
};

const DEMO_CLASSES = [
  { grade: 5, name: 'A' },
  { grade: 5, name: 'B' },
  { grade: 6, name: 'A' },
  { grade: 7, name: 'A' },
  { grade: 8, name: 'A' },
];

const DEMO_DIRECTOR = {
  full_name: 'Demo Müdür',
  username: 'mudur',
  pin: '123456',
};

const DEMO_TEACHER_PIN = '123456';

const DEMO_TEMPLATES = [
  {
    title: 'Yemek',
    icon: '🍽️',
    body: '🍽️ Bugün yemeğini çok güzel yedi, tabağını bitirdi!',
  },
  {
    title: 'Uyku',
    icon: '😴',
    body: '😴 Öğle uykusunu mışıl mışıl uyudu, enerjisini topladı.',
  },
  {
    title: 'Etkinlik',
    icon: '🎨',
    body: '🎨 Bugün parmak boyaması yaptık ve çok eğlendik!',
  },
  {
    title: 'İlaç',
    icon: '💊',
    body: '💊 İlacı öğretmen gözetiminde saatinde içildi.',
  },
  {
    title: 'Genel Duyuru',
    icon: '📢',
    body: '📢 Yarınki pijama partisi için lütfen yedek kıyafet getirmeyi unutmayın!',
  },
];

const DEMO_STUDENTS = [
  { full_name: 'Elif Arslan' },
  { full_name: 'Mira Yıldız' },
  { full_name: 'Defne Koç' },
  { full_name: 'Eylül Öztürk' },
  { full_name: 'Zeynep Aydın' },
  { full_name: 'Ada Şahin' },
  { full_name: 'Lina Acar' },
  { full_name: 'Nehir Polat' },
  { full_name: 'Asya Güneş' },
  { full_name: 'Melis Erdoğan' },
  { full_name: 'Derin Korkmaz' },
  { full_name: 'Ece Taş' },
  { full_name: 'İpek Çetin' },
  { full_name: 'Selin Aksoy' },
  { full_name: 'Yağmur Yavuz' },
  { full_name: 'Azra Demirci' },
  { full_name: 'Beren Kaplan' },
  { full_name: 'Cemre Uçar' },
  { full_name: 'Duru Eren' },
  { full_name: 'Esila Tunç' },
  { full_name: 'Arda Kılıç' },
  { full_name: 'Emir Bozkurt' },
  { full_name: 'Kerem Yalçın' },
  { full_name: 'Mert Can' },
  { full_name: 'Alp Şimşek' },
  { full_name: 'Baran Tekin' },
  { full_name: 'Deniz Karaca' },
  { full_name: 'Efe Aktaş' },
  { full_name: 'Kaan Özkan' },
  { full_name: 'Yiğit Sezer' },
  { full_name: 'Umut Işık' },
  { full_name: 'Berkay Gül' },
  { full_name: 'Caner Aslan' },
  { full_name: 'Doruk Bayrak' },
  { full_name: 'Emre Çakır' },
  { full_name: 'Furkan Durmuş' },
  { full_name: 'Gökhan Sarı' },
  { full_name: 'Hakan Uysal' },
  { full_name: 'Kuzey Ateş' },
  { full_name: 'Ozan Yılmaz' },
];


function buildLoginEmail(schoolId, username) {
  return `${username.toLowerCase()}@${schoolId}.login.internal`;
}

async function findUserIdByLoginEmail(loginEmail) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((user) => user.email?.toLowerCase() === loginEmail.toLowerCase())?.id ?? null;
}

async function ensureStaffUser(schoolId, { full_name, username, role, pin }) {
  const loginEmail = buildLoginEmail(schoolId, username);
  let userId = await findUserIdByLoginEmail(loginEmail);

  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: loginEmail,
      password: pin,
      email_confirm: true,
      user_metadata: {
        full_name,
        school_id: schoolId,
        username,
        role,
      },
    });

    if (error) throw error;
    userId = data.user.id;
    console.log(`Created ${role} account: ${full_name} (${username})`);
  } else {
    await supabase.auth.admin.updateUserById(userId, { password: pin, email: loginEmail });
    console.log(`${role} account exists: ${full_name} (${username})`);
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      full_name,
      email: loginEmail,
      role,
      school_id: schoolId,
      username,
      login_pin: pin,
    })
    .eq('id', userId);

  if (profileError) throw profileError;
  return userId;
}

async function ensureDirector(schoolId) {
  return ensureStaffUser(schoolId, {
    full_name: DEMO_DIRECTOR.full_name,
    username: DEMO_DIRECTOR.username,
    role: 'director',
    pin: DEMO_DIRECTOR.pin,
  });
}

async function ensureDemoTeacher(schoolId) {
  const userId = await ensureStaffUser(schoolId, {
    full_name: DEMO_TEACHER.full_name,
    username: DEMO_TEACHER.username,
    role: 'teacher',
    pin: DEMO_TEACHER_PIN,
  });

  let { error: profileError } = await supabase
    .from('profiles')
    .update({
      phone: DEMO_TEACHER.phone,
      subject_slug: DEMO_TEACHER.subject_slug,
      subject_id: null,
    })
    .eq('id', userId);

  if (profileError && /subject_slug|schema cache/i.test(profileError.message ?? '')) {
    console.warn(
      'profiles.subject_slug not found — apply supabase/migrations/040_teacher_subject_slug.sql in Supabase SQL editor.'
    );
    const { data: subject } = await supabase
      .from('curriculum_subjects')
      .select('id')
      .eq('grade', 5)
      .eq('slug', DEMO_TEACHER.subject_slug)
      .maybeSingle();

    ({ error: profileError } = await supabase
      .from('profiles')
      .update({
        phone: DEMO_TEACHER.phone,
        subject_id: subject?.id ?? null,
      })
      .eq('id', userId));
  }

  if (profileError) throw profileError;
  return userId;
}

async function enableDemoFeatures(schoolId, currentFeatures) {
  const nextFeatures = { ...(currentFeatures ?? {}), ...DEMO_FEATURES };
  const { error } = await supabase
    .from('schools')
    .update({ features: nextFeatures })
    .eq('id', schoolId);
  if (error) throw error;
}

async function ensureClasses(schoolId) {
  for (const cls of DEMO_CLASSES) {
    const { error } = await supabase.from('classes').upsert(
      { school_id: schoolId, grade: cls.grade, name: cls.name },
      { onConflict: 'school_id,grade,name', ignoreDuplicates: true }
    );
    if (error && error.code !== '23505') throw error;
  }

  const { data, error } = await supabase
    .from('classes')
    .select('id, grade')
    .eq('school_id', schoolId);

  if (error) throw error;
  return data ?? [];
}

async function distributeStudentsToClasses(schoolId, classes) {
  if (classes.length === 0) return;

  const { data: students, error } = await supabase
    .from('students')
    .select('id, class_id')
    .eq('school_id', schoolId)
    .order('full_name');

  if (error) throw error;

  const classIds = classes.map((row) => row.id);
  let index = 0;
  for (const student of students ?? []) {
    if (student.class_id) continue;
    const classId = classIds[index % classIds.length];
    const { error: updateError } = await supabase
      .from('students')
      .update({ class_id: classId })
      .eq('id', student.id);
    if (updateError) throw updateError;
    index += 1;
  }
}

async function ensureDemoSchool() {
  const { data: existing, error: lookupError } = await supabase
    .from('schools')
    .select('id, name, school_code, features')
    .eq('school_code', DEMO_SCHOOL.school_code)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (existing) {
    console.log(`School already exists: ${existing.name} (${existing.school_code})`);
    await enableDemoFeatures(existing.id, existing.features);
    return existing.id;
  }

  const { data, error } = await supabase
    .from('schools')
    .insert({ ...DEMO_SCHOOL, features: DEMO_FEATURES })
    .select('id')
    .single();

  if (error) throw error;
  console.log(`Created school: ${DEMO_SCHOOL.name} (${DEMO_SCHOOL.school_code})`);
  return data.id;
}

async function resetDemoStudents(schoolId) {
  const { data: existingStudents, error: listError } = await supabase
    .from('students')
    .select('id')
    .eq('school_id', schoolId);

  if (listError) throw listError;

  if ((existingStudents ?? []).length > 0) {
    const ids = existingStudents.map((row) => row.id);
    const { error: deleteLinksError } = await supabase
      .from('teacher_students')
      .delete()
      .in('student_id', ids);
    if (deleteLinksError) throw deleteLinksError;

    const { error: deleteStudentsError } = await supabase
      .from('students')
      .delete()
      .eq('school_id', schoolId);
    if (deleteStudentsError) throw deleteStudentsError;

    console.log(`Removed ${ids.length} existing demo students.`);
  }
}

async function insertStudents(schoolId) {
  const rows = DEMO_STUDENTS.map((student) => ({
    ...student,
    school_id: schoolId,
  }));

  const { data, error } = await supabase.from('students').insert(rows).select('id, full_name');
  if (error) throw error;

  console.log(`Inserted ${data.length} students.`);
  return data;
}

async function assignStudentsToTeacher(teacherId, studentIds) {
  const { error: deleteError } = await supabase
    .from('teacher_students')
    .delete()
    .eq('teacher_id', teacherId);
  if (deleteError) throw deleteError;

  const links = studentIds.map((studentId) => ({
    teacher_id: teacherId,
    student_id: studentId,
  }));

  const { error } = await supabase.from('teacher_students').insert(links);
  if (error) throw error;

  console.log(`Assigned all ${studentIds.length} students to demo teacher.`);
}

async function resetTemplates(schoolId) {
  const { error } = await supabase.from('message_templates').delete().eq('school_id', schoolId);
  if (error) throw error;
}

async function insertTemplates(schoolId) {
  const rows = DEMO_TEMPLATES.map((template) => ({
    ...template,
    school_id: schoolId,
  }));

  const { data, error } = await supabase.from('message_templates').insert(rows).select('title');
  if (error) throw error;

  console.log(`Inserted ${data.length} message templates.`);
}

async function main() {
  console.log('Seeding Yıldızlar Demo Kreşi…\n');

  const schoolId = await ensureDemoSchool();
  await ensureDirector(schoolId);
  const teacherId = await ensureDemoTeacher(schoolId);
  const classes = await ensureClasses(schoolId);

  await resetDemoStudents(schoolId);
  const students = await insertStudents(schoolId);
  await distributeStudentsToClasses(schoolId, classes);
  await assignStudentsToTeacher(
    teacherId,
    students.map((student) => student.id)
  );

  await resetTemplates(schoolId);
  await insertTemplates(schoolId);

  console.log('\nDemo seed complete.');
  console.log('Localhost resolves to this school automatically (DEMO123).');
  console.log('\nDemo logins (username + PIN):');
  console.log(`  Director: ${DEMO_DIRECTOR.username} / ${DEMO_DIRECTOR.pin}`);
  console.log(`  Teacher:  ${DEMO_TEACHER.username} / ${DEMO_TEACHER_PIN}`);
}

main().catch((error) => {
  console.error('\nDemo seed failed:', error.message ?? error);
  process.exit(1);
});
