export function mergeRecords(cloud, local, deleted = new Set()) {
  const records = new Map();
  for (const item of [...cloud, ...local]) {
    if (!item || !item.id || item.id === '_init' || deleted.has(item.id)) continue;
    const current = records.get(item.id);
    if (!current || Number(item.updatedAt || 0) > Number(current.updatedAt || 0)) records.set(item.id, item);
  }
  return [...records.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// Keep the original browser data plus recent pre-write snapshots, outside the live record.
export function backupRecords(key, data) {
  const value = JSON.stringify(data);
  const initialKey = key + ':backup:original';
  if (!localStorage.getItem(initialKey)) localStorage.setItem(initialKey, value);
  const historyKey = key + ':backup:recent';
  let history = [];
  try { history = JSON.parse(localStorage.getItem(historyKey) || '[]'); } catch {}
  if (!Array.isArray(history)) history = [];
  if (JSON.stringify(history[0]?.data) !== value) {
    localStorage.setItem(historyKey, JSON.stringify([{ savedAt: Date.now(), data }, ...history].slice(0, 5)));
  }
}

export function exportBackup(filename, data) {
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename + '-' + new Date().toISOString().slice(0, 10) + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const queues = new Map();
export function withDataLock(name, operation) {
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(name, operation);
  const next = (queues.get(name) || Promise.resolve()).catch(() => {}).then(operation);
  queues.set(name, next.catch(() => {}));
  return next;
}
