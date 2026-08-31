/**
 * Generate Atlas algorithm brochure PDF (Turkish).
 * Usage: npm run generate-algorithm-pdf
 */

import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const server = await createServer({
  configFile: false,
  root,
  plugins: [react()],
  logLevel: 'error',
  optimizeDeps: {
    noDiscovery: true,
    include: ['react', 'react/jsx-runtime', '@react-pdf/renderer'],
  },
  server: { middlewareMode: true },
  appType: 'custom',
});

try {
  await server.pluginContainer.buildStart({});
  const mod = await server.ssrLoadModule('/src/lib/gapAlgorithm/pdf/renderAtlasAlgorithmPdf.js');
  const buffer = await mod.renderAtlasAlgorithmPdfBuffer();
  const outDir = resolve(root, 'docs');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'atlas-ogrenci-gelisim-algoritmasi.pdf');
  writeFileSync(outPath, buffer);
  console.log(`PDF oluşturuldu: ${outPath}`);
} finally {
  await server.close();
}
