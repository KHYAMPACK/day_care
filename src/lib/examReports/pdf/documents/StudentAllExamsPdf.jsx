import { Document, Page, Text, View } from '@react-pdf/renderer';
import { LGS_SUBJECTS } from '../../../lgsExam';
import { chunkRows, formatNum, formatReportDateTime } from '../formatReport';
import { PdfFooter, PdfTable } from '../PdfTable';
import {
  buildRankingColumns,
  buildRankingHeaderRows,
  LGS_SUBJECT_PDF_LABELS,
  subjectByCode,
} from '../SubjectGridHeader';
import { baseStyles } from '../styles';

/** @param {{ model: import('../../reportSchemas').StudentAllExamsPdfModel }} props */
export function StudentAllExamsPdf({ model }) {
  const { header, exams, averages } = model;
  const generatedAt = formatReportDateTime(new Date());

  const fixedColumns = [
    { key: 'order', label: 'SIRA NO', width: '3%', align: 'center', render: (r) => String(r.order ?? '') },
    { key: 'title', label: 'SINAV ADI', width: '10%', render: (r) => r.title ?? '' },
    { key: 'heldOn', label: 'SINAV TARİHİ', width: '5%', align: 'center', render: (r) => r.heldOn ?? '' },
  ];

  const subjectColumns = LGS_SUBJECTS.flatMap((def) => [
    {
      key: `${def.code}_ss`,
      label: 'SS',
      width: '2%',
      align: 'center',
      render: (r) => formatNum(subjectByCode(r.subjects, def.code)?.ss, 0),
    },
    {
      key: `${def.code}_d`,
      label: 'D',
      width: '2%',
      align: 'center',
      render: (r) => formatNum(subjectByCode(r.subjects, def.code)?.correct, 0),
    },
    {
      key: `${def.code}_y`,
      label: 'Y',
      width: '2%',
      align: 'center',
      render: (r) => formatNum(subjectByCode(r.subjects, def.code)?.wrong, 0),
    },
    {
      key: `${def.code}_n`,
      label: 'N',
      width: '2.5%',
      align: 'center',
      render: (r) => formatNum(subjectByCode(r.subjects, def.code)?.net, 2),
    },
  ]);

  const rankingColumns = buildRankingColumns();
  const columns = [...fixedColumns, ...subjectColumns, ...rankingColumns];

  const subjectHeaderTop = LGS_SUBJECTS.map((def) => ({
    label: LGS_SUBJECT_PDF_LABELS[def.code] ?? def.label,
    width: '8.5%',
    colSpan: 4,
  }));

  const subjectHeaderBottom = LGS_SUBJECTS.flatMap(() => [
    { label: 'SS', width: '2%' },
    { label: 'D', width: '2%' },
    { label: 'Y', width: '2%' },
    { label: 'N', width: '2.5%' },
  ]);

  const rankingHeader = buildRankingHeaderRows();
  const headerRows = [
    [
      { label: 'SIRA NO', width: '3%' },
      { label: 'SINAV ADI', width: '10%' },
      { label: 'SINAV TARİHİ', width: '5%' },
      ...subjectHeaderTop,
      ...rankingHeader[0],
    ],
    [
      { label: '', width: '3%' },
      { label: '', width: '10%' },
      { label: '', width: '5%' },
      ...subjectHeaderBottom,
      ...rankingHeader[1],
    ],
    [
      { label: '', width: '3%' },
      { label: '', width: '10%' },
      { label: '', width: '5%' },
      ...subjectHeaderBottom,
      ...rankingHeader[2],
    ],
  ];

  const averageRow = {
    order: '',
    title: 'Ortalamalar',
    heldOn: '',
    subjects: averages.subjects,
    totalCorrect: averages.totalCorrect,
    totalWrong: averages.totalWrong,
    totalBlank: averages.totalBlank,
    totalNet: averages.totalNet,
    lgsScore: averages.lgsScore,
    ranks: {},
  };

  const rowChunks = chunkRows(exams, 12);

  return (
    <Document>
      {rowChunks.map((chunk, pageIndex) => (
        <Page key={`page-${pageIndex}`} size="A4" orientation="landscape" style={baseStyles.pageLandscape}>
          {pageIndex === 0 ? (
            <>
              <Text style={baseStyles.schoolTitle}>{header.schoolName}</Text>
              <View style={baseStyles.metaRow}>
                <View style={baseStyles.metaItem}>
                  <Text style={baseStyles.metaLabel}>Ad Soyad:</Text>
                  <Text>{header.studentName}</Text>
                </View>
                <View style={baseStyles.metaItem}>
                  <Text style={baseStyles.metaLabel}>Numara:</Text>
                  <Text>{header.studentNumber ?? '—'}</Text>
                </View>
                <View style={baseStyles.metaItem}>
                  <Text style={baseStyles.metaLabel}>Şube:</Text>
                  <Text>{header.classLabel}</Text>
                </View>
                <View style={baseStyles.metaItem}>
                  <Text style={baseStyles.metaLabel}>Rapor Tarihi:</Text>
                  <Text>{header.reportDate}</Text>
                </View>
                <View style={baseStyles.metaItem}>
                  <Text style={baseStyles.metaLabel}>Sınav Sayısı:</Text>
                  <Text>{header.examCount ?? exams.length}</Text>
                </View>
              </View>
            </>
          ) : null}
          <PdfTable
            columns={columns}
            rows={pageIndex === rowChunks.length - 1 ? [...chunk, averageRow] : chunk}
            headerRows={headerRows}
          />
          <PdfFooter schoolName={header.schoolName} generatedAt={generatedAt} />
        </Page>
      ))}
    </Document>
  );
}
