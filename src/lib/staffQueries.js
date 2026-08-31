import { withSchoolFilter } from './tenant';

const PROFILE_ROLES_MISSING = /profile_roles|schema cache/i;

export async function attachProfileRoles(supabase, profiles) {
  if (!profiles?.length) return profiles ?? [];

  const ids = profiles.map((profile) => profile.id);
  const { data, error } = await supabase
    .from('profile_roles')
    .select('profile_id, role')
    .in('profile_id', ids);

  if (error && !PROFILE_ROLES_MISSING.test(error.message ?? '')) {
    throw error;
  }

  const rolesByProfileId = new Map();
  for (const row of data ?? []) {
    if (!rolesByProfileId.has(row.profile_id)) {
      rolesByProfileId.set(row.profile_id, []);
    }
    rolesByProfileId.get(row.profile_id).push({ role: row.role });
  }

  return profiles.map((profile) => {
    const joinedRoles = rolesByProfileId.get(profile.id);
    if (joinedRoles?.length) {
      return { ...profile, profile_roles: joinedRoles };
    }
    return {
      ...profile,
      profile_roles: profile.role ? [{ role: profile.role }] : [],
    };
  });
}

export async function loadSchoolProfilesByRole({
  supabase,
  schoolId,
  role,
  select,
  orderBy = 'full_name',
}) {
  const joined = await withSchoolFilter(
    supabase
      .from('profiles')
      .select(`${select}, profile_roles!inner(role)`)
      .eq('profile_roles.role', role)
      .order(orderBy),
    schoolId
  );

  if (!joined.error || !PROFILE_ROLES_MISSING.test(joined.error.message ?? '')) {
    if (joined.error) return joined;
    return {
      ...joined,
      data: await attachProfileRoles(supabase, joined.data ?? []),
    };
  }

  return withSchoolFilter(
    supabase.from('profiles').select(select).eq('role', role).order(orderBy),
    schoolId
  );
}

export async function insertProfileRole(adminDb, profileId, role) {
  const { error } = await adminDb
    .from('profile_roles')
    .upsert({ profile_id: profileId, role }, { onConflict: 'profile_id,role' });
  if (error && !PROFILE_ROLES_MISSING.test(error.message ?? '')) throw error;
}

export async function removeProfileRole(adminDb, profileId, role) {
  const { error } = await adminDb
    .from('profile_roles')
    .delete()
    .eq('profile_id', profileId)
    .eq('role', role);
  if (error && !PROFILE_ROLES_MISSING.test(error.message ?? '')) throw error;
}

export async function profileHasRoleServer(adminDb, profileId, role) {
  const { data, error } = await adminDb
    .from('profile_roles')
    .select('role')
    .eq('profile_id', profileId)
    .eq('role', role)
    .maybeSingle();

  if (!error && data) return true;
  if (error && !PROFILE_ROLES_MISSING.test(error.message ?? '')) throw error;

  const { data: profile, error: profileError } = await adminDb
    .from('profiles')
    .select('role')
    .eq('id', profileId)
    .maybeSingle();
  if (profileError) throw profileError;
  return profile?.role === role;
}
