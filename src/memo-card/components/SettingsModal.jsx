// 设置弹窗：配置 DeepSeek API key（AI 整理用，存 localStorage）
import { useState } from 'react';

export default function SettingsModal({ aiKey, onClose, onSaveAI }) {
  const [key, setKey] = useState(aiKey || '');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-sans font-semibold text-lg text-[#3a3526] mb-1">设置</h3>
        <p className="font-sans text-xs text-[#8a8270] mb-4">AI 整理使用 DeepSeek，key 保存在本浏览器 localStorage</p>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-…"
          spellCheck={false}
          className="w-full border border-[#e0d7b8] rounded-lg px-3 py-2 font-mono text-sm text-[#3a3526] focus:outline-none focus:border-[#c23b22] mb-5"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full border border-[#e0d7b8] text-[#5a5340] text-sm font-medium hover:border-[#c9bf9d] transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => { onSaveAI(key.trim()); onClose(); }}
            className="px-5 py-2 rounded-full bg-[#c23b22] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
