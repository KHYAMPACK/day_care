import {
  loadPublishedSubjectResultsForStudents,
  loadRankingsForStudents,
} from './lgsExam';
import { loadQuestionsForAnswerKey, loadSessionStudentAnswers } from './examAnalysis';
import { loadAttendanceFlags } from './attendance';
import { loadAtlasForWeek, academicWeekIndex } from './atlasLessons';
import { loadCurriculumSubjects, UNIT_SELECT } from './curriculum';
import { buildStudentDossierFromParts } from './studentDossier';
import {
  aggregateTopicStatsAcrossExams,
  buildAtlasUnitStats,
  buildStudentGapProfile,
  buildStudentTopicAnalysis,
  enrichUnitsWithSubject,
  rollupDenemeTopicsToUnits,
} from './studentGaps';

export async function loadCurriculumUnitsWithSections() {
  const { supabase } = await import('./supabase');
  const [unitsRes, subjects] = await Promise.all([
    supabase.from('curriculum_units').select(UNIT_SELECT).order('sort_order'),
    loadCurriculumSubjects(),
  ]);
  if (unitsRes.error) throw unitsRes.error;
  return enrichUnitsWithSubject(unitsRes.data ?? [], subjects);
}

async function loadStudentGapContext({ schoolId, student, sessionIds = null, includeAtlas = true }) {
  const { supabase } = await import('./supabase');

  const [units, examPack, attendanceFlags, subjectResults, rankings] = await Promise.all([
    loadCurriculumUnitsWithSections(),
    sessionIds
      ? loadExamGapDataForSessions(sessionIds)
      : loadPublishedExamSessionsWithKeys(schoolId).then(async (published) =>
          loadExamGapDataForSessions(published.map((row) => row.id))
        ),
    loadAttendanceFlags({ schoolId, classId: student.class_id }).catch(() => []),
    loadPublishedSubjectResultsForStudents([student.id]),
    loadRankingsForStudents([student.id]),
  ]);

  const examSessions = [...(examPack.sessions ?? [])].sort((a, b) =>
    (a.held_on ?? '').localeCompare(b.held_on ?? '')
  );
  const sessionTopicRows = examSessions.map((session) => {
    const questions = examPack.questionsBySession.get(session.id) ?? [];
    const sessionAnswers = (examPack.answers ?? []).filter((row) => row.session_id === session.id);
    return {
      sessionId: session.id,
      heldOn: session.held_on,
      topics: buildStudentTopicAnalysis({
        questions,
        answers: sessionAnswers,
        studentId: student.id,
      }),
    };
  });

  const rowsBySession = sessionTopicRows.map((entry) => entry.topics);
  const aggregatedTopics = aggregateTopicStatsAcrossExams(rowsBySession);
  const gradeUnits = units.filter((unit) => unit.curriculum_subjects?.grade === student.grade);
  const unitRollup = rollupDenemeTopicsToUnits(aggregatedTopics, gradeUnits);

  let atlasUnits = [];
  if (includeAtlas) {
    const atlasPack = await loadAtlasGapDataForStudent({ schoolId, student });
    atlasUnits = buildAtlasUnitStats({
      atlasSessions: atlasPack.atlasSessions,
      atlasResults: atlasPack.atlasResults,
      studentId: student.id,
      units: gradeUnits,
    });
  }

  let classSubjectResults = [];
  if (student.class_id) {
    try {
      const { data: classmates } = await supabase
        .from('students')
        .select('id')
        .eq('class_id', student.class_id);
      const classmateIds = (classmates ?? []).map((row) => row.id).filter(Boolean);
      if (classmateIds.length) {
        classSubjectResults = await loadPublishedSubjectResultsForStudents(classmateIds);
      }
    } catch {
      classSubjectResults = [];
    }
  }

  const gapProfile = buildStudentGapProfile({
    studentId: student.id,
    aggregatedTopics,
    sessionTopicRows,
    unitRollup,
    atlasUnits,
    missedUnitFlags: attendanceFlags,
    units: gradeUnits,
    subjectResults,
    rankings,
    classSubjectResults,
  });

  const allSessionIds = new Set([
    ...examSessions.map((row) => row.id),
    ...subjectResults.map((row) => row.session_id ?? row.exam_sessions?.id).filter(Boolean),
    ...rankings.map((row) => row.session_id).filter(Boolean),
  ]);

  const mergedSessions = [...allSessionIds]
    .map((id) => {
      const fromExam = examSessions.find((row) => row.id === id);
      const fromRanking = rankings.find((row) => row.session_id === id)?.exam_sessions;
      const fromSubject = subjectResults.find(
        (row) => (row.session_id ?? row.exam_sessions?.id) === id
      )?.exam_sessions;
      return fromExam ?? fromRanking ?? fromSubject ?? { id, title: 'Deneme', held_on: null };
    })
    .filter(Boolean);

  return {
    gapProfile,
    gradeUnits,
    examPack,
    mergedSessions,
    subjectResults,
    rankings,
    attendanceFlags,
    atlasUnits,
  };
}

export async function loadPublishedExamSessionsWithKeys(schoolId) {
  const { supabase } = await import('./supabase');
  const { data, error } = await supabase
    .from('exam_sessions')
    .select('id, title, held_on, answer_key_id, published_at, school_id')
    .eq('school_id', schoolId)
    .not('published_at', 'is', null)
    .order('held_on', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function loadExamGapDataForSessions(sessionIds = []) {
  if (!sessionIds.length) {
    return { sessions: [], questionsBySession: new Map(), answers: [] };
  }

  const { supabase } = await import('./supabase');
  const { data: sessions, error: sessionError } = await supabase
    .from('exam_sessions')
    .select('id, title, held_on, answer_key_id')
    .in('id', sessionIds);
  if (sessionError) throw sessionError;

  const questionsBySession = new Map();
  const answerChunks = await Promise.all(
    (sessions ?? []).map(async (session) => {
      const [questions, answers] = await Promise.all([
        session.answer_key_id
          ? loadQuestionsForAnswerKey(session.answer_key_id)
          : Promise.resolve([]),
        loadSessionStudentAnswers(session.id),
      ]);
      questionsBySession.set(session.id, questions);
      return answers;
    })
  );

  return {
    sessions: sessions ?? [],
    questionsBySession,
    answers: answerChunks.flat(),
  };
}

export async function loadAtlasGapDataForStudent({ schoolId, student, weekCount = 8 } = {}) {
  if (!student?.class_id || !schoolId) {
    return { atlasSessions: [], atlasResults: [] };
  }

  const currentWeek = academicWeekIndex();
  const weekIndexes = Array.from({ length: weekCount }, (_, index) => currentWeek - index).filter(
    (week) => week >= 1
  );

  const packs = await Promise.all(
    weekIndexes.map((weekIndex) =>
      loadAtlasForWeek({ schoolId, classIds: [student.class_id], weekIndex })
    )
  );

  const atlasSessions = packs.flatMap((pack) => pack.sessions ?? []);
  const atlasResults = packs.flatMap((pack) => pack.results ?? []).filter(
    (row) => row.student_id === student.id
  );

  return { atlasSessions, atlasResults };
}

export async function buildStudentGapProfileFromDb(options = {}) {
  const dossier = await buildStudentDossierFromDb(options);
  return dossier?.gapProfile ?? null;
}

export async function buildStudentDossierFromDb({
  schoolId,
  student,
  klass = null,
  sessionIds = null,
  includeAtlas = true,
} = {}) {
  if (!student?.id) return null;

  const ctx = await loadStudentGapContext({ schoolId, student, sessionIds, includeAtlas });

  return buildStudentDossierFromParts({
    student,
    klass,
    gapProfile: ctx.gapProfile,
    rankings: ctx.rankings,
    examSessions: ctx.mergedSessions,
    questionsBySession: ctx.examPack.questionsBySession,
    answers: ctx.examPack.answers,
    subjectResults: ctx.subjectResults,
    attendanceFlags: ctx.attendanceFlags,
    atlasUnits: ctx.atlasUnits,
  });
}

export async function buildClassGapSummaries({ schoolId, students = [], sessionIds = null } = {}) {
  const profiles = await Promise.all(
    students.map((student) =>
      buildStudentGapProfileFromDb({ schoolId, student, sessionIds, includeAtlas: false })
    )
  );

  return profiles.filter(Boolean).map((profile, index) => ({
    student: students[index],
    profile,
  }));
}
