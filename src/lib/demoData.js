export function firstName(fullName, fallback = 'Elif') {
  const trimmed = fullName?.trim();
  if (!trimmed) return fallback;
  return trimmed.split(/\s+/)[0];
}

export const HOMEWORK_TAB = { id: 'homework', label: 'Ödev', icon: 'clipboard' };

export const PARENT_TABS = [
  { id: 'home', label: 'Gün', icon: 'home' },
  { id: 'calendar', label: 'Takvim', icon: 'calendar' },
  { id: 'exams', label: 'Sınavlar', icon: 'file' },
  { id: 'curriculum', label: 'Müfredat', icon: 'book' },
  { id: 'announcements', label: 'Duyurular', icon: 'megaphone' },
  { id: 'chat', label: 'Mesaj', icon: 'message' },
];

export const TEACHER_TABS = [
  { id: 'home', label: 'Sınıf', icon: 'school' },
  { id: 'calendar', label: 'Takvim', icon: 'calendar' },
  { id: 'curriculum', label: 'Müfredat', icon: 'book' },
  { id: 'attendance', label: 'Yoklama', icon: 'check' },
  { id: 'announcements', label: 'Duyurular', icon: 'megaphone' },
];

export const ATLAS_TEACHER_TABS = [
  { id: 'questions', label: 'Sorular', icon: 'file' },
  { id: 'lessons', label: 'Ders', icon: 'check' },
  { id: 'curriculum', label: 'Müfredat', icon: 'book' },
  { id: 'calendar', label: 'Takvim', icon: 'calendar' },
  { id: 'announcements', label: 'Duyurular', icon: 'megaphone' },
];

function withHomeworkTab(tabs, homeworkTracking) {
  if (!homeworkTracking) return tabs;
  const index = tabs.findIndex((tab) => tab.id === 'curriculum');
  const next = [...tabs];
  const insertAt = index >= 0 ? index + 1 : next.length;
  if (!next.some((tab) => tab.id === HOMEWORK_TAB.id)) {
    next.splice(insertAt, 0, HOMEWORK_TAB);
  }
  return next;
}

export function getTeacherTabs(atlasSchedule, homeworkTracking = false) {
  const tabs = atlasSchedule ? ATLAS_TEACHER_TABS : TEACHER_TABS;
  return withHomeworkTab(tabs, homeworkTracking);
}

export function getParentTabs(homeworkTracking = false) {
  return withHomeworkTab(PARENT_TABS, homeworkTracking);
}

export function defaultTeacherTab(atlasSchedule) {
  return atlasSchedule ? 'questions' : 'home';
}

export const COUNSELOR_TABS = [
  { id: 'overview', label: 'Özet', icon: 'chart' },
  { id: 'exams', label: 'Denemeler', icon: 'file' },
  { id: 'reports', label: 'Raporlar', icon: 'clipboard' },
  { id: 'students', label: 'Öğrenciler', icon: 'child' },
  { id: 'guidance', label: 'Rehberlik', icon: 'book' },
  { id: 'schedule', label: 'Program', icon: 'calendar' },
  { id: 'calendar', label: 'Takvim', icon: 'calendar' },
];

export function defaultCounselorTab() {
  return 'overview';
}
