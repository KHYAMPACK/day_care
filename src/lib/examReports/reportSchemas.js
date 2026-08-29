/** @typedef {'class_combined' | 'question_frequency' | 'student_all_exams' | 'class_average' | 'multi_exam_average'} ExamReportType */

/**
 * @typedef {Object} SubjectStat
 * @property {string} code
 * @property {string} label
 * @property {string} [shortLabel]
 * @property {number} [ss]
 * @property {number|null} [correct]
 * @property {number|null} [wrong]
 * @property {number|null} [blank]
 * @property {number|null} [net]
 * @property {number|null} [examCount]
 */

/**
 * @typedef {Object} RankingStats
 * @property {number|null} [general]
 * @property {number|null} [school]
 * @property {number|null} [class]
 * @property {number|null} [grade]
 * @property {number|null} [lgs21]
 * @property {number|null} [lgs20]
 * @property {number|null} [lgs22]
 */

/**
 * @typedef {Object} ReportHeader
 * @property {string} schoolName
 * @property {string} [reportTitle]
 * @property {string} [classLabel]
 * @property {string} [examType]
 * @property {string} [reportDate]
 * @property {string} [studentName]
 * @property {string} [studentNumber]
 * @property {number} [examCount]
 * @property {string} [sessionTitle]
 * @property {string} [sessionDate]
 */

/**
 * @typedef {Object} TopicRow
 * @property {string} label
 * @property {number} [level]
 * @property {number} [ss]
 * @property {number} [correct]
 * @property {number} [wrong]
 * @property {number} [blank]
 * @property {number} [successRate]
 * @property {string} [subjectCode]
 */

/**
 * @typedef {Object} QuestionFrequencyRow
 * @property {number} questionIndex
 * @property {number|null} bookletA
 * @property {number|null} bookletB
 * @property {string|null} correctChoice
 * @property {string} topic
 * @property {number} successPct
 * @property {number} blankPct
 * @property {{ A?: number, B?: number, C?: number, D?: number }} choices
 */

/**
 * @typedef {Object} ExamSummaryRow
 * @property {number} order
 * @property {string} title
 * @property {string} heldOn
 * @property {number} participants
 * @property {number} avgNet
 */

/**
 * @typedef {Object} SessionRef
 * @property {number} order
 * @property {string} title
 * @property {string} heldOn
 */

/**
 * @typedef {Object} StudentExamRow
 * @property {number} order
 * @property {string} title
 * @property {string} heldOn
 * @property {SubjectStat[]} subjects
 * @property {number|null} totalCorrect
 * @property {number|null} totalWrong
 * @property {number|null} totalBlank
 * @property {number|null} totalNet
 * @property {number|null} lgsScore
 * @property {RankingStats} [ranks]
 */

/**
 * @typedef {Object} ClassAverageRow
 * @property {number} rank
 * @property {string} classLabel
 * @property {number} studentCount
 * @property {SubjectStat[]} subjects
 * @property {number|null} totalCorrect
 * @property {number|null} totalWrong
 * @property {number|null} totalBlank
 * @property {number|null} totalNet
 * @property {number|null} lgsScore
 * @property {RankingStats} [ranks]
 */

/**
 * @typedef {Object} MultiExamStudentRow
 * @property {number} rank
 * @property {string} classLabel
 * @property {string} studentName
 * @property {SubjectStat[]} subjects
 * @property {number|null} totalCorrect
 * @property {number|null} totalWrong
 * @property {number|null} totalBlank
 * @property {number|null} totalNet
 * @property {number|null} lgsScore
 * @property {RankingStats} [ranks]
 */

/**
 * @typedef {Object} SchoolAverages
 * @property {SubjectStat[]} subjects
 * @property {number|null} totalCorrect
 * @property {number|null} totalWrong
 * @property {number|null} totalBlank
 * @property {number|null} totalNet
 * @property {number|null} lgsScore
 */

/**
 * @typedef {Object} ClassCombinedPdfModel
 * @property {'class_combined'} type
 * @property {ReportHeader} header
 * @property {ExamSummaryRow[]} exams
 * @property {TopicRow[]} topics
 */

/**
 * @typedef {Object} QuestionFrequencyPdfModel
 * @property {'question_frequency'} type
 * @property {ReportHeader} header
 * @property {{ subjectLabel: string, subjectCode: string, rows: QuestionFrequencyRow[] }[]} sections
 */

/**
 * @typedef {Object} StudentAllExamsPdfModel
 * @property {'student_all_exams'} type
 * @property {ReportHeader} header
 * @property {StudentExamRow[]} exams
 * @property {SchoolAverages} averages
 */

/**
 * @typedef {Object} ClassAveragePdfModel
 * @property {'class_average'} type
 * @property {ReportHeader} header
 * @property {SchoolAverages} schoolAverages
 * @property {ClassAverageRow[]} classRows
 */

/**
 * @typedef {Object} MultiExamAveragePdfModel
 * @property {'multi_exam_average'} type
 * @property {'full' | 'netOnly'} [variant]
 * @property {ReportHeader} header
 * @property {SessionRef[]} sessions
 * @property {SchoolAverages} schoolAverages
 * @property {MultiExamStudentRow[]} rows
 */

/** @typedef {ClassCombinedPdfModel | QuestionFrequencyPdfModel | StudentAllExamsPdfModel | ClassAveragePdfModel | MultiExamAveragePdfModel} ExamPdfModel */

export const REPORT_TYPE_LABELS = {
  class_combined: 'Birleştirilmiş Karne',
  question_frequency: 'Soru Frekans Analizi',
  student_all_exams: 'Öğrenci Tüm Sınavlar',
  class_average: 'Sınıf Ortalama Listesi',
  multi_exam_average: 'Seçilen Sınavlar Ortalama',
};
