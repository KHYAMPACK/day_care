import { hasAccounting, hasAtlasSchedule } from './schoolFeatures';

export const MANAGEMENT_TAB_IDS = new Set([
  'parents',
  'student-mgmt',
  'staff',
  'assignment',
  'curriculum',
  'schedule',
]);

export const RECORDS_TAB_IDS = new Set(['audit', 'attendance']);

export const COMMUNICATIONS_TAB_IDS = new Set(['announcements', 'templates']);

const MANAGEMENT_CHILDREN = [
  { id: 'parents', label: 'Veli Yönetimi', icon: 'users' },
  { id: 'student-mgmt', label: 'Öğrenci Yönetimi', icon: 'child' },
  { id: 'staff', label: 'Öğretmen Yönetimi', icon: 'teacher' },
  { id: 'assignment', label: 'Şube Atama', icon: 'school' },
  { id: 'curriculum', label: 'Müfredat', icon: 'book' },
];

const RECORDS_CHILDREN = [
  { id: 'audit', label: 'Okul Kayıtları', icon: 'clipboard' },
  { id: 'attendance', label: 'Yoklama', icon: 'check' },
];

const COMMUNICATIONS_CHILDREN = [
  { id: 'announcements', label: 'Duyurular', icon: 'megaphone' },
  { id: 'templates', label: 'Şablonlar', icon: 'sparkle' },
];

export function buildManagementChildren(school) {
  if (!hasAtlasSchedule(school)) return MANAGEMENT_CHILDREN;
  const curriculumIndex = MANAGEMENT_CHILDREN.findIndex((item) => item.id === 'curriculum');
  const insertAt = curriculumIndex >= 0 ? curriculumIndex + 1 : MANAGEMENT_CHILDREN.length;
  const children = [...MANAGEMENT_CHILDREN];
  children.splice(insertAt, 0, {
    id: 'schedule',
    label: 'Haftalık ders programı',
    icon: 'calendar',
  });
  return children;
}

export function buildDirectorNav(school) {
  const items = [
    { id: 'overview', label: 'Genel Bakış', icon: 'chart' },
    {
      id: 'management',
      label: 'Yönetim',
      icon: 'users',
      children: buildManagementChildren(school),
    },
    { id: 'calendar', label: 'Takvim', icon: 'calendar' },
    { id: 'exams', label: 'Sınavlar', icon: 'file' },
  ];

  if (hasAccounting(school)) {
    items.push({ id: 'accounting', label: 'Muhasebe', icon: 'chart' });
  }

  items.push(
    {
      id: 'records',
      label: 'Kayıtlar',
      icon: 'clipboard',
      children: RECORDS_CHILDREN,
    },
    {
      id: 'communications',
      label: 'Duyurular',
      icon: 'megaphone',
      children: COMMUNICATIONS_CHILDREN,
    }
  );

  return items;
}

export function buildDirectorBottomNav(school) {
  const items = [
    { id: 'overview', label: 'Genel Bakış', icon: 'chart' },
    { id: 'management', label: 'Yönetim', icon: 'users' },
    { id: 'calendar', label: 'Takvim', icon: 'calendar' },
    { id: 'exams', label: 'Sınavlar', icon: 'file' },
  ];

  if (hasAccounting(school)) {
    items.push({ id: 'accounting', label: 'Muhasebe', icon: 'chart' });
  }

  items.push(
    { id: 'records', label: 'Kayıtlar', icon: 'clipboard' },
    { id: 'communications', label: 'Duyurular', icon: 'megaphone' }
  );

  return items;
}

export function resolveTopLevelTab(activeTab) {
  if (MANAGEMENT_TAB_IDS.has(activeTab)) return 'management';
  if (RECORDS_TAB_IDS.has(activeTab)) return 'records';
  if (COMMUNICATIONS_TAB_IDS.has(activeTab)) return 'communications';
  return activeTab;
}

export function resolveActiveLabel(nav, activeTab) {
  for (const item of nav) {
    if (item.id === activeTab) return item.label;
    if (item.children) {
      const child = item.children.find((row) => row.id === activeTab);
      if (child) return child.label;
    }
  }
  return '';
}

export function getDefaultTabForTopLevel(topLevel, school) {
  if (topLevel === 'management') {
    return buildManagementChildren(school)[0]?.id ?? 'parents';
  }
  if (topLevel === 'records') return 'audit';
  if (topLevel === 'communications') return 'announcements';
  return topLevel;
}

export function getManagementSubNavItems(school) {
  return buildManagementChildren(school);
}

export function getRecordsSubNavItems() {
  return RECORDS_CHILDREN;
}

export function getCommunicationsSubNavItems() {
  return COMMUNICATIONS_CHILDREN;
}

export function findParentGroupId(nav, activeTab) {
  for (const item of nav) {
    if (item.children?.some((child) => child.id === activeTab)) {
      return item.id;
    }
  }
  return null;
}
