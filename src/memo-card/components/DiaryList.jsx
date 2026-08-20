// 日记列表页：查看所有记录（主视图）
import { useEffect, useState } from 'react';
import { loadHistory, saveHistory, cloudSync, cloudRemove } from '../lib/storage.js';

export default function DiaryList() {
  const [items, setItems] = useState([]);
  const [state, setState] = useState('同步中…');

  useEffect(() => {
    cloudSync(loadHistory())
      .then((merged) => {
        saveHistory(merged);
        setItems(merged);
        setState('已同步');
      })
      .catch(() => {
        setItems(loadHistory());
        setState('离线模式');
      });
  }, []);

  // 删除：本地移除 + cloudRemove（tombstone 标记 + 云端删除，保证不弹回）
  const del = async (e, id) => {
    e.preventDefault();
    if (!window.confirm('删除这条记录？')) return;
    const next = loadHistory().filter((x) => x.id !== id);
    saveHistory(next);
    setItems(next);
    await cloudRemove(id).catch(() => {});
    // 云端删除后同步一次，刷新本地为云端权威结果
    try {
      const merged = await cloudSync(next);
      saveHistory(merged);
      setItems(merged);
    } catch { /* ignore */ }
  };

  return (
    <div className="min-h-screen bg-[#f2f2f7]">
      <div className="max-w-3xl mx-auto px-5 py-12">
        <header className="flex items-end justify-between mb-8">
          <div>
            <h1 className="font-serif font-semibold text-[28px] text-[#1c1c1e] tracking-tight">日记</h1>
            <p className="text-xs text-[#8a8a8e] mt-1.5">{items.length} 篇 · {state}</p>
          </div>
          <a
            href="/diary/write"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#0a84ff] text-white text-sm font-medium hover:opacity-90 active:scale-[0.97] transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            写一篇
          </a>
        </header>

        <div className="space-y-3">
          {items.map((it) => (
            <a
              key={it.id}
              href={`/diary/view?id=${it.id}`}
              className="group relative block bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.06)] p-6 hover:shadow-[0_2px_6px_rgba(0,0,0,0.06),0_12px_32px_rgba(0,0,0,0.1)] hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-xs text-[#8a8a8e]">{it.date}</span>
                {it.mood && <span className="text-[11px] text-[#b08a3e]">{it.mood}</span>}
              </div>
              <h2 className="font-serif font-semibold text-lg text-[#1c1c1e] group-hover:text-[#0a84ff] transition-colors mb-1 truncate">
                {it.title || '（无题）'}
              </h2>
              <p className="text-sm text-[#6b6b70] leading-relaxed line-clamp-2 whitespace-pre-wrap">{it.content}</p>
              <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.preventDefault(); window.location.href = `/diary/write?edit=${it.id}`; }}
                  className="w-7 h-7 rounded-full bg-[#f2f2f7] hover:bg-[#e5e5ea] flex items-center justify-center text-[#8a8a8e] hover:text-[#0a84ff] transition-colors"
                  aria-label="编辑"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => del(e, it.id)}
                  className="w-7 h-7 rounded-full bg-[#f2f2f7] hover:bg-[#ffe5e5] flex items-center justify-center text-[#8a8a8e] hover:text-[#ff3b30] transition-colors"
                  aria-label="删除"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </span>
              </div>
            </a>
          ))}

          {items.length === 0 && (
            <div className="text-center py-24">
              <p className="font-serif text-lg text-[#8a8a8e] mb-6">还没有记录，写第一篇吧</p>
              <a
                href="/diary/write"
                className="px-6 py-2.5 rounded-full bg-[#0a84ff] text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                写第一篇
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
