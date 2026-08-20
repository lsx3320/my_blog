// 日记列表页：查看所有记录（主视图）
import { useEffect, useState } from 'react';
import { loadHistory, saveHistory, cloudSync } from '../lib/storage.js';

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

  const del = async (e, id) => {
    e.preventDefault();
    if (!window.confirm('删除这条记录？')) return;
    const next = items.filter((x) => x.id !== id);
    setItems(next);
    saveHistory(next);
    try { await cloudSync(next); } catch { /* ignore */ }
  };

  return (
    <div className="min-h-screen bg-[#f5efe0] border-b border-[#e5ddc8]">
      <div className="max-w-3xl mx-auto px-6 py-14">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h1 className="font-display font-semibold text-3xl text-[#3a3526] tracking-tight">日记</h1>
            <p className="font-sans text-xs text-[#8a8270] mt-1.5">{items.length} 篇 · {state}</p>
          </div>
          <a
            href="/diary/write"
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-[#c23b22] text-white text-sm font-medium hover:opacity-90 active:scale-[0.97] transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            写一篇
          </a>
        </div>

        <div className="space-y-3">
          {items.map((it) => (
            <a
              key={it.id}
              href={`/diary/view?id=${it.id}`}
              className="group relative block bg-white rounded-xl border border-[#efe6c8] p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="font-mono text-xs text-[#8a8270]">{it.date}</span>
                {it.mood && <span className="font-sans text-[11px] text-[#b08a3e]">{it.mood}</span>}
              </div>
              <h2 className="font-display font-semibold text-lg text-[#3a3526] group-hover:text-[#c23b22] transition-colors mb-1 truncate">
                {it.title || '（无题）'}
              </h2>
              <p className="text-sm text-[#6b6350] leading-relaxed line-clamp-2 whitespace-pre-wrap">{it.content}</p>
              <button
                onClick={(e) => del(e, it.id)}
                className="absolute -top-2 -right-2 hidden group-hover:flex w-6 h-6 rounded-full bg-[#c23b22] text-white items-center justify-center"
                aria-label="删除"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </a>
          ))}

          {items.length === 0 && (
            <div className="text-center py-24">
              <p className="font-serif text-lg text-[#8a8270] mb-6">还没有记录，写第一篇吧</p>
              <a
                href="/diary/write"
                className="px-6 py-2.5 rounded-full bg-[#c23b22] text-white text-sm font-medium hover:opacity-90 transition-opacity"
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
