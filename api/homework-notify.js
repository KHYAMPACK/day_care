import { getSupabaseAdmin, buildPushItems, fetchSubscriptionRows, sendWebPushItems } from './_lib/webPush.js';
import { buildPushIconUrl, fetchSchoolBrandingById, getRequestOrigin } from './_lib/tenant.js';

const HOMEWORK_KIND = 'homework_assigned';

function childFirstName(fullName) {
  return fullName?.trim().split(/\s+/)[0] ?? 'Çocuğunuz';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { assignmentId, schoolId } = req.body ?? {};
  if (!assignmentId || !schoolId) {
    return res.status(400).json({ error: 'assignmentId and schoolId required' });
  }

  try {
    const { adminDb } = getSupabaseAdmin();

    const { data: assignment, error: assignmentError } = await adminDb
      .from('homework_assignments')
      .select('id, school_id, due_on, notes, book_id, homework_books ( title )')
      .eq('id', assignmentId)
      .eq('school_id', schoolId)
      .maybeSingle();

    if (assignmentError) throw assignmentError;
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const { data: links, error: linkError } = await adminDb
      .from('homework_assignment_students')
      .select('student_id')
      .eq('assignment_id', assignmentId);
    if (linkError) throw linkError;

    const studentIds = [...new Set((links ?? []).map((row) => row.student_id))];
    if (!studentIds.length) {
      return res.status(200).json({ inserted: 0, sent: 0, message: 'No students to notify' });
    }

    const { data: students, error: studentsError } = await adminDb
      .from('students')
      .select('id, full_name')
      .in('id', studentIds);
    if (studentsError) throw studentsError;
    const studentById = Object.fromEntries((students ?? []).map((row) => [row.id, row]));

    const { data: parentLinks, error: parentError } = await adminDb
      .from('student_parents')
      .select('parent_id, student_id')
      .in('student_id', studentIds);
    if (parentError) throw parentError;

    const tenant = await fetchSchoolBrandingById(schoolId);
    const origin = getRequestOrigin(req) ?? process.env.APP_ORIGIN ?? null;
    const pushIcon = buildPushIconUrl(origin, tenant);
    const bookTitle = assignment.homework_books?.title ?? 'Kaynak kitabı';

    let inserted = 0;
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const link of parentLinks ?? []) {
      const student = studentById[link.student_id];
      if (!student) continue;

      const { data: existing } = await adminDb
        .from('parent_notifications')
        .select('id')
        .eq('parent_id', link.parent_id)
        .eq('student_id', link.student_id)
        .eq('kind', HOMEWORK_KIND)
        .eq('homework_assignment_id', assignmentId)
        .maybeSingle();

      if (existing) {
        skipped += 1;
        continue;
      }

      const title = 'Yeni ödev atandı';
      const body = `${childFirstName(student.full_name)} için ${bookTitle} ödevi eklendi.`;

      const { data: notification, error: insertError } = await adminDb
        .from('parent_notifications')
        .insert({
          school_id: schoolId,
          parent_id: link.parent_id,
          student_id: link.student_id,
          kind: HOMEWORK_KIND,
          homework_assignment_id: assignmentId,
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
        targetId: link.student_id,
        studentIds: [link.student_id],
      });

      const items = buildPushItems(subscriptionRows, {
        body,
        url: '/?tab=homework',
        tag: `homework-${assignmentId}-${link.student_id}`,
      });

      if (items.length) {
        const pushResult = await sendWebPushItems(items, {
          title: tenant.name,
          icon: pushIcon,
          tag: `homework-${assignmentId}-${link.student_id}`,
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
    }

    return res.status(200).json({ inserted, sent, failed, skipped, assignmentId });
  } catch (error) {
    console.error('homework-notify error:', error);
    return res.status(500).json({ error: error.message ?? 'Internal server error' });
  }
}
