// 编辑页：新建（?edit 缺省）或编辑（?edit=id）；草稿自动保存；AI 整理
import { useEffect, useRef, useState } from 'react';
import { loadHistory, saveHistory, cloudSync, saveDraft, loadDraft } from '../lib/storage.js';
import { formatWithAI, getApiKey, setApiKey } from '../api.js';
import SettingsModal from './SettingsModal.jsx';

// storage.js 中草稿的存储 key
const DRAFT_KEY = 'memo-card:draft';

function fmt() {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

export default function DiaryWrite() {
  const editId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('edit')
    : '';
  const isEdit = !!editId;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mood, setMood] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [synced, setSynced] = useState([]);
  const loadedRef = useRef(false);

  // 进入：拉取云端；新建模式恢复草稿；编辑模式加载该条
  useEffect(() => {
    cloudSync(loadHistory())
      .then((merged) => {
        saveHistory(merged);
        setSynced(merged);
        if (isEdit) {
          const item = merged.find((x) => x.id === editId);
          if (item) {
            setTitle(item.title || '');
            setBody(item.content || '');
            setMood(item.mood || '');
          } else {
            setError('要编辑的记录不存在，已切换为新建');
          }
        } else {
          const draft = loadDraft();
          if (draft) {
            if (draft.title) setTitle(draft.title);
            if (draft.content) setBody(draft.content);
            if (draft.mood) setMood(draft.mood);
          }
        }
        loadedRef.current = true;
      })
      .catch(() => {
        const local = loadHistory();
        setSynced(local);
        if (isEdit) {
          const item = local.find((x) => x.id === editId);
          if (item) {
            setTitle(item.title || '');
            setBody(item.content || '');
            setMood(item.mood || '');
          }
        } else {
          const draft = loadDraft();
          if (draft) {
            if (draft.title) setTitle(draft.title);
            if (draft.content) setBody(draft.content);
            if (draft.mood) setMood(draft.mood);
          }
        }
        loadedRef.current = true;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 新建模式：草稿防抖自动保存（写一半刷新/误关不丢）
  useEffect(() => {
    if (isEdit || !loadedRef.current) return;
    const t = setTimeout(() => {
      saveDraft({ title, content: body, mood });
    }, 400);
    return () => clearTimeout(t);
  }, [title, body, mood, isEdit]);

  // 清除草稿
  const clearDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  };

  const save = async () => {
    if (!body.trim()) { setError('写点什么再保存吧'); return; }
    setSaving(true);
    setError('');

    let next;
    if (isEdit) {
      // 编辑：保留原 id / createdAt，更新内容与日期
      const now = Date.now();
      next = synced.map((x) =>
        x.id === editId
          ? { ...x, title: title.trim(), content: body.trim(), mood: mood.trim() || undefined, date: fmt(), updatedAt: now }
          : x,
      );
    } else {
      const item = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        title: title.trim(),
        content: body.trim(),
        mood: mood.trim() || undefined,
        date: fmt(),
        createdAt: Date.now(),
      };
      next = [item, ...synced];
    }

    saveHistory(next);
    try {
      const merged = await cloudSync(next); // 合并云端（含其他设备新增），回写本地
      saveHistory(merged);
      clearDraft();
      window.location.href = isEdit ? `/diary/view?id=${editId}` : '/diary';
    } catch (e) {
      setError('云端保存失败（已存本地），可先返回查看：' + e.message);
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
    <div className="min-h-screen bg-[#f2f2f7]">
      <div className="max-w-2xl mx-auto px-5 py-8">
        {/* 工具条 */}
        <div className="flex items-center justify-between mb-6">
          <a
            href="/diary"
            className="inline-flex items-center gap-1.5 text-sm text-[#8a8a8e] hover:text-[#0a84ff] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            返回
          </a>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettingsOpen(true)}
              className="w-9 h-9 rounded-full bg-white shadow-sm hover:bg-[#f2f2f7] flex items-center justify-center text-[#8a8a8e] hover:text-[#0a84ff] transition-colors"
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
              className="px-4 py-2 rounded-full bg-white shadow-sm text-sm text-[#1c1c1e] font-medium hover:bg-[#f2f2f7] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {aiLoading ? '整理中…' : '✨ AI 整理'}
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2 rounded-full bg-[#0a84ff] text-white text-sm font-medium hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>

        {/* 书写面板 */}
        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.06)] p-8">
          <div className="flex items-baseline justify-between mb-5">
            <span className="text-xs text-[#8a8a8e]">{isEdit ? '编辑记录' : '新记录'} · {fmt()}</span>
            <span className="text-xs text-[#8a8a8e]">{body.length} 字</span>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题（可选）"
            maxLength={40}
            className="w-full bg-transparent font-serif font-semibold text-3xl text-[#1c1c1e] placeholder:text-[#c7c7cc] focus:outline-none mb-6"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={'把脑海中冒出的感悟、想说的话，随手写在这里…'}
            spellCheck={false}
            rows={16}
            className="w-full bg-transparent resize-y font-serif text-[17px] leading-[1.9] text-[#1c1c1e] focus:outline-none placeholder:text-[#c7c7cc]"
          />
          <div className="mt-6 flex items-center gap-5 border-t border-[#e5e5ea] pt-5">
            <input
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              placeholder="心情（可选），如：平静"
              className="flex-1 bg-transparent text-sm text-[#3a3a3c] focus:outline-none placeholder:text-[#c7c7cc]"
            />
            <span className="text-[11px] text-[#8a8a8e]">草稿自动保存，不会丢</span>
          </div>
        </div>

        {error && <p className="mt-4 text-xs text-[#ff3b30]">{error}</p>}
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
