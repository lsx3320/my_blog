// 编辑页：专注书写，无预览无模板；AI 一键整理 + 保存到 jsonbin
import { useEffect, useState } from 'react';
import { loadHistory, saveHistory, cloudSync } from '../lib/storage.js';
import { formatWithAI, getApiKey, setApiKey } from '../api.js';
import SettingsModal from './SettingsModal.jsx';

function fmt() {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

export default function DiaryWrite() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mood, setMood] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [synced, setSynced] = useState([]);

  // 进入时拉取云端，保存时基于最新列表合并
  useEffect(() => {
    cloudSync(loadHistory())
      .then((merged) => { saveHistory(merged); setSynced(merged); })
      .catch(() => setSynced(loadHistory()));
  }, []);

  const save = async () => {
    if (!body.trim()) { setError('写点什么再保存吧'); return; }
    setSaving(true);
    setError('');
    const item = {
      id: Date.now().toString(36),
      title: title.trim(),
      content: body.trim(),
      mood: mood.trim() || undefined,
      date: fmt(),
      createdAt: Date.now(),
    };
    const next = [item, ...synced];
    saveHistory(next);
    try {
      await cloudSync(next);
      window.location.href = '/diary';
    } catch (e) {
      setError('云端保存失败（已存本地），点返回可查看：' + e.message);
      setSaving(false);
    }
  };

  const doAI = async () => {
    if (!body.trim()) return;
    setAiLoading(true);
    setError('');
    try {
      const r = await formatWithAI(body);
      if (r.title) setTitle(r.title);
      if (r.content) setBody(r.content);
    } catch (e) {
      if (e.noKey) {
        setError('AI 整理需要 API key：点右上角 ⚙️ 配置 DeepSeek key');
        setSettingsOpen(true);
      } else {
        setError(e.message || 'AI 整理失败');
      }
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5efe0] border-b border-[#e5ddc8]">
      {/* 顶部工具条 */}
      <div className="sticky top-0 z-40 backdrop-blur-md bg-[#f5efe0]/80 border-b border-[#e5ddc8]">
        <div className="max-w-2xl mx-auto px-6 py-3 flex items-center justify-between">
          <a
            href="/diary"
            className="inline-flex items-center gap-1.5 font-sans text-sm text-[#6b6350] hover:text-[#c23b22] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            返回
          </a>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setSettingsOpen(true)}
              className="w-8 h-8 rounded-full hover:bg-[#eadfc0] flex items-center justify-center text-[#8a8270] transition-colors"
              title="设置：AI key"
              aria-label="设置"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={doAI}
              disabled={aiLoading || !body.trim()}
              className="px-4 py-1.5 rounded-full border border-[#d8cfae] text-[#5a5340] text-sm font-medium hover:border-[#c23b22] hover:text-[#c23b22] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {aiLoading ? '整理中…' : '✨ AI 整理'}
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-1.5 rounded-full bg-[#c23b22] text-white text-sm font-medium hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>

      {/* 书写区 */}
      <div className="max-w-2xl mx-auto px-6 py-10">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="标题（可选）"
          maxLength={40}
          className="w-full bg-transparent font-display font-semibold text-3xl text-[#3a3526] placeholder:text-[#c4baa0] focus:outline-none mb-4"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={'把脑海中冒出的感悟、想说的话，随手写在这里…'}
          spellCheck={false}
          rows={16}
          className="w-full bg-transparent resize-y font-serif text-[17px] leading-loose text-[#3a3526] focus:outline-none placeholder:text-[#c4baa0]"
        />
        <div className="mt-6 flex items-center gap-4">
          <input
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            placeholder="心情（可选），如：平静"
            className="w-44 bg-transparent border-b border-[#d8cfae] pb-1 font-sans text-sm text-[#5a5340] focus:outline-none focus:border-[#c23b22] placeholder:text-[#b5ab8c]"
          />
          <span className="font-sans text-xs text-[#8a8270]">{body.length} 字</span>
        </div>
        {error && <p className="mt-4 font-sans text-xs text-[#d64545]">{error}</p>}
      </div>

      {settingsOpen && (
        <SettingsModal
          aiKey={getApiKey()}
          onClose={() => setSettingsOpen(false)}
          onSaveAI={(k) => setApiKey(k)}
        />
      )}
    </div>
  );
}
