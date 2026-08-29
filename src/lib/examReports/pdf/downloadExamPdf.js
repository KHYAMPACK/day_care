import { buildPdfFilename } from './pdfFilename';

/** @param {import('../reportSchemas').ExamPdfModel | any} reportOrModel @param {string} [filename] */
export async function downloadExamPdf(reportOrModel, filename) {
  const [{ pdf }, { getExamPdfDocument }, { ensurePdfFontsReady }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./getExamPdfDocument.jsx'),
    import('./registerFonts.js'),
  ]);
  await ensurePdfFontsReady();
  const doc = getExamPdfDocument(reportOrModel);
  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = buildPdfFilename(reportOrModel, filename);
  link.click();
  URL.revokeObjectURL(url);
}

/** @param {import('../reportSchemas').ExamPdfModel | any} reportOrModel */
export async function previewExamPdfBlob(reportOrModel) {
  const [{ pdf }, { getExamPdfDocument }, { ensurePdfFontsReady }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./getExamPdfDocument.jsx'),
    import('./registerFonts.js'),
  ]);
  await ensurePdfFontsReady();
  const doc = getExamPdfDocument(reportOrModel);
  return pdf(doc).toBlob();
}
