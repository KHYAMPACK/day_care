import {
  createStaffAuthUser,
  generatePin,
  generateUniqueUsername,
  verifyDirector,
} from './lib/staffAuth.js';

const ALLOWED_ROLES = new Set(['parent', 'teacher', 'counselor']);

const VALID_SUBJECT_SLUGS = new Set([
  'matematik',
  'fen',
  'turkce',
  'sosyal',
  'ingilizce',
  'din',
]);

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
      const slug = String(subject_slug).trim();
      let { error: profileError } = await adminDb
        .from('profiles')
        .update({ subject_slug: slug, subject_id: null })
        .eq('id', userId);

      if (profileError && /subject_slug|schema cache/i.test(profileError.message ?? '')) {
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

    return res.status(200).json({
      user_id: userId,
      username,
      pin,
      full_name: fullName,
      role,
    });
  } catch (error) {
    console.error('create-staff-user error:', error);
    return res.status(500).json({ error: error.message ?? 'Kullanıcı oluşturulamadı.' });
  }
}
