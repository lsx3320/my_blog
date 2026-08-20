import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import Writer from './components/Writer.jsx';
import CardPreview from './components/CardPreview.jsx';
import TemplatePicker from './components/TemplatePicker.jsx';
import HistoryList from './components/HistoryList.jsx';
import HistoryModal from './components/HistoryModal.jsx';
import { formatContent, formatDate } from './lib/format.js';
import { formatWithAI, getApiKey, setApiKey } from './api.js';
import SettingsModal from './components/SettingsModal.jsx';
import { loadDraft, saveDraft, loadHistory, saveHistory, addHistory, removeHistory, cloudSync, cloudRemove } from './lib/storage.js';

export default function App() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [template, setTemplate] = useState('paper');
  const [history, setHistory] = useState([]);
  const [saved, setSaved] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');
  const [viewItem, setViewItem] = useState(null); // 弹层查看的历史卡片
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncedAt, setSyncedAt] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const exportRef = useRef(null);

  // 恢复草稿 + 历史 + 从云端拉取
  useEffect(() => {
    const draft = loadDraft();
    const demo = new URLSearchParams(window.location.search).has('demo');
    if (demo) {
      setTitle('愿你被世界温柔以待');
      setBody('这世界很大，大到一辈子都走不完。\n\n但也很小，小到一句话就能温暖一个人。\n\n愿你在深夜赶路时，路灯正好亮着；\n愿你想念的人，也刚好在想你。');
      setTemplate('paper');
    } else if (draft) {
      setTitle(draft.title || '');
      setBody(draft.content || '');
      setTemplate(draft.template || 'paper');
    }
    setHistory(loadHistory());
    // 云同步：启动时自动拉取云端合并（key/bin 固定，所有浏览器共享）
    cloudSync(loadHistory())
      .then((merged) => {
        saveHistory(merged);
        setHistory(merged);
      })
      .catch(() => {});
  }, []);

  // 草稿自动保存（防抖）
  useEffect(() => {
    const t = setTimeout(() => {
      saveDraft({ title, content: body, template });
    }, 400);
    return () => clearTimeout(t);
  }, [title, body, template]);

  // 自动排版（本地规则，零负担）
  const blocks = useMemo(() => formatContent(body), [body]);

  // 预览缩放自适应：卡片 1080×1350，按预览列宽缩放，容器高度匹配
  const [scale, setScale] = useState(0.35);
  useEffect(() => {
    const onResize = () => {
      const containerW = Math.min(window.innerWidth, 1180);
      // 预览列宽（右侧 400px 列，减去 app padding 48px 与 grid gap 24px）
      const colW = Math.max(280, Math.min(400, containerW - 440));
      setScale(Math.min(1, colW / 1080));
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const today = useMemo(() => formatDate(), []);

  const save = () => {
    if (!body.trim() && !title.trim()) return;
    const item = {
      id: Date.now().toString(36),
      title: title.trim(),
      content: body.trim(),
      date: today,
      template,
      createdAt: Date.now(),
    };
    const list = addHistory(item);
    setHistory(list);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    // 自动保存到云端（固定 key/bin，双向合并不覆盖）
    cloudSync(list)
      .then((merged) => {
        saveHistory(merged);
        setHistory(merged);
        setSyncedAt(Date.now());
      })
      .catch(() => {});
  };

  // 手动同步：拉取云端，合并更新本地（旧浏览器内容会同步过来）
  const doSync = async () => {
    setSyncing(true);
    setError('');
    try {
      const merged = await cloudSync(history.length ? history : loadHistory());
      saveHistory(merged);
      setHistory(merged);
      setSyncedAt(Date.now());
    } catch (e) {
      setError(`同步失败：${e.message || '云端不可达'}`);
    } finally {
      setSyncing(false);
    }
  };

  const download = useCallback(async () => {
    if (!exportRef.current) return;
    try {
      const dataUrl = await toPng(exportRef.current, {
        width: 1080,
        height: 1350,
        pixelRatio: 1,
        cacheBust: true,
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `便签卡片_${title || '无题'}_${today.replace(/\./g, '')}.png`;
      a.click();
    } catch {
      setError('图片生成失败');
    }
  }, [title, today]);

  const doAIFormat = async () => {
    if (!body.trim()) return;
    setAiLoading(true);
    setError('');
    try {
      const r = await formatWithAI(body);
      if (r.title) setTitle(r.title);
      if (r.content) setBody(r.content);
    } catch (e) {
      if (e.noKey) {
        setError('AI 整理需要 API key：点击 ⚙️ 设置，填入 DeepSeek key');
        setSettingsOpen(true);
      } else {
        setError(e.message || 'AI 整理失败');
      }
    } finally {
      setAiLoading(false);
    }
  };

  // 加载历史卡片到编辑器（用户在弹层里明确操作）
  const loadFromHistory = (item) => {
    setTitle(item.title || '');
    setBody(item.content || '');
    setTemplate(item.template || 'paper');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteHistory = (id) => {
    setHistory(removeHistory(id));
    // 同步删除云端，避免刷新后又被拉回来
    cloudRemove(id).catch(() => {});
  };

  const cardProps = { title, blocks, date: today, template };
  const cardMark = '随手记 · 便签卡片';

  return (
    <div className="app">
      {/* 左：写作区 */}
      <div>
        <Writer title={title} body={body} onTitle={setTitle} onBody={setBody} />
        <div className="writer-toolbar">
          <span className="writer-hint">{blocks.length ? `${blocks.length} 个片段 · 自动排版` : '写点什么吧'}</span>
          <div className="toolbar-actions">
            <button type="button" className="btn btn-ai" onClick={doAIFormat} disabled={aiLoading || !body.trim()}>
              {aiLoading ? '整理中…' : '✨ AI 整理'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={save} disabled={!body.trim() && !title.trim()}>
              {saved ? '✓ 已保存' : '保存到本页'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={doSync} disabled={syncing} title="从云端拉取合并其他浏览器的数据">
              {syncing ? '同步中…' : '☁️ 同步'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setSettingsOpen(true)} title="设置：AI key">
              ⚙️
            </button>
          </div>
        </div>
        {error && <p style={{ color: '#ff3b30', fontSize: 13, marginTop: 10 }}>{error}</p>}
      </div>

      {/* 右：卡片预览 */}
      <div className="preview-panel">
        <div className="preview-meta">
          <TemplatePicker value={template} onChange={setTemplate} />
          <span className="date">{today}</span>
        </div>
        <div className="preview-card-wrap" style={{ height: 1350 * scale }}>
          <div className="preview-scale" style={{ transform: `scale(${scale})` }}>
            <CardPreview {...cardProps} mark={cardMark} />
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={download} disabled={!body.trim() && !title.trim()}>
          生成卡片图片 ⬇
        </button>
      </div>

      {/* 隐藏的导出原尺寸卡片 */}
      <div style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }}>
        <div ref={exportRef}>
          <CardPreview {...cardProps} mark={cardMark} />
        </div>
      </div>

      {/* 历史 */}
      <div className="history-panel">
        <div className="history-header">已保存的卡片（{history.length}）</div>
        <HistoryList items={history} onOpen={setViewItem} onDelete={deleteHistory} />
      </div>

      {/* 历史卡片放大预览弹层 */}
      {viewItem && (
        <HistoryModal
          item={viewItem}
          onClose={() => setViewItem(null)}
          onLoad={loadFromHistory}
          onDelete={deleteHistory}
        />
      )}

      {/* 设置弹层 */}
      {settingsOpen && (
        <SettingsModal
          aiKey={getApiKey()}
          syncedAt={syncedAt}
          onClose={() => setSettingsOpen(false)}
          onSaveAI={(k) => setApiKey(k)}
        />
      )}
    </div>
  );
}
