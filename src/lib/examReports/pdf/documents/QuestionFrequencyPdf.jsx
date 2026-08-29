import { Document, Page, Text } from '@react-pdf/renderer';
import { formatNum, formatPct, formatReportDateTime } from '../formatReport';
import { PdfFooter, PdfTable } from '../PdfTable';
import { ReportHeader } from '../ReportHeader';
import { baseStyles } from '../styles';

/** @param {{ model: import('../../reportSchemas').QuestionFrequencyPdfModel }} props */
export function QuestionFrequencyPdf({ model }) {
  const { header, sections } = model;
  const generatedAt = formatReportDateTime(new Date());

  const columns = [
    { key: 'bookletA', label: 'A', width: '6%', align: 'center', render: (r) => formatNum(r.bookletA, 0) },
    { key: 'bookletB', label: 'B', width: '6%', align: 'center', render: (r) => formatNum(r.bookletB, 0) },
    { key: 'correctChoice', label: 'CVP', width: '6%', align: 'center', render: (r) => r.correctChoice ?? '—' },
    { key: 'topic', label: 'Konu', width: '28%', render: (r) => r.topic },
    {
      key: 'successPct',
      label: 'BAŞARI',
      width: '10%',
      align: 'center',
      render: (r) => formatPct(r.successPct),
    },
    { key: 'blankPct', label: 'BOŞ', width: '8%', align: 'center', render: (r) => formatPct(r.blankPct) },
    { key: 'a', label: 'A', width: '9%', align: 'center', render: (r) => formatPct(r.choices?.A) },
    { key: 'b', label: 'B', width: '9%', align: 'center', render: (r) => formatPct(r.choices?.B) },
    { key: 'c', label: 'C', width: '9%', align: 'center', render: (r) => formatPct(r.choices?.C) },
    { key: 'd', label: 'D', width: '9%', align: 'center', render: (r) => formatPct(r.choices?.D) },
  ];

  return (
    <Document>
      {sections.map((section) => (
        <Page key={section.subjectCode} size="A4" style={baseStyles.page}>
          <ReportHeader
            schoolName={header.schoolName}
            reportTitle={`${section.subjectLabel} — soru frekans analizi`}
            subtitle={header.sessionTitle}
            meta={[
              { label: 'Sınıf', value: header.classLabel ?? '—' },
              { label: 'Soru', value: String(section.rows.length) },
            ]}
          />
          <PdfTable columns={columns} rows={section.rows} />
          <PdfFooter schoolName={header.schoolName} generatedAt={generatedAt} />
        </Page>
      ))}
    </Document>
  );
}
