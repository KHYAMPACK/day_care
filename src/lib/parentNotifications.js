import { supabase } from './supabase';
import { formatWeekRangeTr } from './curriculum';
import { reportWeekIndex } from './weeklyReport';

export const PARENT_NOTIFICATION_SELECT = `
  id,
  school_id,
  parent_id,
  student_id,
  kind,
  week_index,
  exam_session_id,
  homework_assignment_id,
  tuition_cycle_id,
  title,
  body,
  read_at,
  push_sent_at,
  created_at,
  students ( full_name )
`;

export function getDemoParentNotifications(students = []) {
  const weekIndex = reportWeekIndex() ?? 1;
  const weekLabel = formatWeekRangeTr(weekIndex) ?? 'Bu hafta';

  return students.slice(0, 2).map((student, index) => {
    const firstName = student.full_name?.trim().split(/\s+/)[0] ?? 'Çocuğunuz';
    return {
      id: `demo-parent-notification-${index + 1}`,
      school_id: null,
      parent_id: null,
      student_id: student.id,
      kind: 'weekly_report',
      week_index: weekIndex,
      title: 'Haftalık özet hazır',
      body: `${firstName} için ${weekLabel} haftalık özeti hazır.`,
      read_at: null,
      push_sent_at: null,
      created_at: new Date().toISOString(),
      students: { full_name: student.full_name },
      isDemo: true,
    };
  });
}

export async function loadParentNotifications(parentId) {
  const { data, error } = await supabase
    .from('parent_notifications')
    .select(PARENT_NOTIFICATION_SELECT)
    .eq('parent_id', parentId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) throw error;
  return data ?? [];
}

export async function markParentNotificationRead(notificationId) {
  const { error } = await supabase
    .from('parent_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId);

  if (error) throw error;
}

export async function markAllParentNotificationsRead(parentId) {
  const { error } = await supabase
    .from('parent_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('parent_id', parentId)
    .is('read_at', null);

  if (error) throw error;
}

export function isMissingParentNotificationsTable(error) {
  const message = error?.message ?? '';
  return /parent_notifications|schema cache|does not exist/i.test(message);
}
