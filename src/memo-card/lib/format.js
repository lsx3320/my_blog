// 本地自动排版：把原始文本规范化并识别结构（标题/金句/列表/段落）
// 返回段对象数组 [{type:'title'|'quote'|'list'|'para', text}]

// 规范化：统一标点、清理多余空格/换行
export function normalizeText(text) {
  if (!text) return '';
  let s = String(text);
  // 统一换行
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // 统一全角标点（半角 → 全角常见场景：, . ! ? : ;）
  s = s.replace(/[,]/g, '，').replace(/[.]/g, '。');
  // 去掉行内多余空格（但保留列表符号后的空格）
  s = s.split('\n').map((line) => line.replace(/[ \t　]+/g, (m, off, str) => {
    // 列表符号（- 1. · 等）后保留一个空格
    return /^[-*·•]+\s/.test(str.slice(0, off + m.length)) ? ' ' : '';
  }).trimEnd()).join('\n');
  // 压缩连续空行
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

// 结构识别
export function formatContent(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const blocks = [];
  const lines = normalized.split('\n');

  // 把行分组成块：空行分隔 → 块；连续列表行 → 列表块
  const rawBlocks = [];
  let cur = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (cur.length) { rawBlocks.push(cur); cur = []; }
    } else {
      cur.push(line);
    }
  }
  if (cur.length) rawBlocks.push(cur);

  for (const block of rawBlocks) {
    // 列表块：所有行都是列表标记
    if (block.length > 1 && block.every((l) => /^[-*·•1-9][\s.、．)]/.test(l.trim()))) {
      blocks.push({ type: 'list', items: block.map((l) => l.replace(/^[-*·•1-9][\s.、．)]/, '').trim()) });
      continue;
    }
    if (block.length === 1) {
      const line = block[0].trim();
      // 列表单行
      if (/^[-*·•]/.test(line)) {
        blocks.push({ type: 'list', items: [line.replace(/^[-*·•]\s*/, '').trim()] });
        continue;
      }
      if (/^\d+[.、．)\s]/.test(line)) {
        blocks.push({ type: 'list', items: [line.replace(/^\d+[.、．)\s]+/, '').trim()] });
        continue;
      }
      // 短句 → 金句（居中）
      if (line.length <= 24 && !/[。！？]$/.test(line)) {
        blocks.push({ type: 'quote', text: line });
        continue;
      }
      blocks.push({ type: 'para', text: line });
    } else {
      // 多行非列表：每行若以标点结尾（，。！？；：、…）→ 各自成段，避免句子黏连
      const allSentences = block.every((l) => /[，。！？；：、」』""…]$/.test(l.trim()));
      if (allSentences) {
        block.forEach((l) => blocks.push({ type: 'para', text: l.trim() }));
      } else {
        // 句子被拆行 → 合并为一段，句间补空格防黏连
        blocks.push({ type: 'para', text: block.join(' ').trim() });
      }
    }
  }

  // 首块若是短金句 → 提升为 title（卡片大标题）
  if (blocks.length && blocks[0].type === 'quote' && blocks[0].text.length <= 14) {
    const t = blocks.shift();
    blocks.unshift({ type: 'title', text: t.text });
  }

  return blocks;
}

// 格式化日期为 "2026.08.12"
export function formatDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}
