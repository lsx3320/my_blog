// 登录门禁（逻辑参考 memo-card 的 LoginGate：密码常量 + state 驱动 + shake 反馈 + 状态记忆）
import { useState } from 'react';

const PASSWORD = '20020423'; // 我的生日
const DEFAULT_KEY = 'diary_unlocked';

const SHAKE_CSS = `
@keyframes diary-shake {
  10%, 90% { transform: translateX(-1px); }
  20%, 80% { transform: translateX(2px); }
  30%, 50%, 70% { transform: translateX(-4px); }
  40%, 60% { transform: translateX(4px); }
}
.diary-shake { animation: diary-shake 0.4s ease; }
`;

export default function LoginGate({ title = '私人随笔', subtitle = '我的生日（8 位数字）', storageKey = DEFAULT_KEY }) {
  const [pass, setPass] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  // 初始：已登录过（localStorage）则遮罩隐藏
  const [hidden, setHidden] = useState(() => {
    try {
      if (localStorage.getItem(storageKey) === '1') return true;
      if (sessionStorage.getItem(storageKey) === '1') {
        localStorage.setItem(storageKey, '1');
        return true;
      }
    } catch { /* ignore */ }
    return false;
  });

  const submit = () => {
    if (pass === PASSWORD) {
      try { localStorage.setItem(storageKey, '1'); } catch { /* ignore */ }
      setError(false);
      setHidden(true); // 揭开遮罩，下方内容始终已就绪
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setPass('');
    }
  };

  if (hidden) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#f2f2f7] p-4">
      <div className={`w-full max-w-sm bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.08)] border border-[#e5e5ea] p-8 text-center ${shake ? 'diary-shake' : ''}`}>
        <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-[#1c1c1e] flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="font-display font-semibold text-xl text-[#1c1c1e] mb-1">{title}</h2>
        <p className="text-sm text-[#8a8a8e] mb-7">{subtitle}</p>
        <input
          type="password"
          inputMode="numeric"
          maxLength={8}
          autoFocus
          value={pass}
          onChange={(e) => { setPass(e.target.value); setError(false); }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="输入密码"
          className="w-full px-4 py-2.5 rounded-xl bg-[#f2f2f7] border border-transparent text-[#1c1c1e] font-mono text-lg text-center tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-[#0a84ff]/40 placeholder:text-[#c7c7cc]"
        />
        <button
          type="button"
          onClick={submit}
          className="mt-5 w-full py-2.5 rounded-xl bg-[#0a84ff] text-white text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all"
        >
          进入
        </button>
        {error && <p className="mt-4 text-xs text-[#ff3b30]">密码不对，再想想～</p>}
      </div>
      <style>{SHAKE_CSS}</style>
    </div>
  );
}
