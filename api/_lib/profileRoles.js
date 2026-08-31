const PROFILE_ROLES_MISSING = /profile_roles|schema cache/i;

export async function getProfileRoles(adminDb, profileId) {
  const { data, error } = await adminDb
    .from('profile_roles')
    .select('role')
    .eq('profile_id', profileId);

  if (!error && (data ?? []).length) {
    return data.map((row) => row.role);
  }

  if (error && !PROFILE_ROLES_MISSING.test(error.message ?? '')) {
    throw error;
  }

  const { data: profile, error: profileError } = await adminDb
    .from('profiles')
    .select('role')
    .eq('id', profileId)
    .maybeSingle();

  if (profileError) throw profileError;
  return profile?.role ? [profile.role] : [];
}

export async function profileHasRoleServer(adminDb, profileId, role) {
  const roles = await getProfileRoles(adminDb, profileId);
  return roles.includes(role);
}

export async function insertProfileRole(adminDb, profileId, role) {
  const { error } = await adminDb
    .from('profile_roles')
    .upsert({ profile_id: profileId, role }, { onConflict: 'profile_id,role' });

  if (error && !PROFILE_ROLES_MISSING.test(error.message ?? '')) {
    throw error;
  }
}

export async function removeProfileRole(adminDb, profileId, role) {
  const { error } = await adminDb
    .from('profile_roles')
    .delete()
    .eq('profile_id', profileId)
    .eq('role', role);

  if (error && !PROFILE_ROLES_MISSING.test(error.message ?? '')) {
    throw error;
  }
}
