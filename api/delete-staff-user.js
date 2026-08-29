import { verifyDirector } from './lib/staffAuth.js';

const DELETABLE_ROLES = new Set(['parent', 'teacher', 'counselor']);

const SKIPPABLE_ERROR_CODES = new Set(['42P01', 'PGRST205', '42703']);

async function deleteWhere(adminDb, table, column, value) {
  const { error } = await adminDb.from(table).delete().eq(column, value);
  if (!error) return;
  if (SKIPPABLE_ERROR_CODES.has(error.code)) return;
  console.warn(`delete-staff-user cleanup ${table}.${column}:`, error.message);
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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
      console.error('delete-staff-user auth error:', deleteError);
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
  } catch (error) {
    console.error('delete-staff-user error:', error);
    return res.status(500).json({ error: error.message ?? 'Kullanıcı silinemedi.' });
  }
}
