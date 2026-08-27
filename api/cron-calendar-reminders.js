import {
  addDaysIso,
  buildReminderBody,
  istanbulDateIso,
} from '../src/lib/calendar.js';
import {
  buildPushItems,
  fetchSubscriptionRows,
  getSupabaseAdmin,
  sendWebPushItems,
} from './lib/webPush.js';
import { buildPushIconUrl, fetchSchoolBrandingById, getRequestOrigin } from './lib/tenant.js';

function isAuthorizedCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (header && header === secret) return true;

  const url = new URL(req.url ?? '/', 'http://localhost');
  return url.searchParams.get('secret') === secret;
}

function wantsDryRun(req) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.searchParams.get('dryRun') === '1') return true;
  return Boolean(req.body?.dryRun);
}

async function studentIdsForEvent(adminDb, event) {
  let query = adminDb.from('students').select('id').eq('school_id', event.school_id);

  if (event.audience_grades?.length) {
    query = query.in('grade', event.audience_grades);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => row.id);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const dryRun = wantsDryRun(req);

  try {
    const { adminDb } = getSupabaseAdmin();
    const today = istanbulDateIso();
    const tomorrow = addDaysIso(today, 1);

    const { data: events, error: eventsError } = await adminDb
      .from('calendar_events')
      .select(
        'id, school_id, title, body, event_type, starts_on, ends_on, starts_at, audience_grades, notify'
      )
      .eq('notify', true)
      .eq('starts_on', tomorrow);

    if (eventsError) throw eventsError;

    const pending = events ?? [];
    const summaries = [];
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const event of pending) {
      const { data: alreadySent, error: logError } = await adminDb
        .from('calendar_notification_log')
        .select('event_id')
        .eq('event_id', event.id)
        .eq('notify_on', today)
        .maybeSingle();

      if (logError) throw logError;
      if (alreadySent) {
        skipped += 1;
        summaries.push({ eventId: event.id, title: event.title, skipped: 'already-sent' });
        continue;
      }

      const reminderBody = buildReminderBody(event);
      const studentIds = await studentIdsForEvent(adminDb, event);
      const subscriptionRows = await fetchSubscriptionRows(adminDb, {
        targetType: 'all',
        studentIds,
      });
      const items = buildPushItems(subscriptionRows, {
        body: reminderBody,
        url: '/?tab=calendar',
        tag: `calendar-${event.id}`,
      });

      const summary = {
        eventId: event.id,
        title: event.title,
        body: reminderBody,
        studentCount: studentIds.length,
        recipients: items.length,
      };

      if (dryRun) {
        summaries.push({ ...summary, dryRun: true });
        continue;
      }

      if (!items.length) {
        skipped += 1;
        summaries.push({ ...summary, skipped: 'no-subscriptions' });
        await adminDb.from('calendar_notification_log').insert({
          event_id: event.id,
          notify_on: today,
        });
        continue;
      }

      const tenant = await fetchSchoolBrandingById(event.school_id);
      const origin = getRequestOrigin(req) ?? process.env.APP_ORIGIN ?? null;
      const pushIcon = buildPushIconUrl(origin, tenant);

      const result = await sendWebPushItems(items, {
        title: tenant.name,
        icon: pushIcon,
        tag: `calendar-${event.id}`,
      });

      sent += result.sent;
      failed += result.failed;

      await adminDb.from('calendar_notification_log').insert({
        event_id: event.id,
        notify_on: today,
      });

      summaries.push({ ...summary, sent: result.sent, failed: result.failed });
    }

    return res.status(200).json({
      today,
      tomorrow,
      dryRun,
      eventCount: pending.length,
      sent,
      failed,
      skipped,
      events: summaries,
    });
  } catch (error) {
    console.error('cron-calendar-reminders error:', error);
    return res.status(500).json({ error: error.message ?? 'Internal server error' });
  }
}
