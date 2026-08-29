import { Document, Page, Text, View } from '@react-pdf/renderer';
import { LGS_SUBJECTS } from '../../../lgsExam';
import { chunkRows, formatNum, formatReportDateTime } from '../formatReport';
import { CHART_COLORS, DonutChart, SubjectNetChart } from '../PdfCharts';
import { PdfFooter, PdfTable } from '../PdfTable';
import { ReportHeader } from '../ReportHeader';
import {
  buildAverageSummaryRow,
  buildRankingColumns,
  buildRankingHeaderRows,
  buildSubjectDYNColumns,
  buildSubjectHeaderRows,
  LGS_SUBJECT_PDF_SHORT_LABELS,
} from '../SubjectGridHeader';
import { baseStyles, chartStyles } from '../styles';

function subjectChartData(schoolAverages) {
  return (schoolAverages?.subjects ?? []).map((subject) => ({
    label: LGS_SUBJECT_PDF_SHORT_LABELS[subject.code] ?? subject.label ?? subject.code,
    net: subject.net ?? 0,
  }));
}

/** @param {{ model: import('../../reportSchemas').ClassAveragePdfModel }} props */
export function ClassAveragePdf({ model }) {
  const { header, schoolAverages, classRows } = model;
  const generatedAt = formatReportDateTime(new Date());

  const summaryRow = buildAverageSummaryRow(schoolAverages, 'PUAN');
  const summaryColumns = [
    { key: 'label', label: '', width: '8%', render: (r) => r.label },
    ...buildSubjectDYNColumns(false),
    ...buildRankingColumns(),
  ];

  const dataColumns = [
    { key: 'rank', label: 'SIRA NO', width: '5%', align: 'center', render: (r) => String(r.rank) },
    { key: 'classLabel', label: 'ŞUBE', width: '7%', render: (r) => r.classLabel },
    {
      key: 'studentCount',
      label: 'Öğr S.',
      width: '5%',
      align: 'center',
      render: (r) => String(r.studentCount),
    },
    ...buildSubjectDYNColumns(false),
    ...buildRankingColumns(),
  ];

  const subjectHeader = buildSubjectHeaderRows(false);
  const rankingHeader = buildRankingHeaderRows();
  const headerRows = [
    [
      { label: 'SIRA NO', width: '5%' },
      { label: 'ŞUBE', width: '7%' },
      { label: 'Öğr S.', width: '5%' },
      ...subjectHeader[0],
      ...rankingHeader[0],
    ],
    [
      { label: '', width: '5%' },
      { label: '', width: '7%' },
      { label: '', width: '5%' },
      ...subjectHeader[1],
      ...rankingHeader[1],
    ],
    [
      { label: '', width: '5%' },
      { label: '', width: '7%' },
      { label: '', width: '5%' },
      ...subjectHeader[1],
      ...rankingHeader[2],
    ],
  ];

  const summaryHeaderRows = [
    [{ label: 'ORTALAMA NETLER', width: '100%', colSpan: 20 }],
    [
      { label: 'PUAN', width: '8%' },
      ...LGS_SUBJECTS.flatMap((def) => [
        { label: LGS_SUBJECT_PDF_SHORT_LABELS[def.code] ?? def.shortLabel, width: '9%', colSpan: 3 },
      ]),
      { label: 'TOPLAM', width: '9%', colSpan: 3 },
      { label: 'LGS', width: '4%' },
    ],
    [
      { label: '', width: '8%' },
      ...LGS_SUBJECTS.flatMap(() => [
        { label: 'D', width: '3%' },
        { label: 'Y', width: '3%' },
        { label: 'N', width: '3%' },
      ]),
      { label: 'D', width: '3%' },
      { label: 'Y', width: '3%' },
      { label: 'N', width: '3%' },
      { label: '', width: '4%' },
    ],
  ];

  const rowChunks = chunkRows(classRows, 12);
  const answerSegments = [
    { label: 'Doğru', value: schoolAverages?.totalCorrect ?? 0, color: CHART_COLORS.correct },
    { label: 'Yanlış', value: schoolAverages?.totalWrong ?? 0, color: CHART_COLORS.wrong },
    { label: 'Boş', value: schoolAverages?.totalBlank ?? 0, color: CHART_COLORS.blank },
  ];

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={baseStyles.pageLandscape}>
        <ReportHeader
          schoolName={header.schoolName}
          reportTitle={header.reportTitle}
          subtitle={`${header.sessionTitle ?? ''} · ${header.sessionDate ?? ''}`}
          meta={[
            { label: 'Şube', value: String(classRows.length) },
            { label: 'Ort. net', value: formatNum(schoolAverages?.totalNet, 2) },
          ]}
        />

        <View style={chartStyles.chartsRow}>
          <SubjectNetChart subjects={subjectChartData(schoolAverages)} title="Kurum ders ortalamaları" />
          <DonutChart title="Kurum cevap dağılımı" segments={answerSegments} />
        </View>

        <PdfTable columns={summaryColumns} rows={[summaryRow]} headerRows={summaryHeaderRows} />
        <PdfTable columns={dataColumns} rows={rowChunks[0]} headerRows={headerRows} />
        <PdfFooter schoolName={header.schoolName} generatedAt={generatedAt} />
      </Page>
      {rowChunks.slice(1).map((chunk, pageIndex) => (
        <Page key={`page-${pageIndex}`} size="A4" orientation="landscape" style={baseStyles.pageLandscape}>
          <PdfTable columns={dataColumns} rows={chunk} headerRows={headerRows} />
          <PdfFooter schoolName={header.schoolName} generatedAt={generatedAt} />
        </Page>
      ))}
    </Document>
  );
}
