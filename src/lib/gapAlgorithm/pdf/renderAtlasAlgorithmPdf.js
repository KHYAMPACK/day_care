import React from 'react';
import { Font, renderToBuffer } from '@react-pdf/renderer';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AtlasAlgorithmDocument } from './AtlasAlgorithmPdf.jsx';

let fontsRegistered = false;

function registerBrochureFontsNode() {
  if (fontsRegistered) return;
  fontsRegistered = true;

  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  Font.register({
    family: 'NotoSans',
    fonts: [
      {
        src: resolve(
          projectRoot,
          'node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf'
        ),
        fontWeight: 400,
        fontStyle: 'normal',
      },
      {
        src: resolve(
          projectRoot,
          'node_modules/@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf'
        ),
        fontWeight: 700,
        fontStyle: 'normal',
      },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
}

/** @returns {Promise<Buffer>} */
export async function renderAtlasAlgorithmPdfBuffer() {
  registerBrochureFontsNode();
  return renderToBuffer(React.createElement(AtlasAlgorithmDocument));
}
