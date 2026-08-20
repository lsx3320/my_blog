// 历史卡片列表：点击卡片弹出放大预览
export default function HistoryList({ items, onOpen, onDelete }) {
  if (!items.length) {
    return <p className="history-empty">还没有保存的卡片，写下你的第一句吧 ✍️</p>;
  }

  return (
    <div className="history-grid">
      {items.map((item) => (
        <div key={item.id} className="history-item" onClick={() => onOpen(item)}>
          <button
            type="button"
            className="history-item-del"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
            aria-label="删除"
          >
            ✕
          </button>
          <div className="history-item-title">{item.title || '无标题'}</div>
          <div className="history-item-preview">{item.content.slice(0, 80)}</div>
          <div className="history-item-date">{item.date}</div>
        </div>
      ))}
    </div>
  );
}
