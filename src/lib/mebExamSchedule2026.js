import { formatGradeLabel } from './atlasCalendar2026.js';

export const MEB_EXAM_SOURCE = 'meb-2026';

function ortakYazili({
  startsOn,
  grades,
  subject,
  term,
  round,
  startsAt = null,
}) {
  const label = formatGradeLabel(grades);
  return {
    title: `${label} ${subject} ortak yazılı`,
    body: `MEB ülke geneli ortak yazılı sınavı — ${term}. dönem ${round}. yazılı.`,
    event_type: 'common_exam',
    starts_on: startsOn,
    ends_on: startsOn,
    starts_at: startsAt,
    audience_grades: grades,
    notify: true,
    exam_kind: 'common',
    exam_subject: subject,
    exam_term: term,
    exam_round: round,
  };
}

function nationalExam({ startsOn, title, body, grades, subject }) {
  return {
    title,
    body,
    event_type: 'common_exam',
    starts_on: startsOn,
    ends_on: startsOn,
    starts_at: null,
    audience_grades: grades,
    notify: true,
    exam_kind: 'common',
    exam_subject: subject,
    exam_term: null,
    exam_round: null,
  };
}

/** MEB 2026 sınav takvimi — 5–8. sınıf ve merkezî sınavlar (03144112 / odsgm.meb.gov.tr). */
export const MEB_EXAM_EVENTS = [
  // 2025–2026 · I. dönem ortak yazılı (7–8)
  ortakYazili({
    startsOn: '2025-11-04',
    grades: [7],
    subject: 'Türkçe',
    term: 1,
    round: 1,
  }),
  ortakYazili({
    startsOn: '2025-11-05',
    grades: [8],
    subject: 'Türkçe',
    term: 1,
    round: 1,
  }),

  // 2025–2026 · II. dönem ortak yazılı (6–8, ATLAS yılı içinde)
  ortakYazili({
    startsOn: '2026-04-07',
    grades: [6],
    subject: 'Türkçe',
    term: 2,
    round: 1,
  }),
  ortakYazili({
    startsOn: '2026-04-08',
    grades: [6, 8],
    subject: 'Matematik',
    term: 2,
    round: 1,
  }),
  ortakYazili({
    startsOn: '2026-06-02',
    grades: [7],
    subject: 'Matematik',
    term: 2,
    round: 2,
  }),

  // Merkezî sınavlar (2026)
  nationalExam({
    startsOn: '2026-04-26',
    title: 'İOKBS (Bursluluk Sınavı)',
    body: 'İlköğretim ve Ortaöğretim Kurumları Bursluluk Sınavı.',
    grades: [5, 6, 7, 8],
    subject: 'İOKBS',
  }),
  nationalExam({
    startsOn: '2026-06-14',
    title: 'LGS (Merkezî Sınav)',
    body: 'Liselere Geçiş Sistemi kapsamında merkezî sınav.',
    grades: [8],
    subject: 'LGS',
  }),

  // 2026–2027 · I. dönem ortak yazılı (tahmini MEB takvim yapısı)
  ortakYazili({
    startsOn: '2026-11-03',
    grades: [7],
    subject: 'Türkçe',
    term: 1,
    round: 1,
  }),
  ortakYazili({
    startsOn: '2026-11-04',
    grades: [8],
    subject: 'Türkçe',
    term: 1,
    round: 1,
  }),
];

export function formatExamTermLabel(term, round) {
  if (!term || !round) return 'Merkezî sınav';
  return `${term}. dönem · ${round}. yazılı`;
}
