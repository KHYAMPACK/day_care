import { readExamDemoConfig } from './examDemoConfig';

const FEATURE_KEYS = [
  'exam_show_common',
  'exam_show_mock',
  'exam_results',
  'exam_mock_results',
  'exam_common_results',
  'exam_detailed_entry',
];

export function resolveExamConfig(school) {
  const features = school?.features ?? {};
  const hasServerFlags = FEATURE_KEYS.some((key) => key in features);

  if (hasServerFlags) {
    return {
      showCommonExams: features.exam_show_common !== false,
      showMockExams: features.exam_show_mock !== false,
      storeResults: Boolean(features.exam_results),
      storeMockResults: features.exam_mock_results !== false,
      storeCommonResults: Boolean(features.exam_common_results),
      detailedEntry: features.exam_detailed_entry !== false,
    };
  }

  return readExamDemoConfig();
}

export function examFeaturesPatch(config) {
  return {
    exam_show_common: config.showCommonExams,
    exam_show_mock: config.showMockExams,
    exam_results: config.storeResults,
    exam_mock_results: config.storeMockResults,
    exam_common_results: config.storeCommonResults,
    exam_detailed_entry: config.detailedEntry,
  };
}

export async function saveExamFeatures(supabaseClient, schoolId, currentFeatures, config) {
  const nextFeatures = {
    ...(currentFeatures ?? {}),
    ...examFeaturesPatch(config),
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
