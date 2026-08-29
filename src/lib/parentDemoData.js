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
    (report.sessionTopics?.length ?? 0) === 0 &&
    (report.subjectActivityMix?.length ?? 0) === 0 &&
    report.moved.length === 0 &&
    report.presence.length === 0 &&
    (report.lessonCounts?.length ?? 0) === 0 &&
    (report.questionStats?.length ?? 0) === 0 &&
    (report.bySubject?.length ?? 0) === 0 &&
    !(report.summary?.totalQuestions > 0) &&
    report.upcoming.length === 0 &&
    report.schoolNotes.length === 0 &&
    report.childNotes.length === 0 &&
    report.curriculumNotes.length === 0
  );
}

export function isDemoSchool(school) {
  return /demo/i.test(school?.name ?? '') || school?.school_code === 'DEMO123';
}

function atlasReportHasPractice(report) {
  return (
    (report?.summary?.totalQuestions ?? 0) > 0 ||
    (report?.questionStats?.length ?? 0) > 0
  );
}

export function shouldUseDemoWeeklyReport(
  report,
  { atlasSchedule = false, demoFallback = false } = {}
) {
  if (!demoFallback) return isWeeklyReportEmpty(report);
  if (!report || isWeeklyReportEmpty(report)) return true;
  if (atlasSchedule && !atlasReportHasPractice(report)) return true;
  return false;
}

export function buildDemoWeeklyReport(student, classLabel = '5-A', { atlasMode = false } = {}) {
  const childName = student?.full_name?.trim().split(/\s+/)[0] ?? 'Çocuğunuz';
  const today = istanbulDateIso();
  const weekLabel = formatWeekRangeTr(1) ?? '14–20 Eylül 2026';

  const base = {
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
        title: '6. sınıf ATLAS Deneme 3',
        event_type: 'exam',
        starts_on: addDaysIso(today, 10),
        ends_on: addDaysIso(today, 10),
      },
      {
        id: 'demo-upcoming-1b',
        title: '5. sınıf ATLAS Deneme 2',
        event_type: 'exam',
        starts_on: addDaysIso(today, 14),
        ends_on: addDaysIso(today, 14),
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

  if (!atlasMode) return base;

  const weekStart = addDaysIso(today, -3);
  return {
    ...base,
    moved: [],
    atlasMode: true,
    encouragementKey: 'great',
    lessonCounts: [
      { subjectName: 'Matematik', count: 4 },
      { subjectName: 'Türkçe', count: 5 },
      { subjectName: 'Fen Bilimleri', count: 4 },
    ],
    questionStats: [
      {
        subjectName: 'Matematik',
        assessmentType: 'Quiz',
        correct: 34,
        wrong: 4,
        blank: 2,
        totalQuestions: 40,
        sessions: 2,
      },
      {
        subjectName: 'Matematik',
        assessmentType: 'Test',
        correct: 8,
        wrong: 2,
        blank: 0,
        totalQuestions: 10,
        sessions: 1,
      },
      {
        subjectName: 'Türkçe',
        assessmentType: 'Quiz',
        correct: 28,
        wrong: 6,
        blank: 6,
        totalQuestions: 40,
        sessions: 2,
      },
      {
        subjectName: 'Fen Bilimleri',
        assessmentType: 'Quiz',
        correct: 8,
        wrong: 2,
        blank: 0,
        totalQuestions: 10,
        sessions: 1,
      },
    ],
    summary: {
      correct: 78,
      wrong: 14,
      blank: 8,
      totalQuestions: 100,
      correctPct: 78,
      practiceSessions: 6,
      lessonSessions: 13,
    },
    bySubject: [
      {
        subjectName: 'Matematik',
        correct: 42,
        wrong: 6,
        blank: 2,
        totalQuestions: 50,
        correctPct: 84,
        assessmentBreakdown: [
          { type: 'Quiz', sessions: 2, questions: 40 },
          { type: 'Test', sessions: 1, questions: 10 },
        ],
      },
      {
        subjectName: 'Türkçe',
        correct: 28,
        wrong: 6,
        blank: 6,
        totalQuestions: 40,
        correctPct: 70,
        assessmentBreakdown: [{ type: 'Quiz', sessions: 2, questions: 40 }],
      },
      {
        subjectName: 'Fen Bilimleri',
        correct: 8,
        wrong: 2,
        blank: 0,
        totalQuestions: 10,
        correctPct: 80,
        assessmentBreakdown: [{ type: 'Quiz', sessions: 1, questions: 10 }],
      },
    ],
    sessionTopics: [
      {
        subjectName: 'Matematik',
        unitTitle: 'Geometrik Şekiller',
        lessonType: 'Konu anlatımı',
        sessionDate: weekStart,
      },
      {
        subjectName: 'Matematik',
        unitTitle: 'Geometrik Şekiller',
        lessonType: 'Test',
        sessionDate: addDaysIso(weekStart, 1),
      },
      {
        subjectName: 'Türkçe',
        unitTitle: 'Sözcükte Anlam',
        lessonType: 'Test',
        sessionDate: addDaysIso(weekStart, 2),
      },
      {
        subjectName: 'Fen Bilimleri',
        unitTitle: 'Madde ve Isı',
        lessonType: 'Konu anlatımı',
        sessionDate: addDaysIso(weekStart, 3),
      },
    ],
    subjectActivityMix: [
      {
        subjectName: 'Matematik',
        lectureSessions: 1,
        practiceSessions: 3,
        totalSessions: 4,
        lecturePct: 23,
        practicePct: 77,
        unitTitles: ['Geometrik Şekiller'],
      },
      {
        subjectName: 'Türkçe',
        lectureSessions: 0,
        practiceSessions: 2,
        totalSessions: 2,
        lecturePct: 0,
        practicePct: 100,
        unitTitles: ['Sözcükte Anlam'],
      },
      {
        subjectName: 'Fen Bilimleri',
        lectureSessions: 3,
        practiceSessions: 1,
        totalSessions: 4,
        lecturePct: 75,
        practicePct: 25,
        unitTitles: ['Madde ve Isı'],
      },
    ],
  };
}
