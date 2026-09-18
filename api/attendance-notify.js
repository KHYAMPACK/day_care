import { istanbulDateIso } from '../src/lib/calendar.js';
import {
  buildPushItems,
  fetchSubscriptionRows,
  getSupabaseAdmin,
  sendWebPushItems,
} from './_lib/webPush.js';
import { buildPushIconUrl, fetchSchoolBrandingById, getRequestOrigin } from './_lib/tenant.js';

const ATTENDANCE_KIND = 'attendance_first_lesson';

function childFirstName(fullName) {
  return fullName?.trim().split(/\s+/)[0] ?? 'Çocuğunuz';
}

function attendanceTitle(status) {
  return status === 'absent' ? 'Bugün okula gelmedi' : 'Bugün okula geldi';
}

function attendanceBody(childName, status) {
  const name = childFirstName(childName);
  return status === 'absent' ? `${name} bugün ilk derse gelmedi.` : `${name} bugün ilk derse geldi.`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { schoolId, source, sessionId } = req.body ?? {};
  if (!schoolId || !sessionId || (source !== 'atlas' && source !== 'classic')) {
    return res.status(400).json({ error: 'schoolId, source and sessionId required' });
  }

  try {
    const { adminDb } = getSupabaseAdmin();
    const today = istanbulDateIso();

    let classId;
    let sessionDate;
    let records;

    if (source === 'atlas') {
      const { data: session, error: sessionError } = await adminDb
        .from('lesson_sessions')
        .select('id, school_id, class_id, session_date, slot_index')
        .eq('id', sessionId)
        .maybeSingle();
      if (sessionError) throw sessionError;
      if (!session || session.school_id !== schoolId) {
        return res.status(404).json({ error: 'Session not found' });
      }
      if (session.slot_index !== 1) {
        return res.status(200).json({ skipped: 'not_first_slot' });
      }

      classId = session.class_id;
      sessionDate = session.session_date;

      const { data: attendanceRows, error: attendanceError } = await adminDb
        .from('lesson_attendance')
        .select('student_id, status')
        .eq('session_id', sessionId);
      if (attendanceError) throw attendanceError;
      records = attendanceRows ?? [];
    } else {
      const { data: session, error: sessionError } = await adminDb
        .from('attendance_sessions')
        .select('id, school_id, class_id, taken_on, created_at')
        .eq('id', sessionId)
        .maybeSingle();
      if (sessionError) throw sessionError;
      if (!session || session.school_id !== schoolId) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const { count: earlierCount, error: earlierError } = await adminDb
        .from('attendance_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('class_id', session.class_id)
        .eq('taken_on', session.taken_on)
        .lt('created_at', session.created_at);
      if (earlierError) throw earlierError;
      if ((earlierCount ?? 0) > 0) {
        return res.status(200).json({ skipped: 'not_first_of_day' });
      }

      classId = session.class_id;
      sessionDate = session.taken_on;

      const { data: attendanceRows, error: attendanceError } = await adminDb
        .from('attendance_records')
        .select('student_id, status')
        .eq('session_id', sessionId);
      if (attendanceError) throw attendanceError;
      records = attendanceRows ?? [];
    }

    if (sessionDate !== today) {
      return res.status(200).json({ skipped: 'not_live' });
    }

    if (!records.length) {
      return res.status(200).json({ inserted: 0, sent: 0, message: 'No attendance records' });
    }

    const studentIds = [...new Set(records.map((row) => row.student_id))];
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

    const statusByStudent = Object.fromEntries(records.map((row) => [row.student_id, row.status]));

    const tenant = await fetchSchoolBrandingById(schoolId);
    const origin = getRequestOrigin(req) ?? process.env.APP_ORIGIN ?? null;
    const pushIcon = buildPushIconUrl(origin, tenant);

    let inserted = 0;
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const link of parentLinks ?? []) {
      const student = studentById[link.student_id];
      const status = statusByStudent[link.student_id];
      if (!student || !status) continue;

      const { data: existing, error: existingError } = await adminDb
        .from('parent_notifications')
        .select('id')
        .eq('parent_id', link.parent_id)
        .eq('student_id', link.student_id)
        .eq('kind', ATTENDANCE_KIND)
        .eq('session_date', sessionDate)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        skipped += 1;
        continue;
      }

      const title = attendanceTitle(status);
      const body = attendanceBody(student.full_name, status);

      const { data: notification, error: insertError } = await adminDb
        .from('parent_notifications')
        .insert({
          school_id: schoolId,
          parent_id: link.parent_id,
          student_id: link.student_id,
          kind: ATTENDANCE_KIND,
          session_date: sessionDate,
          week_index: null,
          title,
          body,
        })
        .select('id')
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          skipped += 1;
          continue;
        }
        throw insertError;
      }
      inserted += 1;

      const subscriptionRows = await fetchSubscriptionRows(adminDb, {
        targetType: 'student',
        targetId: link.student_id,
        studentIds: [link.student_id],
      });

      const items = buildPushItems(subscriptionRows, {
        body,
        url: '/?tab=home',
        tag: `attendance-first-lesson-${sessionDate}-${link.student_id}`,
      });

      if (!items.length) continue;

      const pushResult = await sendWebPushItems(items, {
        title: tenant.name,
        icon: pushIcon,
        tag: `attendance-first-lesson-${sessionDate}-${link.student_id}`,
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

    return res.status(200).json({ inserted, sent, failed, skipped, classId, sessionDate });
  } catch (error) {
    console.error('attendance-notify error:', error);
    return res.status(500).json({ error: error.message ?? 'Internal server error' });
  }
}
