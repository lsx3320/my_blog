import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

const PORT = 4321;
const preview = spawn('npx', ['astro', 'preview', '--host', '127.0.0.1', '--port', String(PORT)], {
  stdio: 'ignore',
  cwd: process.cwd(),
});
const chrome = spawn('/usr/local/bin/google-chrome', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--remote-debugging-port=9335', '--user-data-dir=/tmp/chrome-layout-check', 'about:blank',
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

  const probe = `(() => {
    const doc = document.documentElement;
    const music = document.querySelector('#music-toggle');
    const musicBox = music ? music.getBoundingClientRect() : null;
    const content = document.querySelector('.article-content') || document.querySelector('main > section');
    const contentBox = content ? content.getBoundingClientRect() : null;
    const contentPad = content ? parseFloat(getComputedStyle(content).paddingRight) || 0 : 0;
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
      musicLeft: musicBox ? Math.round(musicBox.left) : null,
      contentRight: contentBox ? Math.round(contentBox.right - contentPad) : null,
      headerRight: headerWrap ? Math.round(headerWrap.getBoundingClientRect().right) : null,
      back: backBox ? { left: Math.round(backBox.left), right: Math.round(backBox.right), top: Math.round(backBox.top), text: back.textContent } : null,
      viewsClient: views ? Math.round(views.getBoundingClientRect().width) : null,
      nav: document.querySelector('.desktop-nav') ? getComputedStyle(document.querySelector('.desktop-nav')).display : '',
    };
  })()`;

  const pages = [
    ['home', 'http://127.0.0.1:4321/', [390, 900]],
    ['posts', 'http://127.0.0.1:4321/posts/', [390]],
    ['article', 'http://127.0.0.1:4321/posts/xiangsi-ersheng/', [390]],
    ['gallery', 'http://127.0.0.1:4321/gallery/', [390]],
    ['moments', 'http://127.0.0.1:4321/moments/', [390]],
    ['timeline', 'http://127.0.0.1:4321/timeline/', [390]],
    ['about', 'http://127.0.0.1:4321/about/', [390]],
    ['dsh', 'http://127.0.0.1:4321/dsh-board/', [390]],
    ['missing', 'http://127.0.0.1:4321/404/', [390]],
  ];
  for (const [name, url, widths] of pages) {
    for (const width of widths) {
      await send(ws, 'Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 800 }, sessionId);
      await send(ws, 'Page.navigate', { url }, sessionId);
      await wait(700);
      const evaluated = await send(ws, 'Runtime.evaluate', { expression: probe, returnByValue: true }, sessionId);
      const value = evaluated.result.value;
      check(`${name}@${width} overflow`, value.overflow <= 1, `overflow=${value.overflow}`);
      if (name !== 'dsh') check(`${name}@${width} skip link`, value.skip);
      if (name === 'posts') check('search input', value.search);
      if (name === 'article' || name === 'moments') {
        if (name === 'article') check('voice control', value.voice);
        check(name + ' clears music button', value.contentRight !== null && value.musicLeft !== null && value.contentRight <= value.musicLeft - 4, `contentRight=${value.contentRight} musicLeft=${value.musicLeft}`);
      }
      if (name === 'home' && width === 390) {
        check('phone sidebar is one column', value.sidebar && !/\d+px \d+px/.test(value.sidebar), value.sidebar);
        check('home keeps header wide', value.headerRight > 340, `headerRight=${value.headerRight}`);
      }
      if (name === 'home' && width === 900) check('desktop nav visible', value.nav === 'flex', value.nav);
      if (name === 'gallery') {
        check('gallery alts', value.galleryAlts.length > 0 && value.galleryAlts.every((alt) => alt && alt.trim()), JSON.stringify(value.galleryAlts));
      }
      if (name === 'moments') {
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
