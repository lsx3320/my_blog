// 历史卡片列表：点击卡片弹出放大预览；删除需二次确认（防手机误触）
import { useRef, useState } from 'react';

export default function HistoryList({ items, onOpen, onDelete }) {
  // 待确认删除的 id（第一次点 ✕ 进入确认态，2.5s 内再点才真删）
  const [confirmId, setConfirmId] = useState(null);
  const timerRef = useRef(null);

  const handleDelete = (id) => {
    if (confirmId === id) {
      clearTimeout(timerRef.current);
      setConfirmId(null);
      onDelete(id);
    } else {
      setConfirmId(id);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setConfirmId(null), 2500);
    }
  };

  if (!items.length) {
    return <p className="history-empty">还没有保存的卡片，写下你的第一句吧 ✍️</p>;
  }

  return (
    <div className="history-grid">
      {items.map((item) => (
        <div key={item.id} className="history-item" onClick={() => onOpen(item)}>
          <button
            type="button"
            className={`history-item-del ${confirmId === item.id ? 'confirming' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(item.id);
            }}
            aria-label={confirmId === item.id ? '确认删除' : '删除'}
          >
            {confirmId === item.id ? '确认?' : '✕'}
          </button>
          <div className="history-item-title">{item.title || '无标题'}</div>
          <div className="history-item-preview">{item.content.slice(0, 80)}</div>
          <div className="history-item-date">{item.date}</div>
        </div>
      ))}
    </div>
  );
}
