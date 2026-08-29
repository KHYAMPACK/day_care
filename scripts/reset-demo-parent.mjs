/**
 * Create / refresh demo parent (veli) for DEMO123 with rich mock data.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env
 *
 * Usage: npm run reset-demo-parent
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

const DEMO_PARENT = {
  full_name: 'Demo Veli',
  username: 'demo.veli',
  pin: '123456',
};

const LINKED_STUDENT_NAMES = ['Elif Arslan', 'Mira Yıldız'];

const SKIPPABLE_ERROR_CODES = new Set(['42P01', 'PGRST205', '42703']);

function buildLoginEmail(schoolId, username) {
  return `${username.toLowerCase()}@${schoolId}.login.internal`;
}

function addDaysIso(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function istanbulToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function deleteWhere(table, column, value) {
  const { error } = await supabase.from(table).delete().eq(column, value);
  if (!error) return;
  if (SKIPPABLE_ERROR_CODES.has(error.code)) return;
  console.warn(`cleanup ${table}.${column}:`, error.message);
}

async function cleanupParentReferences(userId) {
  await deleteWhere('survey_responses', 'parent_id', userId);
  await deleteWhere('student_parents', 'parent_id', userId);
  await deleteWhere('parent_notifications', 'parent_id', userId);
  await deleteWhere('messages', 'author_id', userId);
  await deleteWhere('announcements', 'author_id', userId);
}

async function getDemoSchool() {
  const { data, error } = await supabase
    .from('schools')
    .select('id, name, school_code')
    .eq('school_code', DEMO_SCHOOL_CODE)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error(`Demo school ${DEMO_SCHOOL_CODE} not found. Run npm run seed-demo first.`);
  }
  return data;
}

async function findUserIdByLoginEmail(schoolId, username) {
  const loginEmail = buildLoginEmail(schoolId, username);
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((user) => user.email?.toLowerCase() === loginEmail.toLowerCase())?.id ?? null;
}

async function deleteExistingDemoParent(schoolId) {
  const { data: parents, error } = await supabase
    .from('profiles')
    .select('id, username, full_name')
    .eq('school_id', schoolId)
    .eq('role', 'parent')
    .or(`username.eq.${DEMO_PARENT.username},full_name.eq.${DEMO_PARENT.full_name}`);

  if (error) throw error;

  for (const parent of parents ?? []) {
    await cleanupParentReferences(parent.id);
    const { error: deleteError } = await supabase.auth.admin.deleteUser(parent.id);
    if (deleteError) {
      console.warn(`Could not delete auth user ${parent.username}:`, deleteError.message);
      await supabase.from('profiles').delete().eq('id', parent.id);
    } else {
      console.log(`Removed existing demo parent: ${parent.full_name ?? parent.username}`);
    }
  }
}

async function getTeacherAuthorId(schoolId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('school_id', schoolId)
    .eq('role', 'teacher')
    .eq('username', 'demo.ogretmen')
    .maybeSingle();

  if (error) throw error;
  if (data?.id) return data.id;

  const { data: fallback, error: fallbackError } = await supabase
    .from('profiles')
    .select('id')
    .eq('school_id', schoolId)
    .eq('role', 'teacher')
    .limit(1)
    .maybeSingle();

  if (fallbackError) throw fallbackError;
  if (!fallback?.id) {
    throw new Error('No teacher found for demo school. Run npm run reset-demo-teacher first.');
  }
  return fallback.id;
}

async function getStudentsByNames(schoolId, names) {
  const { data, error } = await supabase
    .from('students')
    .select('id, full_name, grade, class_id')
    .eq('school_id', schoolId)
    .in('full_name', names)
    .order('full_name');

  if (error) throw error;
  const found = data ?? [];
  if (found.length === 0) {
    throw new Error('Demo students not found. Run npm run seed-demo first.');
  }
  return found;
}

async function createDemoParent(schoolId) {
  const loginEmail = buildLoginEmail(schoolId, DEMO_PARENT.username);
  let userId = await findUserIdByLoginEmail(schoolId, DEMO_PARENT.username);

  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: loginEmail,
      password: DEMO_PARENT.pin,
      email_confirm: true,
      user_metadata: {
        full_name: DEMO_PARENT.full_name,
        school_id: schoolId,
        username: DEMO_PARENT.username,
        role: 'parent',
      },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`Created parent: ${DEMO_PARENT.full_name} (${DEMO_PARENT.username})`);
  } else {
    await supabase.auth.admin.updateUserById(userId, {
      password: DEMO_PARENT.pin,
      email: loginEmail,
    });
    console.log(`Updated existing parent: ${DEMO_PARENT.username}`);
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      full_name: DEMO_PARENT.full_name,
      email: loginEmail,
      role: 'parent',
      school_id: schoolId,
      username: DEMO_PARENT.username,
      login_pin: DEMO_PARENT.pin,
    })
    .eq('id', userId);

  if (profileError) throw profileError;
  return userId;
}

async function linkStudents(parentId, studentIds) {
  await supabase.from('student_parents').delete().eq('parent_id', parentId);

  const rows = studentIds.map((studentId) => ({
    parent_id: parentId,
    student_id: studentId,
  }));

  const { error } = await supabase.from('student_parents').insert(rows);
  if (error) throw error;
  console.log(`Linked ${studentIds.length} student(s) to demo parent.`);
}

async function seedMessages(authorId, students) {
  const primary = students[0];
  if (!primary) return;

  await supabase.from('messages').delete().eq('author_id', authorId);

  const rows = [
    {
      student_id: primary.id,
      author_id: authorId,
      body: '🍽️ Elif bugün yemeğini çok güzel yedi, tabağını bitirdi!',
      created_at: hoursAgo(2),
    },
    {
      student_id: primary.id,
      author_id: authorId,
      body: '🎨 Parmak boyaması yaptık; Elif çalışmayı sınıfta sergilemek istedi.',
      created_at: hoursAgo(5),
    },
    {
      student_id: primary.id,
      author_id: authorId,
      body: '😴 Öğle uykusunu mışıl mışıl uyudu, enerjisini topladı.',
      created_at: daysAgo(1),
    },
    {
      student_id: students[1]?.id ?? primary.id,
      author_id: authorId,
      body: '📢 Cuma günü veli toplantısı için kısa bir hatırlatma gönderiyoruz.',
      created_at: daysAgo(3),
    },
    {
      student_id: primary.id,
      author_id: authorId,
      body: '💊 İlaç öğretmen gözetiminde saatinde içildi.',
      created_at: daysAgo(10),
    },
  ];

  const { error } = await supabase.from('messages').insert(rows);
  if (error) throw error;
  console.log(`Inserted ${rows.length} feed messages.`);
}

async function seedAnnouncements(schoolId, authorId) {
  await supabase.from('announcements').delete().eq('school_id', schoolId);

  const rows = [
    {
      school_id: schoolId,
      author_id: authorId,
      author_name: 'Ayşe Yılmaz',
      title: 'Cuma günü veli toplantısı',
      body: '5-A sınıfı velileri için Cuma 14:00’te okul kütüphanesinde kısa bir bilgilendirme yapılacaktır.',
      pinned: true,
      created_at: hoursAgo(5),
    },
    {
      school_id: schoolId,
      author_id: authorId,
      author_name: 'Ayşe Yılmaz',
      title: 'Gezi izin formu hatırlatması',
      body: 'Müze gezisi için imzalı izin formunu en geç Perşembe günü sınıf öğretmenine iletmenizi rica ederiz.',
      pinned: false,
      created_at: daysAgo(1),
    },
    {
      school_id: schoolId,
      author_id: authorId,
      author_name: 'Okul Yönetimi',
      title: 'Eylül beslenme menüsü',
      body: 'Yeni ay menüsü veli portalına yüklendi. Alerji bildiriminiz varsa lütfen öğretmeninize yazın.',
      pinned: false,
      created_at: daysAgo(2),
    },
    {
      school_id: schoolId,
      author_id: authorId,
      author_name: 'Ayşe Yılmaz',
      title: 'Deneme sınavı tarihi',
      body: 'İlk ATLAS denememiz yakında yapılacak. Öğrencilerin en geç 09:45’te okulda olması yeterli.',
      pinned: false,
      created_at: daysAgo(4),
    },
  ];

  const { error } = await supabase.from('announcements').insert(rows);
  if (error) throw error;
  console.log(`Inserted ${rows.length} announcements.`);
}

async function seedCalendarEvents(schoolId) {
  await supabase.from('calendar_events').delete().eq('school_id', schoolId);

  const today = istanbulToday();
  const rows = [
    {
      school_id: schoolId,
      title: '6. sınıf ATLAS Deneme 3',
      body: 'Deneme salonu girişi 09:30.',
      event_type: 'exam',
      exam_kind: 'mock',
      starts_on: addDaysIso(today, 10),
      ends_on: addDaysIso(today, 10),
      audience_grades: [5, 6, 7, 8],
      notify: true,
    },
    {
      school_id: schoolId,
      title: '5. sınıf ATLAS Deneme 2',
      body: 'Öğrenciler en geç 09:45’te okulda olmalı.',
      event_type: 'exam',
      exam_kind: 'mock',
      starts_on: addDaysIso(today, 14),
      ends_on: addDaysIso(today, 14),
      audience_grades: [5, 6],
      notify: true,
    },
    {
      school_id: schoolId,
      title: 'Veli bilgilendirme toplantısı',
      body: '5-A velileri · okul kütüphanesi',
      event_type: 'parent_meeting',
      starts_on: addDaysIso(today, 5),
      ends_on: addDaysIso(today, 5),
      audience_grades: [5],
      notify: true,
    },
    {
      school_id: schoolId,
      title: 'Müze gezisi',
      body: 'İzin formu zorunludur.',
      event_type: 'activity',
      starts_on: addDaysIso(today, 12),
      ends_on: addDaysIso(today, 12),
      audience_grades: [5],
      notify: true,
    },
    {
      school_id: schoolId,
      title: 'Yarın: Fen laboratuvarı',
      body: '5. sınıflar için etkinlik günü.',
      event_type: 'activity',
      starts_on: addDaysIso(today, 1),
      ends_on: addDaysIso(today, 1),
      audience_grades: [5],
      notify: false,
    },
  ];

  const { error } = await supabase.from('calendar_events').insert(rows);
  if (error) throw error;
  console.log(`Inserted ${rows.length} calendar events.`);
}

const LGS_SUBJECTS = [
  { code: 'turkce', questions: 20 },
  { code: 'matematik', questions: 20 },
  { code: 'fen', questions: 20 },
  { code: 'inkilap', questions: 10 },
  { code: 'din', questions: 10 },
  { code: 'ingilizce', questions: 10 },
];

const EXAM_SUBJECT_PRESETS = [
  {
    subjects: {
      turkce: [14, 4, 2],
      matematik: [12, 5, 3],
      fen: [13, 4, 3],
      inkilap: [7, 2, 1],
      din: [8, 1, 1],
      ingilizce: [7, 2, 1],
    },
    bump: [0, 1],
  },
  {
    subjects: {
      turkce: [12, 5, 3],
      matematik: [10, 6, 4],
      fen: [11, 5, 4],
      inkilap: [6, 3, 1],
      din: [7, 2, 1],
      ingilizce: [6, 3, 1],
    },
    bump: [0, 1],
  },
];

function computeNet(correct, wrong) {
  return Math.round((correct - wrong / 3) * 100) / 100;
}

function buildExamSubjectRows(sessionId, studentId, preset, bump = 0) {
  return LGS_SUBJECTS.map((def) => {
    const [correct, wrong, blank] = preset.subjects[def.code] ?? [0, 0, 0];
    const adjustedCorrect = Math.min(def.questions, correct + bump);
    let remaining = def.questions - adjustedCorrect;
    const adjustedWrong = Math.min(wrong, remaining);
    remaining -= adjustedWrong;
    const adjustedBlank = Math.min(blank, remaining);
    return {
      session_id: sessionId,
      student_id: studentId,
      subject_code: def.code,
      question_count: def.questions,
      correct_count: adjustedCorrect,
      wrong_count: adjustedWrong,
      blank_count: adjustedBlank,
      net: computeNet(adjustedCorrect, adjustedWrong),
    };
  });
}

async function seedExams(schoolId, students) {
  const { error: deleteError } = await supabase.from('exam_sessions').delete().eq('school_id', schoolId);
  if (deleteError && !SKIPPABLE_ERROR_CODES.has(deleteError.code)) {
    console.warn('exam cleanup:', deleteError.message);
    return;
  }

  const today = istanbulToday();
  const examDefs = [
    { title: 'ATLAS Deneme 1', held_on: addDaysIso(today, -14) },
    { title: 'ATLAS Deneme 2', held_on: addDaysIso(today, -7) },
  ];

  for (const [examIndex, examDef] of examDefs.entries()) {
    const { data: session, error: sessionError } = await supabase
      .from('exam_sessions')
      .insert({
        school_id: schoolId,
        kind: 'mock',
        title: examDef.title,
        held_on: examDef.held_on,
        audience_grades: [5, 6, 7, 8],
        results_enabled: true,
        published_at: new Date().toISOString(),
        exam_format: 'lgs_full',
      })
      .select('id')
      .single();

    if (sessionError) {
      if (SKIPPABLE_ERROR_CODES.has(sessionError.code)) return;
      throw sessionError;
    }

    for (const [studentIndex, student] of students.entries()) {
      const preset = EXAM_SUBJECT_PRESETS[studentIndex] ?? EXAM_SUBJECT_PRESETS[0];
      const rows = buildExamSubjectRows(
        session.id,
        student.id,
        preset,
        preset.bump[examIndex] ?? 0
      );
      const { error: resultsError } = await supabase.from('exam_subject_results').insert(rows);
      if (resultsError) throw resultsError;
    }

    const { error: rankError } = await supabase.rpc('compute_exam_rankings', {
      p_session_id: session.id,
    });
    if (rankError && !SKIPPABLE_ERROR_CODES.has(rankError.code)) throw rankError;
  }

  console.log(`Seeded ${examDefs.length} published deneme(s) with LGS results.`);
}

async function seedAtlasPractice(schoolId, students, teacherId) {
  const classIds = [...new Set(students.map((row) => row.class_id).filter(Boolean))];
  if (!classIds.length) return;

  for (const classId of classIds) {
    await supabase.from('atlas_lesson_sessions').delete().eq('class_id', classId);
  }

  const { data: classes, error: classError } = await supabase
    .from('classes')
    .select('id, grade')
    .in('id', classIds);
  if (classError) {
    if (SKIPPABLE_ERROR_CODES.has(classError.code)) return;
    throw classError;
  }

  const { data: subjects, error: subjectError } = await supabase
    .from('curriculum_subjects')
    .select('id, grade, name')
    .in('name', ['Matematik', 'Türkçe', 'Fen Bilimleri']);
  if (subjectError) throw subjectError;

  const { data: assessmentTypes, error: typeError } = await supabase
    .from('assessment_types')
    .select('id, slug')
    .eq('school_id', schoolId)
    .eq('slug', 'quiz')
    .limit(1);
  if (typeError && !SKIPPABLE_ERROR_CODES.has(typeError.code)) throw typeError;

  const quizTypeId = assessmentTypes?.[0]?.id ?? null;
  const weekIndex = 1;
  const weekStart = '2026-09-14';
  const practiceDays = [0, 1, 3, 4];
  const classStudents = Object.fromEntries(classIds.map((id) => [id, students.filter((s) => s.class_id === id)]));

  for (const klass of classes ?? []) {
    const gradeSubjects = (subjects ?? []).filter((row) => row.grade === klass.grade);
    const roster = classStudents[klass.id] ?? [];
    if (!gradeSubjects.length || !roster.length) continue;

    for (const dayOffset of practiceDays) {
      const sessionDate = addDaysIso(weekStart, dayOffset);
      for (const [slotIndex, subject] of gradeSubjects.entries()) {
        const { data: session, error: sessionError } = await supabase
          .from('atlas_lesson_sessions')
          .insert({
            school_id: schoolId,
            class_id: klass.id,
            subject_id: subject.id,
            slot_index: slotIndex + 1,
            session_date: sessionDate,
            taken_by: teacherId,
            week_index: weekIndex,
            lesson_type: 'practice',
            assessment_type_id: quizTypeId,
            questions_total: 20,
            activity_completed_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (sessionError) {
          if (SKIPPABLE_ERROR_CODES.has(sessionError.code)) return;
          throw sessionError;
        }

        const attendanceRows = roster.map((student) => ({
          session_id: session.id,
          student_id: student.id,
          status: 'present',
        }));
        const { error: attendanceError } = await supabase
          .from('atlas_lesson_attendance')
          .insert(attendanceRows);
        if (attendanceError) throw attendanceError;

        const resultRows = roster.map((student, index) => ({
          session_id: session.id,
          student_id: student.id,
          wrong_count: 2 + (index % 3),
          blank_count: index % 2,
        }));
        const { error: resultsError } = await supabase.from('atlas_lesson_results').insert(resultRows);
        if (resultsError) throw resultsError;
      }
    }
  }

  console.log('Seeded ATLAS practice sessions for demo parent students.');
}

async function seedParentNotifications(schoolId, parentId, students) {
  await supabase.from('parent_notifications').delete().eq('parent_id', parentId);

  const rows = students.map((student, index) => {
    const firstName = student.full_name.split(/\s+/)[0];
    return {
      school_id: schoolId,
      parent_id: parentId,
      student_id: student.id,
      kind: 'weekly_report',
      week_index: 1,
      title: 'Haftalık özet hazır',
      body: `${firstName} için bu haftanın özeti hazır.`,
      read_at: index === 0 ? null : hoursAgo(24),
      created_at: hoursAgo(6 - index),
    };
  });

  const { error } = await supabase.from('parent_notifications').insert(rows);
  if (error && !SKIPPABLE_ERROR_CODES.has(error.code)) throw error;
  if (!error) console.log(`Inserted ${rows.length} in-app notifications.`);
}

async function seedTuition(schoolId, students) {
  const today = istanbulToday();
  const periodStart = `${today.slice(0, 8)}01`;
  const periodEnd = addDaysIso(periodStart, 30);
  const dueDate = addDaysIso(today, 7);

  for (const student of students) {
    await supabase.from('accounting_tuition_cycles').delete().eq('student_id', student.id);
    await supabase.from('accounting_student_billing').delete().eq('student_id', student.id);

    const { error: billingError } = await supabase.from('accounting_student_billing').insert({
      school_id: schoolId,
      student_id: student.id,
      monthly_amount: 18500,
      billing_start_date: periodStart,
      is_active: true,
    });

    if (billingError && !SKIPPABLE_ERROR_CODES.has(billingError.code)) throw billingError;

    const status = student.full_name.startsWith('Elif') ? 'pending' : 'paid';
    const { error: cycleError } = await supabase.from('accounting_tuition_cycles').insert({
      school_id: schoolId,
      student_id: student.id,
      period_start: periodStart,
      period_end: periodEnd,
      due_date: dueDate,
      amount: 18500,
      status,
      paid_at: status === 'paid' ? new Date().toISOString() : null,
    });

    if (cycleError && !SKIPPABLE_ERROR_CODES.has(cycleError.code)) throw cycleError;
  }

  console.log(`Seeded tuition billing for ${students.length} linked student(s).`);
}

async function main() {
  console.log('Setting up demo parent for Yıldızlar Demo Kreşi…\n');

  const school = await getDemoSchool();
  console.log(`School: ${school.name} (${school.school_code})\n`);

  await deleteExistingDemoParent(school.id);
  const teacherId = await getTeacherAuthorId(school.id);
  const students = await getStudentsByNames(school.id, LINKED_STUDENT_NAMES);
  const parentId = await createDemoParent(school.id);

  await linkStudents(
    parentId,
    students.map((row) => row.id)
  );
  await seedMessages(teacherId, students);
  await seedAnnouncements(school.id, teacherId);
  await seedCalendarEvents(school.id);
  await seedExams(school.id, students);
  await seedAtlasPractice(school.id, students, teacherId);
  await seedParentNotifications(school.id, parentId, students);
  await seedTuition(school.id, students);

  console.log('\nDemo parent ready.');
  console.log('\nLogin (username + PIN):');
  console.log(`  Parent: ${DEMO_PARENT.username} / ${DEMO_PARENT.pin}`);
  console.log('\nLinked students:');
  for (const student of students) {
    console.log(`  • ${student.full_name}`);
  }
  console.log('\nSeeded: feed messages, announcements, calendar, denemeler, ATLAS practice, notifications, tuition.');
}

main().catch((error) => {
  console.error('\nReset failed:', error.message ?? error);
  process.exit(1);
});
