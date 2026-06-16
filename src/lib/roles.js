export const USER_ROLES = {
  parent: 'parent',
  teacher: 'teacher',
  director: 'director',
};

export const STAFF_ROLES = [USER_ROLES.teacher, USER_ROLES.director];

export function isStaffRole(role) {
  return STAFF_ROLES.includes(role);
}

export function getStaffPanelLabel(role) {
  if (role === USER_ROLES.director) return 'Müdür Paneli';
  return 'Yönetici Paneli';
}
