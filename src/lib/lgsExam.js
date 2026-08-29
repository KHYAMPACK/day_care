import { supabase } from './supabase';

export const LGS_SUBJECTS = [
  { code: 'turkce', label: 'Türkçe', shortLabel: 'TRK', questions: 20 },
  { code: 'matematik', label: 'Matematik', shortLabel: 'MAT', questions: 20 },
  { code: 'fen', label: 'Fen Bilimleri', shortLabel: 'FEN', questions: 20 },
  { code: 'inkilap', label: 'T.C. İnkılap Tarihi', shortLabel: 'INK', questions: 10 },
  { code: 'din', label: 'Din Kültürü', shortLabel: 'DİN', questions: 10 },
  { code: 'ingilizce', label: 'Yabancı Dil', shortLabel: 'İNG', questions: 10 },
];

export const LGS_TOTAL_QUESTIONS = LGS_SUBJECTS.reduce((sum, s) => sum + s.questions, 0);

export const SUBJECT_RESULT_SELECT =
  'id, session_id, student_id, subject_code, question_count, correct_count, wrong_count, blank_count, net, score, updated_at';

export const RANKING_SELECT =
  'session_id, student_id, total_net, total_correct, total_wrong, total_blank, lgs_score, school_rank, grade_rank, class_rank, computed_at';

export function subjectByCode(code) {
  return LGS_SUBJECTS.find((s) => s.code === code) ?? null;
}

export function computeNet(correct, wrong) {
  const c = Number(correct) || 0;
  const w = Number(wrong) || 0;
  return Math.round((c - w / 3) * 100) / 100;
}

/** Tahmini LGS puanı — resmi MEB formülü değildir. */
export function estimateLgsScore(totalNet) {
  if (totalNet == null || Number.isNaN(Number(totalNet))) return null;
  return Math.round((Number(totalNet) * 5.95 + 10) * 100) / 100;
}

export function emptySubjectRow(subjectCode) {
  const subject = subjectByCode(subjectCode);
  return {
    subject_code: subjectCode,
    question_count: subject?.questions ?? 0,
    correct_count: '',
    wrong_count: '',
    blank_count: '',
    net: '',
  };
}

function parseCount(value) {
  if (value === '' || value == null) return '';
  const n = Number(value);
  return Number.isNaN(n) ? '' : Math.max(0, Math.floor(n));
}

export function normalizeSubjectRow(subjectCode, input = {}) {
  const subject = subjectByCode(subjectCode);
  const ss = subject?.questions ?? 0;
  let correct = parseCount(input.correct_count ?? input.correct);
  let wrong = parseCount(input.wrong_count ?? input.wrong);
  let blank = parseCount(input.blank_count ?? input.blank);

  if (input.net !== '' && input.net != null && correct === '' && wrong === '' && blank === '') {
    const net = Number(input.net);
    return {
      subject_code: subjectCode,
      question_count: ss,
      correct_count: null,
      wrong_count: null,
      blank_count: null,
      net: Number.isNaN(net) ? null : net,
    };
  }

  correct = correct === '' ? 0 : correct;
  wrong = wrong === '' ? 0 : wrong;
  blank = blank === '' ? 0 : blank;

  if (correct + wrong + blank > ss) {
    blank = Math.max(0, ss - correct - wrong);
  }

  return {
    subject_code: subjectCode,
    question_count: ss,
    correct_count: correct,
    wrong_count: wrong,
    blank_count: blank,
    net: computeNet(correct, wrong),
  };
}

export function summarizeStudentSubjects(rows) {
  const subjects = rows ?? [];
  const totalNet = subjects.reduce((sum, row) => sum + (Number(row.net) || 0), 0);
  const totalCorrect = subjects.reduce((sum, row) => sum + (Number(row.correct_count) || 0), 0);
  const totalWrong = subjects.reduce((sum, row) => sum + (Number(row.wrong_count) || 0), 0);
  const totalBlank = subjects.reduce((sum, row) => sum + (Number(row.blank_count) || 0), 0);
  const roundedNet = Math.round(totalNet * 100) / 100;
  return {
    totalNet: roundedNet,
    totalCorrect,
    totalWrong,
    totalBlank,
    lgsScore: estimateLgsScore(roundedNet),
  };
}

function isMissingLgsTables(error) {
  return /exam_subject_results|exam_session_rankings|schema cache|does not exist/i.test(
    error?.message ?? ''
  );
}

export async function loadSubjectResults(sessionId) {
  const { data, error } = await supabase
    .from('exam_subject_results')
    .select(SUBJECT_RESULT_SELECT)
    .eq('session_id', sessionId);
  if (error) {
    if (isMissingLgsTables(error)) return [];
    throw error;
  }
  return data ?? [];
}

export async function loadSessionRankings(sessionId) {
  const { data, error } = await supabase
    .from('exam_session_rankings')
    .select(RANKING_SELECT)
    .eq('session_id', sessionId)
    .order('school_rank', { ascending: true });
  if (error) {
    if (isMissingLgsTables(error)) return [];
    throw error;
  }
  return data ?? [];
}

export async function loadRankingsForStudents(studentIds, { publishedOnly = true } = {}) {
  if (!studentIds.length) return [];
  const { data, error } = await supabase
    .from('exam_session_rankings')
    .select(`${RANKING_SELECT}, exam_sessions ( id, title, held_on, kind, published_at, answer_key_id )`)
    .in('student_id', studentIds);
  if (error) {
    if (isMissingLgsTables(error)) return [];
    throw error;
  }
  return (data ?? []).filter((row) => !publishedOnly || row.exam_sessions?.published_at);
}

export async function loadPublishedSubjectResultsForStudents(studentIds) {
  if (!studentIds.length) return [];
  const { data, error } = await supabase
    .from('exam_subject_results')
    .select(`${SUBJECT_RESULT_SELECT}, exam_sessions ( id, title, held_on, kind, published_at )`)
    .in('student_id', studentIds);
  if (error) {
    if (isMissingLgsTables(error)) return [];
    throw error;
  }
  return (data ?? []).filter((row) => row.exam_sessions?.published_at);
}

export async function saveClassExamEntry({ sessionId, entries, mode = 'detailed' }) {
  if (mode === 'quick') {
    const { saveExamResults } = await import('./exams.js');
    const rows = entries
      .filter((entry) => entry.totalNet !== '' && entry.totalNet != null)
      .map((entry) => ({
        student_id: entry.student_id,
        net: entry.totalNet,
      }));
    if (rows.length) {
      await saveExamResults({ sessionId, rows });
    }
    await computeExamRankings(sessionId);
    return;
  }

  const allPayload = [];
  for (const entry of entries) {
    for (const subject of LGS_SUBJECTS) {
      const row = normalizeSubjectRow(subject.code, entry.subjects?.[subject.code] ?? {});
      if (row.net == null) continue;
      allPayload.push({
        session_id: sessionId,
        student_id: entry.student_id,
        subject_code: row.subject_code,
        question_count: row.question_count,
        correct_count: row.correct_count ?? 0,
        wrong_count: row.wrong_count ?? 0,
        blank_count: row.blank_count ?? 0,
        net: row.net,
        score: null,
      });
    }
  }

  if (allPayload.length) {
    const { error } = await supabase.from('exam_subject_results').upsert(allPayload, {
      onConflict: 'session_id,student_id,subject_code',
    });
    if (error) throw error;
  }

  await computeExamRankings(sessionId);
}

export async function loadSubjectResultsForSessions(sessionIds) {
  if (!sessionIds?.length) return [];
  const { data, error } = await supabase
    .from('exam_subject_results')
    .select(`${SUBJECT_RESULT_SELECT}, exam_sessions ( id, title, held_on, kind, published_at )`)
    .in('session_id', sessionIds);
  if (error) {
    if (isMissingLgsTables(error)) return [];
    throw error;
  }
  return data ?? [];
}

export async function loadRankingsForSessions(sessionIds) {
  if (!sessionIds?.length) return [];
  const { data, error } = await supabase
    .from('exam_session_rankings')
    .select(`${RANKING_SELECT}, exam_sessions ( id, title, held_on, kind, published_at, answer_key_id )`)
    .in('session_id', sessionIds);
  if (error) {
    if (isMissingLgsTables(error)) return [];
    throw error;
  }
  return data ?? [];
}

export async function computeExamRankings(sessionId) {
  const { error } = await supabase.rpc('compute_exam_rankings', { p_session_id: sessionId });
  if (error) {
    if (isMissingLgsTables(error)) return;
    throw error;
  }
}

export function groupSubjectResultsByStudent(rows) {
  const map = new Map();
  for (const row of rows ?? []) {
    if (!map.has(row.student_id)) map.set(row.student_id, []);
    map.get(row.student_id).push(row);
  }
  return map;
}

export function buildStudentExamCard({ session, subjectRows, ranking }) {
  const summary = summarizeStudentSubjects(subjectRows);
  return {
    sessionId: session?.id,
    title: session?.title,
    heldOn: session?.held_on,
    kind: session?.kind,
    subjects: LGS_SUBJECTS.map((def) => {
      const row = subjectRows.find((r) => r.subject_code === def.code);
      return {
        ...def,
        correct: row?.correct_count ?? null,
        wrong: row?.wrong_count ?? null,
        blank: row?.blank_count ?? null,
        net: row?.net ?? null,
      };
    }),
    ...summary,
    schoolRank: ranking?.school_rank ?? null,
    gradeRank: ranking?.grade_rank ?? null,
    classRank: ranking?.class_rank ?? null,
    lgsScore: ranking?.lgs_score ?? summary.lgsScore,
  };
}

export function buildProgressSeries(rankings) {
  return [...(rankings ?? [])]
    .sort((a, b) => (a.exam_sessions?.held_on ?? '').localeCompare(b.exam_sessions?.held_on ?? ''))
    .map((row) => ({
      sessionId: row.session_id,
      title: row.exam_sessions?.title ?? 'Sınav',
      heldOn: row.exam_sessions?.held_on,
      totalNet: Number(row.total_net) || 0,
      lgsScore: row.lgs_score != null ? Number(row.lgs_score) : estimateLgsScore(row.total_net),
    }));
}

export function aggregateClassSubjectAverages(subjectRows, students) {
  const byClass = new Map();
  const studentMap = new Map(students.map((s) => [s.id, s]));

  for (const student of students) {
    const classId = student.class_id ?? 'none';
    if (!byClass.has(classId)) {
      byClass.set(classId, { classId, studentIds: new Set(), subjects: {} });
    }
    byClass.get(classId).studentIds.add(student.id);
  }

  for (const row of subjectRows) {
    const student = studentMap.get(row.student_id);
    const classId = student?.class_id ?? 'none';
    const bucket = byClass.get(classId) ?? {
      classId,
      studentIds: new Set(),
      subjects: {},
    };
    if (!byClass.has(classId)) byClass.set(classId, bucket);

    if (!bucket.subjects[row.subject_code]) {
      bucket.subjects[row.subject_code] = { nets: [], correct: 0, wrong: 0, blank: 0, count: 0 };
    }
    const sub = bucket.subjects[row.subject_code];
    sub.nets.push(Number(row.net) || 0);
    sub.correct += Number(row.correct_count) || 0;
    sub.wrong += Number(row.wrong_count) || 0;
    sub.blank += Number(row.blank_count) || 0;
    sub.count += 1;
  }

  return [...byClass.values()].map((bucket) => {
    const subjectAvgs = LGS_SUBJECTS.map((def) => {
      const sub = bucket.subjects[def.code];
      if (!sub?.nets.length) return { ...def, net: null, correct: 0, wrong: 0, blank: 0 };
      const net = sub.nets.reduce((a, b) => a + b, 0) / sub.nets.length;
      return {
        ...def,
        net: Math.round(net * 100) / 100,
        correct: Math.round(sub.correct / sub.count),
        wrong: Math.round(sub.wrong / sub.count),
        blank: Math.round(sub.blank / sub.count),
      };
    });
    const totalNet = subjectAvgs.reduce((sum, s) => sum + (s.net ?? 0), 0);
    return {
      classId: bucket.classId,
      studentCount: bucket.studentIds.size,
      subjects: subjectAvgs,
      totalNet: Math.round(totalNet * 100) / 100,
      lgsScore: estimateLgsScore(totalNet),
    };
  });
}
