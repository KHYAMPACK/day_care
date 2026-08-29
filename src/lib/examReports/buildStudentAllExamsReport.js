import { LGS_SUBJECTS, estimateLgsScore, summarizeStudentSubjects } from '../lgsExam';

export function buildStudentAllExamsReport({
  student,
  klass,
  subjectResults,
  rankings,
  schoolName,
  reportDate = new Date().toISOString().slice(0, 10),
}) {
  const bySession = new Map();
  for (const row of subjectResults ?? []) {
    const session = row.exam_sessions;
    if (!session) continue;
    if (!bySession.has(session.id)) {
      bySession.set(session.id, { session, subjects: [], ranking: null });
    }
    bySession.get(session.id).subjects.push(row);
  }

  for (const ranking of rankings ?? []) {
    const bucket = bySession.get(ranking.session_id);
    if (bucket) bucket.ranking = ranking;
  }

  const exams = [...bySession.values()]
    .sort((a, b) => (a.session.held_on ?? '').localeCompare(b.session.held_on ?? ''))
    .map(({ session, subjects, ranking }, index) => {
      const summary = summarizeStudentSubjects(subjects);
      return {
        order: index + 1,
        title: session.title,
        heldOn: session.held_on,
        subjects: LGS_SUBJECTS.map((def) => {
          const row = subjects.find((s) => s.subject_code === def.code);
          return {
            ...def,
            ss: def.questions,
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
    });

  const averages = {
    subjects: LGS_SUBJECTS.map((def) => {
      const nets = exams.map((e) => e.subjects.find((s) => s.code === def.code)?.net).filter((n) => n != null);
      const avg = nets.length ? nets.reduce((a, b) => a + b, 0) / nets.length : null;
      return { ...def, net: avg != null ? Math.round(avg * 100) / 100 : null };
    }),
    totalNet: exams.length
      ? Math.round((exams.reduce((s, e) => s + e.totalNet, 0) / exams.length) * 100) / 100
      : null,
    lgsScore: null,
  };
  averages.lgsScore = estimateLgsScore(averages.totalNet);

  return {
    type: 'student_all_exams',
    schoolName,
    studentName: student?.full_name,
    studentNumber: student?.student_number,
    classLabel: klass ? `${klass.grade}-${klass.name}` : null,
    reportDate,
    examCount: exams.length,
    exams,
    averages,
  };
}
