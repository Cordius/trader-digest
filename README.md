# Trader Digest — 全球金融信源日报

追踪 85+ 全球专业金融信源，每日生成市场摘要与影响分析，通过 IM Webhook 推送。

## 架构

```
GitHub Actions (每日 cron) → feed-financial.json → Agent Skill → IM Webhook
```

- **采集层**: GitHub Actions 定时抓取 RSS + 网页，合并为 `feed-financial.json`
- **Skill 层**: 跨 Agent 通用技能 (SKILL.md)，读取 feed + prompts → 生成摘要
- **推送层**: 飞书 / 钉钉 / 企微 / Slack / Discord Webhook

## 快速开始

### 1. 安装

```bash
git clone <repo-url> trader-digest
cd trader-digest
npm install
```

### 2. 配置

```bash
mkdir -p ~/.trader-digest
cp config/config.template.json ~/.trader-digest/config.json
# 编辑 config.json，填入你的 Webhook URL 和偏好
```

### 3. 运行

```bash
# 全量采集
npm run collect

# 准备 LLM 输入
npm run prepare

# 推送摘要
npm run deliver
```

### 4. 作为 Skill 使用

将 `SKILL.md` 复制到你的 Agent 技能目录:

```bash
# Claude Code
cp SKILL.md ~/.claude/skills/trader-digest/SKILL.md
cp -r scripts/ ~/.claude/skills/trader-digest/scripts/
cp -r prompts/ ~/.claude/skills/trader-digest/prompts/
```

然后在 Agent 中输入 `/news` 触发。

## 信源覆盖 (85 个)

| 类别 | 数量 | 示例 |
|------|------|------|
| 通讯社 | 8 | AP, Reuters, AFP, EFE, TASS, ANSA, 韩联社, 沙特通讯社 |
| 金融专业媒体 | 11 | Bloomberg, FT, WSJ, CNBC, MarketWatch, 第一财经, 财新, 华尔街见闻, 新浪财经, 财联社, 东方财富 |
| 各国大报/广播 | 42 | NYT, BBC, Guardian, LeMonde, Spiegel, NHK, 韩联社 等 |
| 央行/监管 | 7 | 美联储, ECB, 日银, 人行, 英央行, IMF, World Bank |
| 经济日历 | 4 | Trading Economics, Investing.com, ForexFactory, 东方财富经济日历 |
| 市场情绪 | 8 | 金融 Twitter KOLs, Reddit/WSB, 雪球热帖, 雪球A股讨论 |
| 其他 | 4 | 欧盟官方, 欧洲议会, 央广 |

## 命令参考

```bash
npm run collect          # 全量采集 (合并所有采集器)
npm run collect:rss      # 仅 RSS 采集
npm run collect:scrape   # 仅网页抓取
npm run collect:banks    # 仅央行声明
npm run collect:calendar # 仅经济日历
npm run collect:sentiment # 仅市场情绪
npm run prepare          # 准备 LLM 输入 JSON
npm run deliver          # 推送摘要到 Webhook
npm test                 # 运行测试
```

## 开发

```bash
npm test          # 运行所有测试
npm run test:watch # 监听模式
```

## License

MIT
