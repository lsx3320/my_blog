// 随笔列表页：查看所有记录（主视图）
import { useEffect, useState } from 'react';
import '@fontsource/noto-serif-tibetan/tibetan-400.css';
import { loadHistory, saveHistory, cloudSync, cloudRemove } from '../lib/storage.js';

// 私密锁卡片：只有输入密码才能看
const LOCK_PASSWORD = '688886';
const LOCK_TITLE = '纯粹的生命力卡片';
const LOCK_HINT = '沾因果文章勿看';
const LOCK_CONTENT = `（正文内容待补充——把内容发我，我填入此处。）`;

export default function DiaryList() {
  const [items, setItems] = useState([]);
  const [state, setState] = useState('同步中…');
  const [lockPass, setLockPass] = useState('');
  const [lockError, setLockError] = useState(false);
  const [lockShake, setLockShake] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);      // 密码输入弹窗
  const [lockUnlocked, setLockUnlocked] = useState(false); // 正文弹窗

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

  // 锁卡片：打开密码输入弹窗
  const openLock = () => {
    setLockPass('');
    setLockError(false);
    setLockOpen(true);
  };

  // 校验密码：正确 → 正文弹窗；错误 → 提示 + 清空
  const checkLock = () => {
    if (lockPass === LOCK_PASSWORD) {
      setLockError(false);
      setLockOpen(false);
      setLockUnlocked(true);
    } else {
      setLockError(true);
      setLockShake(true);
      setTimeout(() => setLockShake(false), 500);
      setLockPass('');
    }
  };

  return (
    <div className="min-h-screen bg-[#f2f2f7]">
      <div className="max-w-3xl mx-auto px-5 py-12">
        <header className="flex items-end justify-between mb-8">
          <div>
            <h1 className="font-serif font-semibold text-[28px] text-[#1c1c1e] tracking-tight">随笔</h1>
            <p className="text-xs text-[#8a8a8e] mt-1.5">{items.length} 篇 · {state}</p>
          </div>
          <a
            href="/diary/write"
            aria-label="写一篇"
            title="写一篇"
            className="w-11 h-11 rounded-full bg-[#0a84ff] text-white shadow-lg shadow-[#0a84ff]/30 flex items-center justify-center hover:opacity-90 hover:scale-105 active:scale-95 transition-all"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
          </a>
        </header>

        {/* 个性公告 */}
        <section className="relative bg-white rounded-2xl border border-[#e5e5ea] shadow-[0_1px_3px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.06)] p-7 md:p-9 mb-8 overflow-hidden">
          <span className="absolute top-4 right-5 text-[10px] tracking-[0.15em] text-[#8a8a8e] border border-[#d1d1d6] rounded-full px-2.5 py-0.5">
            公告
          </span>
          <h2 className="font-serif font-bold text-2xl text-[#1c1c1e] mb-5">致翻到这里的朋友</h2>
          <div className="text-[15px] text-[#3a3a3c] leading-relaxed space-y-3">
            <p>
              我去！朋友你能翻到这里，说明你有点儿水平，且咱俩关系还不错。
            </p>
            <p>
              这里面就是我<span className="font-semibold text-[#c2503a]">随便写写的东西</span>，你就当个乐子看就行了。
            </p>
            <p>
              点击右上角<span className="font-semibold text-[#0a84ff]">蓝色加号</span>可以留言保存哦～
            </p>
            <p>
              整个留言功能是个黑盒，我并不清楚你的身份，所以说<span className="font-semibold text-[#c2503a]">大胆写吧</span>——生活的不愉快、想喷的人和事都可以。路还长，有点怕，但没办法，你我都是大人了。
            </p>
            <p className="font-semibold text-[#1c1c1e]">
              最后，祝你生活愉快。
            </p>
          </div>
          {/* 藏文祝福：朱砂大号，独立突出 */}
          <div className="mt-7 pt-6 border-t border-[#e5e5ea] text-center">
            <p
              className="text-[#c2503a] text-xl md:text-[26px] leading-[2.1] tracking-wide"
              style={{ fontFamily: "'Noto Serif Tibetan','Kailasa','Tibetan Machine Uni',serif" }}
            >
              འཁྲུལ་སྟོང་འཁྱམས་པའི་སེམས་ཅན་ཐམས་ཅད་རྫོགས་པ་ཆེན་པོར་གནས་ཤོག།
            </p>
          </div>
          <p className="mt-4 text-right text-xs text-[#8a8a8e]">—— 后生仔</p>
        </section>

        {/* 记录列表：第一张是私密锁卡片，其余为随笔记录 */}
        <div className="space-y-3">
          {/* 私密锁卡片（列表第一张） */}
          <button
            onClick={openLock}
            className="w-full text-left bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.06)] p-6 hover:shadow-[0_2px_6px_rgba(0,0,0,0.06),0_12px_32px_rgba(0,0,0,0.1)] hover:-translate-y-0.5 transition-all flex items-center gap-4"
          >
            <span className="w-11 h-11 shrink-0 rounded-full bg-[#1c1c1e] flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block font-serif font-semibold text-lg text-[#1c1c1e]">{LOCK_TITLE}</span>
              <span className="block text-xs text-[#8a8a8e] mt-0.5">{LOCK_HINT}</span>
            </span>
            <svg className="w-4 h-4 ml-auto text-[#c7c7cc] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {items.map((it) => (
            <a
              key={it.id}
              href={`/diary/view?id=${it.id}`}
              className="group relative block bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.06)] p-6 hover:shadow-[0_2px_6px_rgba(0,0,0,0.06),0_12px_32px_rgba(0,0,0,0.1)] hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-xs text-[#8a8a8e]">{it.date?.slice(0, 4)}</span>
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

      {/* 锁卡片：密码输入弹窗 */}
      {lockOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
          onClick={() => setLockOpen(false)}
        >
          <div
            className={`w-full max-w-sm bg-white rounded-2xl shadow-xl p-7 text-center ${lockShake ? 'diary-lock-shake' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#1c1c1e] flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="font-serif font-semibold text-lg text-[#1c1c1e] mb-1">{LOCK_TITLE}</h3>
            <p className="text-xs text-[#8a8a8e] mb-5">{LOCK_HINT}，输入密码查看</p>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              value={lockPass}
              onChange={(e) => { setLockPass(e.target.value); setLockError(false); }}
              onKeyDown={(e) => e.key === 'Enter' && checkLock()}
              placeholder="输入密码"
              className="w-full px-4 py-2.5 rounded-xl bg-[#f2f2f7] border border-transparent text-[#1c1c1e] font-mono text-lg text-center tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-[#0a84ff]/40 placeholder:text-[#c7c7cc] mb-4"
            />
            <button
              onClick={checkLock}
              className="w-full py-2.5 rounded-xl bg-[#0a84ff] text-white text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all"
            >
              查看
            </button>
            {lockError && <p className="mt-3 text-xs text-[#ff3b30]">密码不对，再想想～</p>}
          </div>
        </div>
      )}

      {/* 锁卡片：正文弹窗 */}
      {lockUnlocked && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setLockUnlocked(false)}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-white rounded-2xl shadow-xl p-8 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setLockUnlocked(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#f2f2f7] hover:bg-[#e5e5ea] flex items-center justify-center text-[#8a8a8e] transition-colors"
              aria-label="关闭"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="font-serif font-bold text-2xl text-[#1c1c1e] mb-5 pr-8">{LOCK_TITLE}</h3>
            <div className="font-serif text-[16px] text-[#3a3a3c] leading-[1.9] whitespace-pre-wrap">{LOCK_CONTENT}</div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes diary-lock-shake {
          10%, 90% { transform: translateX(-1px); }
          20%, 80% { transform: translateX(2px); }
          30%, 50%, 70% { transform: translateX(-4px); }
          40%, 60% { transform: translateX(4px); }
        }
        .diary-lock-shake { animation: diary-lock-shake 0.4s ease; }
      `}</style>
    </div>
  );
}
