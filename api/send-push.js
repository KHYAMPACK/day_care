import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

function normalizeSubscription(value) {
  if (!value) return null;
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  return parsed?.endpoint ? parsed : null;
}

async function resolveStudentIds(adminDb, delivery) {
  const { targetType, targetId, studentIds = [] } = delivery;

  if (targetType === 'student' && targetId) {
    return [targetId];
  }

  if (targetType === 'all') {
    return studentIds;
  }

  if (targetType === 'group' && targetId) {
    const { data, error } = await adminDb
      .from('student_groups')
      .select('student_id')
      .eq('group_id', targetId);

    if (error) throw error;
    return (data ?? []).map((row) => row.student_id);
  }

  return studentIds;
}

async function fetchSubscriptionRows(adminDb, delivery) {
  const resolvedStudentIds = await resolveStudentIds(adminDb, delivery);

  console.log('send-push: resolved student IDs', resolvedStudentIds);

  if (resolvedStudentIds.length === 0) {
    return [];
  }

  const { data, error } = await adminDb
    .from('student_parents')
    .select(
      `
      parent_id,
      student_id,
      profiles (
        id,
        web_push_subscription
      )
    `
    )
    .in('student_id', resolvedStudentIds);

  if (error) {
    console.error('send-push: student_parents query failed', error);
    throw error;
  }

  console.log('send-push: student_parents rows', data?.length ?? 0, data);

  return (data ?? []).map((row) => ({
    parent_id: row.parent_id,
    student_id: row.student_id,
    subscription: row.profiles?.web_push_subscription ?? null,
  }));
}

function buildPushItems(subscriptionRows, delivery) {
  const { body, bodiesByStudentId = null } = delivery;
  const seen = new Set();
  const items = [];

  for (const row of subscriptionRows) {
    const messageBody =
      bodiesByStudentId && row.student_id in bodiesByStudentId
        ? bodiesByStudentId[row.student_id]
        : body;

    const subscription = normalizeSubscription(row.subscription);
    if (!subscription || !messageBody) continue;

    const dedupeKey = `${subscription.endpoint}\0${messageBody}`;
    if (seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);
    items.push({ subscription, body: messageBody, url: '/' });
  }

  return items;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabaseUrl =
      process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey =
      process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ error: 'Supabase is not configured on the server' });
    }

    if (!serviceRoleKey) {
      return res.status(500).json({
        error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server',
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !['teacher', 'director'].includes(profile?.role)) {
      return res.status(403).json({ error: 'Only teachers and directors can send push notifications' });
    }

    const publicKey =
      process.env.VAPID_PUBLIC_KEY ?? process.env.VITE_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@kres-takip.local';

    if (!publicKey || !privateKey) {
      return res.status(500).json({
        error: 'VAPID keys are not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Vercel.',
      });
    }

    const { title = '🌸 Kreş Takip', items: clientItems, delivery } = req.body ?? {};

    let items = Array.isArray(clientItems) ? clientItems : [];

    if (delivery) {
      const adminDb = createClient(supabaseUrl, serviceRoleKey);
      const subscriptionRows = await fetchSubscriptionRows(adminDb, delivery);
      items = buildPushItems(subscriptionRows, delivery);
      console.log('send-push: built items from delivery', items.length);
    }

    if (!items.length) {
      return res.status(200).json({
        sent: 0,
        failed: 0,
        total: 0,
        skipped: true,
        message: 'No push subscriptions matched this message target',
      });
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);

    const results = await Promise.allSettled(
      items.map(({ subscription, body, url = '/' }) => {
        const payload = JSON.stringify({
          title,
          body,
          url,
          tag: 'daycare-notification',
        });

        return webpush.sendNotification(subscription, payload);
      })
    );

    const sent = results.filter((result) => result.status === 'fulfilled').length;
    const failed = results.length - sent;

    if (failed > 0) {
      console.error(
        'send-push failures:',
        results
          .filter((result) => result.status === 'rejected')
          .map((result) => result.reason?.message ?? result.reason)
      );
    }

    return res.status(200).json({ sent, failed, total: results.length });
  } catch (error) {
    console.error('send-push error:', error);
    return res.status(500).json({ error: error.message ?? 'Internal server error' });
  }
}
