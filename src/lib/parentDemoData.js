import { addDaysIso, istanbulDateIso } from './calendar';
import { formatWeekRangeTr } from './curriculum';

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function getDemoParentAnnouncements() {
  return [
    {
      id: 'demo-parent-ann-1',
      school_id: null,
      author_id: null,
      author_name: 'Ayşe Yılmaz',
      title: 'Cuma günü veli toplantısı',
      body: '5-A sınıfı velileri için Cuma 14:00’te okul kütüphanesinde kısa bir bilgilendirme yapılacaktır. Gündem: dönem başı rutinler ve iletişim kanalları.',
      pinned: true,
      created_at: hoursAgo(5),
      updated_at: hoursAgo(5),
    },
    {
      id: 'demo-parent-ann-2',
      school_id: null,
      author_id: null,
      author_name: 'Ayşe Yılmaz',
      title: 'Gezi izin formu hatırlatması',
      body: '29 Ağustos müze gezisi için imzalı izin formunu en geç Perşembe günü sınıf öğretmenine iletmenizi rica ederiz.',
      pinned: false,
      created_at: daysAgo(1),
      updated_at: daysAgo(1),
    },
    {
      id: 'demo-parent-ann-3',
      school_id: null,
      author_id: null,
      author_name: 'Okul Yönetimi',
      title: 'Eylül beslenme menüsü',
      body: 'Yeni ay menüsü veli portalına yüklendi. Alerji bildiriminiz varsa lütfen öğretmeninize yazın.',
      pinned: false,
      created_at: daysAgo(2),
      updated_at: daysAgo(2),
    },
    {
      id: 'demo-parent-ann-4',
      school_id: null,
      author_id: null,
      author_name: 'Ayşe Yılmaz',
      title: 'Deneme sınavı tarihi',
      body: 'İlk ATLAS denememiz 12 Eylül Cumartesi 10:00’da yapılacak. Öğrencilerin en geç 09:45’te okulda olması yeterli.',
      pinned: false,
      created_at: daysAgo(4),
      updated_at: daysAgo(4),
    },
  ];
}

export function isWeeklyReportEmpty(report) {
  if (!report) return true;
  return (
    report.konular.length === 0 &&
    report.moved.length === 0 &&
    report.presence.length === 0 &&
    report.upcoming.length === 0 &&
    report.schoolNotes.length === 0 &&
    report.childNotes.length === 0 &&
    report.curriculumNotes.length === 0
  );
}

export function buildDemoWeeklyReport(student, classLabel = '5-A') {
  const childName = student?.full_name?.trim().split(/\s+/)[0] ?? 'Çocuğunuz';
  const today = istanbulDateIso();
  const weekLabel = formatWeekRangeTr(1) ?? '14–20 Eylül 2026';

  return {
    student,
    classLabel: classLabel || '5-A',
    weekIndex: 1,
    weekLabel,
    isCurrentWeek: true,
    isDemo: true,
    konular: [
      {
        subjectName: 'Matematik',
        unitTitle: 'Geometrik Şekiller',
        banner: 'Geometrik Şekiller · hafta 1/2',
      },
      {
        subjectName: 'Türkçe',
        unitTitle: 'Sözcükte Anlam',
        banner: 'Sözcükte Anlam · hafta 2/3',
      },
      {
        subjectName: 'Fen Bilimleri',
        unitTitle: 'Madde ve Isı',
        banner: 'Madde ve Isı · hafta 1/1',
      },
    ],
    moved: [
      {
        subjectName: 'Matematik',
        unitTitle: 'Geometrik Şekiller',
        completed: true,
        questionsSolved: 24,
      },
      {
        subjectName: 'Türkçe',
        unitTitle: 'Paragraf',
        completed: false,
        questionsSolved: 12,
      },
    ],
    curriculumNotes: [
      {
        subjectName: 'Matematik',
        note: `${childName} bu hafta açı-kapalı şekilleri gruplarken dikkatli ve istekliydi.`,
      },
    ],
    presence: [
      { subjectName: 'Matematik', present: 4, total: 5 },
      { subjectName: 'Türkçe', present: 5, total: 5 },
      { subjectName: 'Fen Bilimleri', present: 4, total: 5 },
    ],
    upcoming: [
      {
        id: 'demo-upcoming-1',
        title: '8. sınıf deneme sınavı',
        event_type: 'exam',
        starts_on: addDaysIso(today, 3),
        ends_on: addDaysIso(today, 3),
      },
      {
        id: 'demo-upcoming-2',
        title: 'Veli bilgilendirme toplantısı',
        event_type: 'parent_meeting',
        starts_on: addDaysIso(today, 5),
        ends_on: addDaysIso(today, 5),
      },
    ],
    schoolNotes: [
      {
        id: 'demo-school-note-1',
        title: 'Gezi izin formu hatırlatması',
      },
    ],
    childNotes: [
      {
        id: 'demo-child-note-1',
        body: `${childName} bugün öğle yemeğini güzel yedi, uyku saatinde dinlendi.`,
      },
    ],
  };
}
