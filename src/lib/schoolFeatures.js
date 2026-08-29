export function hasAtlasSchedule(school) {
  return Boolean(school?.features?.atlas_schedule);
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
