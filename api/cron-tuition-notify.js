import { istanbulDateIso } from '../src/lib/calendar.js';
import {
  computeCycleForDate,
  tuitionOverdueBody,
  tuitionOverdueTitle,
  tuitionReminderBody,
  tuitionReminderDate,
  tuitionReminderTitle,
  TUITION_OVERDUE_KIND,
  TUITION_REMINDER_KIND,
} from '../src/lib/tuitionBilling.js';
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

async function ensureCycle(adminDb, billing, today) {
  const { periodStart, periodEnd, dueDate } = computeCycleForDate(
    billing.billing_start_date,
    today
  );

  const { data: existing, error: existingError } = await adminDb
    .from('accounting_tuition_cycles')
    .select('id, status, due_date, amount, reminder_sent_at, overdue_notified_at')
    .eq('student_id', billing.student_id)
    .eq('due_date', dueDate)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await adminDb
    .from('accounting_tuition_cycles')
    .insert({
      school_id: billing.school_id,
      student_id: billing.student_id,
      period_start: periodStart,
      period_end: periodEnd,
      due_date: dueDate,
      amount: Number(billing.monthly_amount),
      status: 'pending',
    })
    .select('id, status, due_date, amount, reminder_sent_at, overdue_notified_at')
    .single();
  if (error) throw error;
  return data;
}

async function notifyParentsForCycle({
  adminDb,
  req,
  schoolId,
  student,
  cycle,
  kind,
  title,
  body,
}) {
  const { data: links, error: linkError } = await adminDb
    .from('student_parents')
    .select('parent_id')
    .eq('student_id', student.id);
  if (linkError) throw linkError;

  let inserted = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const link of links ?? []) {
    const { data: existing, error: existingError } = await adminDb
      .from('parent_notifications')
      .select('id')
      .eq('parent_id', link.parent_id)
      .eq('student_id', student.id)
      .eq('kind', kind)
      .eq('tuition_cycle_id', cycle.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      skipped += 1;
      continue;
    }

    const { data: notification, error: insertError } = await adminDb
      .from('parent_notifications')
      .insert({
        school_id: schoolId,
        parent_id: link.parent_id,
        student_id: student.id,
        kind,
        tuition_cycle_id: cycle.id,
        week_index: null,
        title,
        body,
      })
      .select('id')
      .single();
    if (insertError) throw insertError;
    inserted += 1;

    const subscriptionRows = await fetchSubscriptionRows(adminDb, {
      targetType: 'student',
      targetId: student.id,
      studentIds: [student.id],
    });

    const items = buildPushItems(subscriptionRows, {
      body: title,
      url: '/?tab=home',
      tag: `${kind}-${cycle.id}-${link.parent_id}`,
    });

    if (!items.length) continue;

    const tenant = await fetchSchoolBrandingById(schoolId);
    const origin = getRequestOrigin(req) ?? process.env.APP_ORIGIN ?? null;
    const pushIcon = buildPushIconUrl(origin, tenant);

    const pushResult = await sendWebPushItems(items, {
      title: tenant.name,
      icon: pushIcon,
      tag: `${kind}-${cycle.id}`,
    });

    sent += pushResult.sent;
    failed += pushResult.failed;

    if (pushResult.sent > 0) {
      await adminDb
        .from('parent_notifications')
        .update({ push_sent_at: new Date().toISOString() })
        .eq('id', notification.id);
    }
  }

  return { inserted, sent, failed, skipped };
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

    const { data: billingRows, error: billingError } = await adminDb
      .from('accounting_student_billing')
      .select('id, school_id, student_id, monthly_amount, billing_start_date, is_active')
      .eq('is_active', true);
    if (billingError) throw billingError;

    const summaries = [];
    let reminders = 0;
    let overdue = 0;
    let cyclesEnsured = 0;

    for (const billing of billingRows ?? []) {
      const { data: student, error: studentError } = await adminDb
        .from('students')
        .select('id, full_name, school_id')
        .eq('id', billing.student_id)
        .maybeSingle();
      if (studentError) throw studentError;
      if (!student) continue;

      if (dryRun) {
        const preview = computeCycleForDate(billing.billing_start_date, today);
        summaries.push({
          schoolId: billing.school_id,
          studentId: billing.student_id,
          dueDate: preview.dueDate,
          reminderDate: tuitionReminderDate(preview.dueDate),
          dryRun: true,
        });
        continue;
      }

      const cycle = await ensureCycle(adminDb, billing, today);
      cyclesEnsured += 1;

      if (cycle.status === 'paid') continue;

      const reminderDate = tuitionReminderDate(cycle.due_date);

      if (today === reminderDate && !cycle.reminder_sent_at) {
        const title = tuitionReminderTitle();
        const body = tuitionReminderBody(student.full_name, cycle.due_date, cycle.amount);
        const result = await notifyParentsForCycle({
          adminDb,
          req,
          schoolId: billing.school_id,
          student,
          cycle,
          kind: TUITION_REMINDER_KIND,
          title,
          body,
        });

        await adminDb
          .from('accounting_tuition_cycles')
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq('id', cycle.id);

        reminders += 1;
        summaries.push({
          schoolId: billing.school_id,
          studentId: billing.student_id,
          cycleId: cycle.id,
          type: 'reminder',
          ...result,
        });
      }

      if (today > cycle.due_date) {
        if (cycle.status === 'pending') {
          await adminDb
            .from('accounting_tuition_cycles')
            .update({ status: 'overdue' })
            .eq('id', cycle.id);
        }

        if (!cycle.overdue_notified_at) {
          const title = tuitionOverdueTitle();
          const body = tuitionOverdueBody(student.full_name, cycle.due_date, cycle.amount);
          const result = await notifyParentsForCycle({
            adminDb,
            req,
            schoolId: billing.school_id,
            student,
            cycle,
            kind: TUITION_OVERDUE_KIND,
            title,
            body,
          });

          await adminDb
            .from('accounting_tuition_cycles')
            .update({ overdue_notified_at: new Date().toISOString() })
            .eq('id', cycle.id);

          overdue += 1;
          summaries.push({
            schoolId: billing.school_id,
            studentId: billing.student_id,
            cycleId: cycle.id,
            type: 'overdue',
            ...result,
          });
        }
      }
    }

    return res.status(200).json({
      today,
      dryRun,
      billingCount: billingRows?.length ?? 0,
      cyclesEnsured,
      reminders,
      overdue,
      summaries,
    });
  } catch (error) {
    console.error('cron-tuition-notify failed', error);
    return res.status(500).json({ error: error.message ?? 'Cron failed' });
  }
}
