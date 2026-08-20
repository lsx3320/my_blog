// 阅读页：以文章样式查看单条记录（非卡片）
import { useEffect, useState } from 'react';
import { loadHistory, saveHistory, cloudSync } from '../lib/storage.js';

export default function DiaryView() {
  const id = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('id')
    : '';
  const [item, setItem] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    cloudSync(loadHistory())
      .then((merged) => {
        saveHistory(merged);
        const found = merged.find((x) => x.id === id);
        if (found) setItem(found);
        else setNotFound(true);
      })
      .catch(() => {
        const found = loadHistory().find((x) => x.id === id);
        if (found) setItem(found);
        else setNotFound(true);
      });
  }, [id]);

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#f2f2f7]">
        <div className="max-w-2xl mx-auto px-5 py-32 text-center">
          <p className="font-serif text-lg text-[#8a8a8e] mb-8">这条记录不存在或已被删除</p>
          <a href="/diary" className="px-6 py-2.5 rounded-full bg-[#0a84ff] text-white text-sm font-medium hover:opacity-90 transition-opacity">
            返回日记
          </a>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-[#f2f2f7] flex items-center justify-center">
        <p className="text-sm text-[#8a8a8e]">加载中…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f2f2f7]">
      <div className="max-w-2xl mx-auto px-5 py-10">
        <div className="flex items-center justify-between mb-6">
          <a
            href="/diary"
            className="inline-flex items-center gap-1.5 text-sm text-[#8a8a8e] hover:text-[#0a84ff] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            返回日记
          </a>
          <a
            href={`/diary/write?edit=${item.id}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white shadow-sm text-sm text-[#1c1c1e] font-medium hover:bg-[#f2f2f7] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            编辑
          </a>
        </div>

        <article className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.06)] p-8 md:p-12">
          <header className="mb-10">
            <div className="flex items-center gap-3 text-xs text-[#8a8a8e] mb-5">
              <time>{item.date}</time>
              {item.mood && (
                <>
                  <span className="w-px h-3 bg-[#e5e5ea]" aria-hidden="true"></span>
                  <span className="text-[#b08a3e]">{item.mood}</span>
                </>
              )}
            </div>
            <h1 className="font-serif font-bold text-3xl md:text-4xl text-[#1c1c1e] leading-tight tracking-tight mb-8">
              {item.title || '（无题）'}
            </h1>
            <div className="w-12 h-[2px] bg-[#0a84ff]" aria-hidden="true"></div>
          </header>

          <div className="font-serif text-[17px] md:text-lg text-[#1c1c1e] leading-[1.95] whitespace-pre-wrap">
            {item.content}
          </div>

          <div className="mt-16 text-center">
            <span className="font-serif text-sm text-[#8a8a8e]">—— 完 ——</span>
          </div>
        </article>
      </div>
    </div>
  );
}
