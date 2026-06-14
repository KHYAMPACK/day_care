import { supabase } from './supabase';

export const PUSH_NOTIFICATION_TITLE = '🌸 Kreş Takip';

async function getStudentIdsForTarget(targetType, targetId, students) {
  if (targetType === 'student') {
    return [targetId];
  }

  if (targetType === 'all') {
    return students.map((student) => student.id);
  }

  if (targetType === 'group') {
    const { data, error } = await supabase
      .from('student_groups')
      .select('student_id')
      .eq('group_id', targetId);

    if (error) throw error;
    return (data ?? []).map((row) => row.student_id);
  }

  return [];
}

async function fetchParentLinks(studentIds) {
  if (studentIds.length === 0) return [];

  const { data, error } = await supabase
    .from('student_parents')
    .select('parent_id, student_id')
    .in('student_id', studentIds);

  if (error) throw error;
  return data ?? [];
}

async function fetchProfilesWithSubscriptions(parentIds) {
  if (parentIds.length === 0) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('id, web_push_subscription')
    .in('id', parentIds)
    .not('web_push_subscription', 'is', null);

  if (error) throw error;
  return data ?? [];
}

function buildPushItems(parentLinks, profiles, resolveBody) {
  const profileById = Object.fromEntries(profiles.map((profile) => [profile.id, profile]));
  const seen = new Set();
  const items = [];

  for (const link of parentLinks) {
    const body = resolveBody(link);
    const subscription = profileById[link.parent_id]?.web_push_subscription;

    if (!subscription?.endpoint || !body) continue;

    const dedupeKey = `${subscription.endpoint}\0${body}`;
    if (seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);
    items.push({ subscription, body, url: '/' });
  }

  return items;
}

export async function buildPushItemsForTarget({
  targetType,
  targetId,
  students,
  body,
  bodiesByStudentId = null,
}) {
  const studentIds = await getStudentIdsForTarget(targetType, targetId, students);
  const parentLinks = await fetchParentLinks(studentIds);

  if (parentLinks.length === 0) return [];

  const parentIds = [...new Set(parentLinks.map((link) => link.parent_id))];
  const profiles = await fetchProfilesWithSubscriptions(parentIds);

  const resolveBody = (link) => {
    if (bodiesByStudentId && link.student_id in bodiesByStudentId) {
      return bodiesByStudentId[link.student_id];
    }
    return body;
  };

  return buildPushItems(parentLinks, profiles, resolveBody);
}

export async function sendPushNotifications(items) {
  console.log('sendPushNotifications: called', { itemCount: items.length });

  if (!items.length) {
    console.log('sendPushNotifications: skipped — no subscriptions found');
    return { sent: 0, failed: 0, total: 0, skipped: true };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Push göndermek için oturum bulunamadı.');
  }

  console.log('sendPushNotifications: calling /api/send-push');

  const response = await fetch('/api/send-push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      title: PUSH_NOTIFICATION_TITLE,
      items,
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error ?? 'Push bildirimi gönderilemedi.');
  }

  return result;
}

export async function notifyParentsForMessage({
  targetType,
  targetId,
  students,
  body,
  bodiesByStudentId = null,
}) {
  console.log('notifyParentsForMessage: starting', {
    targetType,
    targetId,
    body,
    studentCount: students.length,
  });

  const items = await buildPushItemsForTarget({
    targetType,
    targetId,
    students,
    body,
    bodiesByStudentId,
  });

  console.log('notifyParentsForMessage: push items built', {
    itemCount: items.length,
    endpoints: items.map((item) => item.subscription?.endpoint),
  });

  return sendPushNotifications(items);
}
