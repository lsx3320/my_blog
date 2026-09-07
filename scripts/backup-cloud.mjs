import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const destination = process.argv[2];
if (!destination) throw new Error('Provide a private backup directory outside the repository.');
const root = resolve(import.meta.dirname, '..');
if (resolve(destination).startsWith(root + '/')) throw new Error('Backups must be stored outside the repository.');
const sources = [
  { name: 'diary', file: 'src/memo-card/lib/storage.js', key: 'CLOUD_KEY', bin: 'CLOUD_BIN' },
  { name: 'links', file: 'src/memo-card/components/LinksHub.jsx', key: 'MASTER_KEY', bin: 'BIN' },
];
await mkdir(destination, { recursive: true, mode: 0o700 });
const manifest = { createdAt: new Date().toISOString(), records: [] };
for (const source of sources) {
  const code = await readFile(resolve(root, source.file), 'utf8');
  const constant = name => code.match(new RegExp(`const ${name} = '([^']+)'`))?.[1];
  const key = constant(source.key);
  const bin = constant(source.bin);
  if (!key || !bin) throw new Error('Missing existing configuration for ' + source.name);
  const response = await fetch(`https://api.jsonbin.io/v3/b/${bin}/latest`, {
    headers: { 'X-Master-Key': key }, signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`${source.name}: read failed (${response.status})`);
  const payload = await response.json();
  const records = source.name === 'diary' ? payload.record : payload.record?.links;
  if (!Array.isArray(records)) throw new Error(source.name + ': unexpected data format; stopped');
  const body = JSON.stringify(payload, null, 2);
  const filename = source.name + '.json';
  await writeFile(resolve(destination, filename), body, { flag: 'wx', mode: 0o600 });
  const summary = { name: source.name, file: filename, count: records.filter(item => item.id !== '_init').length, sha256: createHash('sha256').update(body).digest('hex') };
  manifest.records.push(summary);
  console.log(`${source.name}: ${summary.count} records backed up`);
}
await writeFile(resolve(destination, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
console.log('Backup complete: ' + resolve(destination));
