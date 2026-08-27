import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

export function normalizeSubscription(value) {
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

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service role is not configured on the server');
  }

  return {
    supabaseUrl,
    adminDb: createClient(supabaseUrl, serviceRoleKey),
  };
}

export function getVapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@kres-takip.local';

  if (!publicKey || !privateKey) {
    throw new Error(
      'VAPID keys are not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Vercel.'
    );
  }

  return { publicKey, privateKey, subject };
}

export async function sendWebPushItems(items, { title, tag, icon } = {}) {
  if (!items.length) {
    return { sent: 0, failed: 0, total: 0, skipped: true };
  }

  const { publicKey, privateKey, subject } = getVapidConfig();
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const results = await Promise.allSettled(
    items.map(({ subscription, body, url = '/', tag: itemTag }) => {
      const payload = JSON.stringify({
        title: title ?? 'OkulTakip',
        body,
        url,
        tag: itemTag ?? tag ?? 'daycare-notification',
        icon: icon ?? null,
      });

      return webpush.sendNotification(subscription, payload);
    })
  );

  const sent = results.filter((result) => result.status === 'fulfilled').length;
  const failed = results.length - sent;

  if (failed > 0) {
    console.error(
      'web-push failures:',
      results
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason?.message ?? result.reason)
    );
  }

  return { sent, failed, total: results.length, skipped: false };
}

export async function resolveStudentIds(adminDb, delivery) {
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

export async function fetchSubscriptionRows(adminDb, delivery) {
  const resolvedStudentIds = await resolveStudentIds(adminDb, delivery);

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

  if (error) throw error;

  return (data ?? []).map((row) => ({
    parent_id: row.parent_id,
    student_id: row.student_id,
    subscription: row.profiles?.web_push_subscription ?? null,
  }));
}

export function buildPushItems(subscriptionRows, delivery) {
  const { body, bodiesByStudentId = null, url = '/', tag } = delivery;
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
    items.push({ subscription, body: messageBody, url, tag });
  }

  return items;
}
