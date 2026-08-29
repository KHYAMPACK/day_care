import { supabase } from './supabase';
import { LGS_SUBJECTS, computeNet, subjectByCode } from './lgsExam';

export const ANSWER_KEY_SELECT = 'id, school_id, session_id, title, created_at, updated_at';
export const QUESTION_SELECT =
  'id, answer_key_id, question_index, subject_code, booklet_a_no, booklet_b_no, correct_choice, topic_id, topic_label';

export function globalQuestionIndex(subjectCode, localIndex) {
  let offset = 0;
  for (const subject of LGS_SUBJECTS) {
    if (subject.code === subjectCode) return offset + localIndex;
    offset += subject.questions;
  }
  return localIndex;
}

export function subjectForGlobalIndex(globalIndex) {
  let cursor = 0;
  for (const subject of LGS_SUBJECTS) {
    if (globalIndex <= cursor + subject.questions) {
      return { subject, localIndex: globalIndex - cursor };
    }
    cursor += subject.questions;
  }
  return null;
}

export async function loadAnswerKeys(schoolId) {
  const { data, error } = await supabase
    .from('exam_answer_keys')
    .select(ANSWER_KEY_SELECT)
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function loadQuestionsForAnswerKey(answerKeyId) {
  const { data, error } = await supabase
    .from('exam_questions')
    .select(QUESTION_SELECT)
    .eq('answer_key_id', answerKeyId)
    .order('question_index');
  if (error) throw error;
  return data ?? [];
}

export async function saveAnswerKeyWithQuestions({ schoolId, sessionId, title, questions }) {
  const { data: keyRow, error: keyError } = await supabase
    .from('exam_answer_keys')
    .insert({ school_id: schoolId, session_id: sessionId ?? null, title })
    .select(ANSWER_KEY_SELECT)
    .single();
  if (keyError) throw keyError;

  const payload = (questions ?? []).map((q) => ({
    answer_key_id: keyRow.id,
    question_index: q.question_index,
    subject_code: q.subject_code,
    booklet_a_no: q.booklet_a_no ?? null,
    booklet_b_no: q.booklet_b_no ?? null,
    correct_choice: q.correct_choice ?? null,
    topic_id: q.topic_id ?? null,
    topic_label: q.topic_label ?? null,
  }));

  if (payload.length) {
    const { error } = await supabase.from('exam_questions').insert(payload);
    if (error) throw error;
  }

  if (sessionId) {
    await supabase
      .from('exam_sessions')
      .update({ answer_key_id: keyRow.id })
      .eq('id', sessionId);
  }

  return keyRow;
}

export async function loadStudentAnswers(sessionId, studentId) {
  const { data, error } = await supabase
    .from('exam_student_answers')
    .select('id, session_id, student_id, question_id, choice, exam_questions ( question_index, subject_code, correct_choice, topic_label )')
    .eq('session_id', sessionId)
    .eq('student_id', studentId);
  if (error) throw error;
  return data ?? [];
}

export async function loadSessionStudentAnswers(sessionId) {
  const { data, error } = await supabase
    .from('exam_student_answers')
    .select('id, session_id, student_id, question_id, choice, exam_questions ( question_index, subject_code, correct_choice, topic_label, booklet_a_no, booklet_b_no )')
    .eq('session_id', sessionId);
  if (error) throw error;
  return data ?? [];
}

export function buildQuestionFrequencyReport({ questions, answers, classStudentIds }) {
  const classSet = new Set(classStudentIds ?? []);
  const filtered = (answers ?? []).filter((a) => classSet.has(a.student_id));

  return (questions ?? []).map((question) => {
    const rows = filtered.filter((a) => a.question_id === question.id);
    const total = rows.length || 1;
    const distribution = { A: 0, B: 0, C: 0, D: 0, E: 0, blank: 0 };
    let correct = 0;

    for (const row of rows) {
      const choice = row.choice;
      if (!choice) {
        distribution.blank += 1;
      } else if (distribution[choice] != null) {
        distribution[choice] += 1;
      }
      if (choice && choice === question.correct_choice) correct += 1;
    }

    const pct = (count) => Math.round((count / total) * 1000) / 10;

    return {
      ...question,
      participantCount: rows.length,
      successRate: Math.round((correct / total) * 1000) / 10,
      blankRate: pct(distribution.blank),
      distribution: Object.fromEntries(
        Object.entries(distribution).map(([key, count]) => [key, { count, pct: pct(count) }])
      ),
    };
  });
}

export function buildTopicAnalysis({ questions, answers, topicsById = {} }) {
  const buckets = new Map();

  for (const question of questions ?? []) {
    const label = question.topic_label ?? topicsById[question.topic_id]?.title ?? 'Diğer';
    const key = `${question.subject_code}::${label}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        subject_code: question.subject_code,
        topicLabel: label,
        attempts: 0,
        correct: 0,
        wrong: 0,
        blank: 0,
      });
    }
    const bucket = buckets.get(key);
    const qAnswers = (answers ?? []).filter((a) => a.question_id === question.id);
    for (const row of qAnswers) {
      bucket.attempts += 1;
      if (!row.choice) bucket.blank += 1;
      else if (row.choice === question.correct_choice) bucket.correct += 1;
      else bucket.wrong += 1;
    }
  }

  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      successRate: bucket.attempts
        ? Math.round((bucket.correct / bucket.attempts) * 1000) / 10
        : 0,
    }))
    .sort((a, b) => a.successRate - b.successRate);
}

export function buildErrorReport({ questions, answers, studentId }) {
  const studentAnswers = (answers ?? []).filter((a) => a.student_id === studentId);
  const wrongOrBlank = [];

  for (const row of studentAnswers) {
    const question = row.exam_questions ?? questions.find((q) => q.id === row.question_id);
    if (!question) continue;
    const isBlank = !row.choice;
    const isWrong = row.choice && row.choice !== question.correct_choice;
    if (!isBlank && !isWrong) continue;
    wrongOrBlank.push({
      questionIndex: question.question_index,
      subject_code: question.subject_code,
      topicLabel: question.topic_label ?? '—',
      choice: row.choice,
      correctChoice: question.correct_choice,
      status: isBlank ? 'blank' : 'wrong',
    });
  }

  return wrongOrBlank.sort((a, b) => a.questionIndex - b.questionIndex);
}

export function deriveSubjectResultsFromAnswers({ sessionId, studentId, questions, answers }) {
  const studentRows = (answers ?? []).filter((a) => a.student_id === studentId);
  const bySubject = {};

  for (const subject of LGS_SUBJECTS) {
    bySubject[subject.code] = { correct: 0, wrong: 0, blank: 0, ss: subject.questions };
  }

  for (const question of questions ?? []) {
    const answer = studentRows.find((a) => a.question_id === question.id);
    const bucket = bySubject[question.subject_code];
    if (!bucket) continue;
    if (!answer?.choice) bucket.blank += 1;
    else if (answer.choice === question.correct_choice) bucket.correct += 1;
    else bucket.wrong += 1;
  }

  return LGS_SUBJECTS.map((subject) => {
    const bucket = bySubject[subject.code];
    return {
      session_id: sessionId,
      student_id: studentId,
      subject_code: subject.code,
      question_count: subject.questions,
      correct_count: bucket.correct,
      wrong_count: bucket.wrong,
      blank_count: bucket.blank,
      net: computeNet(bucket.correct, bucket.wrong),
    };
  });
}

export function parseAnswerKeyJson(raw) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const items = Array.isArray(parsed) ? parsed : parsed?.questions ?? [];
  return items.map((item, index) => {
    const subjectCode = item.subject_code ?? item.subject ?? subjectForGlobalIndex(item.question_index ?? index + 1)?.subject.code;
    const subject = subjectByCode(subjectCode);
    const localIndex = item.local_index ?? item.question_no ?? (index % (subject?.questions ?? 20)) + 1;
    return {
      question_index: item.question_index ?? globalQuestionIndex(subjectCode, localIndex),
      subject_code: subjectCode,
      booklet_a_no: item.booklet_a_no ?? item.a ?? localIndex,
      booklet_b_no: item.booklet_b_no ?? item.b ?? localIndex,
      correct_choice: (item.correct_choice ?? item.answer ?? '').toUpperCase() || null,
      topic_label: item.topic_label ?? item.topic ?? item.konu ?? null,
    };
  });
}
