import { useEffect, useMemo, useState } from 'react';
import Writer from './components/Writer.jsx';
import HistoryList from './components/HistoryList.jsx';
import HistoryModal from './components/HistoryModal.jsx';
import { formatContent, formatDate } from './lib/format.js';
import { formatWithAI, getApiKey, setApiKey } from './api.js';
import SettingsModal from './components/SettingsModal.jsx';
import LoginGate from './components/LoginGate.jsx';
import { loadDraft, saveDraft, loadHistory, saveHistory, addHistory, removeHistory, cloudPull, cloudAdd, cloudRemove } from './lib/storage.js';

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
  const [loggedIn, setLoggedIn] = useState(() => {
    try { return sessionStorage.getItem('memo-login') === '1'; } catch { return false; }
  });

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
    // 云同步：启动时以云端为准拉取，本地缓存完全跟随云端（不同设备展示一致）
    cloudPull()
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
    // 保存：把新卡片追加上传到云端（云端 ∪ 新增，不覆盖云端其他卡片）
    cloudAdd(item)
      .then((merged) => {
        saveHistory(merged);
        setHistory(merged);
        setSyncedAt(Date.now());
      })
      .catch(() => {});
  };

  // 手动同步：以云端为准拉取，覆盖本地缓存（不同设备看到一致）
  const doSync = async () => {
    setSyncing(true);
    setError('');
    try {
      const merged = await cloudPull();
      saveHistory(merged);
      setHistory(merged);
      setSyncedAt(Date.now());
    } catch (e) {
      setError(`同步失败：${e.message || '云端不可达'}`);
    } finally {
      setSyncing(false);
    }
  };

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

  // 未登录 → 股票操盘风格登录门禁
  if (!loggedIn) {
    return <LoginGate onLogin={() => setLoggedIn(true)} />;
  }

  return (
    <div className="app">
      {/* 写作区 */}
      <div>
        <Writer title={title} body={body} onTitle={setTitle} onBody={setBody} />
        <div className="writer-toolbar">
          <span className="writer-hint">{blocks.length ? `${blocks.length} 个片段 · 自动排版` : '写点什么吧'}</span>
          <div className="toolbar-actions">
            <button type="button" className="btn btn-ai" onClick={doAIFormat} disabled={aiLoading || !body.trim()}>
              {aiLoading ? '整理中…' : '✨ AI 整理'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={save} disabled={!body.trim() && !title.trim()}>
              {saved ? '✓ 已保存' : '💾 保存'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={doSync} disabled={syncing} title="从云端拉取，覆盖本地（多设备一致）">
              {syncing ? '同步中…' : '☁️ 同步'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setSettingsOpen(true)} title="设置：AI key">
              ⚙️
            </button>
          </div>
        </div>
        {error && <p style={{ color: '#ff3b30', fontSize: 13, marginTop: 10 }}>{error}</p>}
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
