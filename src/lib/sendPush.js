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

    if (error) {
      console.error('getStudentIdsForTarget: student_groups query failed', error);
      throw error;
    }

    return (data ?? []).map((row) => row.student_id);
  }

  return [];
}

async function fetchSubscriptionRows(targetType, targetId, studentIds) {
  if (targetType === 'group' && targetId) {
    const { data, error } = await supabase.rpc('get_push_subscriptions_for_group', {
      target_group_id: targetId,
    });

    if (error) {
      console.error('fetchSubscriptionRows: group RPC failed', error);
      throw error;
    }

    console.log('fetchSubscriptionRows: group RPC rows', data);
    return (data ?? []).map((row) => ({
      parent_id: row.parent_id,
      student_id: row.student_id,
      subscription: row.subscription,
    }));
  }

  if (studentIds.length === 0) return [];

  const { data, error } = await supabase.rpc('get_push_subscriptions_for_students', {
    target_student_ids: studentIds,
  });

  if (error) {
    console.error('fetchSubscriptionRows: students RPC failed', error);

    if (error.message?.includes('Could not find the function')) {
      throw new Error(
        'Push RPC bulunamadı. Supabase SQL Editor\'da 009_admin_push_rpc.sql dosyasını çalıştırın.'
      );
    }

    throw error;
  }

  console.log('fetchSubscriptionRows: students RPC rows', data);
  return (data ?? []).map((row) => ({
    parent_id: row.parent_id,
    student_id: row.student_id,
    subscription: row.subscription,
  }));
}

function buildPushItems(subscriptionRows, resolveBody) {
  const seen = new Set();
  const items = [];

  for (const row of subscriptionRows) {
    const body = resolveBody(row);
    const subscription = normalizeSubscription(row.subscription);

    if (!subscription?.endpoint || !body) {
      console.log('buildPushItems: skipping row', {
        parentId: row.parent_id,
        studentId: row.student_id,
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
  console.log('buildPushItemsForTarget: studentIds', { targetType, targetId, studentIds });

  if (targetType !== 'group' && studentIds.length === 0) {
    console.warn('buildPushItemsForTarget: no students matched this target.');
    return [];
  }

  const subscriptionRows = await fetchSubscriptionRows(targetType, targetId, studentIds);
  console.log('buildPushItemsForTarget: subscription rows', subscriptionRows.length);

  if (subscriptionRows.length === 0) {
    console.warn(
      'buildPushItemsForTarget: no push subscriptions found. Checklist:\n' +
        '1) student_parents links parent to student\n' +
        '2) student_groups links student to group (for group messages)\n' +
        '3) profiles.web_push_subscription is populated on the parent row\n' +
        '4) Run supabase/migrations/009_admin_push_rpc.sql in Supabase'
    );
    return [];
  }

  const resolveBody = (row) => {
    if (bodiesByStudentId && row.student_id in bodiesByStudentId) {
      return bodiesByStudentId[row.student_id];
    }
    return body;
  };

  const items = buildPushItems(subscriptionRows, resolveBody);
  console.log('buildPushItemsForTarget: valid push items', items.length);

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
