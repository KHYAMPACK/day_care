import { supabase } from './supabase';
import { withSchoolFilter, requireSchoolId } from './tenant';
import { formatCurrency } from './accounting';

export { formatCurrency };

export const TUITION_STATUSES = ['pending', 'paid', 'overdue'];

export const TUITION_STATUS_LABELS = {
  pending: 'Bekliyor',
  paid: 'Ödendi',
  overdue: 'Gecikmiş',
};

export const TUITION_REMINDER_KIND = 'tuition_reminder';
export const TUITION_OVERDUE_KIND = 'tuition_overdue';
export const TUITION_REMINDER_DAYS = 3;

export const BILLING_SELECT =
  'id, school_id, student_id, monthly_amount, billing_start_date, is_active, created_at, updated_at, students ( id, full_name, class_id, classes ( grade, name ) )';

export const CYCLE_SELECT = `
  id, school_id, student_id, period_start, period_end, due_date, amount, status,
  paid_at, recorded_by, reminder_sent_at, overdue_notified_at, created_at, updated_at,
  students ( id, full_name, class_id, classes ( grade, name ) )
`;

function parseIsoDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addMonthsPreserveDay(date, months) {
  const anchorDay = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(anchorDay, lastDay));
  return target;
}

export function addDaysIso(iso, days) {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

export function computeCycleForDate(billingStartDate, referenceDate) {
  const billingStart = parseIsoDate(billingStartDate);
  const reference = parseIsoDate(referenceDate);

  if (reference < billingStart) {
    const periodEnd = addMonthsPreserveDay(billingStart, 1);
    return {
      periodStart: billingStartDate,
      periodEnd: toIsoDate(periodEnd),
      dueDate: toIsoDate(periodEnd),
    };
  }

  let periodStart = billingStart;
  while (true) {
    const periodEnd = addMonthsPreserveDay(periodStart, 1);
    const periodStartIso = toIsoDate(periodStart);
    const periodEndIso = toIsoDate(periodEnd);

    if (reference >= periodStart && reference <= periodEnd) {
      return {
        periodStart: periodStartIso,
        periodEnd: periodEndIso,
        dueDate: periodEndIso,
      };
    }

    if (reference < periodStart) {
      return {
        periodStart: periodStartIso,
        periodEnd: periodEndIso,
        dueDate: periodEndIso,
      };
    }

    periodStart = periodEnd;
  }
}

export function formatTuitionPeriodTr(periodStart, periodEnd) {
  const formatter = new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'short',
  });
  const start = formatter.format(parseIsoDate(periodStart));
  const end = formatter.format(parseIsoDate(periodEnd));
  return `${start} – ${end}`;
}

export function formatTuitionDueDate(dueDate) {
  if (!dueDate) return '—';
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parseIsoDate(dueDate));
}

export async function loadSchoolStudents(schoolId) {
  requireSchoolId(schoolId);
  const { data, error } = await withSchoolFilter(
    supabase
      .from('students')
      .select('id, full_name, class_id, classes ( grade, name )')
      .order('full_name'),
    schoolId
  );
  if (error) throw error;
  return data ?? [];
}

export async function loadStudentBilling(schoolId) {
  requireSchoolId(schoolId);
  const { data, error } = await withSchoolFilter(
    supabase.from('accounting_student_billing').select(BILLING_SELECT).order('created_at'),
    schoolId
  );
  if (error) throw error;
  return data ?? [];
}

export async function saveStudentBilling(schoolId, payload) {
  requireSchoolId(schoolId);
  const amount = Number(payload.monthly_amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Geçerli bir aylık tutar girin.');
  }
  if (!payload.student_id) throw new Error('Öğrenci seçin.');
  if (!payload.billing_start_date) throw new Error('Başlangıç tarihi gerekli.');

  const row = {
    school_id: schoolId,
    student_id: payload.student_id,
    monthly_amount: amount,
    billing_start_date: payload.billing_start_date,
    is_active: payload.is_active !== false,
  };

  if (payload.id) {
    const { data, error } = await withSchoolFilter(
      supabase
        .from('accounting_student_billing')
        .update(row)
        .eq('id', payload.id)
        .select(BILLING_SELECT)
        .single(),
      schoolId
    );
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('accounting_student_billing')
    .upsert(row, { onConflict: 'student_id' })
    .select(BILLING_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function loadTuitionCycles(schoolId, { status, studentId } = {}) {
  requireSchoolId(schoolId);
  let query = supabase
    .from('accounting_tuition_cycles')
    .select(CYCLE_SELECT)
    .order('due_date', { ascending: false });

  if (status) query = query.eq('status', status);
  if (studentId) query = query.eq('student_id', studentId);

  const { data, error } = await withSchoolFilter(query, schoolId);
  if (error) throw error;
  return data ?? [];
}

export async function ensureCurrentCycle(schoolId, billing, referenceDate) {
  requireSchoolId(schoolId);
  if (!billing?.is_active) return null;

  const { periodStart, periodEnd, dueDate } = computeCycleForDate(
    billing.billing_start_date,
    referenceDate
  );

  const row = {
    school_id: schoolId,
    student_id: billing.student_id,
    period_start: periodStart,
    period_end: periodEnd,
    due_date: dueDate,
    amount: Number(billing.monthly_amount),
    status: 'pending',
  };

  const { data: existing, error: existingError } = await withSchoolFilter(
    supabase
      .from('accounting_tuition_cycles')
      .select(CYCLE_SELECT)
      .eq('student_id', billing.student_id)
      .eq('due_date', dueDate)
      .maybeSingle(),
    schoolId
  );
  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from('accounting_tuition_cycles')
    .insert(row)
    .select(CYCLE_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function markCyclePaid(schoolId, cycleId, directorId) {
  requireSchoolId(schoolId);
  const { data, error } = await withSchoolFilter(
    supabase
      .from('accounting_tuition_cycles')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        recorded_by: directorId ?? null,
      })
      .eq('id', cycleId)
      .select(CYCLE_SELECT)
      .single(),
    schoolId
  );
  if (error) throw error;
  return data;
}

export async function loadParentTuitionStatus(parentId) {
  if (!parentId) return [];

  const { data: links, error: linkError } = await supabase
    .from('student_parents')
    .select('student_id')
    .eq('parent_id', parentId);
  if (linkError) throw linkError;

  const studentIds = [...new Set((links ?? []).map((row) => row.student_id))];
  if (!studentIds.length) return [];

  const { data, error } = await supabase
    .from('accounting_tuition_cycles')
    .select(CYCLE_SELECT)
    .in('student_id', studentIds)
    .order('due_date', { ascending: false });
  if (error) throw error;

  const latestByStudent = new Map();
  for (const row of data ?? []) {
    if (!latestByStudent.has(row.student_id)) {
      latestByStudent.set(row.student_id, row);
    }
  }
  return [...latestByStudent.values()];
}

export function summarizeTuitionCollected(cycles = []) {
  const paid = cycles.filter((row) => row.status === 'paid');
  return {
    totalCollected: paid.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    paidCount: paid.length,
    pendingCount: cycles.filter((row) => row.status === 'pending').length,
    overdueCount: cycles.filter((row) => row.status === 'overdue').length,
  };
}

export function tuitionReminderDate(dueDate) {
  return addDaysIso(dueDate, -TUITION_REMINDER_DAYS);
}

export function childFirstName(fullName) {
  return fullName?.trim().split(/\s+/)[0] ?? 'Çocuğunuz';
}

export function tuitionReminderTitle() {
  return 'Ödeme hatırlatması';
}

export function tuitionReminderBody(studentName, dueDate, amount) {
  const name = childFirstName(studentName);
  return `${name} için ${formatTuitionDueDate(dueDate)} vadeli ${formatCurrency(amount)} ödeme 3 gün içinde.`;
}

export function tuitionOverdueTitle() {
  return 'Ödeme gecikmesi';
}

export function tuitionOverdueBody(studentName, dueDate, amount) {
  const name = childFirstName(studentName);
  return `${name} için ${formatTuitionDueDate(dueDate)} vadeli ${formatCurrency(amount)} ödeme gecikmiş durumda.`;
}
