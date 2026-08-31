import { LGS_SUBJECTS, computeNet, estimateLgsScore } from './lgsExam';
import { buildStudentDossierFromParts } from './studentDossier';
import {
  aggregateTopicStatsAcrossExams,
  buildAtlasUnitStats,
  buildStudentGapProfile,
  buildStudentTopicAnalysis,
  enrichUnitsWithSubject,
  rollupDenemeTopicsToUnits,
} from './studentGaps';

export const DEMO_COUNSELOR_STUDENT_ID = 'demo-counselor-elif';

const DEMO_SUBJECTS = [
  { id: 'demo-sub-turkce', name: 'Türkçe', slug: 'turkce', grade: 8 },
  { id: 'demo-sub-matematik', name: 'Matematik', slug: 'matematik', grade: 8 },
  { id: 'demo-sub-fen', name: 'Fen Bilimleri', slug: 'fen', grade: 8 },
  { id: 'demo-sub-inkilap', name: 'T.C. İnkılap Tarihi', slug: 'inkilap', grade: 8 },
  { id: 'demo-sub-din', name: 'Din Kültürü', slug: 'din', grade: 8 },
  { id: 'demo-sub-ingilizce', name: 'Yabancı Dil', slug: 'ingilizce', grade: 8 },
];

const DEMO_UNITS = enrichUnitsWithSubject(
  [
    {
      id: 'demo-unit-paragraf',
      title: 'Paragrafta Anlam',
      subject_id: 'demo-sub-turkce',
      sort_order: 1,
      sections: ['Ana Fikir', 'Yardımcı Fikir', 'Paragraf Tamamlama'],
    },
    {
      id: 'demo-unit-sozcuk',
      title: 'Sözcükte Anlam',
      subject_id: 'demo-sub-turkce',
      sort_order: 2,
      sections: ['Gerçek Anlam', 'Mecaz Anlam'],
    },
    {
      id: 'demo-unit-kesirler',
      title: 'Kesirler',
      subject_id: 'demo-sub-matematik',
      sort_order: 3,
      sections: ['Kesir Problemleri', 'Kesir Karşılaştırma'],
    },
    {
      id: 'demo-unit-uslu',
      title: 'Üslü Sayılar',
      subject_id: 'demo-sub-matematik',
      sort_order: 4,
      sections: ['Üslü İfadeler', 'Bilimsel Gösterim'],
    },
    {
      id: 'demo-unit-fotosentez',
      title: 'Fotosentez',
      subject_id: 'demo-sub-fen',
      sort_order: 5,
      sections: ['Fotosentez', 'Solunum'],
    },
    {
      id: 'demo-unit-madde',
      title: 'Madde ve Isı',
      subject_id: 'demo-sub-fen',
      sort_order: 6,
      sections: ['Isı iletimi', 'Hal değişimi'],
    },
    {
      id: 'demo-unit-inkilap',
      title: 'Atatürk İlkeleri',
      subject_id: 'demo-sub-inkilap',
      sort_order: 7,
      sections: ['Cumhuriyetçilik', 'Laiklik'],
    },
    {
      id: 'demo-unit-ingilizce',
      title: 'Daily Routine',
      subject_id: 'demo-sub-ingilizce',
      sort_order: 8,
      sections: ['Daily Routine', 'Free time'],
    },
  ],
  DEMO_SUBJECTS
);

const EXAM_SCHEDULE = [
  { id: 'demo-exam-1', title: 'Eylül Denemesi', held_on: '2025-09-15', net: 62, schoolRank: 48, classRank: 12 },
  { id: 'demo-exam-2', title: 'Ekim Denemesi', held_on: '2025-10-20', net: 64, schoolRank: 44, classRank: 11 },
  { id: 'demo-exam-3', title: 'Kasım Denemesi', held_on: '2025-11-18', net: 66, schoolRank: 40, classRank: 10 },
  { id: 'demo-exam-4', title: 'Aralık Denemesi', held_on: '2025-12-16', net: 68, schoolRank: 36, classRank: 9 },
  { id: 'demo-exam-5', title: 'Ocak Denemesi', held_on: '2026-01-20', net: 71, schoolRank: 30, classRank: 7 },
  { id: 'demo-exam-6', title: 'Şubat Denemesi', held_on: '2026-02-17', net: 73, schoolRank: 26, classRank: 6 },
  { id: 'demo-exam-7', title: 'Mart Denemesi', held_on: '2026-03-24', net: 76, schoolRank: 20, classRank: 4 },
  { id: 'demo-exam-8', title: 'Nisan Denemesi', held_on: '2026-04-21', net: 78, schoolRank: 16, classRank: 3 },
];

function topicPlanForExam(examIndex) {
  const growth = examIndex * 0.04;
  return [
    { subject_code: 'turkce', topic_label: 'Ana Fikir', count: 4, correctRate: 0.25 + growth * 0.3 },
    { subject_code: 'turkce', topic_label: 'Yardımcı Fikir', count: 3, correctRate: 0.55 + growth },
    { subject_code: 'turkce', topic_label: 'Sözcükte Anlam', count: 3, correctRate: 0.6 + growth },
    { subject_code: 'matematik', topic_label: 'Kesirler', count: 4, correctRate: 0.35 + growth * 0.4 },
    { subject_code: 'matematik', topic_label: 'Üslü Sayılar', count: 3, correctRate: 0.5 + growth },
    { subject_code: 'matematik', topic_label: 'Cebirsel İfadeler', count: 3, correctRate: 0.58 + growth },
    { subject_code: 'fen', topic_label: 'Fotosentez', count: 4, correctRate: 0.3 + growth * 0.35 },
    { subject_code: 'fen', topic_label: 'Madde ve Isı', count: 3, correctRate: 0.62 + growth },
    { subject_code: 'fen', topic_label: 'Kuvvet ve Hareket', count: 3, correctRate: 0.55 + growth },
    { subject_code: 'inkilap', topic_label: 'Atatürk İlkeleri', count: 3, correctRate: 0.65 + growth },
    { subject_code: 'inkilap', topic_label: 'Milli Mücadele', count: 2, correctRate: 0.7 + growth },
    { subject_code: 'din', topic_label: 'İbadet', count: 3, correctRate: 0.72 + growth },
    { subject_code: 'din', topic_label: 'Ahlak', count: 2, correctRate: 0.75 + growth },
    { subject_code: 'ingilizce', topic_label: 'Daily Routine', count: 3, correctRate: 0.68 + growth },
    { subject_code: 'ingilizce', topic_label: 'Free time', count: 2, correctRate: 0.7 + growth },
  ];
}

function generateExamQuestionsAndAnswers(sessionId, examIndex, studentId) {
  const plan = topicPlanForExam(examIndex);
  const questions = [];
  const answers = [];
  let questionIndex = 1;

  for (const spec of plan) {
    const correctCount = Math.min(
      spec.count,
      Math.max(0, Math.round(spec.count * Math.min(spec.correctRate, 0.95)))
    );
    for (let i = 0; i < spec.count; i += 1) {
      const questionId = `${sessionId}-q${questionIndex}`;
      questions.push({
        id: questionId,
        subject_code: spec.subject_code,
        topic_label: spec.topic_label,
        correct_choice: 'A',
        question_index: questionIndex,
      });

      let choice = 'A';
      if (i >= correctCount) {
        choice = i % 3 === 0 ? null : i % 2 === 0 ? 'B' : 'C';
      }
      answers.push({
        id: `${sessionId}-a${questionIndex}`,
        session_id: sessionId,
        student_id: studentId,
        question_id: questionId,
        choice,
      });
      questionIndex += 1;
    }
  }

  return { questions, answers };
}

function buildSubjectRowsForExam(sessionId, studentId, net) {
  const scale = net / 78;
  return LGS_SUBJECTS.map((subject, index) => {
    const total = subject.questions;
    const correct = Math.min(total, Math.max(0, Math.round(total * (0.45 + scale * 0.35 + index * 0.02))));
    const wrong = Math.min(total - correct, Math.round((total - correct) * 0.65));
    const blank = Math.max(0, total - correct - wrong);
    return {
      session_id: sessionId,
      student_id: studentId,
      subject_code: subject.code,
      question_count: total,
      correct_count: correct,
      wrong_count: wrong,
      blank_count: blank,
      net: computeNet(correct, wrong),
    };
  });
}

function buildDemoExamPack(studentId) {
  const examSessions = EXAM_SCHEDULE.map((exam) => ({
    id: exam.id,
    title: exam.title,
    held_on: exam.held_on,
    answer_key_id: `${exam.id}-key`,
  }));

  const questionsBySession = new Map();
  const answers = [];
  const subjectResults = [];
  const rankings = [];

  EXAM_SCHEDULE.forEach((exam, examIndex) => {
    const pack = generateExamQuestionsAndAnswers(exam.id, examIndex, studentId);
    questionsBySession.set(exam.id, pack.questions);
    answers.push(...pack.answers);
    subjectResults.push(...buildSubjectRowsForExam(exam.id, studentId, exam.net));
    rankings.push({
      session_id: exam.id,
      student_id: studentId,
      total_net: exam.net,
      total_correct: Math.round(exam.net * 1.1),
      total_wrong: Math.round((90 - exam.net) * 0.6),
      total_blank: Math.max(0, 90 - Math.round(exam.net * 1.1) - Math.round((90 - exam.net) * 0.6)),
      lgs_score: estimateLgsScore(exam.net),
      school_rank: exam.schoolRank,
      grade_rank: exam.schoolRank - 2,
      class_rank: exam.classRank,
      exam_sessions: { id: exam.id, title: exam.title, held_on: exam.held_on },
    });
  });

  return { examSessions, questionsBySession, answers, subjectResults, rankings };
}

function buildDemoAtlasPack(studentId) {
  const atlasSessions = [
    { id: 'demo-atlas-1', lesson_type: 'practice', unit_id: 'demo-unit-paragraf', subject_id: 'demo-sub-turkce', questions_total: 30, week_index: 12 },
    { id: 'demo-atlas-2', lesson_type: 'practice', unit_id: 'demo-unit-kesirler', subject_id: 'demo-sub-matematik', questions_total: 28, week_index: 18 },
    { id: 'demo-atlas-3', lesson_type: 'practice', unit_id: 'demo-unit-fotosentez', subject_id: 'demo-sub-fen', questions_total: 24, week_index: 22 },
    { id: 'demo-atlas-4', lesson_type: 'practice', unit_id: 'demo-unit-uslu', subject_id: 'demo-sub-matematik', questions_total: 22, week_index: 26 },
    { id: 'demo-atlas-5', lesson_type: 'practice', unit_id: 'demo-unit-ingilizce', subject_id: 'demo-sub-ingilizce', questions_total: 20, week_index: 30 },
  ];

  const atlasResults = [
    { session_id: 'demo-atlas-1', student_id: studentId, wrong_count: 9, blank_count: 2 },
    { session_id: 'demo-atlas-2', student_id: studentId, wrong_count: 11, blank_count: 1 },
    { session_id: 'demo-atlas-3', student_id: studentId, wrong_count: 8, blank_count: 3 },
    { session_id: 'demo-atlas-4', student_id: studentId, wrong_count: 5, blank_count: 1 },
    { session_id: 'demo-atlas-5', student_id: studentId, wrong_count: 4, blank_count: 0 },
  ];

  return { atlasSessions, atlasResults };
}

function buildDemoAttendanceFlags(studentId) {
  return [
    {
      studentId,
      unitId: 'demo-unit-paragraf',
      classId: 'demo-class-8a',
      subjectId: 'demo-sub-turkce',
      absentCount: 2,
      studentName: 'Elif Yılmaz',
      classLabel: '8-A',
      subjectName: 'Türkçe',
      unitTitle: 'Paragrafta Anlam',
    },
  ];
}

export function getDemoCounselorStudent() {
  return {
    id: DEMO_COUNSELOR_STUDENT_ID,
    full_name: 'Elif Yılmaz',
    student_number: '8888',
    grade: 8,
    class_id: 'demo-class-8a',
    isDemo: true,
  };
}

export function getDemoCounselorStudentDossier() {
  const student = getDemoCounselorStudent();
  const klass = { id: 'demo-class-8a', grade: 8, name: 'A' };
  const examPack = buildDemoExamPack(student.id);
  const { atlasSessions, atlasResults } = buildDemoAtlasPack(student.id);
  const attendanceFlags = buildDemoAttendanceFlags(student.id);

  const rowsBySession = examPack.examSessions.map((session) => {
    const questions = examPack.questionsBySession.get(session.id) ?? [];
    const sessionAnswers = examPack.answers.filter((row) => row.session_id === session.id);
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

  const aggregatedTopics = aggregateTopicStatsAcrossExams(rowsBySession.map((entry) => entry.topics));
  const unitRollup = rollupDenemeTopicsToUnits(aggregatedTopics, DEMO_UNITS);
  const atlasUnits = buildAtlasUnitStats({
    atlasSessions,
    atlasResults,
    studentId: student.id,
    units: DEMO_UNITS,
  });

  const gapProfile = buildStudentGapProfile({
    studentId: student.id,
    aggregatedTopics,
    sessionTopicRows: rowsBySession,
    unitRollup,
    atlasUnits,
    missedUnitFlags: attendanceFlags,
    units: DEMO_UNITS,
    subjectResults: examPack.subjectResults,
    rankings: examPack.rankings,
    classSubjectResults: [],
  });

  return buildStudentDossierFromParts({
    student,
    klass,
    gapProfile,
    rankings: examPack.rankings,
    examSessions: examPack.examSessions,
    questionsBySession: examPack.questionsBySession,
    answers: examPack.answers,
    subjectResults: examPack.subjectResults,
    attendanceFlags,
    atlasUnits,
  });
}

export function isDemoCounselorStudentId(studentId) {
  return String(studentId ?? '').startsWith('demo-counselor-');
}
