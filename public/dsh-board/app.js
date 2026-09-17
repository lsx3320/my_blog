/* ============================================================
   DSH 插件看板 — 前端逻辑（无依赖、离线可用）
   数据：data/plugins.json（技术索引）+ data/plain.json（人话说明/需求场景）
        data/readmes/<id>.json（官方文档全文）+ data/docs.json（进阶文档）
   设计取向：使用者先说「我想做什么」，界面负责把它翻译成插件。
   ============================================================ */
'use strict'

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

let DATA = null
let PLAIN = { items: {}, scenarios: [], coverage: {} }
let DOCS = []
const byId = new Map()
const readmeCache = new Map()

const state = {
  view: 'need',
  q: '',
  cat: '',
  kind: '',
  plane: '',
  mounted: 'all',
  sort: 'name',
  open: '',    // 展开的需求场景
  sel: null,   // 打开的插件
  tab: 'plain',
  lang: 'zh',
}

/* ────────────────────────── 启动 ────────────────────────── */

init()

async function init() {
  let plugins, plain, docs
  try {
    ;[plugins, plain, docs] = await Promise.all([
      fetch('data/plugins.json').then((r) => r.json()),
      fetch('data/plain.json').then((r) => r.json()),
      fetch('data/docs.json').then((r) => r.json()).catch(() => ({ docs: [] })),
    ])
  } catch {
    $('#view').innerHTML = `<div class="section-head"><h2>数据没加载出来</h2></div>
      <p class="empty">这一页要通过 HTTP 访问（Docker 容器或本地静态服务）。直接双击打开 HTML 文件时，浏览器不允许读取 data/ 下的数据。<br>
      请先 <code>docker compose up -d</code>，再访问 <code>http://localhost:8099</code>。</p>`
    return
  }
  DATA = plugins
  PLAIN = plain
  DOCS = docs.docs || []
  for (const p of DATA.plugins) {
    p.plain = PLAIN.items[p.id] || null
    byId.set(p.id, p)
  }
  readHash()

  $('#ver').textContent = `DSH ${DATA.dshVersion}`
  $('#readout').innerHTML = [
    ['插件', DATA.counts.packages],
    ['默认就开着', DATA.counts.mounted],
    ['要自己装', DATA.counts.packages - DATA.counts.mounted],
    ['能给 AI 加的能力', DATA.counts.tools],
    ['需求场景', PLAIN.scenarios.length],
    ['有中文官方文档', DATA.counts.readmeZh],
  ].map(([k, v], i) => `<span class="rd${i === 2 ? ' copper' : ''}">${k} <b>${v}</b></span>`).join('')

  bindChrome()
  renderRail()
  render()

  if (state.sel) openPlugin(state.sel, false)
  window.addEventListener('hashchange', () => { readHash(); renderRail(); render(); if (state.sel) openPlugin(state.sel, false) })
}

/* ────────────────────────── 全局交互 ────────────────────────── */

function bindChrome() {
  const q = $('#q')
  let t = 0
  q.addEventListener('input', () => {
    clearTimeout(t)
    t = setTimeout(() => { state.q = q.value.trim(); state.open = ''; writeHash(); render() }, 130)
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== q && !/input|textarea/i.test(document.activeElement.tagName)) {
      e.preventDefault(); q.focus(); q.select()
    }
    if (e.key === 'Escape') {
      if (!$('#drawer').hidden) closeDrawer()
      else if (document.activeElement === q) { q.value = ''; state.q = ''; writeHash(); render() }
    }
  })
  $$('#views button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)))
  $('#reset').addEventListener('click', () => {
    Object.assign(state, { q: '', cat: '', kind: '', plane: '', mounted: 'all', sort: 'name', open: '' })
    $('#q').value = ''
    writeHash(); renderRail(); render()
  })
  $('#close').addEventListener('click', closeDrawer)
  $('#scrim').addEventListener('click', closeDrawer)
}

function setView(v) {
  state.view = v
  state.open = ''
  closeDrawer()
  writeHash()
  renderRail()
  render()
}

/* ────────────────────────── 人话词汇表 ────────────────────────── */

const PLANE_NAME = {
  base: '所有模式都用',
  'web-app': '只有网页界面用',
  headless: '只有脚本模式用',
}

const KIND_NAME = {
  tool: '给 AI 加能力',
  client: '网页界面上的部件',
  bundle: '成套的装配包',
  'host-plugin': '后台常驻的插件',
  'agent-plugin': '跟着会话走的插件',
  library: '给别的插件用的零件',
  vendor: '第三方底层库',
  app: '可执行入口',
}

const KIND_HELP = {
  tool: '装上它，AI 就多一个能调用的本事（比如跑命令、上网）',
  client: '装上它，网页界面上就多一块东西（面板、按钮、侧栏）',
  bundle: '一整组插件打包，说明「这个模式默认开哪些」',
  'host-plugin': '装在服务端后台，整个程序共用一份',
  'agent-plugin': '每开一个会话就按需生效',
  library: '它自己不直接给你功能，是别的插件的零件',
  vendor: 'Cordis 框架那一层的依赖，日常不用管',
  app: 'dsh 命令本身',
}

const planeCount = (id) => DATA.plugins.filter((p) => p.planes.includes(id)).length

/* ────────────────────────── 左侧筛选栏 ────────────────────────── */

function renderRail() {
  const body = $('#railBody')
  if (state.view !== 'all' && state.view !== 'tools') {
    body.innerHTML = '<div class="group"><div class="group-title">筛选</div><div class="empty">切到「全部插件」或「能用的工具」页时，这里会出现筛选条件。</div></div>'
    return
  }

  const group = (title, key, items) => `
    <div class="group">
      <div class="group-title">${title}</div>
      ${items.length ? items.map((it) => `
        <button class="chip${state[key] === it.id ? ' on' : ''}" data-k="${key}" data-v="${esc(it.id)}" title="${esc(it.help || '')}">
          <span class="dot"></span><span>${esc(it.label)}</span><span class="n">${it.n ?? ''}</span>
        </button>`).join('') : '<div class="empty">—</div>'}
    </div>`

  body.innerHTML = [
    group('什么时候生效', 'plane', DATA.planes.map((pl) => ({
      id: pl.id, label: PLANE_NAME[pl.id] || pl.label, help: `${pl.label}${pl.note ? `：${pl.note}` : ''}`, n: planeCount(pl.id),
    }))),
    group('插件类型', 'kind', DATA.kinds.map((k) => ({
      id: k.id, label: KIND_NAME[k.id] || k.label, help: KIND_HELP[k.id] || k.desc, n: k.count,
    }))),
    group('功能分类', 'cat', DATA.categories.map((c) => ({ id: c.id, label: c.label, n: c.count }))),
    `<div class="group">
      <div class="group-title">默认开了没有</div>
      ${[['all', '都看'], ['yes', '已经开着的'], ['no', '要自己装的']].map(([id, label]) => `
        <button class="chip${state.mounted === id ? ' on' : ''}" data-k="mounted" data-v="${id}">
          <span class="dot"></span><span>${label}</span><span class="n">${
            id === 'yes' ? DATA.counts.mounted : id === 'no' ? DATA.counts.packages - DATA.counts.mounted : DATA.counts.packages
          }</span>
        </button>`).join('')}
    </div>`,
    `<div class="group">
      <div class="group-title">排序</div>
      ${[['name', '按名字'], ['used', '被最多插件需要'], ['deps', '需要的前提最多']].map(([id, label]) => `
        <button class="chip${state.sort === id ? ' on' : ''}" data-k="sort" data-v="${id}">
          <span class="dot"></span><span>${label}</span>
        </button>`).join('')}
    </div>`,
  ].join('')

  $$('.chip', body).forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.k
    const v = b.dataset.v
    state[k] = k === 'mounted' || k === 'sort' ? v : (state[k] === v ? '' : v)
    writeHash(); renderRail(); render()
  }))
}

/* ────────────────────────── 搜索与过滤 ────────────────────────── */

function haystack(p) {
  const pl = p.plain || {}
  return [
    p.id, p.name, p.description, p.categoryLabel, p.dir,
    p.tools.map((t) => `${t.name} ${t.description}`).join(' '),
    pl.headline, pl.analogy, pl.enable,
    (pl.problems || []).join(' '), (pl.whenToUse || []).join(' '), (pl.keywords || []).join(' '),
  ].filter(Boolean).join(' ').toLowerCase()
}

const matchesQuery = (p, q) => !q || q.toLowerCase().split(/\s+/).every((w) => haystack(p).includes(w))

function filtered() {
  const list = DATA.plugins.filter((p) => {
    if (state.cat && p.category !== state.cat) return false
    if (state.kind && p.kind !== state.kind) return false
    if (state.plane && !p.planes.includes(state.plane)) return false
    if (state.mounted === 'yes' && !p.mounted) return false
    if (state.mounted === 'no' && p.mounted) return false
    return matchesQuery(p, state.q)
  })
  const sorters = {
    name: (a, b) => a.id.localeCompare(b.id),
    used: (a, b) => b.requiredBy.length - a.requiredBy.length || a.id.localeCompare(b.id),
    deps: (a, b) => b.requires.length - a.requires.length || a.id.localeCompare(b.id),
  }
  return list.sort(sorters[state.sort] || sorters.name)
}

/* ────────────────────────── 渲染总入口 ────────────────────────── */

function render() {
  $$('#views button').forEach((b) => b.classList.toggle('on', b.dataset.view === state.view))
  const v = $('#view')
  if (state.view === 'need') v.innerHTML = viewNeed()
  else if (state.view === 'all') v.innerHTML = viewAll()
  else if (state.view === 'tools') v.innerHTML = viewTools()
  else if (state.view === 'config') v.innerHTML = viewConfig()
  else v.innerHTML = viewDocs()
  wire(v)
}

/* ── 视图 1：按需求找 ── */

function viewNeed() {
  const q = state.q
  const hitPlugins = q ? DATA.plugins.filter((p) => matchesQuery(p, q)) : []
  const scenarios = PLAIN.scenarios.filter((s) => {
    if (!q) return true
    const hay = `${s.need} ${s.promise} ${s.start} ${s.keywords.join(' ')} ${s.plugins.join(' ')}`.toLowerCase()
    return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))
  })
  const open = state.open ? PLAIN.scenarios.find((s) => s.id === state.open) : null
  if (open) return scenarioDetail(open)

  return `
  <div class="section-head">
    <h2>你想做什么？</h2>
    <span class="sub">挑一条最接近的需求，看它对应哪些插件；也可以直接把想法打进上面的搜索框</span>
    <span class="count">${scenarios.length} 条需求 · 覆盖 ${PLAIN.coverage.inScenarios} 个插件</span>
  </div>

  ${q && hitPlugins.length ? `
    <div class="block">
      <div class="block-title">搜索「${esc(q)}」直接命中的插件（${hitPlugins.length}）</div>
      <div class="grid">${hitPlugins.slice(0, 12).map(card).join('')}</div>
      ${hitPlugins.length > 12 ? `<p class="empty">还有 ${hitPlugins.length - 12} 个，切到「全部插件」页看完整列表。</p>` : ''}
    </div>` : ''}

  <div class="needs">
    ${scenarios.map(needCard).join('') || '<p class="empty">没有匹配的需求。换个说法，或切到「全部插件」页搜。</p>'}
  </div>`
}

function needCard(s) {
  return `
  <article class="need-card" tabindex="0" role="button" data-need="${esc(s.id)}">
    <div class="need-label">我需要</div>
    <h3 class="need-title">${esc(s.need)}</h3>
    <p class="need-promise">${esc(s.promise)}</p>
    <p class="need-start"><b>怎么开始：</b>${esc(s.start)}</p>
    <div class="need-foot">
      <span class="need-count">${s.plugins.length} 个插件</span>
      <span class="need-keys">${s.keywords.slice(0, 4).map((k) => `<span class="key">${esc(k)}</span>`).join('')}</span>
    </div>
  </article>`
}

function scenarioDetail(s) {
  const list = s.plugins.map((id) => byId.get(id)).filter(Boolean)
  const on = list.filter((p) => p.mounted).length
  return `
  <div class="section-head">
    <button class="backlink" data-need-back="1">← 所有需求</button>
    <span class="sub">${list.length} 个插件 · 其中 ${on} 个默认就开着</span>
  </div>
  <div class="need-hero">
    <div class="need-label">我需要</div>
    <h2>${esc(s.need)}</h2>
    <p class="need-promise">${esc(s.promise)}</p>
    ${on === 0 ? '<p class="need-warn">这条需求默认没有开着任何插件 —— 下面这几个都需要你自己先装上（怎么装见「怎么用上」页签）。</p>' : ''}
    <p class="need-start"><b>怎么开始：</b>${esc(s.start)}</p>
    <div class="need-keys" style="margin-top:10px">${s.keywords.map((k) => `<button class="key" data-q="${esc(k)}">${esc(k)}</button>`).join('')}</div>
  </div>
  <div class="grid" style="margin-top:14px">${list.map(card).join('')}</div>`
}

/* ── 视图 2：全部插件 ── */

function viewAll() {
  const list = filtered()
  const active = [
    state.plane && (PLANE_NAME[state.plane] || DATA.planes.find((p) => p.id === state.plane)?.label),
    state.kind && (KIND_NAME[state.kind] || DATA.kinds.find((k) => k.id === state.kind)?.label),
    state.cat && DATA.categories.find((c) => c.id === state.cat)?.label,
    state.q && `搜索「${state.q}」`,
  ].filter(Boolean).join(' · ')

  return `
  <div class="section-head">
    <h2>全部插件</h2>
    <span class="sub">${active || '每一个卡片都用一句话说清它能干嘛；点开看比方和怎么开启'}</span>
    <span class="count">${list.length} / ${DATA.counts.packages}</span>
  </div>
  ${list.length ? `<div class="grid">${list.map(card).join('')}</div>`
    : `<p class="empty">没有匹配的插件。换个说法试试，或点左下角「重置」。</p>`}`
}

function card(p) {
  const pl = p.plain || {}
  const headline = pl.headline || p.summary || p.description
  const keys = (pl.keywords || []).slice(0, 4)
  const outLabel = p.tools.length
    ? p.tools.slice(0, 3).map((t) => t.name).join(' ')
    : p.client ? `界面 ${p.client.inject.length} 处` : p.kind === 'library' ? '别的插件的零件' : p.kind === 'vendor' ? '底层库' : '后台服务'
  const stateTag = p.mounted
    ? '<span class="tag mask" title="DSH 默认清单里已经装上，直接能用">默认就开着</span>'
    : '<span class="tag copper" title="默认没装，需要你自己加进插件清单">要自己装</span>'

  return `
  <article class="card k-${p.kind}" tabindex="0" role="button" data-p="${esc(p.id)}" aria-label="${esc(headline)}（${esc(p.id)}）">
    <div class="card-top">
      <span class="tag${p.kind === 'tool' ? ' mask' : p.kind === 'bundle' ? ' copper' : ''}">${esc(KIND_NAME[p.kind] || p.kindLabel)}</span>
      ${stateTag}
      <span class="cat">${esc(p.categoryLabel)}</span>
    </div>
    <h3 class="card-headline">${esc(headline)}</h3>
    ${keys.length ? `<div class="card-keys">${keys.map((k) => `<span class="key">${esc(k)}</span>`).join('')}</div>` : ''}
    <div class="card-part">${esc(p.id)}${p.alternate ? ' · 备选实现' : ''}</div>
    <div class="patch" title="需要先有 ${p.requires.length} 个插件提供能力；生效范围 ${p.planes.length} 处；提供：${outLabel}">
      <span class="in">需要 ${p.requires.length} 个前提</span>
      <span class="wire"></span>
      <span class="node">${Array.from({ length: Math.max(1, Math.min(p.planes.length, 7)) }).map(() => '<i></i>').join('')}</span>
      <span class="wire"></span>
      <span class="out"><span class="tooldot"></span>${esc(outLabel)}</span>
    </div>
  </article>`
}

/* ── 视图 3：能用的工具 ── */

function viewTools() {
  const q = state.q.toLowerCase()
  const hit = (s) => !q || q.split(/\s+/).every((w) => s.toLowerCase().includes(w))
  const tools = DATA.tools.filter((t) => hit(`${t.name} ${t.description} ${t.pkg}`))
  const cmds = DATA.commands.filter((t) => hit(`${t.name} ${t.description} ${t.pkg}`))

  const row = (t) => {
    const p = byId.get(t.pkg)
    return `
    <tr>
      <td class="tname">${esc(t.name)}</td>
      <td class="tdesc">${esc(t.description)}</td>
      <td><button class="towner" data-p="${esc(t.pkg)}">${esc(p?.plain?.headline || t.pkg)}</button>
        <div class="tsub">${esc(t.pkg)}</div></td>
      <td class="tcat">${esc(p?.categoryLabel || '')}</td>
    </tr>`
  }

  return `
  <div class="section-head">
    <h2>AI 能用的工具</h2>
    <span class="sub">这些是它真正能动手做的事；「谁给的」那一列点进去，就是提供这个能力的插件</span>
    <span class="count">${tools.length} 个工具 · ${cmds.length} 条斜杠命令</span>
  </div>
  <table class="table">
    <thead><tr><th style="width:170px">工具</th><th>能干什么</th><th style="width:290px">谁给的</th><th style="width:130px">分类</th></tr></thead>
    <tbody>${tools.map(row).join('') || '<tr><td colspan="4" class="empty">没有匹配的工具</td></tr>'}</tbody>
  </table>

  <div class="section-head" style="margin-top:26px">
    <h2>斜杠命令</h2>
    <span class="sub">在输入框里以 / 开头就能用</span>
  </div>
  <table class="table">
    <thead><tr><th style="width:170px">命令</th><th>干什么</th><th style="width:290px">谁给的</th><th style="width:130px">分类</th></tr></thead>
    <tbody>${cmds.map(row).join('') || '<tr><td colspan="4" class="empty">没有匹配的命令</td></tr>'}</tbody>
  </table>`
}

/* ── 视图 4：装配与配置 ── */

const SNIPPETS = [
  ['打开一个现在没装的插件', '在你自己那份插件清单里加两行。清单是一层层叠加的，你写的这层最后生效。', `# 你自己的清单：~/.dsh/profiles/<模式>/cordis.patch.yml
- insert:
    - id: my-schedule          # 起个不重复的名字
      name: '@deepseek-ai/dsh-schedule'`],
  ['改一个插件的行为（比如把历史全文搜索打开）', '只写 id + 要改的配置。注意：这会把这个条目的配置整块换掉，不是合并。', `- id: session-query-sqlite
  config:
    path: !!js dshHomePath('query.sqlite')
    openAt: first-search      # never | first-search | startup`],
  ['关掉一个不想要的插件', '写 disabled: true；也能按环境判断，比如只在 Windows 上关。', `- id: hmr
  disabled: true

# 只在 Windows 上关掉终端工具
- id: tool-bash
  disabled: !!js process.platform === 'win32'`],
  ['改「某个模式下 AI 有哪些能力」', '每个模式单独一份清单，里面一行就是一个能力。', `# dsh/config/agent-presets/<预设名>/agent.cordis.yml
- id: tool-workflow
  name: '@deepseek-ai/dsh-tool-workflow'
  config:
    maxConcurrency: 8`],
]

function viewConfig() {
  const q = state.q.toLowerCase()
  const comps = DATA.compositions.map((c) => ({
    ...c,
    shown: c.entries.filter((e) => !q || q.split(/\s+/).every((w) => `${e.id} ${e.name} ${e.note}`.toLowerCase().includes(w))),
  })).filter((c) => !q || c.shown.length)

  return `
  <div class="section-head">
    <h2>这些插件是怎么被装起来的</h2>
    <span class="sub">DSH 的能力都写在「清单」里：一层通用清单 + 网页/脚本各一层 + 每个模式一层，你自己那份最后生效 —— 想加插件、关插件、改配置，都在这里抄</span>
    <span class="count">${DATA.planes.length} 份清单 · ${DATA.counts.entries} 行</span>
  </div>

  <div class="block">
    <div class="block-title">四段可以直接抄的配置</div>
    <div class="guide-grid">
      ${SNIPPETS.map(([t, d, code]) => `<div class="slip"><h3>${esc(t)}</h3><p>${esc(d)}</p><pre>${esc(code)}</pre></div>`).join('')}
    </div>
  </div>

  <div class="block">
    <div class="block-title">四种模式各自开哪些能力</div>
    <div class="guide-grid">
      ${DATA.presets.map((p) => `
        <div class="slip">
          <h3>${esc(p.label)}（${esc(p.id)}）</h3>
          <p>${esc(p.description)}</p>
          <p class="empty">${p.entryCount} 项：${p.entries.slice(0, 6).map((e) => esc(e)).join('、')}${p.entries.length > 6 ? ' …' : ''}</p>
        </div>`).join('')}
    </div>
  </div>

  ${comps.map((c) => `
    <section class="compo">
      <header class="compo-head">
        <div class="compo-id">${esc(c.kind === 'preset' ? '某个模式的清单' : '一层通用清单')}</div>
        <div class="compo-label">${esc(c.label)}</div>
        <div class="compo-file">${esc(c.file)}</div>
        <div class="compo-note">${esc(c.note)}</div>
        <div class="compo-count">${c.entryCount} 行 ＝ ${c.inserts} 处新装 + ${c.patches} 处改配置${q ? ` ｜ 命中 ${c.shown.length}` : ''}</div>
        ${c.header ? `<details class="yamldoc" style="margin-top:8px"><summary>这份清单开头的说明（作者注释）</summary><pre>${esc(c.header)}</pre></details>` : ''}
      </header>
      <div class="entries">
        ${c.shown.map((e) => {
          const pid = e.name ? e.name.replace(/^@[^/]+\//, '') : ''
          const p = byId.get(pid)
          return `<div class="entry">
            <div class="entry-top">
              <span class="entry-id">${esc(e.id)}</span>
              ${e.insert ? '<span class="tag mask">新装</span>' : '<span class="tag copper">改配置</span>'}
              ${e.disabled ? `<span class="tag dim" title="${esc(e.disabled)}">有条件关闭</span>` : ''}
            </div>
            ${p ? `<button class="entry-link" data-p="${esc(pid)}">${esc(p.plain?.headline || pid)}</button>
                   <div class="entry-id">${esc(pid)}</div>`
                : `<span class="entry-id">${esc(pid || '（没解析出来）')}</span>`}
            ${e.note ? `<div class="entry-note">${esc(e.note)}</div>` : ''}
            ${e.config ? `<details><summary>它的配置</summary><pre>${esc(e.config)}</pre></details>` : ''}
          </div>`
        }).join('')}
      </div>
    </section>`).join('')}`
}

/* ── 视图 5：深入文档 ── */

function viewDocs() {
  const q = state.q.toLowerCase()
  const docs = q ? DOCS.filter((d) => `${d.title} ${d.markdown}`.toLowerCase().includes(q)) : DOCS

  return `
  <div class="section-head">
    <h2>想自己写插件 / 改装配</h2>
    <span class="sub">日常用不到；真要动手时，先看这两份 DSH 自带的文档</span>
    <span class="count">${DOCS.length} 份文档</span>
  </div>

  <div class="guide">
    <div class="block">
      <div class="block-title">看板上的说法都是什么意思</div>
      <div class="guide-grid">
        <div class="slip">
          <h3>「什么时候生效」= 它何时在场</h3>
          <p><b>所有模式都用</b>：整个程序共用一份，进程一起来就在（模型、会话、安全边界、文件读写）。</p>
          <p><b>只有网页界面用 / 只有脚本模式用</b>：按你跑 dsh 的方式二选一。</p>
          <p><b>跟着会话走</b>：每开一个会话按需生效，不同模式之间互不干扰。</p>
        </div>
        <div class="slip">
          <h3>卡片底部那条线怎么看</h3>
          <p><b>「需要 N 个前提」</b>：得先有这 N 个插件提供的能力，它才启动；否则一直待命不动。</p>
          <p><b>中间竖条</b>：它现在被几层清单装着。灰色一条 = 默认没装，是零件或备选方案。</p>
          <p><b>右边</b>：它给你换来了什么 —— 工具名、界面部件，或只是个后台服务。</p>
        </div>
      </div>
    </div>

    <div class="block">
      <div class="block-title">这些人话说明是怎么来的</div>
      <div class="slip">
        <p>先扫本机正在用的 DSH（<code>${esc(DATA.scope)}</code>，版本 ${esc(DATA.dshVersion)}）里全部 <code>@deepseek-ai/*</code> 包，读出官方文档、清单结构和每个插件的配置；再让 AI 逐篇读完官方文档，改写成「一句话 + 打个比方 + 解决什么问题 + 什么时候用」。</p>
        <p>共 ${PLAIN.coverage.explained} 个插件有人话说明，${PLAIN.coverage.scenarios} 条需求场景覆盖其中 ${PLAIN.coverage.inScenarios} 个；剩下的多是被别的插件引用的零件，在「全部插件」页也能搜到。</p>
        <p>官方文档原文与包信息来自 DeepSeek Harness 公开发布的 npm 包（<code>@deepseek-ai/*</code>，MIT 许可）；「一句话 / 打比方 / 需求场景」是本看板自己写的，不代表官方说法。</p>
        <p>生成时间 ${esc(DATA.generatedAt.slice(0, 16).replace('T', ' '))}。DSH 升级后重跑 <code>./run.sh</code> 刷新。</p>
      </div>
    </div>

    ${docs.map((d) => `
      <div class="doc">
        <div class="doc-head">
          <h3>${esc(d.title)}</h3>
          <code>${esc(d.file)}</code>
        </div>
        <div class="prose">${renderMarkdown(d.markdown, { dir: 'dsh/config/agent-presets/cordis/skills' })}</div>
      </div>`).join('')}
  </div>`
}

/* ────────────────────────── 详情抽屉 ────────────────────────── */

const TABS = [
  ['plain', '它是干嘛的'],
  ['use', '怎么用上'],
  ['doc', '官方文档'],
  ['tech', '技术细节'],
]

function openPlugin(id, pushHash = true) {
  const p = byId.get(id)
  if (!p) return
  state.sel = id
  state.tab = 'plain'
  state.lang = p.hasReadmeZh ? 'zh' : 'en'
  if (pushHash) writeHash()

  const pl = p.plain || {}
  $('#drawerTitle').innerHTML = `
    <div class="d-headline">${esc(pl.headline || p.summary || p.description)}</div>
    <div class="d-id">${esc(p.id)}</div>
    <div class="d-tags">
      <span class="tag${p.kind === 'tool' ? ' mask' : p.kind === 'bundle' ? ' copper' : ''}">${esc(KIND_NAME[p.kind] || p.kindLabel)}</span>
      ${p.mounted ? '<span class="tag mask">默认就开着</span>' : '<span class="tag copper">要自己装</span>'}
      <span class="tag">${esc(p.categoryLabel)}</span>
      ${p.client ? '<span class="tag">网页界面部件</span>' : ''}
      ${p.alternate ? '<span class="tag copper">备选实现</span>' : ''}
    </div>
    <div class="d-part">${esc(p.name)} · v${esc(p.version)} · ${esc(p.dir || '—')}</div>`

  $('#drawer').hidden = false
  $('#scrim').hidden = false
  renderDrawer()
  $('#drawerBody').scrollTop = 0
  $('#close').focus()
}

function closeDrawer() {
  $('#drawer').hidden = true
  $('#scrim').hidden = true
  state.sel = null
  writeHash()
}

function renderDrawer() {
  const p = byId.get(state.sel)
  if (!p) return
  const hasDoc = p.hasReadmeZh || p.hasReadmeEn
  $('#drawerTabs').innerHTML = TABS.map(([id, label]) =>
    `<button data-tab="${id}" class="${state.tab === id ? 'on' : ''}">${esc(label)}${id === 'doc' && !hasDoc ? ' · 无' : ''}</button>`).join('')
    + (state.tab === 'doc' && p.hasReadmeZh && p.hasReadmeEn
      ? `<button class="lang" data-lang="${state.lang === 'zh' ? 'en' : 'zh'}">${state.lang === 'zh' ? 'EN' : '中文'}</button>` : '')

  $$('#drawerTabs button[data-tab]').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; renderDrawer() }))
  const langBtn = $('#drawerTabs button[data-lang]')
  if (langBtn) langBtn.addEventListener('click', () => { state.lang = langBtn.dataset.lang; renderDrawer() })

  const body = $('#drawerBody')
  if (state.tab === 'plain') body.innerHTML = tabPlain(p)
  else if (state.tab === 'use') body.innerHTML = tabUse(p)
  else if (state.tab === 'tech') body.innerHTML = tabTech(p)
  else { body.innerHTML = '<p class="empty">正在读官方文档…</p>'; loadReadme(p); return }
  wire(body)
}

function tabPlain(p) {
  const pl = p.plain
  if (!pl) {
    return `<p class="empty">这个插件还没有人话说明 —— 它是给别的插件用的零件，日常用不到。想看细节切「官方文档」或「技术细节」。</p>`
  }
  return `
    <div class="block">
      <div class="block-title">一句话</div>
      <p class="plain-headline">${esc(pl.headline)}</p>
    </div>
    <div class="block">
      <div class="block-title">打个比方</div>
      <p class="plain-analogy">${esc(pl.analogy)}</p>
    </div>
    <div class="block">
      <div class="block-title">它解决什么问题</div>
      <ul class="plain-list">${pl.problems.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    </div>
    <div class="block">
      <div class="block-title">什么时候会用到</div>
      <ul class="plain-list">${pl.whenToUse.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    </div>
    <div class="block">
      <div class="block-title">想找这类东西，可以搜这些词</div>
      <div class="chips">${pl.keywords.map((k) => `<button class="plink" data-q="${esc(k)}">${esc(k)}</button>`).join('')}</div>
    </div>
    ${p.tools.length ? `
    <div class="block">
      <div class="block-title">它给 AI 加的能力（${p.tools.length} 个工具）</div>
      ${p.tools.map((t) => `<div style="margin-bottom:8px"><code>${esc(t.name)}</code><div class="empty" style="margin-top:3px">${esc(t.description)}</div></div>`).join('')}
    </div>` : ''}`
}

function tabUse(p) {
  const pl = p.plain || {}
  return `
    <div class="block">
      <div class="block-title">要不要做点什么</div>
      <p class="plain-headline" style="font-size:15px">${esc(pl.enable || (p.mounted ? 'DSH 默认就开着，你什么都不用做。' : '要自己装：把它加进你的插件清单。'))}</p>
    </div>
    ${p.mounted ? `
      <div class="block">
        <div class="block-title">它现在装在哪</div>
        <dl class="kv">
          <dt>什么时候生效</dt><dd>${p.planeLabels.map((l) => `<span class="plink">${esc(l)}</span>`).join(' ')}</dd>
          <dt>在哪份清单</dt><dd>${p.mounts.map((m) => `<code>${esc(m.planeLabel)}</code> 里的 <code>${esc(m.id)}</code> 行`).join('<br>')}</dd>
        </dl>
      </div>` : `
      <div class="block">
        <div class="block-title">怎么装上它</div>
        <p class="empty">把下面这两行加进你自己那份插件清单（例如 <code>~/.dsh/profiles/web/cordis.patch.yml</code>），重启后生效。清单一层层叠加，你写的这层最后生效。</p>
        <pre>${esc(`- insert:\n    - id: ${p.id.replace(/^dsh-/, '')}\n      name: '${p.name}'`)}</pre>
      </div>`}
    ${p.requires.length ? `
      <div class="block">
        <div class="block-title">它需要先有这些（${p.requires.length}）</div>
        <p class="empty" style="margin-bottom:8px">这些插件提供的能力必须先就位，否则它会一直待命不启动。默认清单里通常已经齐了。</p>
        <div class="chips">${p.requires.map((d) => `<button class="plink" data-p="${esc(d)}">${esc(byId.get(d)?.plain?.headline || d)}</button>`).join('')}</div>
      </div>` : ''}
    ${p.client ? `
      <div class="block">
        <div class="block-title">界面上的位置</div>
        <p class="empty">这是网页界面上的一个部件，平台 <code>${esc(p.client.platform || '—')}</code>，需要 ${p.client.inject.length} 个前端基础设施。</p>
      </div>` : ''}`
}

function tabTech(p) {
  const kv = [
    ['包名', `<code>${esc(p.name)}</code>`],
    ['源码路径', `<code>${esc(p.dir || '—')}</code>`],
    ['类型', `${esc(p.kindLabel)} — ${esc(p.kindDesc)}`],
    ['分类', `${esc(p.categoryLabel)}${p.categoryDesc ? ` — ${esc(p.categoryDesc)}` : ''}`],
    ['版本', esc(p.version)],
    ['官方一句话', esc(p.description)],
    ['清单位置', p.mounts.length
      ? p.mounts.map((m) => `<code>${esc(m.planeLabel)}/${esc(m.id)}</code>${m.insert ? '（新装）' : '（改配置）'}`).join('<br>')
      : '<span class="empty">默认清单里没有它</span>'],
  ]
  if (p.inject.length) kv.push(['代码里的 inject（需要注入的服务名）', p.inject.map((s) => `<code>${esc(s)}</code>`).join(' ')])
  if (p.toolLiterals.length) kv.push(['代码里扫到的工具名', p.toolLiterals.map((s) => `<code>${esc(s)}</code>`).join(' ')])
  if (p.alternateTools.length) kv.push(['备选实现', `和 <code>${esc(p.alternateTools.join('/'))}</code> 同名：两者选一个装`])

  const configs = p.mounts.filter((m) => m.config)
  return `
    <div class="block">
      <div class="block-title">规格</div>
      <dl class="kv">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>
    </div>
    ${configs.length ? `
    <div class="block">
      <div class="block-title">原始配置片段</div>
      ${configs.map((m) => `<div class="entry-id" style="margin-top:6px">${esc(m.planeLabel)} · ${esc(m.id)}</div><pre>${esc(m.config)}</pre>`).join('')}
    </div>` : ''}
    <div class="block">
      <div class="block-title">它需要哪些包提供的服务（${p.requires.length}）</div>
      <p class="empty" style="margin-bottom:8px">来自 peerDependencies：装上它时，这些包提供的能力必须先存在，否则它保持 pending 不激活。</p>
      <div class="chips">${p.requires.length ? p.requires.map((d) => `<button class="plink" data-p="${esc(d)}">${esc(d)}</button>`).join('') : '<span class="empty">无</span>'}</div>
    </div>
    <div class="block">
      <div class="block-title">哪些插件需要它（${p.requiredBy.length}）</div>
      <div class="chips">${p.requiredBy.length ? p.requiredBy.map((d) => `<button class="plink" data-p="${esc(d)}">${esc(d)}</button>`).join('') : '<span class="empty">没有</span>'}</div>
    </div>`
}

let readmeToken = 0
async function loadReadme(p) {
  const token = ++readmeToken
  const body = $('#drawerBody')
  let data = readmeCache.get(p.id)
  if (!data) {
    try {
      data = await fetch(`data/readmes/${p.id}.json`).then((r) => r.json())
      readmeCache.set(p.id, data)
    } catch { data = { zh: null, en: null } }
  }
  if (token !== readmeToken || state.tab !== 'doc' || state.sel !== p.id) return
  const md = state.lang === 'zh' ? (data.zh || data.en) : (data.en || data.zh)
  body.innerHTML = md
    ? `<div class="prose">${renderMarkdown(md, { dir: p.dir })}</div>`
    : `<p class="empty">这个包没有官方文档。</p>`
  wire(body)
}

/* ────────────────────────── 事件绑定 ────────────────────────── */

function wire(root) {
  $$('[data-p]', root).forEach((el) => {
    el.addEventListener('click', (e) => { e.stopPropagation(); openPlugin(el.dataset.p) })
    if (el.tagName === 'ARTICLE') {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPlugin(el.dataset.p) }
      })
    }
  })
  $$('[data-need]', root).forEach((el) => {
    const go = () => { state.open = el.dataset.need; writeHash(); render() }
    el.addEventListener('click', go)
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go() } })
  })
  $$('[data-need-back]', root).forEach((el) => el.addEventListener('click', () => { state.open = ''; writeHash(); render() }))
  $$('[data-q]', root).forEach((el) => el.addEventListener('click', () => {
    state.q = el.dataset.q
    $('#q').value = state.q
    state.open = ''
    state.view = 'all'
    writeHash(); renderRail(); render()
  }))
}

/* ────────────────────────── 迷你 Markdown 渲染 ────────────────────────── */

function renderMarkdown(md, ctx = {}) {
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n')
  const out = []
  let i = 0
  const isTableSep = (l) => /^\|[\s:|-]+\|$/.test(l.trim())
  const startsBlock = (l, idx) =>
    /^\s*(#{1,6})\s+/.test(l) || /^```/.test(l) || /^\s*>/.test(l) || /^\s*([-*+]|\d+\.)\s+/.test(l) ||
    /^(-{3,}|\*{3,}|_{3,})\s*$/.test(l) || (l.trim().startsWith('|') && lines[idx + 1] && isTableSep(lines[idx + 1]))

  while (i < lines.length) {
    const line = lines[i]

    const fence = line.match(/^\s*```\s*(\S*)/)
    if (fence) {
      const lang = fence[1]
      const buf = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++])
      i++
      out.push(`<pre${lang ? ` data-lang="${esc(lang)}"` : ''}><code>${esc(buf.join('\n'))}</code></pre>`)
      continue
    }

    const h = line.match(/^\s*(#{1,6})\s+(.*?)\s*#*\s*$/)
    if (h) {
      const lv = h[1].length
      const text = h[2]
      if (!(lv === 1 && /^@?[a-z0-9@/._-]+$/i.test(text.replace(/`/g, '')))) {
        out.push(`<h${Math.min(lv + 1, 6)}>${inline(text, ctx)}</h${Math.min(lv + 1, 6)}>`)
      }
      i++
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue }

    if (line.trim().startsWith('|') && lines[i + 1] && isTableSep(lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      const head = cells(line)
      i += 2
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]))
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c, ctx)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, ctx)}</td>`).join('')}</tr>`).join('')}</tbody></table>`)
      continue
    }

    if (/^\s*>/.test(line)) {
      const buf = []
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''))
      out.push(`<blockquote>${buf.map((l) => inline(l, ctx)).join('<br>')}</blockquote>`)
      continue
    }

    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line)
      const items = []
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        const text = lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, '')
        const sub = []
        i++
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*+]|\d+\.)\s+/.test(lines[i])) sub.push(lines[i++].trim())
        items.push(`<li>${inline(text, ctx)}${sub.length ? ` ${sub.map((s) => inline(s, ctx)).join(' ')}` : ''}</li>`)
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`)
      continue
    }

    if (!line.trim()) { i++; continue }

    const buf = [line]
    i++
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], i)) buf.push(lines[i++])
    out.push(`<p>${buf.map((l) => inline(l.trim(), ctx)).join(' ')}</p>`)
  }
  return out.join('\n')
}

function inline(text, ctx) {
  const codes = []
  let s = esc(text)
  s = s.replace(/`([^`]+)`/g, (_, code) => { codes.push(code); return `\u0000${codes.length - 1}\u0000` })
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => link(label, href, ctx))
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[\s(（])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  s = s.replace(/(^|[\s(（])_([^_\n]+)_/g, '$1<em>$2</em>')
  s = s.replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${esc(codes[+n])}</code>`)
  return s
}

function link(label, href, ctx) {
  if (/^https?:/i.test(href)) return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`
  if (href.startsWith('#')) return `<a href="${esc(href)}">${label}</a>`
  const pid = resolveLink(href, ctx.dir)
  if (pid) return `<a href="#" class="plink" data-p="${esc(pid)}" style="border:none;background:none;padding:0">${label}</a>`
  return `<span class="dead" title="仓库内文档：${esc(href)}">${label}</span>`
}

function resolveLink(href, dir) {
  if (!dir) return null
  const target = href.replace(/#.*$/, '').replace(/(^|\/)README(\.zh|\.md)?\.md$/i, '').replace(/\/$/, '')
  if (!target) return null
  const parts = dir.split('/')
  parts.pop()
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.' && seg !== '') parts.push(seg)
  }
  const norm = parts.join('/')
  return DATA.dirIndex[norm] || DATA.dirIndex[norm.split('/').pop()] || null
}

/* ────────────────────────── 深链 ────────────────────────── */

function writeHash() {
  const q = new URLSearchParams()
  if (state.view !== 'need') q.set('v', state.view)
  if (state.q) q.set('q', state.q)
  if (state.cat) q.set('cat', state.cat)
  if (state.kind) q.set('k', state.kind)
  if (state.plane) q.set('plane', state.plane)
  if (state.mounted !== 'all') q.set('m', state.mounted)
  if (state.sort !== 'name') q.set('s', state.sort)
  if (state.open) q.set('n', state.open)
  if (state.sel) q.set('p', state.sel)
  const hash = q.toString()
  history.replaceState(null, '', hash ? `#${hash}` : location.pathname)
}

function readHash() {
  const q = new URLSearchParams(location.hash.replace(/^#/, ''))
  state.view = q.get('v') || 'need'
  state.q = q.get('q') || ''
  state.cat = q.get('cat') || ''
  state.kind = q.get('k') || ''
  state.plane = q.get('plane') || ''
  state.mounted = q.get('m') || 'all'
  state.sort = q.get('s') || 'name'
  state.open = q.get('n') || ''
  state.sel = q.get('p') || null
  $('#q').value = state.q
}
