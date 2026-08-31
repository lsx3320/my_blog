// 设置弹层：云同步状态（固定 key）+ AI key（用户配置，存 localStorage）
import { useState } from 'react';

export default function SettingsModal({ aiKey, syncedAt, onClose, onSaveAI }) {
  const [aiInput, setAiInput] = useState(aiKey);
  const [msg, setMsg] = useState('');

  const saveAI = () => {
    onSaveAI(aiInput.trim());
    setMsg('已保存 AI key');
  };

  return (
    <div className="history-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings-panel">
        <h3 className="settings-title">设置</h3>

        {/* 云同步（只读状态） */}
        <div className="settings-section">
          <p className="settings-label">☁️ 云同步</p>
          <p className="settings-ok">✓ 已配置云端共享（所有设备共用同一份数据）</p>
          <p className="settings-hint">
            保存卡片自动上传云端；换设备/浏览器后点工具栏「☁️ 同步」即可拉取最新数据。启动页面时也会自动同步。
          </p>
          {syncedAt > 0 && (
            <p className="settings-hint">上次同步：{new Date(syncedAt).toLocaleString()}</p>
          )}
        </div>

        <div className="settings-divider" />

        {/* AI 直连 key（用户配置） */}
        <div className="settings-section">
          <p className="settings-label">✨ AI 整理 · DeepSeek API key</p>
          <p className="settings-hint">纯静态部署直连用。填一次保存在本浏览器，之后 AI 整理可用。</p>
          <input
            type="password"
            className="settings-input"
            placeholder="DeepSeek API key（sk-...）"
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
          />
          <div className="settings-actions">
            <button type="button" className="btn btn-ghost" onClick={saveAI}>保存</button>
          </div>
        </div>

        {msg && <p className="settings-msg">{msg}</p>}

        <button type="button" className="btn btn-ghost settings-close" onClick={onClose}>关闭</button>
      </div>
    </div>
  );
}
