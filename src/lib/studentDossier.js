import { buildProgressSeries, LGS_SUBJECTS } from './lgsExam';
import {
  buildErrorReport,
  buildStudentTopicAnalysis,
  groupErrorReportByTopic,
  isPersistentGap,
} from './studentGaps';

export function computeDossierStats({ gapProfile, progressSeries, exams, attendanceFlags, studentId }) {
  const latest = progressSeries?.[progressSeries.length - 1];
  const studentFlags = (attendanceFlags ?? []).filter((row) => row.studentId === studentId);
  return {
    examCount: exams?.length ?? 0,
    latestNet: latest?.totalNet ?? null,
    latestLgs: latest?.lgsScore ?? null,
    persistentGapCount: (gapProfile?.allFlags ?? []).length || (gapProfile?.allTopics ?? []).filter(isPersistentGap).length,
    attendanceFlagCount: studentFlags.length,
    topicCount: gapProfile?.allTopics?.length ?? 0,
  };
}

export function buildExamDossierEntries({
  studentId,
  examSessions = [],
  questionsBySession = new Map(),
  answers = [],
  subjectResults = [],
  rankings = [],
}) {
  const rankingBySession = new Map(
    (rankings ?? []).filter((row) => row.student_id === studentId).map((row) => [row.session_id, row])
  );

  const subjectBySession = new Map();
  for (const row of subjectResults ?? []) {
    if (row.student_id !== studentId) continue;
    const sessionId = row.session_id ?? row.exam_sessions?.id;
    if (!sessionId) continue;
    if (!subjectBySession.has(sessionId)) subjectBySession.set(sessionId, []);
    subjectBySession.get(sessionId).push(row);
  }

  return [...(examSessions ?? [])]
    .sort((a, b) => (a.held_on ?? '').localeCompare(b.held_on ?? ''))
    .map((session) => {
      const questions = questionsBySession.get(session.id) ?? [];
      const sessionAnswers = (answers ?? []).filter(
        (row) => row.session_id === session.id && row.student_id === studentId
      );
      const topicRows = questions.length
        ? buildStudentTopicAnalysis({ questions, answers: sessionAnswers, studentId })
        : [];
      const errorItems = questions.length
        ? buildErrorReport({ questions, answers: sessionAnswers, studentId })
        : [];
      const subjectRows = subjectBySession.get(session.id) ?? [];

      return {
        session,
        ranking: rankingBySession.get(session.id) ?? null,
        subjectRows: LGS_SUBJECTS.map((def) => {
          const row = subjectRows.find((item) => item.subject_code === def.code);
          return {
            ...def,
            correct: row?.correct_count ?? null,
            wrong: row?.wrong_count ?? null,
            blank: row?.blank_count ?? null,
            net: row?.net ?? null,
          };
        }),
        topicRows,
        errorGroups: groupErrorReportByTopic(errorItems),
      };
    });
}

export function assembleStudentDossier({
  student,
  klass = null,
  gapProfile,
  progressSeries = [],
  exams = [],
  attendanceFlags = [],
  atlasUnits = [],
}) {
  const stats = computeDossierStats({
    gapProfile,
    progressSeries,
    exams,
    attendanceFlags,
    studentId: student?.id,
  });

  const studentAttendance = (attendanceFlags ?? []).filter((row) => row.studentId === student?.id);

  return {
    student,
    klass,
    gapProfile,
    progressSeries,
    exams,
    attendanceFlags: studentAttendance,
    atlasUnits: atlasUnits ?? gapProfile?.atlasUnits ?? [],
    stats,
  };
}

export function buildStudentDossierFromParts({
  student,
  klass,
  gapProfile,
  rankings = [],
  examSessions = [],
  questionsBySession = new Map(),
  answers = [],
  subjectResults = [],
  attendanceFlags = [],
  atlasUnits = [],
}) {
  const studentRankings = (rankings ?? []).filter((row) => row.student_id === student?.id);
  const progressSeries = buildProgressSeries(studentRankings);
  const exams = buildExamDossierEntries({
    studentId: student.id,
    examSessions,
    questionsBySession,
    answers,
    subjectResults,
    rankings,
  });

  return assembleStudentDossier({
    student,
    klass,
    gapProfile,
    progressSeries,
    exams,
    attendanceFlags,
    atlasUnits,
  });
}
