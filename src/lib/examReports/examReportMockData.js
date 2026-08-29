import { LGS_SUBJECTS } from '../lgsExam';

const SCHOOL = 'Yıldızlar Demo Kreşi';

function subjectStats(overrides = {}) {
  return LGS_SUBJECTS.map((def) => ({
    code: def.code,
    label: def.label,
    shortLabel: def.shortLabel,
    ss: def.questions,
    correct: 15,
    wrong: 3,
    blank: 2,
    net: 14,
    examCount: 5,
    ...overrides[def.code],
  }));
}

function ranks(seed = 1) {
  return {
    general: 40 + seed,
    school: 8 + seed,
    class: 3 + seed,
    grade: 2 + seed,
    lgs21: seed % 3,
    lgs20: (seed + 1) % 4,
    lgs22: (seed + 2) % 5,
  };
}

/** @returns {import('./reportSchemas').ClassCombinedPdfModel} */
export function mockClassCombinedReport() {
  return {
    type: 'class_combined',
    header: {
      schoolName: SCHOOL,
      reportTitle: 'SINAVZA SINIF BAZINDA BİRLEŞTİRİLMİŞ KARNE',
      classLabel: '8-A6',
      examType: 'LGS',
      reportDate: '12.07.2023',
    },
    exams: [
      { order: 1, title: 'LGS DENEME 31-ADRENALİN LGS-4', heldOn: '22.05.2023', participants: 10, avgNet: 72.7 },
      { order: 2, title: 'LGS DENEME 31-ÖZDEBİR LGS-7', heldOn: '23.05.2023', participants: 9, avgNet: 72 },
      { order: 3, title: 'LGS DENEME 32-PRUVA ÖZEL LGS-3', heldOn: '24.05.2023', participants: 10, avgNet: 67.17 },
      { order: 4, title: 'LGS DENEME 32-WORKWİN LGS', heldOn: '25.05.2023', participants: 10, avgNet: 73.24 },
      { order: 5, title: 'LGS DENEME 33-STRATEJİ LGS-4', heldOn: '27.05.2023', participants: 7, avgNet: 64.53 },
    ],
    topics: [
      { label: 'Türkçe( LGS-TRK )', level: 0, ss: 1540, correct: 1271, wrong: 255, blank: 14, successRate: 81 },
      { label: 'Sözcükte Anlam', level: 1, ss: 198, correct: 159, wrong: 38, blank: 1, successRate: 80 },
      { label: 'Çok Anlamlılık', level: 2, ss: 27, correct: 18, wrong: 9, blank: 0, successRate: 67 },
      { label: 'Paragrafta Anlam Ve Yapı', level: 1, ss: 427, correct: 361, wrong: 62, blank: 4, successRate: 85 },
      { label: 'Matematik( LGS-MAT )', level: 0, ss: 1540, correct: 1066, wrong: 280, blank: 194, successRate: 69 },
      { label: 'Kareköklü İfadeler', level: 1, ss: 382, correct: 253, wrong: 67, blank: 62, successRate: 66 },
      { label: 'Fen Bilgisi( LGS FEN )', level: 0, ss: 1540, correct: 1315, wrong: 213, blank: 12, successRate: 84 },
      { label: 'DNA ve Genetik Kod', level: 1, ss: 579, correct: 500, wrong: 77, blank: 2, successRate: 86 },
    ],
  };
}

/** @returns {import('./reportSchemas').QuestionFrequencyPdfModel} */
export function mockQuestionFrequencyReport() {
  const makeRows = (start, topics) =>
    topics.map((topic, i) => ({
      questionIndex: start + i,
      bookletA: start + i,
      bookletB: 20 - i,
      correctChoice: ['A', 'B', 'C', 'D'][i % 4],
      topic,
      successPct: 55 + (i * 3) % 40,
      blankPct: i % 5 === 0 ? 9 : 0,
      choices: {
        A: i % 4 === 0 ? 73 : 18,
        B: i % 4 === 1 ? 64 : 9,
        C: i % 4 === 2 ? 55 : 18,
        D: i % 4 === 3 ? 91 : 9,
      },
    }));

  return {
    type: 'question_frequency',
    header: {
      schoolName: SCHOOL,
      sessionTitle: 'OKYANUS CLASSMATE LGS-6 SORU FREKANS ANALİZİ',
      classLabel: '8-B',
      reportDate: '04.06.2023',
    },
    sections: [
      {
        subjectCode: 'turkce',
        subjectLabel: 'LGS-TÜRKÇE',
        rows: makeRows(1, [
          'Paragrafta Anlam Ve Yapı',
          'Paragrafta Dil Ve Anlatım',
          'Edebi Türler',
          'Sözcükte Anlam',
          'Cümlenin Ögeleri',
        ]),
      },
      {
        subjectCode: 'inkilap',
        subjectLabel: 'LGS-İNKILAP TARİHİ',
        rows: makeRows(1, [
          'Kuvayı Milliye Hareketi',
          'M. Kemal\'İn Çocukluk Dönemi Ve Öğrenim Hayatı',
          'Misakı Milli Kararları Ve TBMM\'in Açılması',
          'Batı Cephesinde İlk Başarılar',
        ]),
      },
      {
        subjectCode: 'matematik',
        subjectLabel: 'LGS-MATEMATİK',
        rows: makeRows(1, [
          'Gerçek Sayılar Ve İrrasyonel Sayılar',
          'Basit Olayların Olma Olasılığı',
          'Cebirsel İfadeler Ve Özdeşlikler',
          'Kareköklü İfade Hangi İki Doğal Sayı Arasında?',
        ]),
      },
    ],
  };
}

/** @returns {import('./reportSchemas').StudentAllExamsPdfModel} */
export function mockStudentAllExamsReport() {
  const exams = [
    'ADAY LGS-1',
    'VİP LGS-2',
    'STRATEJİ LGS-1',
    'ADRENALİN LGS-4',
    'ÖZDEBİR LGS-7',
    'PARAF LGS-6',
  ].map((title, index) => ({
    order: index + 1,
    title,
    heldOn: `0${(index % 6) + 1}.06.2023`,
    subjects: subjectStats({
      turkce: { correct: 16 + (index % 3), wrong: 2, blank: 2, net: 15.33 + index * 0.2 },
      matematik: { correct: 14 + (index % 4), wrong: 4, blank: 2, net: 12.67 + index * 0.3 },
    }),
    totalCorrect: 78 + index,
    totalWrong: 10,
    totalBlank: 8,
    totalNet: 74.66 + index * 0.5,
    lgsScore: 435 + index * 5,
    ranks: ranks(index + 1),
  }));

  return {
    type: 'student_all_exams',
    header: {
      schoolName: SCHOOL,
      studentName: 'AZRA BAKMAZ',
      studentNumber: '80027',
      classLabel: '8-A5',
      reportDate: '12.07.2023',
      examCount: exams.length,
    },
    exams,
    averages: {
      subjects: subjectStats({ turkce: { correct: 16, wrong: 2, blank: 2, net: 15.55 } }),
      totalCorrect: 70,
      totalWrong: 11,
      totalBlank: 7,
      totalNet: 70.11,
      lgsScore: 427.99,
    },
  };
}

/** @returns {import('./reportSchemas').ClassAveragePdfModel} */
export function mockClassAverageReport() {
  const classRows = ['8-A1', '8-A2', '8-A3', '8-A5', '8-B1', '8-B2'].map((label, index) => ({
    rank: index + 1,
    classLabel: label,
    studentCount: 8 + (index % 3),
    subjects: subjectStats({
      turkce: { correct: 18 - index, wrong: 1, blank: 1, net: 17.5 - index * 0.3 },
      matematik: { correct: 15 - index, wrong: 3, blank: 2, net: 14 - index * 0.4 },
    }),
    totalCorrect: 87 - index * 2,
    totalWrong: 5 + index,
    totalBlank: 4,
    totalNet: 86 - index * 2,
    lgsScore: 487 - index * 8,
    ranks: ranks(index + 1),
  }));

  return {
    type: 'class_average',
    header: {
      schoolName: SCHOOL,
      reportTitle: 'LGS SINIF ORTALAMA LİSTESİ',
      sessionTitle: 'PARAF LGS-6',
      sessionDate: '01.06.2023',
      reportDate: '12.07.2023',
    },
    schoolAverages: {
      subjects: subjectStats({ turkce: { correct: 14, wrong: 4, blank: 2, net: 14.09 } }),
      totalCorrect: 15,
      totalWrong: 4,
      totalBlank: 0,
      totalNet: 14.09,
      lgsScore: 432.28,
    },
    classRows,
  };
}

/** @returns {import('./reportSchemas').MultiExamAveragePdfModel} */
export function mockMultiExamAverageReport() {
  const sessions = [
    { order: 1, title: 'STRATEJİ LGS-4', heldOn: '27.05.2023' },
    { order: 2, title: 'ÇALIŞKAN ARGON TG LGS-8', heldOn: '29.05.2023' },
    { order: 3, title: 'ÖZDER TG LGS-3', heldOn: '30.05.2023' },
    { order: 4, title: 'YANIT ÖZEL LGS-6', heldOn: '31.05.2023' },
    { order: 5, title: 'PARAF LGS-6', heldOn: '01.06.2023' },
  ];

  const names = [
    'KEREM ÖZKAN',
    'POYRAZ TÜTÜNCÜ',
    'YAĞIZ KABA',
    'ZEYNEP SUDE ÇETİN',
    'ÖMER SELİM BURCAN',
    'ECRİN SUDE ER',
    'BERRA BAK',
    'ALPER KAPLAN',
  ];

  const rows = names.map((studentName, index) => ({
    rank: index + 1,
    classLabel: `8-A${(index % 3) + 1}`,
    studentName,
    subjects: subjectStats({
      turkce: { correct: 18 - (index % 3), wrong: 1, blank: 1, net: 17.2 - index * 0.2, examCount: 5 },
      matematik: { correct: 16 - (index % 4), wrong: 2, blank: 2, net: 15.5 - index * 0.3, examCount: 5 },
    }),
    totalCorrect: 83 - index,
    totalWrong: 2 + (index % 3),
    totalBlank: 1,
    totalNet: 84 - index * 0.5,
    lgsScore: 481 - index * 3,
    ranks: ranks(index + 1),
  }));

  return {
    type: 'multi_exam_average',
    variant: 'full',
    header: {
      schoolName: SCHOOL,
      reportTitle: 'LGS PUAN ORTALAMA LİSTESİ',
      reportDate: '12.07.2023',
    },
    sessions,
    schoolAverages: {
      subjects: subjectStats({ turkce: { correct: 18, wrong: 2, blank: 0, net: 17.22, examCount: 5 } }),
      totalCorrect: 18,
      totalWrong: 2,
      totalBlank: 0,
      totalNet: 17.22,
      lgsScore: 464.57,
    },
    rows,
  };
}

/** @type {Record<string, () => import('./reportSchemas').ExamPdfModel>} */
export const MOCK_REPORT_BUILDERS = {
  class_combined: mockClassCombinedReport,
  question_frequency: mockQuestionFrequencyReport,
  student_all_exams: mockStudentAllExamsReport,
  class_average: mockClassAverageReport,
  multi_exam_average: mockMultiExamAverageReport,
};

export function getMockReport(type) {
  const builder = MOCK_REPORT_BUILDERS[type];
  if (!builder) throw new Error(`Unknown mock report type: ${type}`);
  return builder();
}
