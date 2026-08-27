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

const DEMO_TEACHERS = [
  { full_name: 'Ayşe Yılmaz', email: 'ayse@demo.com' },
  { full_name: 'Fatma Demir', email: 'fatma@demo.com' },
  { full_name: 'Zeynep Kaya', email: 'zeynep@demo.com' },
  { full_name: 'Murat Çelik', email: 'murat@demo.com' },
];

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

const DEMO_TEACHER_PASSWORD = 'Demo1234!';

async function ensureDemoSchool() {
  const { data: existing, error: lookupError } = await supabase
    .from('schools')
    .select('id, name, school_code')
    .eq('school_code', DEMO_SCHOOL.school_code)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (existing) {
    console.log(`School already exists: ${existing.name} (${existing.school_code})`);
    return existing.id;
  }

  const { data, error } = await supabase
    .from('schools')
    .insert(DEMO_SCHOOL)
    .select('id')
    .single();

  if (error) throw error;
  console.log(`Created school: ${DEMO_SCHOOL.name} (${DEMO_SCHOOL.school_code})`);
  return data.id;
}

async function findUserIdByEmail(email) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
}

async function ensureTeachers(schoolId) {
  const teacherIds = [];

  for (const teacher of DEMO_TEACHERS) {
    let userId = await findUserIdByEmail(teacher.email);

    if (!userId) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: teacher.email,
        password: DEMO_TEACHER_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: teacher.full_name },
      });

      if (error) throw error;
      userId = data.user.id;
      console.log(`Created teacher account: ${teacher.full_name} (${teacher.email})`);
    } else {
      console.log(`Teacher account exists: ${teacher.full_name} (${teacher.email})`);
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        full_name: teacher.full_name,
        email: teacher.email,
        role: 'teacher',
        school_id: schoolId,
      })
      .eq('id', userId);

    if (profileError) throw profileError;
    teacherIds.push(userId);
  }

  return teacherIds;
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

async function assignStudentsToTeachers(teacherIds, studentIds) {
  for (const teacherId of teacherIds) {
    const { error: deleteError } = await supabase
      .from('teacher_students')
      .delete()
      .eq('teacher_id', teacherId);
    if (deleteError) throw deleteError;
  }

  const links = studentIds.map((studentId, index) => ({
    teacher_id: teacherIds[Math.floor(index / 10)],
    student_id: studentId,
  }));

  const { error } = await supabase.from('teacher_students').insert(links);
  if (error) throw error;

  console.log(`Assigned 10 students to each of ${teacherIds.length} teachers.`);
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
  const teacherIds = await ensureTeachers(schoolId);

  await resetDemoStudents(schoolId);
  const students = await insertStudents(schoolId);
  await assignStudentsToTeachers(
    teacherIds,
    students.map((student) => student.id)
  );

  await resetTemplates(schoolId);
  await insertTemplates(schoolId);

  console.log('\nDemo seed complete.');
  console.log(`School code for signup: ${DEMO_SCHOOL.school_code}`);
  console.log('Demo teacher logins (password for all):', DEMO_TEACHER_PASSWORD);
  for (const teacher of DEMO_TEACHERS) {
    console.log(`  • ${teacher.email}`);
  }
}

main().catch((error) => {
  console.error('\nDemo seed failed:', error.message ?? error);
  process.exit(1);
});
