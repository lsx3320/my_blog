# 后生仔的博客

个人博客（刊物概念：封面 / 目录 / 版面 / 图录 / 画册 / 编者按），记录技术探索与生活感悟。
基于 **Astro 6** 构建，静态输出，部署在 **Cloudflare Pages**（域名 `lushixiao.cn`）。

## 视觉与字体

中文刊物杂志风：纸色底 `#f7f4ec`、墨黑 `#1c1b17`、朱砂红 `#c23b22` 印章感强调；发丝线、
运行页眉、编号索引、CSS 自动编号章节（一、二、三…）、首字下沉、竖排点缀。标题衬线
display（Fraunces + 宋体）、正文衬线（Lora + 宋体）、UI 小字无衬线（Poppins），全部
@fontsource 自托管（latin 子集），无渲染阻塞。

## 技术栈

- [Astro](https://astro.build) 6 — 静态站点生成，启用 View Transitions（站内 SPA 式跳转）
- [Tailwind CSS](https://tailwindcss.com) 4（通过 `@tailwindcss/vite` 集成）
- Shiki 代码高亮（`css-variables` 主题，跟随明暗模式）
- `@astrojs/sitemap` — 自动生成 sitemap
- @fontsource（poppins / lora / fraunces / jetbrains-mono）+ sharp（图片优化脚本）

## 项目结构

```text
/
├── public/                  # 静态资源（图片、bgm.mp3、favicon 等）
│   └── gallery/             # 画册与图录图片（WebP）
├── scripts/optimize-images.mjs  # 图片批量优化脚本
├── src/
│   ├── components/          # Header / Footer / Timeline / MusicPlayer / Comment
│   ├── content/
│   │   ├── posts/           # 文章（Markdown，frontmatter 见下）
│   │   └── moments/         # 图录动态（Markdown）
│   ├── data/timeline.ts     # 编年史数据（类型化）
│   ├── layouts/BaseLayout.astro
│   ├── pages/               # 封面 / 目录 / 图录 / 画册 / 编者按 / 404
│   ├── styles/global.css    # Tailwind 主题变量 + 明暗模式 + Shiki 配色
│   ├── types/global.d.ts    # MusicPlayer 跨页全局状态声明
│   └── content.config.ts    # 内容集合 schema
└── astro.config.mjs
```

## 常用命令

| 命令 | 说明 |
| :--- | :--- |
| `npm run dev` | 本地开发服务器（默认 `localhost:4321`） |
| `npm run build` | 构建生产产物到 `dist/` |
| `npm run preview` | 本地预览构建产物 |
| `npm run check` | `astro check` 类型检查（含 .astro 模板） |
| `npm run images:optimize` | 批量优化 `public/gallery` 图片（转 WebP ≤1920px） |

## 写内容

### 文章（`src/content/posts/*.md`）

```yaml
---
title: '文章标题'
description: '一句话摘要'
pubDate: 2026-05-20
category: '技术'            # 分类，会用于文章列表的筛选
tags: ['Transformer', 'AI'] # 可选，默认 []
draft: false                # 可选，true 时不出现在列表
# updatedDate: 2026-05-21  # 可选
# image: '/path/to.webp'    # 可选（当前 UI 未展示封面图，字段保留备用）
---
```

> 文件名即 slug，如 `src/content/posts/transformer-guide.md` → `/posts/transformer-guide`。
> 图片建议先跑 `npm run images:optimize`（或手动转 WebP），相册图片统一 `.webp`。

### 朋友圈（`src/content/moments/*.md`）

```yaml
---
date: 2026-05-25          # 可选
images:                   # 可选，1 张大图 / 多张九宫格
  - /gallery/xxx.webp
likes: 0                  # 初始点赞数
location: 武汉             # 可选
---
正文内容（Markdown）
```

## 部署

Cloudflare Pages（静态，无需 wrangler 配置）：

- Build command: `npm run build`
- Output directory: `dist`
- 自定义域名：`lushixiao.cn`（`public/0d96f56d4e5ba3e58d1b0d5fb03c1e73.txt` 为域名验证文件，勿删）

### 环境变量

| 变量 | 说明 |
| :--- | :--- |
| `PUBLIC_TWIKOO_ENV_ID` | Twikoo 评论后端地址。**未配置时评论区自动隐藏**，配置后启用（构建时注入，改后需重新部署） |

## 随笔功能（/diary · 便签卡片）

- 访问 `/diary` 需先通过密码门（问题：**我现在在哪里？** 答案：**武汉**，客户端校验 + 会话记忆）
- 完全引用 [memo-card](https://github.com/lsx3320/memo-card) 的便签卡片应用（React 19 + 自定义样式）：
  - 写作区 + 实时卡片预览（1080×1350，**备忘录白 / 便签黄 / 深色极简**三种模板）
  - **✨ AI 一键整理**：调用 DeepSeek（key 在 ⚙️ 设置里配置，存 localStorage；无后端代理时前端直连）
  - 本地自动排版（短句金句、列表、段落识别）、生成卡片图片下载
  - 历史卡片墙 + 放大查看 + 删除
- **存储：jsonbin.io 云同步**（`src/memo-card/lib/storage.js` 的 `CLOUD_KEY` / `CLOUD_BIN` 常量）：
  本地 localStorage 缓存 + 云端合并去重，保存后自动同步，任何设备打开可见
- 相关代码在 `src/memo-card/`（React 组件 + styles.css），通过 `@astrojs/react` 挂载到随笔页

## 评论（Twikoo）

评论区默认关闭。启用方式：在 Cloudflare Pages 项目设置 → Environment variables 添加
`PUBLIC_TWIKOO_ENV_ID`（值填你的 Twikoo 部署地址），重新部署即可。

## 主题与字体

- 明暗模式：跟随系统，也可手动切换（记忆在 `localStorage.theme`）；暗色为墨黑纸底
- 字体：Fraunces + Lora + Poppins + JetBrains Mono（@fontsource 自托管，latin 子集，
  `display: swap`）；中文回退系统宋体 / 黑体
- 背景音乐：`public/bgm.mp3`（WebAudio 解码播放，跨页面保持进度）
