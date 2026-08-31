// AI 文案整理 API：优先后端代理；后端不可用时前端直连 DeepSeek（key 用户在设置里配置，存 localStorage）
const AI_KEY = 'memo-card:apikey';

export function getApiKey() {
  try {
    return localStorage.getItem(AI_KEY) || '';
  } catch {
    return '';
  }
}

export function setApiKey(key) {
  try {
    localStorage.setItem(AI_KEY, key);
  } catch { /* ignore */ }
}

const buildPrompt = (text) =>
  '你是文案排版助手。请把下面的原始文案整理成一张「文字卡片」的规整内容，要求：\n' +
  '1. 识别并保留核心标题（若无则提炼一个，不超过 14 字）；\n' +
  '2. 正文按语义分自然段，每段一句或几句，逻辑连贯；\n' +
  '3. 规范标点与空格（统一全角标点、去掉多余空行与空格）；\n' +
  '4. 保持原意与语气，不增删内容、不润色过度、不评论；\n' +
  '5. 短句金句可单独成段。\n\n' +
  '严格输出如下 JSON，不要任何额外文字：\n' +
  '{"title":"标题","content":"第一段\\n\\n第二段\\n\\n…（按原意分段，\n为换行）"}\n\n' +
  '原始文案：\n' + text;

const parseResult = (rawText) => {
  const m = String(rawText || '').match(/\{[\s\S]*\}/);
  if (!m) throw new Error('模型返回格式异常');
  const parsed = JSON.parse(m[0]);
  return {
    title: String(parsed.title || '').trim(),
    content: String(parsed.content || '').trim(),
  };
};

// 前端直连 DeepSeek（key 从 localStorage 读取，用户在设置里配置）
async function viaDirect(text) {
  const key = getApiKey();
  if (!key) {
    const e = new Error('请先配置 DeepSeek API key');
    e.noKey = true;
    throw e;
  }
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: buildPrompt(text) }],
      temperature: 0.4,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    }),
  });
  if (!r.ok) throw new Error(`DeepSeek API ${r.status}`);
  const data = await r.json();
  return parseResult(data?.choices?.[0]?.message?.content);
}

// 主入口：有后端（Express 代理）→ 走后端，key 零暴露；纯静态部署 → 前端直连
// 后端可用性探测一次并缓存，避免纯静态下每次请求都白发一次 /api/format
let backendAvailable = null; // null=未知 true/false=已确认

async function checkBackend() {
  if (backendAvailable !== null) return backendAvailable;
  try {
    const r = await fetch('/api/health', { headers: { Accept: 'application/json' } });
    backendAvailable = r.ok;
  } catch {
    backendAvailable = false;
  }
  return backendAvailable;
}

export async function formatWithAI(text) {
  if (await checkBackend()) {
    // 有后端：key 在服务端，前端不保存；业务错误直接透传
    const res = await fetch('/api/format', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (res.ok) return await res.json();
    const errBody = await res.json().catch(() => null);
    throw new Error(errBody?.error || `AI 整理失败（${res.status}）`);
  }
  return await viaDirect(text);
}
