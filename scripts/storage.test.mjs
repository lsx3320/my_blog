import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecords, backupRecords } from '../src/memo-card/lib/safe-sync.js';
import { cloudSync, saveHistory, loadHistory, addHistory } from '../src/memo-card/lib/storage.js';

beforeEach(() => {
  const memory = new Map();
  globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: key => memory.delete(key),
  };
});

test('merge preserves every record, remote fields, and newer edits', () => {
  const remote = Array.from({ length: 75 }, (_, i) => ({ id: String(i), title: 'remote', createdAt: i }));
  remote[0].locked = true;
  const merged = mergeRecords(remote, [{ id: '0', title: 'stale' }, { id: '1', title: 'edited', updatedAt: 100 }, { id: 'new' }]);
  assert.equal(merged.length, 76);
  assert.equal(merged.find(item => item.id === '0').locked, true);
  assert.equal(merged.find(item => item.id === '1').title, 'edited');
  assert.equal(mergeRecords(remote, [], new Set(['0'])).length, 74);
});

test('opening diary reads cloud without writing or truncating', async () => {
  const cloud = Array.from({ length: 65 }, (_, i) => ({ id: String(i), createdAt: i }));
  const methods = [];
  globalThis.fetch = async (_url, options) => {
    methods.push(options.method || 'GET');
    return { ok: true, json: async () => ({ record: cloud }) };
  };
  const merged = await cloudSync([{ id: 'offline', title: 'offline draft' }]);
  assert.equal(merged.length, 66);
  assert.deepEqual(methods, ['GET']);
  saveHistory(merged);
  addHistory({ id: 'another' });
  assert.equal(loadHistory().length, 67);
});

test('save reads latest remote records before PUT and keeps a pre-write backup', async () => {
  let uploaded;
  const methods = [];
  globalThis.fetch = async (_url, options) => {
    methods.push(options.method || 'GET');
    if (options.method === 'PUT') uploaded = JSON.parse(options.body);
    return { ok: true, json: async () => ({ record: [{ id: 'other-device', locked: true }] }) };
  };
  await cloudSync([{ id: 'local' }], { write: true });
  assert.deepEqual(methods, ['GET', 'PUT']);
  assert.equal(uploaded.length, 2);
  assert.equal(JSON.parse(localStorage.getItem('memo-card:cloud:backup:original'))[0].locked, true);
});

test('unexpected cloud data and read errors never trigger destructive writes', async () => {
  for (const response of [{ ok: true, json: async () => ({ record: {} }) }, { ok: false, status: 503 }]) {
    const methods = [];
    globalThis.fetch = async (_url, options) => { methods.push(options.method || 'GET'); return response; };
    await assert.rejects(cloudSync([{ id: 'local' }], { write: true }));
    assert.deepEqual(methods, ['GET']);
  }
});

test('original backup survives later changes and write quota errors propagate', () => {
  backupRecords('example', [{ id: 'original' }]);
  for (let i = 0; i < 8; i++) backupRecords('example', [{ id: String(i) }]);
  assert.equal(JSON.parse(localStorage.getItem('example:backup:original'))[0].id, 'original');
  assert.equal(JSON.parse(localStorage.getItem('example:backup:recent')).length, 5);
  localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => saveHistory([{ id: 'new' }]), /QuotaExceeded/);
});
