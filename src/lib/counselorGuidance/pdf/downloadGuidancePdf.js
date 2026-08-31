/**
 * @param {ReturnType<import('./buildGuidancePdfModel.js').buildGuidancePdfModel>} model
 */
export async function downloadGuidancePdf(model) {
  const [{ pdf }, { GuidanceWorkbookPdf }, { ensurePdfFontsReady }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./GuidanceWorkbookPdf.jsx'),
    import('../../examReports/pdf/registerFonts.js'),
  ]);
  await ensurePdfFontsReady();
  const React = await import('react');
  const instance = pdf(React.createElement(GuidanceWorkbookPdf, { model }));
  const blob = await instance.toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = model.filename ?? 'rehberlik-plan.pdf';
  link.click();
  URL.revokeObjectURL(url);
}
