import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { mkdirSync, writeFileSync } from 'node:fs';

const PORT = 4321;
const OUT = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
const preview = spawn('npx', ['astro', 'preview', '--host', '127.0.0.1', '--port', String(PORT)], {
  stdio: 'ignore',
  cwd: process.cwd(),
});
const chrome = spawn('/usr/local/bin/google-chrome', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--remote-debugging-port=9335', '--user-data-dir=/tmp/chrome-gutter-check', 'about:blank',
], { stdio: 'ignore' });

function send(ws, method, params = {}, sessionId) {
  const id = ++send.next;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout ' + method)), 20000);
    send.pending.set(id, { resolve, reject, timer });
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    ws.send(JSON.stringify(msg));
  });
}
send.next = 0;
send.pending = new Map();

const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' ' + detail : ''}`);
  if (!ok) failures.push(name + (detail ? ' ' + detail : ''));
}

const probe = `(() => {
  const doc = document.documentElement;
  const music = document.querySelector('#music-toggle');
  const musicBox = music ? music.getBoundingClientRect() : null;
  const column = document.querySelector('.article-shell')
    || document.querySelector('.archive')
    || document.querySelector('#latest')
    || document.querySelector('.photo-grid')
    || document.querySelector('main > section');
  let insets = null;
  if (column) {
    const rect = column.getBoundingClientRect();
    const style = getComputedStyle(column);
    const padL = parseFloat(style.paddingLeft) || 0;
    const padR = parseFloat(style.paddingRight) || 0;
    const left = rect.left + padL;
    const rightEdge = rect.right - padR;
    const view = document.documentElement.clientWidth;
    insets = {
      left: Math.round(left),
      right: Math.round(view - rightEdge),
      width: Math.round(rightEdge - left),
    };
  }
  const underMusic = [];
  if (musicBox) {
    const points = [
      [musicBox.left + 6, musicBox.top + 6],
      [musicBox.right - 6, musicBox.bottom - 6],
      [(musicBox.left + musicBox.right) / 2, (musicBox.top + musicBox.bottom) / 2],
    ];
    for (const [x, y] of points) {
      const stack = document.elementsFromPoint(x, y) || [];
      const under = stack.find((el) => el !== music && !music.contains(el));
      if (under && under.closest('main')) underMusic.push(under.tagName);
    }
  }
  const blockers = ['#mobile-menu-toggle', '#theme-toggle', 'a[aria-label="搜索文章"]'];
  const coveredControls = blockers.filter((selector) => {
    const el = document.querySelector(selector);
    if (!el || !musicBox) return false;
    const rect = el.getBoundingClientRect();
    const width = Math.min(musicBox.right, rect.right) - Math.max(musicBox.left, rect.left);
    const height = Math.min(musicBox.bottom, rect.bottom) - Math.max(musicBox.top, rect.top);
    return width > 1 && height > 1;
  });
  const sidebar = document.querySelector('.journal-sidebar');
  const headerWrap = document.querySelector('.site-header .page-wrap');
  const back = document.querySelector('.back-blog');
  const backBox = back ? back.getBoundingClientRect() : null;
  const views = document.querySelector('.views');
  return {
    overflow: doc.scrollWidth - doc.clientWidth,
    title: document.title,
    skip: !!document.querySelector('.skip-link'),
    search: !!document.querySelector('#post-search'),
    voice: !!document.querySelector('#vp-open'),
    robots: document.querySelector('meta[name="robots"]')?.content || '',
    canonical: document.querySelector('link[rel="canonical"]')?.href || '',
    galleryAlts: [...document.querySelectorAll('.photo-item img')].map((img) => img.getAttribute('alt')),
    likeLabel: document.querySelector('.like-btn')?.getAttribute('aria-label') || '',
    momentAlts: [...document.querySelectorAll('.moment-img')].slice(0, 6).map((img) => img.getAttribute('alt')),
    sidebar: sidebar ? getComputedStyle(sidebar).gridTemplateColumns : '',
    insets,
    musicTop: musicBox ? Math.round(musicBox.top) : null,
    musicRight: musicBox ? Math.round(document.documentElement.clientWidth - musicBox.right) : null,
    musicWidth: musicBox ? Math.round(musicBox.width) : null,
    underMusic,
    coveredControls,
    headerRight: headerWrap ? Math.round(headerWrap.getBoundingClientRect().right) : null,
    back: backBox ? { left: Math.round(backBox.left), right: Math.round(backBox.right), text: back.textContent } : null,
    viewsClient: views ? Math.round(views.getBoundingClientRect().width) : null,
    nav: document.querySelector('.desktop-nav') ? getComputedStyle(document.querySelector('.desktop-nav')).display : '',
  };
})()`;

try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      const response = await fetch('http://127.0.0.1:' + PORT + '/');
      if (response.ok) { ready = true; break; }
    } catch { /* preview still booting */ }
    await wait(250);
  }
  if (!ready) throw new Error('preview did not start');

  let version;
  for (let i = 0; i < 40; i++) {
    try { version = await (await fetch('http://127.0.0.1:9335/json/version')).json(); break; }
    catch { await wait(250); }
  }
  if (!version) throw new Error('chrome did not start');
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    const pending = send.pending.get(data.id);
    if (!pending) return;
    send.pending.delete(data.id);
    clearTimeout(pending.timer);
    if (data.error) pending.reject(new Error(JSON.stringify(data.error)));
    else pending.resolve(data.result);
  });
  const { targetId } = await send(ws, 'Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send(ws, 'Target.attachToTarget', { targetId, flatten: true });
  await send(ws, 'Page.enable', {}, sessionId);
  await send(ws, 'Runtime.enable', {}, sessionId);

  async function shot(file, url, width, scroll) {
    await send(ws, 'Emulation.setDeviceMetricsOverride', {
      width, height: 844, deviceScaleFactor: 1, mobile: width < 800,
    }, sessionId);
    await send(ws, 'Page.navigate', { url }, sessionId);
    await wait(900);
    if (scroll) await send(ws, 'Runtime.evaluate', { expression: scroll, returnByValue: true }, sessionId);
    await wait(200);
    const image = await send(ws, 'Page.captureScreenshot', { format: 'png' }, sessionId);
    writeFileSync(OUT + '/' + file, Buffer.from(image.data, 'base64'));
  }

  const before = [
    ['gutter-before-390-home.png', 'https://lushixiao.cn/', `document.querySelector('#latest')?.scrollIntoView({block:'start'})`],
    ['gutter-before-390-posts.png', 'https://lushixiao.cn/posts/', ''],
    ['gutter-before-390-article.png', 'https://lushixiao.cn/posts/xiangsi-ersheng/', `document.querySelector('.article-content p')?.scrollIntoView({block:'center'})`],
  ];
  for (const [file, url, scroll] of before) await shot(file, url, 390, scroll);

  const pages = [
    ['home', 'http://127.0.0.1:' + PORT + '/', [360, 390, 430, 1280]],
    ['posts', 'http://127.0.0.1:' + PORT + '/posts/', [360, 390, 430, 1280]],
    ['article', 'http://127.0.0.1:' + PORT + '/posts/xiangsi-ersheng/', [360, 390, 430, 1280]],
    ['gallery', 'http://127.0.0.1:' + PORT + '/gallery/', [360, 390, 430, 1280]],
    ['moments', 'http://127.0.0.1:' + PORT + '/moments/', [360, 390, 430, 1280]],
    ['dsh', 'http://127.0.0.1:' + PORT + '/dsh-board/', [390]],
    ['missing', 'http://127.0.0.1:' + PORT + '/404/', [390]],
  ];
  const shots = new Set(['home@390', 'posts@390', 'article@390', 'moments@390', 'gallery@390', 'home@360', 'article@430', 'home@1280']);
  for (const [name, url, widths] of pages) {
    for (const width of widths) {
      await send(ws, 'Emulation.setDeviceMetricsOverride', {
        width, height: width >= 1100 ? 900 : 844, deviceScaleFactor: 1, mobile: width < 800,
      }, sessionId);
      await send(ws, 'Page.navigate', { url }, sessionId);
      await wait(700);
      const evaluated = await send(ws, 'Runtime.evaluate', { expression: probe, returnByValue: true }, sessionId);
      const value = evaluated.result.value;
      const mobile = width <= 700;
      check(`${name}@${width} overflow`, value.overflow <= 1, `overflow=${value.overflow}`);
      if (value.insets && name !== 'dsh' && name !== 'missing') {
        const delta = Math.abs(value.insets.left - value.insets.right);
        check(`${name}@${width} balanced gutters`, delta <= 8, JSON.stringify(value.insets));
        if (mobile) {
          check(`${name}@${width} no wide right gutter`, value.insets.right <= 32 && value.insets.left >= 12, JSON.stringify(value.insets));
          check(`${name}@${width} music stays at the corner`, value.musicTop > 640 && value.musicRight >= 16 && value.musicRight <= 30, `top=${value.musicTop} right=${value.musicRight}`);
          check(`${name}@${width} music target`, value.musicWidth >= 44, `width=${value.musicWidth}`);
        }
      }
      if (name !== 'dsh') check(`${name}@${width} skip link`, value.skip);
      if (name === 'posts' && width === 390) check('search input', value.search);
      if (name === 'article' && width === 390) check('voice control', value.voice);
      if (name === 'home' && width === 390) {
        check('phone sidebar is one column', value.sidebar && !/\d+px \d+px/.test(value.sidebar), value.sidebar);
      }
      if (name === 'home' && width === 1280) check('desktop nav visible', value.nav === 'flex', value.nav);
      if (name === 'gallery' && width === 390) {
        check('gallery alts', value.galleryAlts.length > 0 && value.galleryAlts.every((alt) => alt && alt.trim()));
      }
      if (name === 'moments' && width === 390) {
        check('like name', value.likeLabel.includes('点赞'), value.likeLabel);
        check('moment alts', value.momentAlts.length > 0 && value.momentAlts.every((alt) => alt && alt !== '动态图片'));
      }
      if (name === 'dsh') {
        check('return link inside viewport', value.back && value.back.left >= 0 && value.back.right <= width && value.back.text.includes('返回博客'), JSON.stringify(value.back));
        check('board tabs stay inside the viewport', value.viewsClient !== null && value.viewsClient <= width + 1, `views=${value.viewsClient}`);
      }
      if (name === 'missing') {
        check('404 noindex', value.robots.includes('noindex'), value.robots);
        check('404 has no canonical', value.canonical === '');
      }
      if (shots.has(`${name}@${width}`)) {
        const image = await send(ws, 'Page.captureScreenshot', { format: 'png' }, sessionId);
        writeFileSync(`${OUT}/gutter-after-${width}-${name}.png`, Buffer.from(image.data, 'base64'));
      }
    }
  }
  ws.close();
} finally {
  preview.kill('SIGKILL');
  chrome.kill('SIGKILL');
}
if (failures.length) {
  console.error('LAYOUT FAILURES\n' + failures.join('\n'));
  process.exit(1);
}
console.log('layout checks passed');
