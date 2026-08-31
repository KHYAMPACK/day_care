import { USER_ROLES } from './roles';

const STAFF_ROLE_PRIORITY = {
  [USER_ROLES.director]: 1,
  [USER_ROLES.counselor]: 2,
  [USER_ROLES.teacher]: 3,
  [USER_ROLES.parent]: 4,
};

export function normalizeProfileRoles(profile) {
  const fromJoin = (profile?.profile_roles ?? [])
    .map((row) => row?.role)
    .filter(Boolean);
  if (fromJoin.length) return [...new Set(fromJoin)];
  return profile?.role ? [profile.role] : [];
}

export function profileHasRole(profile, role) {
  return normalizeProfileRoles(profile).includes(role);
}

export function staffRolesForProfile(profile) {
  return normalizeProfileRoles(profile).filter((role) => role !== USER_ROLES.parent);
}

export function defaultActiveRole(profile) {
  const roles = normalizeProfileRoles(profile);
  const staff = roles
    .filter((role) => role !== USER_ROLES.parent)
    .sort((a, b) => (STAFF_ROLE_PRIORITY[a] ?? 99) - (STAFF_ROLE_PRIORITY[b] ?? 99));
  if (staff.length) return staff[0];
  return roles[0] ?? USER_ROLES.parent;
}

export function readStoredActiveRole(profileId) {
  if (!profileId || typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(`activeRole:${profileId}`);
  } catch {
    return null;
  }
}

export function storeActiveRole(profileId, role) {
  if (!profileId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`activeRole:${profileId}`, role);
  } catch {
    // ignore quota / private mode
  }
}

export function resolveActiveRole(profile, storedRole = null) {
  const roles = normalizeProfileRoles(profile);
  if (storedRole && roles.includes(storedRole)) return storedRole;
  return defaultActiveRole(profile);
}

export function isFullDirector(profile) {
  return profile?.primary_role === USER_ROLES.director;
}

export function isAssistantDirector(profile) {
  return profileHasRole(profile, USER_ROLES.director) && !isFullDirector(profile);
}
