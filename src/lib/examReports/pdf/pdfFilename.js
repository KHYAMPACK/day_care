import { REPORT_TYPE_LABELS } from '../reportSchemas';

/** @param {import('../reportSchemas').ExamPdfModel | any} reportOrModel @param {string} [filename] */
export function buildPdfFilename(reportOrModel, filename) {
  if (filename) return filename;
  const type = reportOrModel?.type ?? 'rapor';
  const label = REPORT_TYPE_LABELS[type] ?? type;
  const stamp = new Date().toISOString().slice(0, 10);
  return `${label.replace(/\s+/g, '-').toLowerCase()}-${stamp}.pdf`;
}
