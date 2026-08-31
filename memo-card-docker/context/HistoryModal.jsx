// 历史卡片放大预览弹层：深色遮罩 + 放大卡片 + 操作
import { useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import CardPreview from './CardPreview.jsx';
import { formatContent, formatDate } from '../lib/format.js';

export default function HistoryModal({ item, onClose, onLoad, onDelete }) {
  const exportRef = useRef(null);
  const [scale, setScale] = useState(0.4);
  const [busy, setBusy] = useState(false);

  // 卡片内容
  const blocks = useMemo(() => formatContent(item?.content || ''), [item]);
  const date = item?.date || formatDate();

  // 弹层自适应缩放：同时受屏幕宽高约束，容器与缩放后卡片完全一致
  useEffect(() => {
    const onResize = () => {
      const pad = 24; // 手机 12px*2 + 按钮区余量；桌面 24px*2
      const maxW = Math.min(window.innerWidth - pad, 560);
      const maxH = window.innerHeight * 0.62; // 给按钮区留空间
      const base = Math.min(maxW, maxH * (1080 / 1350), 500);
      setScale(Math.min(1, base / 1080));
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Esc 关闭
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!item) return null;

  const download = async () => {
    if (!exportRef.current) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(exportRef.current, { width: 1080, height: 1350, pixelRatio: 1, cacheBust: true });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `便签卡片_${item.title || '无题'}_${date.replace(/\./g, '')}.png`;
      a.click();
    } catch { /* ignore */ }
    setBusy(false);
  };

  return (
    <div
      className="history-modal"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div className="history-modal-inner">
        <div className="history-modal-card" style={{ width: 1080 * scale, height: 1350 * scale }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 1080, height: 1350, position: 'absolute', top: 0, left: 0 }}>
            <div ref={exportRef}>
              <CardPreview title={item.title} blocks={blocks} date={date} template={item.template || 'paper'} mark="随手记 · 便签卡片" />
            </div>
          </div>
        </div>

        <div className="history-modal-actions">
          <button type="button" className="btn btn-primary" onClick={download} disabled={busy}>下载图片</button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              onLoad(item);
              onClose();
            }}
          >
            加载到编辑器
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ color: '#ff3b30' }}
            onClick={() => {
              onDelete(item.id);
              onClose();
            }}
          >
            删除
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
