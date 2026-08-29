import { Font } from '@react-pdf/renderer';
import notoSansRegular from '@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf?url';
import notoSansBold from '@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf?url';

let registered = false;
let fontsReadyPromise = null;

export function registerPdfFonts() {
  if (registered) return;
  registered = true;

  Font.register({
    family: 'NotoSans',
    fonts: [
      { src: notoSansRegular, fontWeight: 400, fontStyle: 'normal' },
      { src: notoSansBold, fontWeight: 700, fontStyle: 'normal' },
    ],
  });

  Font.registerHyphenationCallback((word) => [word]);
}

/** Preload font binaries so Turkish glyphs are available before the first PDF render. */
export function ensurePdfFontsReady() {
  registerPdfFonts();
  if (!fontsReadyPromise) {
    fontsReadyPromise = Promise.all([
      fetch(notoSansRegular).then((response) => {
        if (!response.ok) throw new Error('PDF font (regular) could not be loaded.');
        return response.arrayBuffer();
      }),
      fetch(notoSansBold).then((response) => {
        if (!response.ok) throw new Error('PDF font (bold) could not be loaded.');
        return response.arrayBuffer();
      }),
    ]).catch((error) => {
      fontsReadyPromise = null;
      throw error;
    });
  }
  return fontsReadyPromise;
}
