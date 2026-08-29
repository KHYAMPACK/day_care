import { LGS_SUBJECTS } from '../../lgsExam';
import { formatReportDate } from './formatReport';

/** @param {import('../reportSchemas').SubjectStat[]} subjects @param {string} code */
function findSubject(subjects, code) {
  return subjects?.find((s) => s.code === code) ?? null;
}

/** @param {any[]} subjectResults @param {string} studentId @param {string} code */
function aggregateSubject(subjectResults, studentId, code) {
  const rows = subjectResults.filter((r) => r.student_id === studentId && r.subject_code === code);
  if (!rows.length) return null;
  const def = LGS_SUBJECTS.find((s) => s.code === code);
  const correct = rows.reduce((s, r) => s + (Number(r.correct_count) || 0), 0) / rows.length;
  const wrong = rows.reduce((s, r) => s + (Number(r.wrong_count) || 0), 0) / rows.length;
  const blank = rows.reduce((s, r) => s + (Number(r.blank_count) || 0), 0) / rows.length;
  const net = rows.reduce((s, r) => s + (Number(r.net) || 0), 0) / rows.length;
  return {
    code,
    label: def?.label ?? code,
    shortLabel: def?.shortLabel,
    ss: def?.questions ?? 0,
    correct: Math.round(correct * 10) / 10,
    wrong: Math.round(wrong * 10) / 10,
    blank: Math.round(blank * 10) / 10,
    net: Math.round(net * 100) / 100,
    examCount: rows.length,
  };
}

/** @param {import('../reportSchemas').ExamPdfModel} report */
export function toExamPdfModel(report) {
  switch (report.type) {
    case 'class_combined':
      return toClassCombinedPdfModel(report);
    case 'question_frequency':
      return toQuestionFrequencyPdfModel(report);
    case 'student_all_exams':
      return toStudentAllExamsPdfModel(report);
    case 'class_average':
      return toClassAveragePdfModel(report);
    case 'multi_exam_average':
      return toMultiExamAveragePdfModel(report);
    default:
      throw new Error(`Unknown report type: ${report.type}`);
  }
}

/** @param {any} report */
export function toClassCombinedPdfModel(report) {
  return {
    type: 'class_combined',
    header: {
      schoolName: report.schoolName ?? 'Okul',
      reportTitle: 'SINAVZA SINIF BAZINDA BİRLEŞTİRİLMİŞ KARNE',
      classLabel: report.classLabel ?? '—',
      examType: 'LGS',
      reportDate: formatReportDate(new Date()),
    },
    exams: (report.examSummaries ?? []).map((row) => ({
      order: row.order,
      title: row.title,
      heldOn: row.heldOn,
      participants: row.participants,
      avgNet: row.avgNet,
    })),
    topics: (report.topicRows ?? []).map((row) => ({
      label: row.topicLabel ?? row.label,
      level: row.level ?? 0,
      ss: row.attempts ?? row.ss ?? 0,
      correct: row.correct ?? 0,
      wrong: row.wrong ?? 0,
      blank: row.blank ?? 0,
      successRate: row.successRate ?? 0,
      subjectCode: row.subject_code,
    })),
  };
}

/** @param {any} report */
export function toQuestionFrequencyPdfModel(report) {
  const bySubject = new Map();
  for (const row of report.rows ?? []) {
    const code = row.subject_code ?? 'other';
    if (!bySubject.has(code)) {
      bySubject.set(code, {
        subjectCode: code,
        subjectLabel: LGS_SUBJECTS.find((s) => s.code === code)?.label ?? code,
        rows: [],
      });
    }
    bySubject.get(code).rows.push({
      questionIndex: row.question_index ?? row.localIndex,
      bookletA: row.booklet_a_no ?? row.bookletA,
      bookletB: row.booklet_b_no ?? row.bookletB,
      correctChoice: row.correct_choice ?? row.correctChoice,
      topic: row.topic_label ?? row.topic ?? '—',
      successPct: row.successRate ?? row.successPct ?? 0,
      blankPct: row.blankRate ?? row.blankPct ?? 0,
      choices: {
        A: row.distribution?.A?.pct ?? row.choices?.A,
        B: row.distribution?.B?.pct ?? row.choices?.B,
        C: row.distribution?.C?.pct ?? row.choices?.C,
        D: row.distribution?.D?.pct ?? row.choices?.D,
      },
    });
  }

  return {
    type: 'question_frequency',
    header: {
      schoolName: report.schoolName ?? 'Okul',
      sessionTitle: report.sessionTitle ?? 'SORU FREKANS ANALİZİ',
      classLabel: report.classLabel ?? '—',
      reportDate: formatReportDate(new Date()),
    },
    sections: [...bySubject.values()],
  };
}

/** @param {any} report */
export function toStudentAllExamsPdfModel(report) {
  return {
    type: 'student_all_exams',
    header: {
      schoolName: report.schoolName ?? 'Okul',
      studentName: report.studentName,
      studentNumber: report.studentNumber,
      classLabel: report.classLabel,
      reportDate: formatReportDate(report.reportDate ?? new Date()),
      examCount: report.examCount ?? report.exams?.length ?? 0,
    },
    exams: (report.exams ?? []).map((exam) => ({
      order: exam.order,
      title: exam.title,
      heldOn: exam.heldOn,
      subjects: (exam.subjects ?? []).map((s) => ({
        code: s.code,
        label: s.label,
        shortLabel: s.shortLabel,
        ss: s.ss ?? s.questions,
        correct: s.correct ?? s.correct_count,
        wrong: s.wrong ?? s.wrong_count,
        blank: s.blank ?? s.blank_count,
        net: s.net,
      })),
      totalCorrect: exam.totalCorrect ?? exam.total_correct,
      totalWrong: exam.totalWrong ?? exam.total_wrong,
      totalBlank: exam.totalBlank ?? exam.total_blank,
      totalNet: exam.totalNet ?? exam.total_net,
      lgsScore: exam.lgsScore ?? exam.lgs_score,
      ranks: {
        general: exam.schoolRank ?? exam.ranks?.general,
        school: exam.schoolRank ?? exam.ranks?.school,
        class: exam.classRank ?? exam.ranks?.class,
        grade: exam.gradeRank ?? exam.ranks?.grade,
        lgs21: exam.ranks?.lgs21,
        lgs20: exam.ranks?.lgs20,
        lgs22: exam.ranks?.lgs22,
      },
    })),
    averages: {
      subjects: (report.averages?.subjects ?? []).map((s) => ({
        code: s.code,
        label: s.label,
        shortLabel: s.shortLabel,
        ss: s.ss ?? s.questions,
        correct: s.correct,
        wrong: s.wrong,
        blank: s.blank,
        net: s.net,
      })),
      totalCorrect: report.averages?.totalCorrect,
      totalWrong: report.averages?.totalWrong,
      totalBlank: report.averages?.totalBlank,
      totalNet: report.averages?.totalNet,
      lgsScore: report.averages?.lgsScore,
    },
  };
}

/** @param {any} report */
export function toClassAveragePdfModel(report) {
  return {
    type: 'class_average',
    header: {
      schoolName: report.schoolName ?? 'Okul',
      reportTitle: 'LGS SINIF ORTALAMA LİSTESİ',
      sessionTitle: report.sessionTitle,
      sessionDate: report.sessionDate,
      reportDate: formatReportDate(new Date()),
    },
    schoolAverages: mapSchoolAverages(report.schoolAverages),
    classRows: (report.classRows ?? []).map((row) => ({
      rank: row.rank,
      classLabel: row.classLabel,
      studentCount: row.studentCount,
      subjects: mapSubjectRows(row.subjects),
      totalCorrect: row.totalCorrect,
      totalWrong: row.totalWrong,
      totalBlank: row.totalBlank,
      totalNet: row.totalNet,
      lgsScore: row.lgsScore,
      ranks: {
        general: row.avgSchoolRank ?? row.ranks?.general,
        school: row.ranks?.school,
        class: row.ranks?.class,
        grade: row.ranks?.grade,
      },
    })),
  };
}

/** @param {any} report */
export function toMultiExamAveragePdfModel(report) {
  return {
    type: 'multi_exam_average',
    variant: report.variant ?? 'full',
    header: {
      schoolName: report.schoolName ?? 'Okul',
      reportTitle: 'LGS PUAN ORTALAMA LİSTESİ',
      reportDate: formatReportDate(new Date()),
    },
    sessions: (report.sessions ?? []).map((s) => ({
      order: s.order,
      title: s.title,
      heldOn: s.heldOn,
    })),
    schoolAverages: mapSchoolAverages(report.schoolAverages),
    rows: (report.rows ?? []).map((row) => ({
      rank: row.rank,
      classLabel: row.classLabel ?? '—',
      studentName: row.student?.full_name ?? row.studentName ?? '—',
      subjects: mapSubjectRows(row.subjects),
      totalCorrect: row.totalCorrect,
      totalWrong: row.totalWrong,
      totalBlank: row.totalBlank,
      totalNet: row.totalNet,
      lgsScore: row.lgsScore,
      ranks: row.ranks ?? {},
    })),
  };
}

function mapSchoolAverages(avgs) {
  if (!avgs) {
    return { subjects: [], totalCorrect: null, totalWrong: null, totalBlank: null, totalNet: null, lgsScore: null };
  }
  return {
    subjects: mapSubjectRows(avgs.subjects),
    totalCorrect: avgs.totalCorrect,
    totalWrong: avgs.totalWrong,
    totalBlank: avgs.totalBlank,
    totalNet: avgs.totalNet,
    lgsScore: avgs.lgsScore,
  };
}

function mapSubjectRows(subjects) {
  return (subjects ?? []).map((s) => ({
    code: s.code ?? s.subject_code,
    label: s.label,
    shortLabel: s.shortLabel,
    ss: s.ss ?? s.question_count ?? s.questions,
    correct: s.correct ?? s.correct_count,
    wrong: s.wrong ?? s.wrong_count,
    blank: s.blank ?? s.blank_count,
    net: s.net,
    examCount: s.examCount,
  }));
}

export { aggregateSubject, findSubject };
