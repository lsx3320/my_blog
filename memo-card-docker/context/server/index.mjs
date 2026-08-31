// 便签卡片：AI 文案整理代理 + 生产静态托管
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../dist');
const PORT = Number(process.env.PORT || 8010);

// DeepSeek key：env → ~/.claude/settings.json
function resolveApiKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY.trim();
  try {
    const p = path.join(os.homedir(), '.claude', 'settings.json');
    const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
    const key = cfg?.env?.ANTHROPIC_AUTH_TOKEN;
    if (typeof key === 'string' && key.startsWith('sk-')) return key.trim();
  } catch { /* 忽略 */ }
  return null;
}

const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

// ===== 云同步代理（jsonbin.io）=====
// key/bin 只存在于服务端环境变量，绝不进入前端 bundle。
// 纯静态部署（无后端）时前端会降级直连（需构建时注入 PUBLIC_JSONBIN_KEY）。
const JSONBIN_KEY = (process.env.JSONBIN_MASTER_KEY || '').trim();
const JSONBIN_BIN = (process.env.JSONBIN_BIN || '').trim();
const JSONBIN_URL = 'https://api.jsonbin.io/v3/b';

// GET /api/cards — 拉取云端卡片
app.get('/api/cards', async (_req, res) => {
  if (!JSONBIN_KEY || !JSONBIN_BIN) {
    return res.status(503).json({ error: '服务端未配置 JSONBIN_MASTER_KEY / JSONBIN_BIN' });
  }
  try {
    const r = await fetch(`${JSONBIN_URL}/${JSONBIN_BIN}/latest`, {
      headers: { 'X-Master-Key': JSONBIN_KEY },
    });
    if (!r.ok) return res.status(502).json({ error: `云端读取失败（${r.status}）` });
    const j = await r.json();
    res.json({ record: Array.isArray(j.record) ? j.record : [] });
  } catch (e) {
    res.status(500).json({ error: `云端读取异常：${e.message}` });
  }
});

// PUT /api/cards — 覆盖云端卡片
app.put('/api/cards', async (req, res) => {
  if (!JSONBIN_KEY || !JSONBIN_BIN) {
    return res.status(503).json({ error: '服务端未配置 JSONBIN_MASTER_KEY / JSONBIN_BIN' });
  }
  const data = req.body;
  if (!Array.isArray(data)) return res.status(400).json({ error: '数据格式错误' });
  try {
    const r = await fetch(`${JSONBIN_URL}/${JSONBIN_BIN}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': JSONBIN_KEY },
      body: JSON.stringify(data),
    });
    if (!r.ok) return res.status(502).json({ error: `云端写入失败（${r.status}）` });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: `云端写入异常：${e.message}` });
  }
});


// AI 文案整理：把零散文案整理成规整的卡片内容（标题 + 分段，保持原意）
app.post('/api/format', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) return res.status(400).json({ error: '内容为空' });
  if (text.length > 4000) return res.status(400).json({ error: '内容过长（≤4000 字）' });

  const key = resolveApiKey();
  if (!key) return res.status(400).json({ error: '未配置 DeepSeek API key（请设置 DEEPSEEK_API_KEY 或检查 ~/.claude/settings.json）' });

  const prompt =
    '你是文案排版助手。请把下面的原始文案整理成一张「文字卡片」的规整内容，要求：\n' +
    '1. 识别并保留核心标题（若无则提炼一个，不超过 14 字）；\n' +
    '2. 正文按语义分自然段，每段一句或几句，逻辑连贯；\n' +
    '3. 规范标点与空格（统一全角标点、去掉多余空行与空格）；\n' +
    '4. 保持原意与语气，不增删内容、不润色过度、不评论；\n' +
    '5. 短句金句可单独成段。\n\n' +
    '严格输出如下 JSON，不要任何额外文字：\n' +
    '{"title":"标题","content":"第一段\\n\\n第二段\\n\\n…（按原意分段，\n为换行）"}\n\n' +
    '原始文案：\n' + text;

  try {
    const r = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    });
    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      return res.status(502).json({ error: `DeepSeek API ${r.status}` + (errText ? `：${errText.slice(0, 160)}` : '') });
    }
    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content || '';
    // 提取 JSON
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) return res.status(502).json({ error: '模型返回格式异常' });
    const parsed = JSON.parse(m[0]);
    return res.json({
      title: String(parsed.title || '').trim(),
      content: String(parsed.content || '').trim(),
    });
  } catch (e) {
    return res.status(500).json({ error: `整理失败：${e.message}` });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true, llm: !!resolveApiKey() }));

// 生产：托管构建产物 + SPA fallback
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`[memo-card] server on http://localhost:${PORT} (llm: ${resolveApiKey() ? '已配置' : '未配置'})`);
});
