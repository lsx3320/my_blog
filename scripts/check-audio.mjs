#!/usr/bin/env node
/**
 * 检查每篇文章是否都有语音播报文件。
 * 有遗漏时以非 0 退出，方便在发布流程里当守门员。
 *
 * 用法：
 *   npm run audio:check          # 列出缺音频的文章
 *   npm run audio:check -- --fix # 直接为缺失文章生成（等价 npm run audio）
 */
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const POSTS_DIR = join(ROOT, 'src', 'content', 'posts');
const AUDIO_DIR = join(ROOT, 'public', 'audio');

const posts = readdirSync(POSTS_DIR)
  .filter((f) => f.endsWith('.md'))
  .map((f) => basename(f, '.md'))
  .sort();

const missing = [];
const covered = [];
for (const slug of posts) {
  const dir = join(AUDIO_DIR, slug);
  const mp3 = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith('.mp3') && statSync(join(dir, f)).size > 1024)
    : [];
  if (mp3.length === 0) missing.push(slug);
  else covered.push(`${slug}（${mp3.length} 段）`);
}

console.log(`语音覆盖：${covered.length}/${posts.length} 篇有音频`);
if (missing.length === 0) {
  console.log('✓ 全部文章都有语音播报');
  process.exit(0);
}

console.log(`\n✗ ${missing.length} 篇缺音频：`);
for (const slug of missing) console.log(`  · ${slug}`);

if (process.argv.includes('--fix')) {
  console.log('\n开始生成缺失的语音…');
  const r = spawnSync('npm', ['run', 'audio'], { cwd: ROOT, stdio: 'inherit', shell: false });
  process.exit(r.status ?? 1);
}
console.log('\n修复：npm run audio（或 npm run audio:check -- --fix）');
process.exit(1);
