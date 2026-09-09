import { deriveAcademicWeeksFromCalendar } from './curriculum.js';

export function hasAtlasSchedule(school) {
  if (Boolean(school?.features?.atlas_schedule)) return true;
  // Atlas VIP was created without the flag, so Şube Atama stayed in the müdür nav.
  return /atlas vip/i.test(school?.name ?? '');
}

export function hasAccounting(school) {
  return Boolean(school?.features?.accounting);
}

export function hasExamResults(school) {
  return Boolean(school?.features?.exam_results);
}

export function hasExamImport(school) {
  return Boolean(school?.features?.exam_import);
}

export function hasExamDetailedEntry(school) {
  return school?.features?.exam_detailed_entry !== false;
}

export function hasHomeworkTracking(school) {
  return Boolean(school?.features?.homework_tracking);
}

export const DEFAULT_ACADEMIC_WEEKS = 52;
export const MIN_ACADEMIC_WEEKS = 1;
export const MAX_ACADEMIC_WEEKS = 52;

export function clampAcademicWeeks(value, fallback = DEFAULT_ACADEMIC_WEEKS) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(MIN_ACADEMIC_WEEKS, Math.min(MAX_ACADEMIC_WEEKS, parsed));
}

export function getAcademicWeeks(school) {
  return clampAcademicWeeks(school?.features?.academic_weeks);
}

/** Stored week count, or Atlas calendar school_end when unset. */
export function resolveAcademicWeeks(school, calendarEvents, { atlasSchedule = false } = {}) {
  if (school?.features?.academic_weeks != null) {
    return clampAcademicWeeks(school.features.academic_weeks);
  }
  if (atlasSchedule && calendarEvents?.length) {
    return clampAcademicWeeks(deriveAcademicWeeksFromCalendar(calendarEvents));
  }
  return DEFAULT_ACADEMIC_WEEKS;
}

export async function saveAcademicWeeks(supabaseClient, schoolId, currentFeatures, weeks) {
  return saveSchoolFeature(supabaseClient, schoolId, currentFeatures, {
    academic_weeks: clampAcademicWeeks(weeks),
  });
}

export async function saveSchoolFeature(supabaseClient, schoolId, currentFeatures, patch) {
  const nextFeatures = {
    ...(currentFeatures ?? {}),
    ...patch,
  };
  const { data, error } = await supabaseClient
    .from('schools')
    .update({ features: nextFeatures })
    .eq('id', schoolId)
    .select('features')
    .single();
  if (error) throw error;
  return data?.features ?? nextFeatures;
}
