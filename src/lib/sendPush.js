import { supabase } from './supabase';

export const PUSH_NOTIFICATION_TITLE = '🌸 Kreş Takip';

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

  if (parsed?.endpoint) return parsed;
  return null;
}

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

/**
 * Load parent ↔ student links and nested profile subscriptions in one query.
 */
async function fetchParentSubscriptionLinks(studentIds) {
  if (studentIds.length === 0) return [];

  const { data, error } = await supabase
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
    .in('student_id', studentIds);

  if (error) {
    console.error('fetchParentSubscriptionLinks: query failed', error);
    throw error;
  }

  console.log('fetchParentSubscriptionLinks: raw rows', data);
  return data ?? [];
}

function buildPushItems(parentLinks, resolveBody) {
  const seen = new Set();
  const items = [];

  for (const link of parentLinks) {
    const body = resolveBody(link);
    const subscription = normalizeSubscription(link.profiles?.web_push_subscription);

    if (!subscription?.endpoint || !body) {
      console.log('buildPushItems: skipping row', {
        parentId: link.parent_id,
        studentId: link.student_id,
        hasProfile: Boolean(link.profiles),
        hasSubscription: Boolean(subscription?.endpoint),
        body,
      });
      continue;
    }

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
  console.log('buildPushItemsForTarget: studentIds', studentIds);

  if (studentIds.length === 0) {
    console.warn(
      'buildPushItemsForTarget: no students matched this target. ' +
        'For groups, ensure student_groups rows exist.'
    );
    return [];
  }

  const parentLinks = await fetchParentSubscriptionLinks(studentIds);
  console.log('buildPushItemsForTarget: parentLinks count', parentLinks.length);

  if (parentLinks.length === 0) {
    console.warn(
      'buildPushItemsForTarget: no student_parents rows for these students. ' +
        'Link each parent profile to the student in student_parents.'
    );
    return [];
  }

  const resolveBody = (link) => {
    if (bodiesByStudentId && link.student_id in bodiesByStudentId) {
      return bodiesByStudentId[link.student_id];
    }
    return body;
  };

  const items = buildPushItems(parentLinks, resolveBody);

  const profilesWithSub = parentLinks.filter((link) =>
    normalizeSubscription(link.profiles?.web_push_subscription)
  ).length;

  console.log('buildPushItemsForTarget: profiles with subscription', profilesWithSub);

  if (parentLinks.length > 0 && items.length === 0) {
    console.warn(
      'buildPushItemsForTarget: parent links exist but no valid web_push_subscription. ' +
        'Confirm the column is web_push_subscription (jsonb) with endpoint + keys, ' +
        'and that admins can read parent profiles (003_profiles_rls.sql).'
    );
  }

  return items;
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
