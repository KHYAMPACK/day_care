/**
 * Applies a strict school tenant filter to a Supabase query builder.
 * Returns the query unchanged when schoolId is missing (caller should guard first).
 */
export function withSchoolFilter(query, schoolId) {
  if (!schoolId) return query;
  return query.eq('school_id', schoolId);
}

export function requireSchoolId(schoolId) {
  if (!schoolId) {
    throw new Error('Okul bilgisi yüklenemedi. Lütfen sayfayı yenileyin.');
  }
  return schoolId;
}
