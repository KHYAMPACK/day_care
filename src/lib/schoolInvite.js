import { supabase } from './supabase';

export const INVALID_SCHOOL_CODE_MESSAGE =
  'Geçersiz okul kodu. Lütfen okul yönetiminizden doğru kodu isteyin.';

export function normalizeSchoolCode(value) {
  return value.trim().toUpperCase();
}

export async function resolveSchoolIdByCode(schoolCode) {
  const normalized = normalizeSchoolCode(schoolCode);
  if (!normalized) {
    return null;
  }

  const { data, error } = await supabase.rpc('resolve_school_id_by_code', {
    p_code: normalized,
  });

  if (error) {
    throw error;
  }

  return data ?? null;
}
