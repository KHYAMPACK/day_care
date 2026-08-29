import { LGS_SUBJECTS, estimateLgsScore } from '../lgsExam';

export function buildMultiExamAverageReport({
  sessions,
  subjectResults,
  students,
  rankings,
  schoolName,
}) {
  const sessionIds = new Set((sessions ?? []).map((s) => s.id));
  const filtered = (subjectResults ?? []).filter((r) => sessionIds.has(r.session_id));

  const byStudent = new Map();
  for (const student of students ?? []) {
    byStudent.set(student.id, {
      student,
      subjects: Object.fromEntries(LGS_SUBJECTS.map((s) => [s.code, { nets: [], correct: [], wrong: [], blank: [], examCount: 0 }])),
      totalNets: [],
    });
  }

  for (const row of filtered) {
    const bucket = byStudent.get(row.student_id);
    if (!bucket) continue;
    const sub = bucket.subjects[row.subject_code];
    if (!sub) continue;
    sub.nets.push(Number(row.net) || 0);
    sub.correct.push(Number(row.correct_count) || 0);
    sub.wrong.push(Number(row.wrong_count) || 0);
    sub.blank.push(Number(row.blank_count) || 0);
    sub.examCount += 1;
  }

  for (const ranking of rankings ?? []) {
    if (!sessionIds.has(ranking.session_id)) continue;
    const bucket = byStudent.get(ranking.student_id);
    if (bucket) bucket.totalNets.push(Number(ranking.total_net) || 0);
  }

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  const rows = [...byStudent.values()]
    .map(({ student, subjects, totalNets }) => {
      const subjectAvgs = LGS_SUBJECTS.map((def) => {
        const sub = subjects[def.code];
        return {
          ...def,
          examCount: sub.examCount,
          correct: avg(sub.correct) != null ? Math.round(avg(sub.correct) * 10) / 10 : null,
          wrong: avg(sub.wrong) != null ? Math.round(avg(sub.wrong) * 10) / 10 : null,
          blank: avg(sub.blank) != null ? Math.round(avg(sub.blank) * 10) / 10 : null,
          net: avg(sub.nets) != null ? Math.round(avg(sub.nets) * 100) / 100 : null,
        };
      });
      const totalNet = avg(totalNets);
      return {
        student,
        classLabel: student.classes
          ? `${student.grade}-${student.classes?.name ?? ''}`
          : student.class_id
            ? `${student.grade}`
            : '—',
        subjects: subjectAvgs,
        totalNet: totalNet != null ? Math.round(totalNet * 100) / 100 : null,
        lgsScore: estimateLgsScore(totalNet),
      };
    })
    .filter((row) => row.totalNet != null)
    .sort((a, b) => b.totalNet - a.totalNet)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const schoolAvgs = LGS_SUBJECTS.map((def) => {
    const nets = rows.map((r) => r.subjects.find((s) => s.code === def.code)?.net).filter((n) => n != null);
    const net = nets.length ? nets.reduce((a, b) => a + b, 0) / nets.length : null;
    return { ...def, net: net != null ? Math.round(net * 100) / 100 : null };
  });
  const schoolTotal = rows.length ? rows.reduce((s, r) => s + r.totalNet, 0) / rows.length : null;

  return {
    type: 'multi_exam_average',
    schoolName,
    sessions: (sessions ?? []).map((s, i) => ({
      order: i + 1,
      title: s.title,
      heldOn: s.held_on,
    })),
    schoolAverages: {
      subjects: schoolAvgs,
      totalNet: schoolTotal != null ? Math.round(schoolTotal * 100) / 100 : null,
      lgsScore: estimateLgsScore(schoolTotal),
    },
    rows,
  };
}
