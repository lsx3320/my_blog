// localStorage：草稿 + 历史卡片
const DRAFT_KEY = 'memo-card:draft';
const HISTORY_KEY = 'memo-card:history';

export function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY)) || null;
  } catch {
    return null;
  }
}

export function saveDraft(draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch { /* ignore */ }
}

export function loadHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveHistory(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

export function addHistory(item) {
  const list = loadHistory();
  list.unshift(item);
  // 最多保留 50 条（返回截断后的列表，保证 UI 与存储一致）
  const capped = list.slice(0, 50);
  saveHistory(capped);
  return capped;
}

export function removeHistory(id) {
  const list = loadHistory().filter((x) => x.id !== id);
  saveHistory(list);
  return list;
}

// ========== 云同步（jsonbin.io，所有浏览器共享同一份数据） ==========
// 安全策略：
// 1. 有后端（Express 代理 /api/cards）→ key 只存服务端环境变量，前端零暴露
// 2. 纯静态部署（无后端）→ 降级直连，key 需在构建时注入 PUBLIC_JSONBIN_KEY
//    （由部署方显式配置；不配置则云同步不可用，本地数据仍可用）
const CLOUD_BIN = import.meta.env.PUBLIC_JSONBIN_BIN || '6a7c55c5f5f4af5e290b8e09';
const CLOUD_KEY = import.meta.env.PUBLIC_JSONBIN_KEY || '';
const BIN_URL = 'https://api.jsonbin.io/v3/b';
const DELETED_KEY = 'memo-card:deleted';

// 已删除标记（tombstone）：删除的卡片 id，云合并时永远排除，防止刷新/竞态后弹回
export function getDeletedIds() {
  try {
    const arr = JSON.parse(localStorage.getItem(DELETED_KEY));
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function addDeletedId(id) {
  try {
    const set = getDeletedIds();
    set.add(id);
    const arr = [...set].slice(-200); // 限长，防无限增长
    localStorage.setItem(DELETED_KEY, JSON.stringify(arr));
  } catch { /* ignore */ }
}

// —— 后端代理优先；代理失败（纯静态无后端）时降级直连 ——
async function cloudGet() {
  // 1) 后端代理
  try {
    const r = await fetch('/api/cards', { headers: { Accept: 'application/json' } });
    const ct = r.headers.get('content-type') || '';
    if (r.ok && ct.includes('application/json')) {
      const j = await r.json();
      return Array.isArray(j.record) ? j.record : [];
    }
  } catch { /* 后端不可达/非 JSON（纯静态 SPA fallback），继续降级 */ }

  // 2) 直连 jsonbin（纯静态部署，需构建时注入 key）
  if (!CLOUD_KEY) throw new Error('云同步未配置（需要后端代理或 PUBLIC_JSONBIN_KEY）');
  const r = await fetch(`${BIN_URL}/${CLOUD_BIN}/latest`, {
    headers: { 'X-Master-Key': CLOUD_KEY },
  });
  if (!r.ok) throw new Error(`云读取失败（${r.status}）`);
  const j = await r.json();
  return Array.isArray(j.record) ? j.record : [];
}

async function cloudPut(data) {
  // 1) 后端代理
  try {
    const r = await fetch('/api/cards', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data),
    });
    const ct = r.headers.get('content-type') || '';
    if (r.ok && ct.includes('application/json')) return;
  } catch { /* 后端不可达/非 JSON，继续降级 */ }

  // 2) 直连 jsonbin
  if (!CLOUD_KEY) throw new Error('云同步未配置（需要后端代理或 PUBLIC_JSONBIN_KEY）');
  const r = await fetch(`${BIN_URL}/${CLOUD_BIN}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Master-Key': CLOUD_KEY },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`云写入失败（${r.status}）`);
}

// 云端权威拉取：本地缓存完全跟随云端，保证不同设备登录看到一致的卡片
// （旧的双向并集合并会让本地残留卡片弹回云端，导致删不干净）
export async function cloudPull() {
  const deleted = getDeletedIds();
  const cloud = await cloudGet();
  const cleaned = cloud.filter((x) => x && x.id && x.id !== '_init' && !deleted.has(x.id));
  saveHistory(cleaned);
  return cleaned;
}

// 上传新增卡片到云端：云端 ∪ 新增（不把本地残留的旧卡片带回去）
export async function cloudAdd(items) {
  const deleted = getDeletedIds();
  const cloud = await cloudGet();
  const cleaned = cloud.filter((x) => x && x.id && x.id !== '_init' && !deleted.has(x.id));
  const seen = new Set(cleaned.map((x) => x.id));
  (Array.isArray(items) ? items : [items]).forEach((x) => {
    if (x && x.id && !seen.has(x.id) && !deleted.has(x.id)) {
      cleaned.push(x);
      seen.add(x.id);
    }
  });
  cleaned.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const capped = cleaned.slice(0, 50);
  await cloudPut(capped);
  return capped;
}

// 删除卡片：记录删除标记 + 从云端移除，双重保证删除永久生效
export async function cloudRemove(id) {
  addDeletedId(id); // 标记已删除，云合并会永远排除
  try {
    const cloud = await cloudGet();
    const next = cloud.filter((x) => x && x.id !== id);
    await cloudPut(next);
  } catch { /* 云端删除失败也不影响本地：deleted 标记会拦住弹回 */ }
}
