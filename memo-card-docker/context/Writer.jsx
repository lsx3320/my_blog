// 备忘录写作区：标题 + 正文（flex 撑满，手机端键盘友好）
import { useRef } from 'react';

export default function Writer({ title, body, onTitle, onBody }) {
  const bodyRef = useRef(null);

  return (
    <div className="writer-panel">
      <input
        className="writer-title"
        placeholder="标题（可选）"
        value={title}
        onChange={(e) => onTitle(e.target.value)}
        maxLength={40}
        enterKeyHint="next"
      />
      <textarea
        ref={bodyRef}
        className="writer-body"
        placeholder={'把抖音里收藏的句子、脑海里冒出的感悟，随手写在这里…\n\n写完点「保存到本页」，自动排版对齐。'}
        value={body}
        onChange={(e) => onBody(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}
