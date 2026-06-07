---
name: trader-digest
description: >
  全球金融信源日报 — 追踪85+专业信源，生成市场摘要与影响分析。
  无需 API key，数据从中央 feed 获取。
  触发: /news
---

# Trader Digest — 全球金融信源日报

追踪 85+ 全球专业金融信源（通讯社、央行、财经媒体、经济日历、市场情绪），每日生成市场摘要与影响分析，通过 IM Webhook 推送。

## 平台检测

首先检测运行平台:

- **OpenClaw**: 持久 Agent，内置推送和调度能力
- **Claude Code / Codex / Hermes**: 非持久，需配置 Webhook 和定时任务

检测方法: 检查环境变量或平台特征。如无法确定，默认按非持久平台处理。

## 首次运行引导 (Onboarding)

按以下步骤引导用户完成配置:

### Step 1: 介绍
向用户介绍服务: "我是 Trader Digest，将每日为你追踪 85+ 全球金融信源，生成市场摘要与影响分析。"

### Step 2: 推送方式
询问用户希望如何接收摘要:

- **飞书**: 需要飞书 Bot Webhook URL
- **钉钉**: 需要钉钉 Robot Webhook URL
- **企微**: 需要企微 Bot Webhook URL
- **Slack**: 需要 Slack Incoming Webhook URL
- **Discord**: 需要 Discord Webhook URL
- **终端输出**: 无需配置，每次手动触发 `/news` 查看

### Step 3: 时区
询问用户时区，默认 `Asia/Shanghai`。

### Step 4: 保存配置
将配置写入 `~/.trader-digest/config.json`:

```json
{
  "language": "zh",
  "frequency": "daily",
  "timezone": "Asia/Shanghai",
  "delivery": {
    "platform": "feishu",
    "webhookUrl": "https://open.feishu.cn/open-apis/bot/v2/hook/xxx",
    "method": "webhook"
  },
  "preferences": {
    "includeDeepAnalysis": true,
    "focusRegions": [],
    "focusSectors": []
  }
}
```

### Step 5: 展示信源列表
告知用户当前追踪的信源数量和类别分布。

### Step 6: 设置定时任务

**Claude Code**: 使用 CronCreate 工具设置每日定时运行。
**OpenClaw**: 使用内置调度功能。
**其他平台**: 提示用户手动设置 cron 或使用 `/news` 手动触发。

### Step 7: 生成首次样例
立即运行一次摘要生成流程，让用户看到效果。

## 内容生成流程

每次触发时，按以下步骤执行:

### 1. 加载配置
读取 `~/.trader-digest/config.json`。如不存在，提示用户完成首次引导。

### 2. 运行 prepare-digest.js
```bash
node scripts/prepare-digest.js
```
获取一个包含所有数据和 prompts 的 JSON blob。

### 3. 检查内容
如果 `articles` 为空，告知用户"今日暂无新内容"，跳过后续步骤。
如果 `errors` 包含 feed 过期警告，在摘要顶部标注。

### 4. 生成快速简报
使用 `digest_brief` prompt 指令，将 JSON 数据重组为快速简报。
遵循 prompt 中的输出结构和规则。

### 5. 生成深度分析
如果用户配置 `includeDeepAnalysis: true`，使用 `digest_deep` prompt 生成深度分析。
深度分析附在快速简报之后。

### 6. 推送
将完整摘要文本通过 deliver-webhook.js 推送:
```bash
echo "摘要内容" | node scripts/deliver-webhook.js
```

如果推送失败，降级为终端输出。

## 手动触发

用户输入 `/news` 时，立即执行上述内容生成流程，将摘要输出到终端或推送到配置的平台。

## 配置变更

### 修改推送方式
用户可随时要求更改推送平台或 Webhook URL，更新 `~/.trader-digest/config.json`。

### 自定义 Prompt
用户可在 `~/.trader-digest/prompts/` 放置自定义 prompt 文件覆盖默认行为:
- `digest-brief.md` — 自定义简报格式
- `digest-deep.md` — 自定义分析深度
- `market-impact.md` — 自定义影响分析框架
- `translate.md` — 自定义翻译规则

### 关注区域/行业
用户可设置 `focusRegions` 和 `focusSectors`，生成摘要时优先展示相关内容。

## 信源覆盖

当前追踪 85 个信源，覆盖:
- **全球通讯社**: AP, Reuters, AFP, EFE, TASS, ANSA, 韩联社, 沙特通讯社
- **金融专业媒体**: Bloomberg, FT, WSJ, CNBC, MarketWatch, 第一财经, 财新, 华尔街见闻, 新浪财经, 财联社, 东方财富
- **各国大报**: NYT, Guardian, BBC, LeMonde, Spiegel, 日经亚洲 等
- **央行/监管**: 美联储, ECB, 日银, 人行, 英央行, IMF, World Bank
- **经济日历**: Trading Economics, Investing.com, ForexFactory, 东方财富经济日历
- **市场情绪**: 金融 Twitter KOLs, Reddit/WSB, 雪球热帖, 雪球A股讨论

## 错误处理

- 采集失败: 单个信源失败不影响整体，摘要末尾列出不可用信源
- 推送失败: 重试 3 次后降级为终端输出
- feed 过期: 超过 48h 未更新时在摘要顶部警告

## 致谢

本技能的数据采集架构参考了 [Follow Builders](https://github.com/zarazhangrui/follow-builders) 的中央聚合 + Skill 模式。
