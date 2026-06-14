import sharp from 'sharp';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const sourcePath = join(publicDir, 'app-logo-source.png');

async function makeSquareIcon(size, { paddingRatio = 0.08 } = {}) {
  const padding = Math.round(size * paddingRatio);
  const inner = size - padding * 2;

  const resized = await sharp(sourcePath)
    .resize(inner, inner, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: resized, gravity: 'center' }])
    .png()
    .toBuffer();
}

const outputs = [
  { name: 'pwa-192x192.png', size: 192, paddingRatio: 0.08 },
  { name: 'pwa-512x512.png', size: 512, paddingRatio: 0.08 },
  { name: 'apple-touch-icon.png', size: 180, paddingRatio: 0.08 },
  { name: 'favicon-32x32.png', size: 32, paddingRatio: 0.06 },
  { name: 'favicon-16x16.png', size: 16, paddingRatio: 0.04 },
];

for (const { name, size, paddingRatio } of outputs) {
  const buffer = await makeSquareIcon(size, { paddingRatio });
  await sharp(buffer).toFile(join(publicDir, name));
  console.log(`Wrote ${name}`);
}

const favicon32 = await sharp(join(publicDir, 'favicon-32x32.png')).toBuffer();
await sharp(favicon32).toFile(join(publicDir, 'favicon.ico'));
console.log('Wrote favicon.ico');
