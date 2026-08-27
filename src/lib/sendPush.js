import { supabase } from './supabase';

export const PUSH_NOTIFICATION_TITLE = 'OkulTakip';

export async function sendPushNotifications({ delivery }) {
  console.log('sendPushNotifications: calling /api/send-push with delivery', delivery);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Push göndermek için oturum bulunamadı.');
  }

  const response = await fetch('/api/send-push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      title: PUSH_NOTIFICATION_TITLE,
      delivery,
    }),
  });

  const result = await response.json().catch(() => ({}));

  console.log('sendPushNotifications: API response', result);

  if (!response.ok) {
    throw new Error(result.error ?? 'Push bildirimi gönderilemedi.');
  }

  if (result.skipped) {
    console.warn('sendPushNotifications: skipped —', result.message);
  }

  return result;
}

export async function notifyParentsForMessage({
  targetType,
  targetId,
  students,
  studentIds = null,
  body,
  bodiesByStudentId = null,
}) {
  console.log('notifyParentsForMessage: starting', {
    targetType,
    targetId,
    body,
    studentCount: studentIds?.length ?? students.length,
  });

  const delivery = {
    targetType,
    targetId,
    studentIds: studentIds ?? students.map((student) => student.id),
    body,
    bodiesByStudentId,
  };

  const result = await sendPushNotifications({ delivery });

  console.log('notifyParentsForMessage: done', result);
  return result;
}
