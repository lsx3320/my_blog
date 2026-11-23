import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { includeInSitemap } from '../src/lib/sitemap-filter.mjs';

const read = (path) => readFileSync(path, 'utf8');

test('gated tools stay out of the sitemap and public posts stay in', () => {
  assert.equal(includeInSitemap('https://lushixiao.cn/diary/'), false);
  assert.equal(includeInSitemap('https://lushixiao.cn/diary/write/'), false);
  assert.equal(includeInSitemap('https://lushixiao.cn/diary/view/'), false);
  assert.equal(includeInSitemap('https://lushixiao.cn/links/'), false);
  assert.equal(includeInSitemap('https://lushixiao.cn/posts/xiangsi-ersheng/'), true);
  assert.equal(includeInSitemap('https://lushixiao.cn/gallery/'), true);
  assert.equal(includeInSitemap('https://lushixiao.cn/dsh-board/'), true);
  assert.equal(includeInSitemap('https://lushixiao.cn/posts/diary-notes/'), true);
});

test('default share image is a real 1200x630 PNG', () => {
  const bytes = readFileSync('public/og-default.png');
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16), 1200);
  assert.equal(bytes.readUInt32BE(20), 630);
  assert.ok(bytes.length > 5000);
});

test('gallery photos all have a visible title', () => {
  const source = read('src/data/photos.ts');
  const titles = [...source.matchAll(/title:\s*'([^']*)'/g)].map((match) => match[1]);
  assert.ok(titles.length >= 10);
  assert.ok(titles.every((title) => title.trim().length > 0));
  assert.ok(titles.includes('未命名照片'));
});

test('404 and personal tools are marked noindex in source', () => {
  assert.match(read('src/pages/404.astro'), /robots="noindex"/);
  assert.match(read('src/pages/404.astro'), /canonical=\{false\}/);
  for (const file of ['src/pages/diary.astro', 'src/pages/diary/view.astro', 'src/pages/diary/write.astro', 'src/pages/links.astro']) {
    assert.match(read(file), /robots="noindex"/);
  }
});

test('hashed assets can be cached and HTML is not given the same rule', () => {
  const headers = read('public/_headers');
  assert.match(headers, /\/_astro\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/);
  assert.doesNotMatch(headers, /\/\*\.html/);
  assert.match(headers, /\/diary\/\*\n {2}X-Robots-Tag: noindex/);
  assert.match(headers, /\/404\/\n {2}X-Robots-Tag: noindex/);
});

test('moments controls and plugin board return link are named in source', () => {
  const moments = read('src/pages/moments.astro');
  assert.match(moments, /aria-label=\{`点赞，当前/);
  assert.match(moments, /aria-label="关闭照片"/);
  assert.match(moments, /class="moment-zoom"/);
  assert.doesNotMatch(moments, /动态图片/);
  const board = read('public/dsh-board/index.html');
  assert.match(board, /class="back-blog" href="\/">返回博客/);
});

test('phone reading column leaves room for the music control', () => {
  const css = read('src/styles/global.css');
  assert.match(css, /margin-right: 68px/);
  assert.match(css, /\.site-header \.page-wrap/);
  const home = read('src/pages/index.astro');
  assert.match(home, /grid-template-columns: 1fr; gap: 24px/);
  assert.match(home, /\/gallery\/thumbs\/gugong\.webp/);
  assert.doesNotMatch(home, /width="800" height="600"/);
});

test('built sitemap omits gated tools when dist exists', () => {
  const file = 'dist/sitemap-0.xml';
  if (!existsSync(file)) return;
  const xml = read(file);
  assert.doesNotMatch(xml, /\/diary\//);
  assert.doesNotMatch(xml, /\/links\//);
  assert.match(xml, /https:\/\/lushixiao\.cn\/dsh-board\//);
  assert.match(xml, /https:\/\/lushixiao\.cn\/posts\/xiangsi-ersheng\//);
  const missing = read('dist/404.html');
  assert.match(missing, /name="robots" content="noindex"/);
  assert.doesNotMatch(missing, /rel="canonical"/);
  const article = read('dist/posts/xiangsi-ersheng/index.html');
  assert.match(article, /跳到正文/);
  assert.match(article, /语音播报/);
  assert.match(article, /rel="canonical" href="https:\/\/lushixiao\.cn\/posts\/xiangsi-ersheng\/"/);
  assert.doesNotMatch(article, /name="robots" content="noindex"/);
  const home = read('dist/index.html');
  assert.match(home, /\/gallery\/thumbs\/gugong\.webp/);
  assert.match(home, /width="960"/);
});
