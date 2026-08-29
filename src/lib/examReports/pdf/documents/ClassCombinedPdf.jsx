import { Document, Page, Text, View } from '@react-pdf/renderer';
import { formatNum, formatReportDateTime } from '../formatReport';
import { CHART_COLORS, DonutChart, HorizontalBarChart, ProgressBar, StatBox } from '../PdfCharts';
import { PdfFooter, PdfTable } from '../PdfTable';
import { ReportHeader } from '../ReportHeader';
import { baseStyles, chartStyles, colors } from '../styles';

function aggregateAnswers(topics) {
  return topics.reduce(
    (acc, topic) => ({
      correct: acc.correct + (topic.correct ?? 0),
      wrong: acc.wrong + (topic.wrong ?? 0),
      blank: acc.blank + (topic.blank ?? 0),
    }),
    { correct: 0, wrong: 0, blank: 0 }
  );
}

function overallSuccess(topics) {
  const roots = topics.filter((topic) => (topic.level ?? 0) === 0);
  if (!roots.length) return 0;
  return Math.round(roots.reduce((sum, topic) => sum + (topic.successRate ?? 0), 0) / roots.length);
}

/** @param {{ model: import('../../reportSchemas').ClassCombinedPdfModel }} props */
export function ClassCombinedPdf({ model }) {
  const { header, exams, topics } = model;
  const generatedAt = formatReportDateTime(new Date());
  const answers = aggregateAnswers(topics);
  const avgParticipants = exams.length
    ? Math.round(exams.reduce((sum, exam) => sum + exam.participants, 0) / exams.length)
    : 0;
  const avgExamNet = exams.length
    ? exams.reduce((sum, exam) => sum + exam.avgNet, 0) / exams.length
    : 0;

  const examColumns = [
    { key: 'order', label: 'No', width: '6%', align: 'center', render: (r) => String(r.order) },
    { key: 'title', label: 'Sınav Adı', width: '46%', render: (r) => r.title },
    { key: 'participants', label: 'Katılan', width: '12%', align: 'center', render: (r) => String(r.participants) },
    { key: 'heldOn', label: 'Sınav Tarihi', width: '18%', align: 'center', render: (r) => r.heldOn },
    { key: 'avgNet', label: 'Ort. Net', width: '18%', align: 'right', render: (r) => formatNum(r.avgNet, 2) },
  ];

  const topicColumns = [
    {
      key: 'label',
      label: 'Konu Adı',
      width: '40%',
      render: (r) => `${'  '.repeat(r.level ?? 0)}${r.label}`,
    },
    { key: 'ss', label: 'SS', width: '8%', align: 'center', render: (r) => formatNum(r.ss, 0) },
    { key: 'correct', label: 'D', width: '8%', align: 'center', render: (r) => formatNum(r.correct, 0) },
    { key: 'wrong', label: 'Y', width: '8%', align: 'center', render: (r) => formatNum(r.wrong, 0) },
    { key: 'blank', label: 'B', width: '8%', align: 'center', render: (r) => formatNum(r.blank, 0) },
    {
      key: 'successRate',
      label: 'Başarı',
      width: '28%',
      render: (r) => (
        <View style={chartStyles.progressCell}>
          <View style={{ flex: 1 }}>
            <ProgressBar value={r.successRate ?? 0} />
          </View>
          <Text style={chartStyles.progressPct}>{formatNum(r.successRate, 0)}%</Text>
        </View>
      ),
    },
  ];

  return (
    <Document>
      <Page size="A4" style={baseStyles.page}>
        <ReportHeader
          schoolName={header.schoolName}
          reportTitle={header.reportTitle}
          subtitle="Sınıf bazında birleştirilmiş deneme analizi"
          meta={[
            { label: 'Sınıf', value: header.classLabel ?? '—' },
            { label: 'Sınav türü', value: header.examType ?? 'LGS' },
            { label: 'Deneme', value: String(exams.length) },
          ]}
        />

        <View style={chartStyles.summaryRow}>
          <StatBox label="Deneme sayısı" value={String(exams.length)} hint="Karşılaştırılan oturum" />
          <StatBox label="Ort. katılım" value={String(avgParticipants)} hint="Öğrenci / deneme" />
          <StatBox label="Genel başarı" value={`%${overallSuccess(topics)}`} hint="Ana ders ortalaması" />
          <StatBox label="Ort. net" value={formatNum(avgExamNet, 1)} hint="Deneme ortalaması" />
        </View>

        <View style={chartStyles.chartsRow}>
          <HorizontalBarChart
            title="Deneme ortalama netleri"
            items={exams.map((exam) => ({
              label: `#${exam.order}`,
              value: exam.avgNet,
            }))}
          />
          <DonutChart
            title="Cevap dağılımı (tüm konular)"
            segments={[
              { label: 'Doğru', value: answers.correct, color: CHART_COLORS.correct },
              { label: 'Yanlış', value: answers.wrong, color: CHART_COLORS.wrong },
              { label: 'Boş', value: answers.blank, color: CHART_COLORS.blank },
            ]}
          />
        </View>

        <Text style={baseStyles.sectionTitle}>Hesaplanan deneme sınavları</Text>
        <PdfTable columns={examColumns} rows={exams} />
        <PdfFooter schoolName={header.schoolName} generatedAt={generatedAt} />
      </Page>

      <Page size="A4" style={baseStyles.page}>
        <ReportHeader
          schoolName={header.schoolName}
          reportTitle="Konu başarı analizi"
          subtitle={`${header.classLabel ?? ''} · ${exams.length} deneme birleşimi`}
        />
        <PdfTable
          columns={topicColumns}
          rows={topics}
          getRowStyle={(row) => ((row.level ?? 0) === 0 ? { backgroundColor: colors.subjectRow } : null)}
        />
        <PdfFooter schoolName={header.schoolName} generatedAt={generatedAt} />
      </Page>
    </Document>
  );
}
