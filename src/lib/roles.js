export const USER_ROLES = {
  parent: 'parent',
  teacher: 'teacher',
  director: 'director',
  counselor: 'counselor',
};

export const STAFF_ROLES = [USER_ROLES.teacher, USER_ROLES.director, USER_ROLES.counselor];

export function isStaffRole(role) {
  return STAFF_ROLES.includes(role);
}

export function getStaffPanelLabel(role) {
  if (role === USER_ROLES.director) return 'Müdür Paneli';
  if (role === USER_ROLES.counselor) return 'Rehberlik Paneli';
  if (role === USER_ROLES.teacher) return 'Öğretmen Paneli';
  return 'Yönetici Paneli';
}

export function formatRoleLabel(role) {
  if (role === USER_ROLES.teacher) return 'Öğretmen';
  if (role === USER_ROLES.director) return 'Müdür';
  if (role === USER_ROLES.counselor) return 'Rehberlikçi';
  if (role === USER_ROLES.parent) return 'Veli';
  return role ?? '—';
}
