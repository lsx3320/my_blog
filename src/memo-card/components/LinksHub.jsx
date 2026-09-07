// 网站中转：随时存入网址 + AI 一键识别简介 + 分类管理
import { useEffect, useState } from 'react';
import { backupRecords, mergeRecords, withDataLock, exportBackup } from '../lib/safe-sync.js';

const BIN = '6a988ba0da38895dfe312450';
const BIN_URL = 'https://api.jsonbin.io/v3/b';
const MASTER_KEY = '$2a$10$Iyqn3eO8f2SOtdwE9A9k1uY7MIXfb5k1Z7pYYkWZW9lYtxc1bJlbi';
const LOCAL_KEY = 'links:local';
const API_KEY_STORE = 'links:apikey';
const DIARY_KEY_STORE = 'memo-card:apikey'; // 随笔页同款 key，回退复用
const TAGS = ['网站', 'GitHub', '插件', 'MCP', 'Skill', '模型'];

function fmtTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

const FETCH_TIMEOUT = 12000;
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('超时')), ms))]);
}
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// 抓页面真实内容：GitHub 走 API + README，普通网页走 Jina Reader，再兜底公共代理
async function fetchContext(u) {
  const gh = u.match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)/i);
  if (gh) {
    const [, owner, repoRaw] = gh;
    const repo = repoRaw.replace(/\.git$/, '');
    try {
      const info = await withTimeout(fetch(`https://api.github.com/repos/${owner}/${repo}`).then((r) => r.json()), FETCH_TIMEOUT);
      if (info && !info.message) {
        let ctx = `GitHub 仓库 ${owner}/${repo}\n描述: ${info.description || '无'}\n主语言: ${info.language || '未知'}\nStar: ${info.stargazers_count}\nTopics: ${(info.topics || []).join('、')}\n`;
        for (const name of ['README.md', 'readme.md', 'README_zh.md', 'README.zh-CN.md']) {
          try {
            const md = await withTimeout(fetch(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${name}`).then((r) => { if (!r.ok) throw new Error(); return r.text(); }), FETCH_TIMEOUT);
            ctx += `\nREADME 摘录:\n${md.slice(0, 6000)}`;
            break;
          } catch { /* 试下一个文件名 */ }
        }
        return { source: 'GitHub API', text: ctx.slice(0, 7000) };
      }
    } catch { /* 限流或超时，走通用抓取 */ }
  }
  try {
    const text = await withTimeout(fetch(`https://r.jina.ai/${u}`).then((r) => r.text()), FETCH_TIMEOUT);
    if (text && text.length > 50) return { source: 'Jina Reader', text: text.slice(0, 6000) };
  } catch { /* 下一个 */ }
  try {
    const text = await withTimeout(fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`).then((r) => r.text()), FETCH_TIMEOUT);
    const clean = htmlToText(text);
    if (clean.length > 50) return { source: '代理抓取', text: clean.slice(0, 6000) };
  } catch { /* 放弃 */ }
  return null;
}

export default function LinksHub() {
  const [items, setItems] = useState([]);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState(['网站']);
  const [aiKey, setAiKey] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStage, setAiStage] = useState(''); // 'fetch' | 'ai' | ''
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [apiKeyOpen, setApiKeyOpen] = useState(false);

  useEffect(() => {
    try {
      setAiKey(localStorage.getItem(API_KEY_STORE) || localStorage.getItem(DIARY_KEY_STORE) || '');
    } catch { /* ignore */ }
    loadCloud();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadLocal() { try { const value = JSON.parse(localStorage.getItem(LOCAL_KEY)); return Array.isArray(value) ? value : []; } catch { return []; } }
  function saveLocal(list) {
    backupRecords(LOCAL_KEY, loadLocal());
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  }
  function deletedIds() {
    try { const ids = JSON.parse(localStorage.getItem('links:deleted') || '[]'); return new Set(Array.isArray(ids) ? ids : []); } catch { return new Set(); }
  }
  async function cloudGet() {
    const r = await fetch(`${BIN_URL}/${BIN}/latest`, { headers: { 'X-Master-Key': MASTER_KEY } });
    if (!r.ok) throw new Error('云端读取失败');
    const j = await r.json();
    if (!j.record || !Array.isArray(j.record.links)) throw new Error('云端数据格式异常，已停止同步以保护原数据');
    return j.record;
  }
  async function cloudPut(list) {
    return withDataLock('links:sync', async () => {
      const record = await cloudGet();
      backupRecords('links:cloud', record);
      const deleted = new Set([...deletedIds(), ...(Array.isArray(record.deletedIds) ? record.deletedIds : [])]);
      const merged = mergeRecords(record.links, mergeRecords(list, loadLocal()), deleted);
      const r = await fetch(`${BIN_URL}/${BIN}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': MASTER_KEY },
        body: JSON.stringify({ ...record, links: merged, deletedIds: [...deleted] }),
      });
      if (!r.ok) throw new Error('云端写入失败');
      localStorage.setItem('links:deleted', JSON.stringify([...deleted]));
      saveLocal(merged);
      return merged;
    });
  }
  async function loadCloud() {
    try {
      const record = await cloudGet();
      const deleted = new Set([...deletedIds(), ...(Array.isArray(record.deletedIds) ? record.deletedIds : [])]);
      const merged = mergeRecords(record.links, loadLocal(), deleted);
      backupRecords('links:cloud', record);
      localStorage.setItem('links:deleted', JSON.stringify([...deleted]));
      saveLocal(merged);
      setItems(merged);
    } catch (error) {
      setItems(loadLocal());
      setErr('云端读取失败，显示本地记录：' + error.message);
    }
  }

  function toggleTag(t) {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  // AI 识别：先抓页面真实内容，再让 DeepSeek 概括
  async function aiDescribe() {
    const trimmed = url.trim();
    if (!trimmed) { setErr('先输入网址'); return; }
    const key = aiKey;
    if (!key) { setErr('请先设置 DeepSeek API key（右上角 ⚙️）'); setApiKeyOpen(true); return; }
    setAiLoading(true);
    setAiStage('fetch');
    setErr('');
    try {
      const fetched = await fetchContext(trimmed);
      setAiStage('ai');
      const page = fetched ? fetched.text : null;
      const source = fetched ? fetched.source : '';
      let prompt;
      if (page) {
        prompt =
          '你是网站分析助手。以下是网址对应的真实页面内容，请基于抓取内容概括（不许编造没出现的功能），用中文严格按格式输出四行，不要多余文字和客套：\n' +
          '名称：<网站/项目名，15 字内>\n' +
          '简介：<它是什么 + 主要用途，30 字内一句话>\n' +
          '亮点：<从页面内容挑 2-4 个最核心最有价值的功能/特色/适用场景/技术栈，顿号分隔，45 字内>\n' +
          '分类：<从 网站/GitHub/插件/MCP/Skill/模型 里选 1-3 个最贴切的>\n' +
          (source === 'GitHub API' ? '（这是 GitHub 仓库，分类通常含 GitHub）\n' : '') +
          '网址：' + trimmed + '\n\n页面内容：\n' + page;
      } else {
        prompt =
          '你是网站识别助手。只根据网址本身（域名、路径、仓库名）推断，用中文严格按格式输出三行，不要多余文字：\n' +
          '名称：<网站名或域名含义，15 字内>\n' +
          '简介：<它是什么 + 主要用途，30 字内一句话>\n' +
          '亮点：<由网址可推断的用途/场景/技术栈，顿号分隔，30 字内>\n' +
          '只输出确定的信息，不确定的不写。网址：' + trimmed;
      }
      const r = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 400 }),
      });
      if (!r.ok) throw new Error('AI 请求失败 ' + r.status);
      const data = await r.json();
      const text = data?.choices?.[0]?.message?.content || '';
      const nameM = text.match(/名称[:：]\s*(.+)/);
      const descM = text.match(/简介[:：]\s*(.+)/);
      const noteM = text.match(/亮点[:：]\s*(.+)/);
      const catM = text.match(/分类[:：]\s*(.+)/);
      if (nameM) setTitle(nameM[1].trim().slice(0, 40));
      if (descM) setDesc(descM[1].trim().slice(0, 100));
      else if (text.trim()) setDesc(text.trim().slice(0, 100));
      if (noteM) setNote(noteM[1].trim().slice(0, 120));
      if (catM && page) {
        const valid = catM[1].split(/[、,，\s]+/).map((s) => s.trim()).filter((s) => TAGS.includes(s)).slice(0, 3);
        if (valid.length) setTags(valid);
      }
    } catch (e) {
      setErr(e.message || 'AI 识别失败');
    } finally {
      setAiLoading(false);
      setAiStage('');
    }
  }

  async function save() {
    const u = url.trim();
    if (!u) { setErr('网址不能为空'); return; }
    if (!/^https?:\/\//i.test(u)) { setErr('网址需以 http:// 或 https:// 开头'); return; }
    setSaving(true);
    setErr('');
    const item = {
      id: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      url: u,
      title: title.trim() || hostOf(u),
      desc: desc.trim(),
      note: note.trim(),
      tags: tags.length ? tags : ['网站'],
      createdAt: Date.now(),
    };
    const next = mergeRecords([item, ...items], loadLocal(), deletedIds());
    let localSaved = false;
    try {
      saveLocal(next);
      localSaved = true;
      setItems(next);
      setItems(await cloudPut(next));
    } catch (e) {
      setErr((localSaved ? '云端保存失败（已存本地）：' : '本地保存失败，请保留输入内容并导出已有数据：') + e.message);
    } finally {
      setSaving(false);
      if (localSaved) { setUrl(''); setTitle(''); setDesc(''); setNote(''); setTags(['网站']); }
    }
  }

  async function remove(id) {
    if (!window.confirm('删除这条？')) return;
    setSaving(true);
    try {
      const deleted = deletedIds();
      deleted.add(id);
      localStorage.setItem('links:deleted', JSON.stringify([...deleted]));
      const next = mergeRecords(items, loadLocal(), deleted);
      saveLocal(next);
      setItems(next);
      setItems(await cloudPut(next));
    } catch (error) { setErr('删除尚未同步，原数据备份已保留：' + error.message); }
    finally { setSaving(false); }
  }

  async function syncNow() {
    setSaving(true);
    setErr('');
    try { setItems(await cloudPut(loadLocal())); }
    catch (error) { setErr('同步失败，原数据保留：' + error.message); }
    finally { setSaving(false); }
  }

  const tagColor = (t) => {
    const map = { 网站: 'bg-[#e8f1fb] text-[#0a5dc2]', GitHub: 'bg-[#f0f0f2] text-[#333]', 插件: 'bg-[#fdeef0] text-[#d64545]', MCP: 'bg-[#eafaf1] text-[#1f9d55]', Skill: 'bg-[#fdf6e3] text-[#b0893e]', 模型: 'bg-[#f3e8fd] text-[#7c3aed]' };
    return map[t] || 'bg-[#f2f2f7] text-[#8a8a8e]';
  };

  return (
    <div className="min-h-screen bg-[#f2f2f7]">
      <div className="max-w-3xl mx-auto px-5 py-12">
        <div className="flex gap-5 mb-6 text-sm text-[#28614f]">
          <button type="button" disabled={saving} onClick={syncNow}>{saving ? '同步中…' : '同步数据'}</button>
          <button type="button" onClick={() => exportBackup('links', { links: loadLocal() })}>导出中转备份</button>
        </div>
        {/* 头部 */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="font-serif font-semibold text-[28px] text-[#1c1c1e] tracking-tight">网站中转</h1>
            <p className="text-xs text-[#8a8a8e] mt-1.5">{items.length} 条 · 随时存网址，AI 帮你看它是啥</p>
          </div>
          <button
            onClick={() => setApiKeyOpen(true)}
            className="w-9 h-9 rounded-full bg-white shadow-sm hover:bg-[#f2f2f7] flex items-center justify-center text-[#8a8a8e] hover:text-[#0a84ff] transition-colors"
            title="设置 AI key"
            aria-label="设置 AI key"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {/* 添加表单 */}
        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.06)] p-6 mb-8">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="粘贴网址，如 https://github.com/…"
            className="w-full font-mono text-sm text-[#1c1c1e] placeholder:text-[#c7c7cc] focus:outline-none mb-4"
          />
          <div className="flex flex-wrap gap-2 mb-4">
            {TAGS.map((t) => (
              <button
                key={t}
                onClick={() => toggleTag(t)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  tags.includes(t) ? 'bg-[#0a84ff] text-white' : 'bg-[#f2f2f7] text-[#8a8a8e] hover:bg-[#e5e5ea]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="名称（可 AI 识别或手填）"
            className="w-full font-serif font-semibold text-lg text-[#1c1c1e] placeholder:text-[#c7c7cc] focus:outline-none mb-3"
          />
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="一句话简介（点「AI 识别」自动生成，或手写）"
            rows={2}
            className="w-full font-serif text-sm text-[#3a3a3c] placeholder:text-[#c7c7cc] focus:outline-none mb-3 resize-none"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="亮点：核心功能 / 适合谁用 / 技术栈（AI 识别自动填，可手改）"
            className="w-full font-serif text-sm text-[#6b6b70] placeholder:text-[#c7c7cc] focus:outline-none mb-4"
          />
          {err && <p className="text-xs text-[#ff3b30] mb-3">{err}</p>}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#c7c7cc]">AI key 存在本浏览器 localStorage</span>
            <div className="flex gap-2">
              <button
                onClick={aiDescribe}
                disabled={aiLoading || !url.trim()}
                className="px-4 py-2 rounded-full bg-[#f2f2f7] text-sm text-[#1c1c1e] font-medium hover:bg-[#e5e5ea] transition-colors disabled:opacity-40"
              >
                {aiLoading ? (aiStage === 'fetch' ? '抓取页面…' : 'AI 分析…') : 'AI 识别'}
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-5 py-2 rounded-full bg-[#0a84ff] text-white text-sm font-medium hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-50"
              >
                {saving ? '保存中…' : '存入'}
              </button>
            </div>
          </div>
        </div>

        {/* 列表 */}
        <div className="space-y-3">
          {items.map((it) => (
            <div
              key={it.id}
              className="group relative bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.06)] p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-4">
                <span className="w-10 h-10 shrink-0 rounded-xl bg-[#f2f2f7] flex items-center justify-center font-sans font-semibold text-[#0a84ff] uppercase">
                  {(it.title || '?').slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="font-serif font-semibold text-lg text-[#1c1c1e] truncate">{it.title}</h2>
                    {it.tags?.map((t) => (
                      <span key={t} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${tagColor(t)}`}>{t}</span>
                    ))}
                  </div>
                  <a href={it.url} target="_blank" rel="noopener" className="text-xs font-mono text-[#0a84ff] hover:underline break-all">
                    {it.url}
                  </a>
                  {it.desc && <p className="text-sm text-[#6b6b70] mt-1.5 leading-relaxed">{it.desc}</p>}
                  {it.note && (
                    <p className="text-xs text-[#98989d] mt-1 leading-relaxed">
                      <span className="text-[#b0893e] font-medium">亮点</span> · {it.note}
                    </p>
                  )}
                  <div className="text-[11px] text-[#c7c7cc] mt-2">{fmtTime(it.createdAt)}</div>
                </div>
                <button
                  onClick={() => remove(it.id)}
                  className="shrink-0 w-7 h-7 rounded-full bg-[#f2f2f7] hover:bg-[#ffe5e5] flex items-center justify-center text-[#8a8a8e] hover:text-[#ff3b30] transition-colors opacity-0 group-hover:opacity-100"
                  aria-label="删除"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}

          {items.length === 0 && (
            <div className="text-center py-20 text-sm text-[#8a8a8e]">还没有存网址，粘一个进来试试</div>
          )}
        </div>
      </div>

      {/* AI key 设置弹窗 */}
      {apiKeyOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
          onClick={() => setApiKeyOpen(false)}
        >
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-sans font-semibold text-lg text-[#1c1c1e] mb-4">设置 · AI key</h3>
            <p className="text-xs text-[#8a8a8e] mb-3">DeepSeek API key（存本浏览器 localStorage，用于「AI 识别」）</p>
            <input
              type="password"
              value={aiKey}
              onChange={(e) => setAiKey(e.target.value)}
              placeholder="sk-…"
              className="w-full border border-[#e5e5ea] rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#0a84ff] mb-5"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setApiKeyOpen(false)} className="px-4 py-2 rounded-full border border-[#e5e5ea] text-sm text-[#5a5a5e] hover:bg-[#f2f2f7] transition-colors">取消</button>
              <button
                onClick={() => { try { localStorage.setItem(API_KEY_STORE, aiKey.trim()); localStorage.setItem(DIARY_KEY_STORE, aiKey.trim()); } catch { /* ignore */ } setApiKeyOpen(false); }}
                className="px-5 py-2 rounded-full bg-[#0a84ff] text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
