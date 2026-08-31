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
        placeholder={'记录本身不会替你改变命运,但它会让你再也没有办法欺骗自己.当你不再自欺,所有\'小小的调整\',才有机会叠加出一条全新的轨迹.'}
        value={body}
        onChange={(e) => onBody(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}
