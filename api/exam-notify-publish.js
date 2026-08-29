import { getSupabaseAdmin, buildPushItems, fetchSubscriptionRows, sendWebPushItems } from './lib/webPush.js';
import { buildPushIconUrl, fetchSchoolBrandingById, getRequestOrigin } from './lib/tenant.js';

const EXAM_KIND = 'exam_results_published';

function childFirstName(fullName) {
  return fullName?.trim().split(/\s+/)[0] ?? 'Çocuğunuz';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionId, schoolId } = req.body ?? {};
  if (!sessionId || !schoolId) {
    return res.status(400).json({ error: 'sessionId and schoolId required' });
  }

  try {
    const { adminDb } = getSupabaseAdmin();

    const { data: session, error: sessionError } = await adminDb
      .from('exam_sessions')
      .select('id, title, held_on, school_id, published_at')
      .eq('id', sessionId)
      .eq('school_id', schoolId)
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session?.published_at) {
      return res.status(400).json({ error: 'Session is not published' });
    }

    const { data: resultRows, error: resultsError } = await adminDb
      .from('exam_session_rankings')
      .select('student_id')
      .eq('session_id', sessionId);

    if (resultsError) throw resultsError;

    const studentIds = [...new Set((resultRows ?? []).map((r) => r.student_id))];
    if (!studentIds.length) {
      return res.status(200).json({ inserted: 0, sent: 0, message: 'No results to notify' });
    }

    const { data: students, error: studentsError } = await adminDb
      .from('students')
      .select('id, full_name')
      .in('id', studentIds);
    if (studentsError) throw studentsError;

    const studentById = Object.fromEntries((students ?? []).map((s) => [s.id, s]));

    const { data: links, error: linksError } = await adminDb
      .from('student_parents')
      .select('parent_id, student_id')
      .in('student_id', studentIds);
    if (linksError) throw linksError;

    const tenant = await fetchSchoolBrandingById(schoolId);
    const origin = getRequestOrigin(req) ?? process.env.APP_ORIGIN ?? null;
    const pushIcon = buildPushIconUrl(origin, tenant);

    let inserted = 0;
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const link of links ?? []) {
      const student = studentById[link.student_id];
      if (!student) continue;

      const { data: existing } = await adminDb
        .from('parent_notifications')
        .select('id')
        .eq('parent_id', link.parent_id)
        .eq('student_id', link.student_id)
        .eq('kind', EXAM_KIND)
        .eq('exam_session_id', sessionId)
        .maybeSingle();

      if (existing) {
        skipped += 1;
        continue;
      }

      const title = 'Deneme sonuçları açıklandı';
      const body = `${childFirstName(student.full_name)} için ${session.title} sonuçları yayınlandı.`;

      const { data: notification, error: insertError } = await adminDb
        .from('parent_notifications')
        .insert({
          school_id: schoolId,
          parent_id: link.parent_id,
          student_id: link.student_id,
          kind: EXAM_KIND,
          exam_session_id: sessionId,
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
        url: '/?tab=exams',
        tag: `exam-results-${sessionId}-${link.student_id}`,
      });

      if (items.length) {
        const pushResult = await sendWebPushItems(items, {
          title: tenant.name,
          icon: pushIcon,
          tag: `exam-results-${sessionId}-${link.student_id}`,
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

    return res.status(200).json({ inserted, sent, failed, skipped, sessionId });
  } catch (error) {
    console.error('exam-notify-publish error:', error);
    return res.status(500).json({ error: error.message ?? 'Internal server error' });
  }
}
