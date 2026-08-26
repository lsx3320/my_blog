---
title: '我的 DPH (DeepSeek Harness) 配置历程：从零搭建 AI 智能体工作流'
description: '记录从 2026 年 5 月到 8 月，我在 macOS 上配置 DeepSeek Harness、搭建 AI 智能体工作流的完整历程，包括踩过的坑和积累的经验。'
pubDate: 2026-08-27
category: '技术'
tags: ['DeepSeek', 'Hermes Agent', 'MiMo', 'AI 智能体', '配置笔记']
---

从 2026 年 5 月开始，我花了几个月时间在 macOS 上搭建了一套完整的 AI 智能体工作流。从最初的 Hermes Agent 到后来的 DeepSeek Harness（DSH），从模型配置到项目实践，一路踩了不少坑，也积累了不少经验。

这篇文章就是对我这几个月 **DPH（DeepSeek PowerHouse）配置历程** 的一次完整复盘。

## 一、环境概览

先说一下我的开发环境：

| 项目 | 详情 |
|------|------|
| **操作系统** | macOS (Apple Silicon) |
| **主要工具** | DeepSeek Harness (DSH) + Hermes Agent |
| **默认模型** | MiMo V2.5 Pro（小米） |
| **备选模型** | DeepSeek V4 Pro/Flash（阿里云百炼 DashScope） |
| **工作区** | `/Users/Zhuanz1/Desktop` |

选择 MiMo 作为主力模型，主要看中它 **1M token 的超长上下文窗口**，在处理长文档和复杂任务时非常有优势。而 DashScope 作为备选，提供了 DeepSeek V4 系列模型，可以在 MiMo 不可用时快速切换。

## 二、工具安装配置历程

### 阶段 1：Hermes Agent 基础配置（5 月 ~ 6 月）

最早接触的是 **Hermes Agent**，安装路径在 `~/.hermes/`。

这个阶段主要做了这些事：

- 配置了多套 LLM Provider：Anthropic、小米 MiMo、DeepSeek
- 安装了丰富的 Skills 插件：creative、data-science、github、media 等
- 配置了 Discord/Telegram 等多平台集成
- 设置了定时任务（cron）和记忆系统（MEMORY.md）

**踩过的坑：**

1. **API Key 管理混乱**：多个 Provider 的 Key 分散在 `.env` 和 `auth.json` 中，管理起来很头疼
2. **模型切换不直观**：需要手动修改 `config.yaml` 的 `model.default`，不够灵活
3. **OAuth 认证问题**：Anthropic 的 OAuth 流程在本地环境有兼容性问题

### 阶段 2：DeepSeek Harness (DSH) 集成（8 月）

8 月份开始引入 **DeepSeek Harness**，安装路径在 `~/.dsh/`。

DSH 的核心配置（`settings.yaml`）：

```yaml
agent-default-model:
  provider: mimo
  model: mimo-v2.5-pro
  reasoningEffort: high
```

配置了三套 Provider，形成了**三级冗余**架构：

1. **小米 MiMo**（主力）—— 端点 `https://mimo.ezlook.top/v1`，1M context
2. **阿里云百炼 DashScope**（备选）—— 端点 `https://dashscope.aliyuncs.com/compatible-mode/v1`
3. **DeepSeek 官方**（备用）—— 端点 `https://api.deepseek.com/v1`

**踩过的坑：**

1. **LAN Proxy 配置**：需要额外运行 `lan-proxy.js` 才能在局域网访问 Web GUI
2. **Session 管理**：多个工作区的 Session 需要手动切换
3. **权限问题**：`workspace-write` 权限需要在 `settings.yaml` 中显式配置

### 阶段 3：DPH CS 模型测试（8 月 17 日 ~ 27 日）

在这个阶段，我测试了通过 DashScope 调用 DeepSeek V4 Pro 的能力。

核心代码 `call_deepseek.py` 的设计原则是**零依赖**——只用 Python 标准库的 `urllib`，部署简单，不需要安装额外的包。

**踩过的坑：**

1. **API Key 安全**：`.env` 文件包含明文 Key，需要加入 `.gitignore`
2. **代理冲突**：国内 API（DashScope）不需要代理，但系统环境变量设置了代理，导致请求失败。解决方案：
   ```python
   session.trust_env = False  # 禁用代理
   ```
3. **超时问题**：大模型推理可能需要 120s+，默认超时太短

## 三、智能体项目实践

配置完成后，我做了几个实际项目来验证这套工作流。

### 项目 1：抖音内容处理工作流 (`dy_tk`)

这是一个**从视频到文本**的完整处理链路：

```
抖音链接 → yt-dlp 下载 → faster-whisper 语音识别 → Markdown 生成 → 可选 AI 润色
```

技术栈包括：Python 3.11 虚拟环境、faster-whisper（本地 ASR）、OpenCV + YuNet（人脸检测）、yt-dlp（视频下载）。

**设计亮点**：语音识别完全在本地运行，不消耗任何 API 额度，成本为零。

**踩过的坑**：

1. **Cookie 问题**：抖音风控导致需要动态生成 Cookie，不能硬编码
2. **Whisper 模型下载**：首次使用需要下载 ~460MB 模型到 `.hf_cache/`
3. **同音错字**：ASR 识别"甲午战争"为"家务战争"，需要热词纠正

### 项目 2：英伟达财报分析 (`nvda_earnings`)

这是一个**从数据到报告**的智能分析系统：

```
Yahoo Finance API → 财报数据拉取 → 巴菲特八法分析 → LLM 深度解读 → HTML 报告 → QQ 邮箱发送
```

**设计亮点**：先做规则化计算（巴菲特八法），LLM 只负责深度解读，既保证了准确性，又发挥了 AI 的分析能力。

**踩过的坑**：

1. **API 切换**：从 DeepSeek 官方切换到 DashScope 需要同时改 `api_base` 和 `model`
2. **邮件发送**：QQ 邮箱需要开启 SMTP 服务并使用授权码
3. **时区问题**：财报日期判断需要处理时区差异

### 项目 3：散文作家风格分析 (`jlh_dy`)

功能是：爬取抖音散文作家作品 → 分析写作风格 → 生成风格档案 → 润色/创作。

**踩过的坑**：反爬虫机制需要 `a_bogus` 签名接口，全量作品分析可能消耗大量 API 额度。

## 四、磁盘空间治理（8 月 24 日 ~ 27 日）

做项目的过程中，我发现 Desktop 目录已经膨胀到了 **37GB**。

### 问题发现

- 模型权重重复存储：`bert-base-chinese` 有 **6 份**，`bge-reranker` 有 **3 份**
- 缓存堆积：Anaconda 8.8G、Docker 13G、npm 4.1G

### 解决方案

1. **目录重构**：建立 `01_Projects` ~ `05_Archive` 五大目录
2. **模型去重**：sha256 校验后只保留一份，节省 **~15GB**
3. **缓存清理**：npm/uv/Yarn/pip/IDE 缓存全部清理，节省 **~20GB**

### 踩过的坑

1. **mv 失败**：目标目录已存在时脚本跳过而非合并
2. **危险目录名**：`~` 目录在 shell 中会被展开，需要先重命名
3. **venv 迁移**：虚拟环境移动后会失效，建议删除重建

## 五、经验总结

### ✅ 做对的事

1. **多 Provider 冗余**：MiMo 主力 + DashScope 备选 + DeepSeek 官方兜底
2. **本地优先**：Whisper 语音识别全本地，不消耗 API 额度
3. **零依赖设计**：`call_deepseek.py` 仅用标准库，部署简单
4. **结构化分析**：财报分析先做规则化计算，LLM 只做深度解读

### ❌ 踩过的坑

1. **代理冲突**：国内 API + 系统代理 = 请求失败
2. **超时设置**：大模型推理需要 120s+ 超时
3. **Cookie 管理**：抖音风控需要动态生成，不能硬编码
4. **模型权重膨胀**：同一模型多份存储，缺乏去重机制
5. **虚拟环境迁移**：venv 路径绑定，不能直接 mv

### 💡 最佳实践

1. **API Key 管理**：使用 `.env` + `.gitignore`，不要硬编码
2. **错误处理**：LLM 调用失败时自动降级到规则化分析
3. **成本控制**：语音识别全本地，LLM 只做高价值任务
4. **磁盘治理**：定期清理缓存，模型权重做 sha256 去重

## 六、当前状态

| 组件 | 状态 | 备注 |
|------|------|------|
| DSH Web GUI | ✅ 运行中 | `http://127.0.0.1:3080` |
| Hermes Agent | ✅ 已配置 | 定时任务运行中 |
| MiMo 模型 | ✅ 可用 | 1M context window |
| DashScope | ✅ 可用 | DeepSeek V4 系列 |
| dy_tk | ✅ 已安装 | Python 3.11 venv |
| nvda_earnings | ✅ 已配置 | 支持 LLM 分析 |

## 七、写在最后

这几个月的配置历程，本质上是一个**从混乱到有序**的过程。

从最初 API Key 满天飞、模型权重重复存储，到现在的多 Provider 冗余架构、结构化的项目管理——每一步踩过的坑，都变成了后面的经验。

最深的体会是：

> **AI 智能体的价值不在于模型有多强，而在于工作流设计得有多好。**

再强的模型，如果没有好的工具链配合，也只是一台"高级聊天机器人"。而当你把模型、工具、工作流串联起来，它才能真正成为你的**智能助手**。

希望这篇总结能给同样在折腾 AI 智能体的朋友一些参考。

---

*生成时间: 2026-08-27*
*工作区: `/Users/Zhuanz1/Desktop`*
