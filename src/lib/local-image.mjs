import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

/** Read pixel size for a file in public/. Returns null when the file is missing. */
export async function readPublicImage(publicPath) {
  if (typeof publicPath !== 'string' || !publicPath.startsWith('/') || publicPath.includes('..')) return null;
  const abs = path.join(process.cwd(), 'public', publicPath.slice(1));
  if (!existsSync(abs)) return null;
  const meta = await sharp(abs, { pages: 1 }).metadata();
  if (!meta.width || !meta.height) return null;
  return { width: meta.width, height: meta.height };
}
