import { buildLoginEmail, generatePin, verifyDirector } from './lib/staffAuth.js';

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
  } catch (error) {
    console.error('reset-staff-pin error:', error);
    return res.status(500).json({ error: error.message ?? 'PIN sıfırlanamadı.' });
  }
}
