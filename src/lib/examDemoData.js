import { addDaysIso, istanbulDateIso } from './calendar';
import { LGS_SUBJECTS, computeNet, estimateLgsScore } from './lgsExam';

const EXAM_DEFS = [
  { key: 'deneme-1', title: 'ATLAS Deneme 1', heldOffset: -14 },
  { key: 'deneme-2', title: 'ATLAS Deneme 2', heldOffset: -7 },
];

const STUDENT_PRESETS = [
  {
    subjects: {
      turkce: [14, 4, 2],
      matematik: [12, 5, 3],
      fen: [13, 4, 3],
      inkilap: [7, 2, 1],
      din: [8, 1, 1],
      ingilizce: [7, 2, 1],
    },
    bump: [0, 1],
    ranks: [
      { school: 22, class: 6, grade: 14 },
      { school: 15, class: 4, grade: 9 },
    ],
  },
  {
    subjects: {
      turkce: [12, 5, 3],
      matematik: [10, 6, 4],
      fen: [11, 5, 4],
      inkilap: [6, 3, 1],
      din: [7, 2, 1],
      ingilizce: [6, 3, 1],
    },
    bump: [0, 1],
    ranks: [
      { school: 28, class: 8, grade: 18 },
      { school: 20, class: 6, grade: 12 },
    ],
  },
];

function buildSubjectRows(sessionId, studentId, session, preset, bump = 0) {
  return LGS_SUBJECTS.map((def) => {
    const [correct, wrong, blank] = preset.subjects[def.code] ?? [0, 0, 0];
    const adjustedCorrect = Math.min(def.questions, correct + bump);
    let remaining = def.questions - adjustedCorrect;
    const adjustedWrong = Math.min(wrong, remaining);
    remaining -= adjustedWrong;
    const adjustedBlank = Math.min(blank, remaining);
    return {
      session_id: sessionId,
      student_id: studentId,
      subject_code: def.code,
      question_count: def.questions,
      correct_count: adjustedCorrect,
      wrong_count: adjustedWrong,
      blank_count: adjustedBlank,
      net: computeNet(adjustedCorrect, adjustedWrong),
      exam_sessions: session,
    };
  });
}

function sumSubjectRows(rows) {
  return rows.reduce(
    (acc, row) => ({
      totalNet: acc.totalNet + Number(row.net ?? 0),
      totalCorrect: acc.totalCorrect + row.correct_count,
      totalWrong: acc.totalWrong + row.wrong_count,
      totalBlank: acc.totalBlank + row.blank_count,
    }),
    { totalNet: 0, totalCorrect: 0, totalWrong: 0, totalBlank: 0 }
  );
}

export function getDemoParentExamPack(students = [], { today = istanbulDateIso() } = {}) {
  const subjectResults = [];
  const rankings = [];

  EXAM_DEFS.forEach((examDef, examIndex) => {
    const sessionId = `demo-${examDef.key}`;
    const heldOn = addDaysIso(today, examDef.heldOffset);
    const publishedAt = new Date(
      Date.parse(`${heldOn}T12:00:00+03:00`) + 24 * 60 * 60 * 1000
    ).toISOString();
    const session = {
      id: sessionId,
      kind: 'mock',
      title: examDef.title,
      held_on: heldOn,
      audience_grades: [5, 6, 7, 8],
      published_at: publishedAt,
    };

    students.forEach((student, studentIndex) => {
      const preset = STUDENT_PRESETS[studentIndex] ?? STUDENT_PRESETS[0];
      const rows = buildSubjectRows(
        sessionId,
        student.id,
        session,
        preset,
        preset.bump[examIndex] ?? 0
      );
      subjectResults.push(...rows);

      const totals = sumSubjectRows(rows);
      const ranks = preset.ranks[examIndex] ?? preset.ranks[0];
      rankings.push({
        session_id: sessionId,
        student_id: student.id,
        total_net: Math.round(totals.totalNet * 100) / 100,
        total_correct: totals.totalCorrect,
        total_wrong: totals.totalWrong,
        total_blank: totals.totalBlank,
        lgs_score: estimateLgsScore(totals.totalNet),
        school_rank: ranks.school,
        class_rank: ranks.class,
        grade_rank: ranks.grade,
        exam_sessions: session,
      });
    });
  });

  return { subjectResults, rankings };
}

/** @deprecated Use getDemoParentExamPack */
export const DEMO_EXAM_SESSIONS = [];
export const DEMO_EXAM_RESULTS = [];

/** @deprecated Use getDemoParentExamPack */
export function demoResultsForStudent() {
  return [];
}
