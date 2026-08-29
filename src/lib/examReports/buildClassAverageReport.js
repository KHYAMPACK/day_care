import { LGS_SUBJECTS, aggregateClassSubjectAverages, estimateLgsScore, summarizeStudentSubjects } from '../lgsExam';

export function buildClassAverageReport({
  session,
  subjectResults,
  students,
  classes,
  rankings,
  schoolName,
}) {
  const classAvgs = aggregateClassSubjectAverages(subjectResults, students);
  const classMap = new Map((classes ?? []).map((c) => [c.id, c]));

  const schoolSummary = summarizeStudentSubjects(subjectResults);
  const participantCount = new Set(subjectResults.map((r) => r.student_id)).size;

  const classRows = classAvgs
    .map((row, index) => {
      const klass = classMap.get(row.classId);
      const classRankings = (rankings ?? []).filter((r) => {
        const student = students.find((s) => s.id === r.student_id);
        return (student?.class_id ?? 'none') === row.classId;
      });
      const avgSchoolRank =
        classRankings.length
          ? Math.round(classRankings.reduce((s, r) => s + (r.school_rank ?? 0), 0) / classRankings.length)
          : null;
      return {
        rank: index + 1,
        classLabel: klass ? `${klass.grade}-${klass.name}` : 'Atanmamış',
        studentCount: row.studentCount,
        subjects: row.subjects,
        totalNet: row.totalNet,
        lgsScore: row.lgsScore,
        avgSchoolRank,
      };
    })
    .sort((a, b) => b.totalNet - a.totalNet)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return {
    type: 'class_average',
    schoolName,
    sessionTitle: session?.title,
    sessionDate: session?.held_on,
    participantCount,
    schoolAverages: {
      subjects: LGS_SUBJECTS.map((def) => {
        const nets = subjectResults
          .filter((r) => r.subject_code === def.code)
          .map((r) => Number(r.net) || 0);
        const avg = nets.length ? nets.reduce((a, b) => a + b, 0) / nets.length : null;
        return { ...def, net: avg != null ? Math.round(avg * 100) / 100 : null };
      }),
      totalNet: schoolSummary.totalNet
        ? Math.round((subjectResults.reduce((s, r) => s + (Number(r.net) || 0), 0) / Math.max(participantCount * LGS_SUBJECTS.length, 1)) * LGS_SUBJECTS.length * 100) / 100
        : null,
      lgsScore: estimateLgsScore(
        subjectResults.reduce((s, r) => s + (Number(r.net) || 0), 0) / Math.max(participantCount, 1)
      ),
    },
    classRows,
  };
}
