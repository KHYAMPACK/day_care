export function resolveStaffActorRole(roles = []) {
  const roleList = Array.isArray(roles) ? roles : [roles];
  if (roleList.includes('director')) return 'director';
  if (roleList.includes('counselor')) return 'counselor';
  if (roleList.includes('teacher')) return 'teacher';
  return 'director';
}

export async function logSchoolActivityServer(
  adminDb,
  {
    schoolId,
    actorId,
    actorRole,
    category,
    action,
    summary,
    targetType,
    targetId,
    metadata,
  }
) {
  if (!schoolId || !summary?.trim()) return null;

  const { error } = await adminDb.from('school_activity_logs').insert({
    school_id: schoolId,
    actor_id: actorId ?? null,
    actor_role: actorRole ?? 'director',
    category,
    action,
    summary: summary.trim(),
    target_type: targetType ?? null,
    target_id: targetId ?? null,
    metadata: metadata ?? {},
  });

  if (error) {
    console.warn('activity log insert failed:', error.message);
    return null;
  }

  return true;
}
