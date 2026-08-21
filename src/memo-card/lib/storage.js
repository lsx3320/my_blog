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
  // 最多保留 50 条
  saveHistory(list.slice(0, 50));
  return list;
}

export function removeHistory(id) {
  const list = loadHistory().filter((x) => x.id !== id);
  saveHistory(list);
  return list;
}

// ========== 云同步（jsonbin.io，固定 key + bin，所有浏览器共享同一份数据） ==========
const CLOUD_KEY = '$2a$10$Iyqn3eO8f2SOtdwE9A9k1uY7MIXfb5k1Z7pYYkWZW9lYtxc1bJlbi';
const CLOUD_BIN = '6a86f47cda38895dfefb5b57'; // 博客随笔专用 bin
const BIN_URL = 'https://api.jsonbin.io/v3/b';
const DELETED_KEY = 'memo-card:deleted';

// 已删除标记（tombstone）：删除的卡片 id，cloudSync 合并时永远排除，防止刷新/竞态后弹回
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

async function cloudGet() {
  const r = await fetch(`${BIN_URL}/${CLOUD_BIN}/latest`, {
    headers: { 'X-Master-Key': CLOUD_KEY },
  });
  if (!r.ok) throw new Error(`云读取失败（${r.status}）`);
  const j = await r.json();
  return Array.isArray(j.record) ? j.record : [];
}

async function cloudPut(data) {
  const r = await fetch(`${BIN_URL}/${CLOUD_BIN}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Master-Key': CLOUD_KEY },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`云写入失败（${r.status}）`);
}

// 双向同步：拉取云端 → 与本地合并去重 → 存本地 → 上传合并结果
// 已删除的 id 在合并与上传时都被排除，删除永久生效（不会因刷新/并集竞态弹回）
export async function cloudSync(localList) {
  const deleted = getDeletedIds();
  const cloud = await cloudGet();
  const cleaned = cloud.filter((x) => x && x.id && x.id !== '_init' && !deleted.has(x.id));

  // 合并去重：同 id 冲突时取「更新时间 / 创建时间」较新的版本
  // （本设备刚编辑过的记录 updatedAt 最新 → 编辑内容胜出，不会被云端旧数据覆盖）
  const byId = new Map();
  [...cleaned, ...(localList || [])].forEach((x) => {
    if (!x || !x.id || deleted.has(x.id)) return;
    const cur = byId.get(x.id);
    if (!cur) {
      byId.set(x.id, x);
      return;
    }
    const curT = cur.updatedAt || cur.createdAt || 0;
    const newT = x.updatedAt || x.createdAt || 0;
    if (newT >= curT) byId.set(x.id, x);
  });

  const merged = [...byId.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const capped = merged.slice(0, 50);
  await cloudPut(capped);
  return capped;
}

// 删除卡片：记录删除标记 + 从云端移除，双重保证删除永久生效
export async function cloudRemove(id) {
  addDeletedId(id); // 标记已删除，cloudSync 会永远排除
  try {
    const cloud = await cloudGet();
    const next = cloud.filter((x) => x && x.id !== id);
    await cloudPut(next);
  } catch { /* 云端删除失败也不影响本地：deleted 标记会拦住弹回 */ }
}
