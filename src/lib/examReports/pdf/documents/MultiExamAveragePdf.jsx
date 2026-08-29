import { Document, Page, Text, View } from '@react-pdf/renderer';
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

function SessionList({ sessions }) {
  return (
    <View style={baseStyles.examListRow}>
      {sessions.map((session) => (
        <View key={session.order} style={baseStyles.examListItem}>
          <Text>
            {session.order}. {session.title} · {session.heldOn}
          </Text>
        </View>
      ))}
    </View>
  );
}

function buildFullColumns() {
  return [
    { key: 'rank', label: 'SIRA NO', width: '4%', align: 'center', render: (r) => String(r.rank) },
    { key: 'classLabel', label: 'ŞB', width: '5%', render: (r) => r.classLabel },
    { key: 'studentName', label: 'ADI SOYADI', width: '12%', render: (r) => r.studentName },
    ...buildSubjectDYNColumns(true),
    ...buildRankingColumns(),
  ];
}

function buildNetOnlyColumns() {
  return [
    { key: 'rank', label: 'SIRA NO', width: '5%', align: 'center', render: (r) => String(r.rank) },
    { key: 'classLabel', label: 'ŞB', width: '6%', render: (r) => r.classLabel },
    { key: 'studentName', label: 'ADI SOYADI', width: '16%', render: (r) => r.studentName },
    ...buildSubjectDYNColumns(true),
    { key: 'total_d', label: 'D', width: '3%', align: 'center', render: (r) => formatNum(r.totalCorrect, 0) },
    { key: 'total_y', label: 'Y', width: '3%', align: 'center', render: (r) => formatNum(r.totalWrong, 0) },
    { key: 'total_n', label: 'N', width: '4%', align: 'center', render: (r) => formatNum(r.totalNet, 2) },
  ];
}

function buildFullHeaderRows() {
  const subjectHeader = buildSubjectHeaderRows(true);
  const rankingHeader = buildRankingHeaderRows();
  return [
    [
      { label: 'SIRA NO', width: '4%' },
      { label: 'ŞB', width: '5%' },
      { label: 'ADI SOYADI', width: '12%' },
      ...subjectHeader[0],
      ...rankingHeader[0],
    ],
    [
      { label: '', width: '4%' },
      { label: '', width: '5%' },
      { label: '', width: '12%' },
      ...subjectHeader[1],
      ...rankingHeader[1],
    ],
    [
      { label: '', width: '4%' },
      { label: '', width: '5%' },
      { label: '', width: '12%' },
      ...subjectHeader[1],
      ...rankingHeader[2],
    ],
  ];
}

function buildNetOnlyHeaderRows() {
  const subjectHeader = buildSubjectHeaderRows(true);
  return [
    [
      { label: 'SIRA NO', width: '5%' },
      { label: 'ŞB', width: '6%' },
      { label: 'ADI SOYADI', width: '16%' },
      ...subjectHeader[0],
      { label: 'TOPLAM', width: '10%', colSpan: 3 },
    ],
    [
      { label: '', width: '5%' },
      { label: '', width: '6%' },
      { label: '', width: '16%' },
      ...subjectHeader[1],
      { label: 'D', width: '3%' },
      { label: 'Y', width: '3%' },
      { label: 'N', width: '4%' },
    ],
  ];
}

function subjectChartData(schoolAverages) {
  return (schoolAverages?.subjects ?? []).map((subject) => ({
    label: LGS_SUBJECT_PDF_SHORT_LABELS[subject.code] ?? subject.label ?? subject.code,
    net: subject.net ?? 0,
  }));
}

/** @param {{ model: import('../../reportSchemas').MultiExamAveragePdfModel }} props */
export function MultiExamAveragePdf({ model }) {
  const { header, sessions, schoolAverages, rows } = model;
  const generatedAt = formatReportDateTime(new Date());

  const summaryRow = buildAverageSummaryRow(schoolAverages, 'PUAN');
  const summaryColumns = [
    { key: 'label', label: '', width: '6%', render: (r) => r.label },
    ...buildSubjectDYNColumns(false),
    ...buildRankingColumns(),
  ];

  const fullColumns = buildFullColumns();
  const fullHeaderRows = buildFullHeaderRows();
  const fullChunks = chunkRows(rows, 14);

  const netColumns = buildNetOnlyColumns();
  const netHeaderRows = buildNetOnlyHeaderRows();
  const netChunks = chunkRows(rows, 16);

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
          reportTitle={header.reportTitle ?? 'LGS puan ortalama listesi'}
          subtitle={`${sessions.length} denemenin birleşik karşılaştırması`}
          meta={[
            { label: 'Öğrenci', value: String(rows.length) },
            { label: 'Deneme', value: String(sessions.length) },
            { label: 'Ort. net', value: formatNum(schoolAverages?.totalNet, 2) },
          ]}
        />

        <Text style={baseStyles.sectionTitle}>Hesaplanan denemeler</Text>
        <SessionList sessions={sessions} />

        <View style={chartStyles.chartsRow}>
          <SubjectNetChart subjects={subjectChartData(schoolAverages)} title="Ders bazlı ortalama net" />
          <DonutChart title="Toplam cevap dağılımı" segments={answerSegments} />
        </View>

        <PdfTable
          columns={summaryColumns}
          rows={[summaryRow]}
          headerRows={[[{ label: 'ORTALAMA NETLER', width: '100%', colSpan: 20 }]]}
        />
        <PdfTable columns={fullColumns} rows={fullChunks[0]} headerRows={fullHeaderRows} />
        <PdfFooter schoolName={header.schoolName} generatedAt={generatedAt} />
      </Page>

      {fullChunks.slice(1).map((chunk, pageIndex) => (
        <Page key={`full-${pageIndex}`} size="A4" orientation="landscape" style={baseStyles.pageLandscape}>
          <PdfTable columns={fullColumns} rows={chunk} headerRows={fullHeaderRows} />
          <PdfFooter schoolName={header.schoolName} generatedAt={generatedAt} />
        </Page>
      ))}

      <Page size="A4" orientation="landscape" style={baseStyles.pageLandscape}>
        <ReportHeader
          schoolName={header.schoolName}
          reportTitle="Net sıralı liste"
          subtitle="Seçili denemelerin birleşik net sıralaması"
        />
        <SessionList sessions={sessions} />
        <PdfTable columns={netColumns} rows={netChunks[0]} headerRows={netHeaderRows} />
        <PdfFooter schoolName={header.schoolName} generatedAt={generatedAt} />
      </Page>

      {netChunks.slice(1).map((chunk, pageIndex) => (
        <Page key={`net-${pageIndex}`} size="A4" orientation="landscape" style={baseStyles.pageLandscape}>
          <PdfTable columns={netColumns} rows={chunk} headerRows={netHeaderRows} />
          <PdfFooter schoolName={header.schoolName} generatedAt={generatedAt} />
        </Page>
      ))}
    </Document>
  );
}
