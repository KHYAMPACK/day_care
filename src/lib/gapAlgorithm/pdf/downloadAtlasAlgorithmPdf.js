import { ensurePdfFontsReady } from '../../examReports/pdf/registerFonts.js';

/** Browser helper — triggers download */
export async function downloadAtlasAlgorithmPdf(filename = 'atlas-ogrenci-gelisim-algoritmasi.pdf') {
  const [{ pdf }, { AtlasAlgorithmDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./AtlasAlgorithmPdf.jsx'),
  ]);
  await ensurePdfFontsReady();
  const React = await import('react');
  const instance = pdf(React.createElement(AtlasAlgorithmDocument));
  const blob = await instance.toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
