import { withSchoolFilter, requireSchoolId } from './tenant';

export const ACTIVITY_LOG_SELECT =
  'id, school_id, actor_id, actor_role, category, action, summary, target_type, target_id, metadata, created_at, profiles ( full_name, email )';

export const ACTIVITY_CATEGORIES = [
  'message',
  'announcement',
  'attendance',
  'calendar',
  'student',
  'staff',
  'exam',
  'homework',
  'accounting',
  'curriculum',
  'atlas',
  'alert',
];

export const ACTIVITY_CATEGORY_LABELS = {
  message: 'Mesaj',
  announcement: 'Duyuru',
  attendance: 'Yoklama',
  calendar: 'Takvim',
  student: 'Öğrenci',
  staff: 'Personel',
  exam: 'Sınav',
  homework: 'Ödev',
  accounting: 'Muhasebe',
  curriculum: 'Müfredat',
  atlas: 'Atlas',
  alert: 'Uyarı',
};

export const ACTIVITY_ROLE_LABELS = {
  director: 'Müdür',
  teacher: 'Öğretmen',
  counselor: 'Rehber',
  system: 'Sistem',
};

export const ACTIVITY_DATE_RANGES = [
  { id: 'today', label: 'Bugün' },
  { id: '7d', label: 'Son 7 gün' },
  { id: '30d', label: 'Son 30 gün' },
  { id: 'all', label: 'Tümü' },
];

export function isActivityLogSchemaMissing(error) {
  const message = error?.message ?? '';
  const code = error?.code ?? '';
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    /school_activity_logs|schema cache|does not exist|404/i.test(message)
  );
}

export function activityLogSchemaMissingError() {
  return new Error(
    'Kayıt tablosu veritabanında yok. Supabase SQL editöründe 043_school_activity_logs.sql migration dosyasını çalıştırın.'
  );
}

export function resolveActorRole(profile) {
  const roles = profile?.profile_roles?.map((row) => row.role) ?? [];
  if (roles.includes('director')) return 'director';
  if (roles.includes('counselor')) return 'counselor';
  if (roles.includes('teacher')) return 'teacher';
  if (profile?.role === 'director') return 'director';
  if (profile?.role === 'counselor') return 'counselor';
  if (profile?.role === 'teacher') return 'teacher';
  return 'teacher';
}

function getDateRangeStart(dateRange) {
  if (dateRange === 'all') return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (dateRange === '7d') {
    start.setDate(start.getDate() - 6);
  } else if (dateRange === '30d') {
    start.setDate(start.getDate() - 29);
  }
  return start.toISOString();
}

export function isDefaultActivityFilters(filters = {}) {
  return (
    (filters.dateRange ?? '7d') === '7d' &&
    !filters.category &&
    !filters.actorRole &&
    !String(filters.searchQuery ?? '').trim()
  );
}

export function filterActivityLogs(rows, filters = {}) {
  const {
    dateRange = '7d',
    category = '',
    actorRole = '',
    searchQuery = '',
  } = filters;

  const rangeStart = getDateRangeStart(dateRange);
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase('tr');

  return rows.filter((row) => {
    if (rangeStart && row.created_at < rangeStart) return false;
    if (category && row.category !== category) return false;
    if (actorRole && row.actor_role !== actorRole) return false;
    if (!normalizedSearch) return true;

    const actorName = row.profiles?.full_name ?? row.profiles?.email ?? '';
    const haystack = [row.summary, actorName, ACTIVITY_CATEGORY_LABELS[row.category] ?? row.category]
      .join(' ')
      .toLocaleLowerCase('tr');
    return haystack.includes(normalizedSearch);
  });
}

export async function logSchoolActivity(
  supabase,
  profile,
  { schoolId, category, action, summary, targetType, targetId, metadata, actorRole }
) {
  requireSchoolId(schoolId);
  if (!summary?.trim()) return null;

  const row = {
    school_id: schoolId,
    actor_id: profile?.id ?? null,
    actor_role: actorRole ?? resolveActorRole(profile),
    category,
    action,
    summary: summary.trim(),
    target_type: targetType ?? null,
    target_id: targetId ?? null,
    metadata: metadata ?? {},
  };

  const { data, error } = await supabase.from('school_activity_logs').insert(row).select('id').single();
  if (error) {
    if (isActivityLogSchemaMissing(error)) throw activityLogSchemaMissingError();
    throw error;
  }
  return data;
}

let activityLogTableMissing = false;

export function recordSchoolActivity(supabase, profile, payload) {
  if (activityLogTableMissing) return;

  void logSchoolActivity(supabase, profile, payload).catch((error) => {
    if (isActivityLogSchemaMissing(error)) {
      activityLogTableMissing = true;
    }
  });
}

export async function loadSchoolActivityLogs(supabase, schoolId, filters = {}) {
  requireSchoolId(schoolId);

  const { dateRange = '7d', category = '', limit = 200 } = filters;
  const rangeStart = getDateRangeStart(dateRange);

  let query = supabase
    .from('school_activity_logs')
    .select(ACTIVITY_LOG_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);

  query = withSchoolFilter(query, schoolId);

  if (rangeStart) {
    query = query.gte('created_at', rangeStart);
  }
  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error) {
    if (isActivityLogSchemaMissing(error)) throw activityLogSchemaMissingError();
    throw error;
  }

  return data ?? [];
}

export function formatActivityLogTime(iso) {
  return new Date(iso).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatActivityActor(row) {
  return row.profiles?.full_name ?? row.profiles?.email ?? 'Bilinmiyor';
}
