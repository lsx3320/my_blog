// 备忘录写作区：标题 + 自动扩展正文
import { useEffect, useRef } from 'react';

export default function Writer({ title, body, onTitle, onBody }) {
  const bodyRef = useRef(null);

  // 正文自动扩展高度
  useEffect(() => {
    const el = bodyRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [body]);

  return (
    <div className="writer-panel">
      <input
        className="writer-title"
        placeholder="标题（可选）"
        value={title}
        onChange={(e) => onTitle(e.target.value)}
        maxLength={40}
      />
      <textarea
        ref={bodyRef}
        className="writer-body"
        placeholder={'把抖音里收藏的句子、脑海里冒出的感悟，随手写在这里…\n\n写完点右侧「生成卡片」，自动排版对齐。'}
        value={body}
        onChange={(e) => onBody(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}
