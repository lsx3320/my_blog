# 便签卡片 · Memo Card

苹果备忘录风格的**文案卡片生成器**——随手记下收藏的句子和感悟，一键生成一张精美的文字卡片图片。

## 功能

- ✍️ **备忘录式写作**：标题 + 正文，无边框白框，自动扩展
- 📐 **自动排版对齐**：写完即看卡片，短句金句居中、列表识别、段落两端对齐，零调整负担
- ✨ **AI 整理**（可选）：DeepSeek 把零散文案整理成规整的标题 + 分段
- 🎨 **3 套模板**：备忘录白 / 便签黄 / 深色极简
- 📸 **生成卡片图片**：1080×1350 竖版 PNG 下载
- 💾 **保存本页**：草稿自动保存 + 历史卡片回顾 / 重新生成 / 删除

## 快速开始

```bash
npm install
npm run dev          # http://localhost:5173（后端 8010）
```

- 预览示例：`http://localhost:5173/?demo=1`

## 部署

```bash
npm run build && npm start     # 单服务器 :8010，托管页面 + AI 整理
```

**纯静态托管**（如 Claudefer）：访问根 `/` 会自动跳转 `/dist/index.html`。

### AI 整理配置

点击工具栏 **⚙️ 设置**，填入你的 **DeepSeek API key**（`sk-...`）→ 保存。key 存在本浏览器（localStorage），之后 AI 整理可用。换浏览器需重新填一次。

### 云同步
已内置固定 key（jsonbin），保存卡片自动上传云端，跨浏览器点「☁️ 同步」即可共享，无需配置。

## 技术

- 前端：React 19 + Vite，`html-to-image` 导出卡片
- 后端：Express 代理 DeepSeek（`POST /api/format`）
- 数据：localStorage（草稿 + 历史，无后端存储）
