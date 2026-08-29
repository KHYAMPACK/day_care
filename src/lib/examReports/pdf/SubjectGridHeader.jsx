import { LGS_SUBJECTS } from '../../lgsExam';
import { formatNum } from './formatReport';

export const LGS_SUBJECT_PDF_LABELS = {
  turkce: 'LGS-TÜRKÇE',
  inkilap: 'LGS-İNKILAP TARİHİ',
  din: 'LGS-DİN KÜLTÜRÜ VE AHLAK BİLGİSİ',
  ingilizce: 'LGS-İNGİLİZCE',
  matematik: 'LGS-MATEMATİK',
  fen: 'LGS-FEN BİLİMLERİ',
};

/** Compact labels for narrow PDF table headers */
export const LGS_SUBJECT_PDF_SHORT_LABELS = {
  turkce: 'Türkçe',
  inkilap: 'İnkılap',
  din: 'Din',
  ingilizce: 'İngilizce',
  matematik: 'Mat.',
  fen: 'Fen',
};

/** @param {import('../reportSchemas').SubjectStat[]} subjects */
export function subjectByCode(subjects, code) {
  return subjects?.find((s) => s.code === code) ?? null;
}

export function buildSubjectDYNColumns(includeExamCount = false) {
  const cols = [];
  for (const def of LGS_SUBJECTS) {
    if (includeExamCount) {
      cols.push({
        key: `${def.code}_sin`,
        label: 'Den.',
        width: '3%',
        align: 'center',
        render: (row) => formatNum(subjectByCode(row.subjects, def.code)?.examCount, 0),
      });
    }
    cols.push(
      {
        key: `${def.code}_d`,
        label: 'D',
        width: '3%',
        align: 'center',
        render: (row) => formatNum(subjectByCode(row.subjects, def.code)?.correct, 1),
      },
      {
        key: `${def.code}_y`,
        label: 'Y',
        width: '3%',
        align: 'center',
        render: (row) => formatNum(subjectByCode(row.subjects, def.code)?.wrong, 1),
      },
      {
        key: `${def.code}_n`,
        label: 'N',
        width: '3%',
        align: 'center',
        render: (row) => formatNum(subjectByCode(row.subjects, def.code)?.net, 2),
      }
    );
  }
  return cols;
}

export function buildSubjectHeaderRows(includeExamCount = false) {
  const top = [];
  const bottom = [];

  for (const def of LGS_SUBJECTS) {
    const span = includeExamCount ? 4 : 3;
    top.push({
      label: LGS_SUBJECT_PDF_SHORT_LABELS[def.code] ?? def.shortLabel ?? def.label,
      width: `${span * 3}%`,
      colSpan: span,
    });
    if (includeExamCount) bottom.push({ label: 'Den.', width: '3%' });
    bottom.push({ label: 'D', width: '3%' }, { label: 'Y', width: '3%' }, { label: 'N', width: '3%' });
  }

  return [top, bottom];
}

export function buildRankingColumns() {
  return [
    { key: 'total_d', label: 'D', width: '3%', align: 'center', render: (r) => formatNum(r.totalCorrect, 0) },
    { key: 'total_y', label: 'Y', width: '3%', align: 'center', render: (r) => formatNum(r.totalWrong, 0) },
    { key: 'total_n', label: 'N', width: '3%', align: 'center', render: (r) => formatNum(r.totalNet, 2) },
    { key: 'lgs', label: 'LGS', width: '4%', align: 'center', render: (r) => formatNum(r.lgsScore, 2) },
    {
      key: 'genel',
      label: 'GENEL',
      width: '4%',
      align: 'center',
      render: (r) => formatNum(r.ranks?.general, 0),
    },
    {
      key: 'kurum',
      label: 'KURUM',
      width: '4%',
      align: 'center',
      render: (r) => formatNum(r.ranks?.school, 0),
    },
    {
      key: 'sube',
      label: 'ŞUBE',
      width: '4%',
      align: 'center',
      render: (r) => formatNum(r.ranks?.class, 0),
    },
    {
      key: 'sinif',
      label: 'SINIF',
      width: '4%',
      align: 'center',
      render: (r) => formatNum(r.ranks?.grade, 0),
    },
    {
      key: 'lgs21',
      label: 'LGS21',
      width: '4%',
      align: 'center',
      render: (r) => formatNum(r.ranks?.lgs21, 0),
    },
    {
      key: 'lgs20',
      label: 'LGS20',
      width: '4%',
      align: 'center',
      render: (r) => formatNum(r.ranks?.lgs20, 0),
    },
    {
      key: 'lgs22',
      label: 'LGS22',
      width: '4%',
      align: 'center',
      render: (r) => formatNum(r.ranks?.lgs22, 0),
    },
  ];
}

export function buildRankingHeaderRows() {
  return [
    [{ label: 'LGS PUANI', width: '40%', colSpan: 11 }],
    [
      { label: 'TOPLAM', width: '9%', colSpan: 3 },
      { label: 'LGS', width: '4%' },
      { label: 'GENEL', width: '4%' },
      { label: 'KURUM', width: '4%' },
      { label: 'ŞUBE', width: '4%' },
      { label: 'SINIF', width: '4%' },
      { label: 'LGS21', width: '4%' },
      { label: 'LGS20', width: '4%' },
      { label: 'LGS22', width: '4%' },
    ],
    [
      { label: 'D', width: '3%' },
      { label: 'Y', width: '3%' },
      { label: 'N', width: '3%' },
      { label: 'LGS', width: '4%' },
      { label: 'GENEL', width: '4%' },
      { label: 'KURUM', width: '4%' },
      { label: 'ŞUBE', width: '4%' },
      { label: 'SINIF', width: '4%' },
      { label: 'LGS21', width: '4%' },
      { label: 'LGS20', width: '4%' },
      { label: 'LGS22', width: '4%' },
    ],
  ];
}

/** @param {import('../reportSchemas').SchoolAverages} avgs */
export function buildAverageSummaryRow(avgs, label = 'PUAN') {
  const row = {
    id: 'avg',
    label,
    subjects: avgs.subjects,
    totalCorrect: avgs.totalCorrect,
    totalWrong: avgs.totalWrong,
    totalBlank: avgs.totalBlank,
    totalNet: avgs.totalNet,
    lgsScore: avgs.lgsScore,
    ranks: {},
  };
  return row;
}
