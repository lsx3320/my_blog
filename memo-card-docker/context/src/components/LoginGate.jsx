// 登录门禁：股票投资手账风格
// 说明：纯前端门禁，仅用于防误入（sessionStorage 可被手动伪造）。
// 密码以 SHA-256 哈希存储，源码不暴露明文。
import { useState } from 'react';

// SHA-256('yc031213') —— 改密码：算出新哈希替换此值即可
const PASSWORD_HASH = 'acd3a469a6b7b175cf7f654cb7153ed61135e293ca7b45bd8a4a75edc76b7dbb';

const TICKERS = [
  { name: '贵州茅台', code: '600519', val: '1724.50', chg: '+0.86%', up: true },
  { name: '宁德时代', code: '300750', val: '187.32', chg: '-0.32%', up: false },
  { name: '比亚迪', code: '002594', val: '243.55', chg: '+1.24%', up: true },
  { name: '中芯国际', code: '688981', val: '54.11', chg: '+0.45%', up: true },
  { name: '隆基绿能', code: '601012', val: '19.09', chg: '-0.12%', up: false },
  { name: '五粮液', code: '000858', val: '136.23', chg: '+0.68%', up: true },
  { name: '恒瑞医药', code: '600276', val: '42.77', chg: '-0.85%', up: false },
  { name: '招商银行', code: '600036', val: '33.67', chg: '+2.03%', up: true },
];

// K线走势装饰（柔和上升）
const KLINE_POINTS = '0,118 40,104 80,110 120,92 160,98 200,74 240,82 280,58 320,66 360,44 400,50 440,28';

export default function LoginGate({ onLogin }) {
  const [pass, setPass] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const submit = async () => {
    // 哈希后比对，源码不暴露明文密码
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pass));
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (hex === PASSWORD_HASH) {
      sessionStorage.setItem('memo-login', '1');
      onLogin();
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  };

  return (
    <div className="login">
      {/* 背景氛围 */}
      <div className="login-atmosphere" />

      {/* 顶部行情滚动条（柔和） */}
      <div className="login-ticker">
        <div className="login-ticker-inner">
          {[...TICKERS, ...TICKERS].map((t, i) => (
            <span key={i} className="ticker-item">
              <b className="ticker-name">{t.name}</b>
              <span className="ticker-code">{t.code}</span>
              <span className={`ticker-val ${t.up ? 'up' : 'down'}`}>{t.val}</span>
              <span className={`ticker-chg ${t.up ? 'up' : 'down'}`}>{t.chg}</span>
            </span>
          ))}
        </div>
      </div>

      {/* 中部：K线装饰 + 登录面板 */}
      <div className="login-body">
        <svg className="login-kline" viewBox="0 0 440 130" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="kfill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d98a5a" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#d98a5a" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`0,130 ${KLINE_POINTS} 440,130`} fill="url(#kfill)" />
          <polyline points={KLINE_POINTS} fill="none" stroke="#d98a5a" strokeWidth="1.8" strokeOpacity="0.7" />
        </svg>

        {/* 登录面板 */}
        <div className={`login-panel ${shake ? 'login-shake' : ''}`}>
          <div className="login-brand">
            <div className="login-logo">📈</div>
            <h1 className="login-title">股海手账</h1>
            <p className="login-sub">把每一次心动 · 记成一行红绿</p>
          </div>

          <div className="login-field">
            <label htmlFor="login-pass" className="login-label">打开手账</label>
            <input
              id="login-pass"
              type="password"
              className={`login-input ${error ? 'login-input-err' : ''}`}
              placeholder="请输入手账密码"
              value={pass}
              onChange={(e) => { setPass(e.target.value); setError(false); }}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              autoFocus
            />
          </div>

          <button type="button" className="login-btn" onClick={submit}>翻开手账</button>

          {error && <p className="login-err">✕ 密码不对哦，再想想</p>}

          <div className="login-status">
            <span className="status-dot" /> 今日已记 3 笔心得 · 悄悄保管在这里
          </div>
        </div>
      </div>

      {/* 底部状态栏 */}
      <div className="login-footer">
        <span>记 · 2026 年夏</span>
        <span className="mono">红涨 · 绿跌</span>
        <span className="up">▲ 中证白酒 +0.86%</span>
      </div>
    </div>
  );
}
