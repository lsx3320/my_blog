// 卡片 DOM（1080×1350 导出目标）。按 block 类型排版，备忘录风：顶部自然向下。
export default function CardPreview({ title, blocks, date, template, mark = '随手记' }) {
  // 按内容量自适应字号，长文不溢出
  const totalChars = blocks.reduce((n, b) => n + (b.text ? b.text.length : (b.items || []).join('').length), 0) + (title || '').length;
  const bodyFont = totalChars > 300 ? 24 : totalChars > 160 ? 27 : 30;

  return (
    <div className={`card tpl-${template}`}>
      {date && <div className="card-date">{date}</div>}

      {title && <div className="card-title">{title}</div>}

      <div className="card-body" style={{ fontSize: bodyFont }}>
        {blocks.map((b, i) => {
          if (b.type === 'title') {
            return <div key={i} className="card-title" style={{ marginBottom: 0 }}>{b.text}</div>;
          }
          if (b.type === 'quote') {
            return <div key={i} className="card-quote">{b.text}</div>;
          }
          if (b.type === 'list') {
            return (
              <div key={i} className="card-list">
                {(b.items || []).map((item, j) => (
                  <div key={j} className="card-list-item">
                    <span className="card-list-bullet">·</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            );
          }
          return <div key={i} className="card-para">{b.text}</div>;
        })}
      </div>

      {mark && <div className="card-footer-mark">{mark}</div>}
    </div>
  );
}
