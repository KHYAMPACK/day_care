import { istanbulDateIso } from '../src/lib/calendar.js';
import { formatWeekRangeTr, weekRangeIso } from '../src/lib/curriculum.js';
import { reportWeekIndex } from '../src/lib/weeklyReport.js';
import {
  buildPushItems,
  fetchSubscriptionRows,
  getSupabaseAdmin,
  sendWebPushItems,
} from './_lib/webPush.js';
import { buildPushIconUrl, fetchSchoolBrandingById, getRequestOrigin } from './_lib/tenant.js';

const WEEKLY_REPORT_KIND = 'weekly_report';

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

function childFirstName(fullName) {
  return fullName?.trim().split(/\s+/)[0] ?? 'Çocuğunuz';
}

function weeklyReportTitle() {
  return 'Haftalık özet hazır';
}

function weeklyReportBody(childName, weekLabel) {
  const name = childFirstName(childName);
  if (weekLabel) {
    return `${name} için ${weekLabel} haftalık özeti hazır.`;
  }
  return `${name} için haftalık özet hazır.`;
}

function weeklyReportPushBody(childName) {
  return `${childFirstName(childName)} için haftalık özet hazır.`;
}

async function studentHasWeekActivity(adminDb, student, range) {
  if (!student?.class_id || !range) return true;

  try {
    const { count: atlasCount, error: atlasError } = await adminDb
      .from('lesson_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', student.class_id)
      .gte('session_date', range.start)
      .lte('session_date', range.end);

    if (!atlasError && (atlasCount ?? 0) > 0) return true;

    const { count: attendanceCount, error: attendanceError } = await adminDb
      .from('attendance_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', student.class_id)
      .gte('taken_on', range.start)
      .lte('taken_on', range.end);

    if (!attendanceError && (attendanceCount ?? 0) > 0) return true;
  } catch {
    return true;
  }

  return false;
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
    const weekIndex = reportWeekIndex(today);

    if (!weekIndex) {
      return res.status(200).json({
        today,
        weekIndex: null,
        dryRun,
        skipped: true,
        message: 'No academic week available for weekly report notifications',
      });
    }

    const weekLabel = formatWeekRangeTr(weekIndex);
    const range = weekRangeIso(weekIndex);

    const { data: schools, error: schoolsError } = await adminDb.from('schools').select('id');
    if (schoolsError) throw schoolsError;

    const summaries = [];
    let inserted = 0;
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const school of schools ?? []) {
      const { data: students, error: studentsError } = await adminDb
        .from('students')
        .select('id, school_id, full_name, class_id')
        .eq('school_id', school.id);

      if (studentsError) throw studentsError;

      const studentRows = students ?? [];
      if (!studentRows.length) continue;

      const studentById = Object.fromEntries(studentRows.map((row) => [row.id, row]));
      const studentIds = studentRows.map((row) => row.id);

      const { data: links, error: linksError } = await adminDb
        .from('student_parents')
        .select('parent_id, student_id')
        .in('student_id', studentIds);

      if (linksError) throw linksError;

      for (const link of links ?? []) {
        const student = studentById[link.student_id];
        if (!student) continue;

        const { data: existing, error: existingError } = await adminDb
          .from('parent_notifications')
          .select('id')
          .eq('parent_id', link.parent_id)
          .eq('student_id', link.student_id)
          .eq('kind', WEEKLY_REPORT_KIND)
          .eq('week_index', weekIndex)
          .maybeSingle();

        if (existingError) throw existingError;
        if (existing) {
          skipped += 1;
          summaries.push({
            schoolId: school.id,
            parentId: link.parent_id,
            studentId: link.student_id,
            skipped: 'already-notified',
          });
          continue;
        }

        const hasActivity = await studentHasWeekActivity(adminDb, student, range);
        if (!hasActivity) {
          skipped += 1;
          summaries.push({
            schoolId: school.id,
            parentId: link.parent_id,
            studentId: link.student_id,
            skipped: 'no-activity',
          });
          continue;
        }

        const title = weeklyReportTitle();
        const body = weeklyReportBody(student.full_name, weekLabel);
        const summary = {
          schoolId: school.id,
          parentId: link.parent_id,
          studentId: link.student_id,
          studentName: student.full_name,
          title,
          body,
        };

        if (dryRun) {
          summaries.push({ ...summary, dryRun: true });
          continue;
        }

        const { data: notification, error: insertError } = await adminDb
          .from('parent_notifications')
          .insert({
            school_id: school.id,
            parent_id: link.parent_id,
            student_id: link.student_id,
            kind: WEEKLY_REPORT_KIND,
            week_index: weekIndex,
            title,
            body,
          })
          .select('id')
          .single();

        if (insertError) throw insertError;
        inserted += 1;

        const subscriptionRows = await fetchSubscriptionRows(adminDb, {
          targetType: 'student',
          targetId: link.student_id,
          studentIds: [link.student_id],
        });

        const items = buildPushItems(subscriptionRows, {
          body: weeklyReportPushBody(student.full_name),
          url: '/?tab=home',
          tag: `weekly-report-${weekIndex}-${link.student_id}`,
        });

        if (!items.length) {
          summaries.push({ ...summary, notificationId: notification.id, push: 'no-subscriptions' });
          continue;
        }

        const tenant = await fetchSchoolBrandingById(school.id);
        const origin = getRequestOrigin(req) ?? process.env.APP_ORIGIN ?? null;
        const pushIcon = buildPushIconUrl(origin, tenant);

        const pushResult = await sendWebPushItems(items, {
          title: tenant.name,
          icon: pushIcon,
          tag: `weekly-report-${weekIndex}-${link.student_id}`,
        });

        sent += pushResult.sent;
        failed += pushResult.failed;

        if (pushResult.sent > 0) {
          await adminDb
            .from('parent_notifications')
            .update({ push_sent_at: new Date().toISOString() })
            .eq('id', notification.id);
        }

        summaries.push({
          ...summary,
          notificationId: notification.id,
          pushSent: pushResult.sent,
          pushFailed: pushResult.failed,
        });
      }
    }

    return res.status(200).json({
      today,
      weekIndex,
      weekLabel,
      dryRun,
      inserted,
      sent,
      failed,
      skipped,
      notifications: summaries,
    });
  } catch (error) {
    console.error('cron-weekly-report-notify error:', error);
    return res.status(500).json({ error: error.message ?? 'Internal server error' });
  }
}
