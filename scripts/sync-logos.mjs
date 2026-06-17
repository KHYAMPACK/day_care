import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const assetsDir = path.join(root, 'assets');

const wordmarkSource = path.join(assetsDir, 'krestakip-wordmark.png');
const iconSource = path.join(assetsDir, 'krestakip-icon.png');

async function writeSquarePng(source, destination, size) {
  await sharp(source).resize(size, size, { fit: 'cover' }).png().toFile(destination);
}

await mkdir(publicDir, { recursive: true });
await mkdir(assetsDir, { recursive: true });

await copyFile(wordmarkSource, path.join(publicDir, 'logo.png'));
await copyFile(iconSource, path.join(publicDir, 'pwa-512x512.png'));
await writeSquarePng(iconSource, path.join(publicDir, 'pwa-192x192.png'), 192);
await writeSquarePng(iconSource, path.join(publicDir, 'apple-touch-icon.png'), 180);
await writeSquarePng(iconSource, path.join(publicDir, 'favicon-32x32.png'), 32);
await writeSquarePng(iconSource, path.join(publicDir, 'favicon-16x16.png'), 16);

console.log('KreşTakip logos synced to public/');
