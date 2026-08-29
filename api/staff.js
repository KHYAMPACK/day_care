import {
  createStaffAuthUser,
  generatePin,
  generateUniqueUsername,
  buildLoginEmail,
  verifyDirector,
} from './_lib/staffAuth.js';

const ALLOWED_ROLES = new Set(['parent', 'teacher', 'counselor']);
const DELETABLE_ROLES = new Set(['parent', 'teacher', 'counselor']);
const VALID_SUBJECT_SLUGS = new Set([
  'matematik',
  'fen',
  'turkce',
  'sosyal',
  'ingilizce',
  'din',
]);
const SKIPPABLE_ERROR_CODES = new Set(['42P01', 'PGRST205', '42703']);

async function deleteWhere(adminDb, table, column, value) {
  const { error } = await adminDb.from(table).delete().eq(column, value);
  if (!error) return;
  if (SKIPPABLE_ERROR_CODES.has(error.code)) return;
  console.warn(`staff cleanup ${table}.${column}:`, error.message);
}

async function cleanupStaffReferences(adminDb, userId, role) {
  if (role === 'parent') {
    await deleteWhere(adminDb, 'survey_responses', 'parent_id', userId);
    await deleteWhere(adminDb, 'student_parents', 'parent_id', userId);
    await deleteWhere(adminDb, 'parent_notifications', 'parent_id', userId);
  }

  if (role === 'teacher' || role === 'counselor') {
    await deleteWhere(adminDb, 'atlas_lesson_sessions', 'taken_by', userId);
    await deleteWhere(adminDb, 'homework_assignments', 'created_by', userId);
    await deleteWhere(adminDb, 'surveys', 'created_by', userId);
    await deleteWhere(adminDb, 'trips', 'created_by', userId);
    await deleteWhere(adminDb, 'teacher_students', 'teacher_id', userId);
    await deleteWhere(adminDb, 'teacher_assignments', 'teacher_id', userId);
    await deleteWhere(adminDb, 'atlas_teacher_day_responses', 'teacher_id', userId);
    await deleteWhere(adminDb, 'atlas_teacher_missed_day_prompts', 'teacher_id', userId);
  }

  await deleteWhere(adminDb, 'messages', 'author_id', userId);
  await deleteWhere(adminDb, 'announcements', 'author_id', userId);
}

function isDeleteBlockedError(message = '') {
  return /foreign key|violates|restrict|database error deleting|unable to delete|still referenced/i.test(
    message
  );
}

async function updateTeacherSubject(adminDb, userId, slug) {
  let { error: profileError } = await adminDb
    .from('profiles')
    .update({ subject_slug: slug, subject_id: null })
    .eq('id', userId);

  if (!profileError) return;

  if (/subject_slug|schema cache/i.test(profileError.message ?? '')) {
    const { data: subject, error: subjectError } = await adminDb
      .from('curriculum_subjects')
      .select('id')
      .eq('slug', slug)
      .eq('grade', 5)
      .maybeSingle();

    if (subjectError) throw subjectError;

    ({ error: profileError } = await adminDb
      .from('profiles')
      .update({ subject_id: subject?.id ?? null })
      .eq('id', userId));
  }

  if (profileError) throw profileError;
}

async function handleCreate(req, res) {
  const auth = await verifyDirector(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { adminDb, profile } = auth;
  const schoolId = profile.school_id;
  const { role, full_name, subject_slug, student_ids } = req.body ?? {};

  if (!ALLOWED_ROLES.has(role)) {
    return res.status(400).json({ error: 'Geçersiz rol.' });
  }

  const fullName = String(full_name ?? '').trim();
  if (!fullName) {
    return res.status(400).json({ error: 'Ad soyad zorunludur.' });
  }

  if (role === 'parent') {
    const ids = Array.isArray(student_ids) ? student_ids.filter(Boolean) : [];
    if (ids.length === 0) {
      return res.status(400).json({ error: 'En az bir öğrenci seçilmelidir.' });
    }

    const { data: students, error: studentsError } = await adminDb
      .from('students')
      .select('id')
      .eq('school_id', schoolId)
      .in('id', ids);

    if (studentsError) throw studentsError;
    if ((students ?? []).length !== ids.length) {
      return res.status(400).json({ error: 'Seçilen öğrenciler bu okula ait değil.' });
    }
  }

  if (role === 'teacher') {
    const slug = String(subject_slug ?? '').trim();
    if (!slug) {
      return res.status(400).json({ error: 'Branş seçimi zorunludur.' });
    }
    if (!VALID_SUBJECT_SLUGS.has(slug)) {
      return res.status(400).json({ error: 'Geçersiz branş.' });
    }
  }

  const username = await generateUniqueUsername(adminDb, schoolId, fullName);
  const pin = generatePin();
  const userId = await createStaffAuthUser(adminDb, {
    schoolId,
    fullName,
    role,
    username,
    pin,
  });

  if (role === 'parent') {
    const ids = student_ids.filter(Boolean);
    const rows = ids.map((studentId) => ({
      student_id: studentId,
      parent_id: userId,
    }));
    const { error: linkError } = await adminDb.from('student_parents').insert(rows);
    if (linkError) throw linkError;
  }

  if (role === 'teacher') {
    await updateTeacherSubject(adminDb, userId, String(subject_slug).trim());
  }

  return res.status(200).json({
    user_id: userId,
    username,
    pin,
    full_name: fullName,
    role,
  });
}

async function handleDelete(req, res) {
  const auth = await verifyDirector(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { adminDb, profile } = auth;
  const schoolId = profile.school_id;
  const userId = String(req.body?.user_id ?? '').trim();

  if (!userId) {
    return res.status(400).json({ error: 'Kullanıcı kimliği gerekli.' });
  }

  if (userId === profile.id) {
    return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz.' });
  }

  const { data: target, error: targetError } = await adminDb
    .from('profiles')
    .select('id, role, full_name, username, school_id')
    .eq('id', userId)
    .maybeSingle();

  if (targetError) throw targetError;
  if (!target || target.school_id !== schoolId) {
    return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  }

  if (!DELETABLE_ROLES.has(target.role)) {
    return res.status(400).json({ error: 'Bu hesap türü silinemez.' });
  }

  await cleanupStaffReferences(adminDb, userId, target.role);

  const { error: deleteError } = await adminDb.auth.admin.deleteUser(userId);
  if (deleteError) {
    const message = deleteError.message ?? '';
    console.error('staff delete auth error:', deleteError);
    if (isDeleteBlockedError(message)) {
      return res.status(409).json({
        error:
          'Bu kullanıcıya bağlı kayıtlar var (Atlas dersi, ödev, anket vb.). İlgili kayıtları kaldırdıktan sonra tekrar deneyin.',
      });
    }
    throw deleteError;
  }

  return res.status(200).json({
    user_id: userId,
    full_name: target.full_name,
    username: target.username,
    role: target.role,
  });
}

async function handleResetPin(req, res) {
  const auth = await verifyDirector(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { adminDb, profile } = auth;
  const { user_id: userId } = req.body ?? {};

  if (!userId) {
    return res.status(400).json({ error: 'Kullanıcı seçilmedi.' });
  }

  const { data: target, error: targetError } = await adminDb
    .from('profiles')
    .select('id, role, school_id, username, full_name')
    .eq('id', userId)
    .maybeSingle();

  if (targetError) throw targetError;
  if (!target || target.school_id !== profile.school_id) {
    return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  }
  if (target.role === 'director') {
    return res.status(403).json({ error: 'Müdür PIN sıfırlanamaz.' });
  }
  if (!target.username) {
    return res.status(400).json({ error: 'Bu kullanıcının kullanıcı adı yok.' });
  }

  const pin = generatePin();
  const loginEmail = buildLoginEmail(profile.school_id, target.username);

  const { error: updateError } = await adminDb.auth.admin.updateUserById(userId, {
    password: pin,
    email: loginEmail,
  });

  if (updateError) throw updateError;

  const { error: profileError } = await adminDb
    .from('profiles')
    .update({ login_pin: pin })
    .eq('id', userId);

  if (profileError) throw profileError;

  return res.status(200).json({
    user_id: userId,
    username: target.username,
    pin,
    full_name: target.full_name,
    role: target.role,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body);
    } catch {
      return res.status(400).json({ error: 'Geçersiz istek gövdesi.' });
    }
  }

  const action = String(req.body?.action ?? '').trim();

  try {
    if (action === 'create') return await handleCreate(req, res);
    if (action === 'delete') return await handleDelete(req, res);
    if (action === 'reset-pin') return await handleResetPin(req, res);
    return res.status(400).json({ error: 'Geçersiz işlem.' });
  } catch (error) {
    console.error(`staff.${action || 'unknown'} error:`, error);
    return res.status(500).json({ error: error.message ?? 'İşlem başarısız oldu.' });
  }
}
