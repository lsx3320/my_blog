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

test('article taps keep a pressed state and show a top progress bar while the next page loads', () => {
  const css = read('src/styles/global.css');
  const layout = read('src/layouts/BaseLayout.astro');
  const script = read('src/scripts/nav-feedback.ts');
  const home = read('src/pages/index.astro');
  assert.match(layout, /id="nav-progress"/);
  assert.match(layout, /transition:persist="nav-progress"/);
  assert.match(layout, /nav-feedback/);
  assert.match(css, /\.nav-progress\.is-active \{ background: var\(--color-primary-light\); \}/);
  assert.match(css, /\.post-item > a\.is-pressed/);
  assert.match(css, /\.recent-post > a\.is-pressed/);
  assert.match(css, /\.reading-note > a\.is-pressed/);
  assert.match(css, /\.memory\.is-pressed/);
  assert.match(css, /\.pager-card\.is-pressed/);
  assert.match(css, /\.mobile-nav a\.is-pressed/);
  assert.match(css, /button, a, input \{ -webkit-tap-highlight-color: transparent; \}/);
  assert.match(script, /astro:before-preparation/);
  assert.match(script, /astro:after-swap/);
  assert.match(script, /pointerdown/);
  assert.match(script, /is-pressed/);
  assert.match(home, /\.photo-memory:is\(:active, \.is-pressed\) img/);
  assert.match(read('src/pages/posts/[slug].astro'), /class="pager-card /);
});

test('phone pages keep symmetric margins and the original corner music button', () => {
  const css = read('src/styles/global.css');
  assert.match(css, /@media \(max-width: 700px\) \{\s*\.page-wrap \{ width: calc\(100% - 40px\); \}/);
  assert.doesNotMatch(css, /margin-right:\s*68px/);
  assert.doesNotMatch(css, /padding-right:\s*68px/);
  const header = read('src/components/Header.astro');
  assert.doesNotMatch(header, /header-actions \{ margin-right: 48px/);
  const music = read('src/components/MusicPlayer.astro');
  assert.match(music, /\.music-player \{ position: fixed; bottom: 22px; right: 22px; z-index: 40; \}/);
  assert.doesNotMatch(music, /bottom: auto/);
  const footer = read('src/components/Footer.astro');
  assert.doesNotMatch(footer, /padding-bottom: calc\(88px/);
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
  assert.match(home, /https:\/\/img\.lushixiao\.cn\/gallery\/thumbs\/gugong\.webp/);
  assert.match(home, /https:\/\/img\.lushixiao\.cn\/gallery\/mountain-blessing\.webp/);
  assert.match(home, /href="\/favicon\.svg"/);
  assert.doesNotMatch(home, /src="\/gallery\//);
  assert.match(home, /width="960"/);
  const guide = read('dist/posts/transformer-guide/index.html');
  assert.match(guide, /https:\/\/img\.lushixiao\.cn\/posts\/transformer\/transformer_arch\.png/);
  assert.doesNotMatch(guide, /src="\/posts\//);
  assert.match(article, /property="og:image" content="https:\/\/img\.lushixiao\.cn\/og-default\.png"/);
  const gallery = read('dist/gallery/index.html');
  assert.match(gallery, /https:\/\/img\.lushixiao\.cn\/gallery\/(?:故宫|%E6%95%85%E5%AE%AB)\.webp/);
  assert.doesNotMatch(gallery, /src="\/gallery\//);
  const moments = read('dist/moments/index.html');
  assert.match(moments, /https:\/\/img\.lushixiao\.cn\/gallery\//);
  assert.doesNotMatch(moments, /src="\/gallery\//);
  const htmlImage = read('dist/posts/da-bing-solo-motorcycle-travel/index.html');
  assert.match(htmlImage, /https:\/\/img\.lushixiao\.cn\/posts\/da-bing-solo-motorcycle-travel\/can-am-spyder-ride\.webp/);
  assert.match(htmlImage, /property="og:image" content="https:\/\/img\.lushixiao\.cn\/posts\/da-bing-solo-motorcycle-travel\/can-am-spyder-ride\.webp"/);
  const diagram = read('dist/posts/tau-scaling-law/index.html');
  assert.match(diagram, /https:\/\/img\.lushixiao\.cn\/gallery\/tau-law\/rc-circuit\.svg/);
});
