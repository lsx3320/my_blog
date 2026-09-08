#!/usr/bin/env node
/**
 * 文章语音生成器：把每篇 posts 正文用 MiMo mimo-v2.5-tts 合成为 MP3。
 * 用法：
 *   MIMO_API_KEY=sk-xxx npm run audio        # 全量（只补缺失/变更过的文章）
 *   MIMO_API_KEY=sk-xxx npm run audio -- --slug da-bing-ziqia-xinan   # 只生成某一篇
 *   MIMO_API_KEY=sk-xxx npm run audio -- --force                      # 全部重新生成
 *
 * 密钥也可以放在项目根目录 .env（已 gitignore），格式 MIMO_API_KEY=sk-xxx
 * 可选环境变量：
 *   MIMO_VOICE      音色：mimo_default / 冰糖 / 茉莉 / 苏打 / 白桦 / Mia / Chloe / Milo / Dean
 *   MIMO_MAX_CHARS  单次合成最大字符数（过长自动触发更小分片）
 *   MIMO_BASE_URL   手动指定接口地址
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const POSTS_DIR = join(ROOT, 'src', 'content', 'posts');
const AUDIO_DIR = join(ROOT, 'public', 'audio');
const MODEL = process.env.MIMO_MODEL || 'mimo-v2.5-tts';
const VOICE = process.env.MIMO_VOICE || 'mimo_default';
const MAX_CHARS = Math.max(200, Number(process.env.MIMO_MAX_CHARS) || 1500);
const MIN_CHARS = 60; // 少于这个字数的正文不值得合成

const args = process.argv.slice(2);
const argVal = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const onlySlug = argVal('slug');
const force = args.includes('--force');

function apiKey() {
  if (process.env.MIMO_API_KEY) return process.env.MIMO_API_KEY.trim();
  const envFile = join(ROOT, '.env');
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*MIMO_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^['"]|['"]$/g, '').trim();
    }
  }
  return '';
}

const KEY = apiKey();
if (!KEY) {
  console.error('没有找到 API 密钥：请先执行  export MIMO_API_KEY=sk-xxx ，');
  console.error('或在项目根目录 .env 文件里写一行  MIMO_API_KEY=sk-xxx');
  process.exit(1);
}

const HOSTS = [
  process.env.MIMO_BASE_URL,
  'https://api.xiaomimimo.com/v1/chat/completions',
  'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function synthChunk(text) {
  const payload = {
    model: MODEL,
    messages: [
      { role: 'user', content: '请用自然、沉稳的中文播报语气朗读以下内容。' },
      { role: 'assistant', content: text },
    ],
    audio: { format: 'mp3', voice: VOICE },
  };
  const errors = [];
  for (const url of HOSTS) {
    let res;
    {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 300000);
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'api-key': KEY, 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        });
      } catch (e) {
        clearTimeout(timer);
        errors.push(`${url} 连接失败：${e?.cause?.message || e?.message || e}`);
        continue;
      }
      clearTimeout(timer);
    if (!res.ok) {
      const raw = (await res.text()).slice(0, 400);
      errors.push(`${url} HTTP ${res.status}：${raw}`);
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        // 参数或鉴权问题：换地址也没意义，直接抛出最明确的那条
        throw new Error(errors[errors.length - 1]);
      }
      continue;
    }
    const data = await res.json();
    const b64 = data?.choices?.[0]?.message?.audio?.data;
    if (!b64) {
      throw new Error(`${url} 返回了 200 但没有音频数据：${JSON.stringify(data).slice(0, 300)}`);
    }
    return Buffer.from(b64, 'base64');
    }
  }
  throw new Error(`所有接口地址均不可用：${errors.join('；')}`);
}

async function synthWithRetry(text, attempt = 1) {
  try {
    return await synthChunk(text);
  } catch (e) {
    const msg = String(e?.message || e);
    // 参数/鉴权错误不重试；分片超长会显示 length/token/上下文 字样，交给上层缩小分片
    if (/HTTP 40[013]/.test(msg)) throw e;
    if (attempt >= 3) throw e;
    console.log(`    请求失败，${attempt * 5} 秒后重试（${msg.slice(0, 140)}）`);
    await sleep(attempt * 5000);
    return synthWithRetry(text, attempt + 1);
  }
}

/** 把 markdown 正文变成适合朗读的纯文本 */
function cleanMarkdown(raw) {
  let text = raw.replace(/^---[\s\S]*?---/, ''); // 去掉 frontmatter
  text = text.replace(/```[\s\S]*?```/g, ''); // 代码块整段跳过
  text = text.replace(/~~~[\s\S]*?~~~/g, '');
  text = text.replace(/<[^>]+>/g, ''); // HTML 标签
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1'); // 图片 → 只留 alt
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'); // 链接 → 只留文字
  text = text.replace(/https?:\/\/\S+/g, ''); // 裸链接不朗读
  text = text.replace(/`([^`]*)`/g, '$1'); // 行内代码去掉反引号
  text = text.replace(/^#{1,6}\s*/gm, ''); // 标题符号
  text = text.replace(/^\s{0,3}>\s?/gm, ''); // 引用符
  text = text.replace(/^\s*[-*+]\s+/gm, ''); // 无序列表符
  text = text.replace(/^\s*\d+[.、)]\s+/gm, ''); // 有序列表符
  text = text.replace(/^[-=]{3,}\s*$/gm, ''); // 分隔线
  text = text.replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1'); // 加粗/斜体等
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  text = text.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{2,}/g, '\n');
  return text.trim();
}

function splitIntoChunks(text, maxChars) {
  const units = text.split('\n');
  const chunks = [];
  let buf = '';
  for (let unit of units) {
    unit = unit.trim();
    if (!unit) continue;
    while (unit.length > maxChars) {
      let cut = unit.lastIndexOf('。', maxChars);
      if (cut < maxChars * 0.4) cut = unit.lastIndexOf('！', maxChars);
      if (cut < maxChars * 0.4) cut = unit.lastIndexOf('？', maxChars);
      if (cut < maxChars * 0.4) cut = unit.lastIndexOf('；', maxChars);
      if (cut < maxChars * 0.4) cut = maxChars;
      chunks.push(unit.slice(0, cut + 1).trim());
      unit = unit.slice(cut + 1).trim();
    }
    if (buf && buf.length + unit.length + 1 > maxChars) {
      chunks.push(buf.trim());
      buf = '';
    }
    buf += (buf ? '\n' : '') + unit;
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.filter(Boolean);
}

const hashOf = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

async function generatePost(file) {
  const slug = basename(file, '.md');
  const raw = readFileSync(file, 'utf8');
  if (/^\s*draft:\s*true\s*$/m.test(raw)) {
    console.log(`跳过（草稿）: ${slug}`);
    return;
  }
  const title = raw.match(/^title:\s*['"](.+?)['"]\s*$/m)?.[1] || slug;
  const text = cleanMarkdown(raw);
  const chars = text.replace(/\s/g, '').length;
  if (chars < MIN_CHARS) {
    console.log(`跳过（正文太短 ${chars} 字）: ${slug}`);
    return;
  }

  const dir = join(AUDIO_DIR, slug);
  const metaPath = join(dir, 'meta.json');
  const hash = hashOf(text);
  let need = true;
  if (!force && existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      need = meta.hash !== hash || meta.model !== MODEL || meta.voice !== VOICE;
    } catch { need = true; }
  }
  if (!need) {
    console.log(`无需更新: ${slug}（${chars} 字）`);
    return;
  }

  console.log(`\n开始生成: ${slug}（${title}，${chars} 字，音色 ${VOICE}）`);
  mkdirSync(dir, { recursive: true });
  // 清掉旧文件，避免换过参数后残留多余分段
  for (const f of readdirSync(dir)) if (f.endsWith('.mp3') || f === 'meta.json') rmSync(join(dir, f), { force: true });

  // 生成过程中实时测试最大分片，失败则缩小一半重来
  let maxChars = MAX_CHARS;
  let chunks = splitIntoChunks(text, maxChars);
  const segments = [];
  let fatal = null;
  while (chunks.length) {
    const textChunk = chunks.shift();
    const label = chunks.length ? `  ${segments.length + 1}/${segments.length + 1 + chunks.length}` : `  ${segments.length + 1}`;
    process.stdout.write(`  合成第${label}段（${textChunk.length} 字）…`);
    try {
      const mp3 = await synthWithRetry(textChunk);
      const file = join(dir, `${segments.length + 1}.mp3`);
      writeFileSync(file, mp3);
      segments.push(`${segments.length + 1}.mp3`);
      process.stdout.write(` ${(mp3.length / 1024).toFixed(0)}KB\n`);
    } catch (e) {
      const msg = String(e?.message || e);
      if (!fatal && maxChars > 300 && /HTTP 400/.test(msg)) {
        fatal = { msg, at: segments.length };
        maxChars = Math.floor(maxChars / 2);
        console.log(`\n  分片过长（${msg.slice(0, 120)}），改用 ${maxChars} 字分片重试本文`);
        chunks = splitIntoChunks(text, maxChars);
        segments.length = 0;
        continue;
      }
      console.error(`\n  合成失败: ${slug} → ${msg}`);
      failedPosts.push(slug);
      return;
    }
    await sleep(400);
  }
  if (fatal && segments.length === 0 && chunks.length === 0) { /* handled above */ }

  const meta = {
    slug, title, chars, hash, model: MODEL, voice: VOICE,
    segments, generatedAt: new Date().toISOString(),
  };
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  const totalKB = segments.reduce((s, f) => s + (existsSync(join(dir, f)) ? readFileSync(join(dir, f)).length : 0), 0) / 1024;
  console.log(`  完成: ${segments.length} 段，共 ${(totalKB / 1024).toFixed(2)}MB，已写入 public/audio/${slug}/`);
}

const failedPosts = [];
const files = readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md')).sort();
let todo = files;
if (onlySlug) todo = files.filter((f) => basename(f, '.md') === onlySlug);
if (!todo.length) {
  console.error(onlySlug ? `没有找到 slug 为 ${onlySlug} 的文章` : '没有找到任何文章');
  process.exit(1);
}
for (const f of todo) await generatePost(join(POSTS_DIR, f));
if (failedPosts.length) {
  console.log(`\n有 ${failedPosts.length} 篇失败：${failedPosts.join('、')}（可直接重跑本命令，已成功的不会重复生成）`);
  process.exitCode = 1;
} else {
  console.log('\n全部完成。生成后把 public/audio/ 目录随文章一起提交，站点会自动带上语音。');
}
