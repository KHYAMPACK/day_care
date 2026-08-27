export function firstName(fullName, fallback = 'Elif') {
  const trimmed = fullName?.trim();
  if (!trimmed) return fallback;
  return trimmed.split(/\s+/)[0];
}

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
  { id: 'exams', label: 'Sınavlar', icon: 'file' },
  { id: 'curriculum', label: 'Müfredat', icon: 'book' },
  { id: 'attendance', label: 'Yoklama', icon: 'check' },
  { id: 'announcements', label: 'Duyurular', icon: 'megaphone' },
];
