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
      <div className="min-h-screen bg-[#f5efe0]">
        <div className="max-w-2xl mx-auto px-6 py-32 text-center">
          <p className="font-serif text-lg text-[#8a8270] mb-8">这条记录不存在或已被删除</p>
          <a href="/diary" className="px-6 py-2.5 rounded-full border border-[#3a3526] text-[#3a3526] text-sm font-medium hover:border-[#c23b22] hover:text-[#c23b22] transition-colors">
            返回日记
          </a>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-[#f5efe0] flex items-center justify-center">
        <p className="font-sans text-sm text-[#8a8270]">加载中…</p>
      </div>
    );
  }

  return (
    <article className="min-h-screen bg-[#f5efe0] border-b border-[#e5ddc8]">
      <div className="max-w-2xl mx-auto px-6 py-14">
        <a
          href="/diary"
          className="inline-flex items-center gap-1.5 font-sans text-sm text-[#6b6350] hover:text-[#c23b22] transition-colors mb-12"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
          返回日记
        </a>

        <header className="mb-12">
          <div className="flex items-center gap-3 font-sans text-xs text-[#8a8270] mb-5">
            <time>{item.date}</time>
            {item.mood && (
              <>
                <span className="w-px h-3 bg-[#d8cfae]" aria-hidden="true"></span>
                <span className="text-[#b08a3e]">{item.mood}</span>
              </>
            )}
          </div>
          <h1 className="font-display font-bold text-3xl md:text-4xl text-[#3a3526] leading-tight tracking-tight mb-8">
            {item.title || '（无题）'}
          </h1>
          <div className="w-12 h-[2px] bg-[#c23b22]" aria-hidden="true"></div>
        </header>

        <div className="font-serif text-[17px] md:text-lg text-[#3a3526] leading-[1.95] whitespace-pre-wrap">
          {item.content}
        </div>

        <div className="mt-20 text-center">
          <span className="font-serif text-sm text-[#8a8270]">—— 完 ——</span>
        </div>
      </div>
    </article>
  );
}
