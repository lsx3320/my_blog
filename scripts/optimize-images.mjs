// 图片批量优化：将 public/gallery 下的 jpg/png 转为 ≤1920px 的高质量 WebP
// 并删除原图（保持同名路径，仅扩展名变化）。可重复执行（幂等）。
//
// 用法：npm run images:optimize
import { readdir, unlink } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'gallery');
const MAX_EDGE = 1920;
const QUALITY = 80;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

let converted = 0;
let skipped = 0;

for await (const file of walk(ROOT)) {
  const ext = extname(file).toLowerCase();
  if (!['.jpg', '.jpeg', '.png'].includes(ext)) continue;

  const out = file.slice(0, -ext.length) + '.webp';
  const meta = await sharp(file).metadata();
  if (!meta.width || !meta.height) {
    skipped++;
    continue;
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(meta.width, meta.height));
  await sharp(file)
    .rotate() // 按 EXIF 方向摆正
    .resize({
      width: Math.round(meta.width * scale),
      height: Math.round(meta.height * scale),
      fit: 'inside',
    })
    .webp({ quality: QUALITY })
    .toFile(out);

  await unlink(file);
  converted++;
  console.log(`→ ${out}  (${meta.width}x${meta.height})`);
}

console.log(`\ndone: ${converted} converted, ${skipped} skipped`);
