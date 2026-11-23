import { mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
mkdirSync(path.join(root, 'public/gallery/thumbs'), { recursive: true });

const svg = readFileSync(path.join(root, 'scripts/og-default.svg'));
await sharp(svg).png().toFile(path.join(root, 'public/og-default.png'));

const thumbs = [
  ['public/gallery/故宫.webp', 'public/gallery/thumbs/gugong.webp'],
  ['public/gallery/合照.webp', 'public/gallery/thumbs/group.webp'],
  ['public/gallery/ppyq/slmh/f709402f3861a10eb4749ede2e8127dd.webp', 'public/gallery/thumbs/sayram.webp'],
];
for (const [src, dest] of thumbs) {
  await sharp(path.join(root, src))
    .resize({ width: 960, withoutEnlargement: true })
    .webp({ quality: 68 })
    .toFile(path.join(root, dest));
  const meta = await sharp(path.join(root, dest)).metadata();
  console.log(`${statSync(path.join(root, dest)).size}\t${meta.width}x${meta.height}\t${dest}`);
}
console.log('og', statSync(path.join(root, 'public/og-default.png')).size);
