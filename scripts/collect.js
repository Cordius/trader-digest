#!/usr/bin/env node
// ============================================================================
// Trader Digest — 合并采集器
// ============================================================================
// 并行运行所有采集脚本，合并输出为 feed-financial.json
// 用法: node scripts/collect.js
// ============================================================================

import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { extractKeywords, log } from './utils.js';

dayjs.extend(utc);

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const FEED_PATH = join(__dirname, '..', 'feed-financial.json');

// -- 运行子采集脚本 --------------------------------------------------------

async function runCollector(scriptName) {
  const scriptPath = join(__dirname, scriptName);
  try {
    const { stdout } = await execFileAsync('node', [scriptPath], {
      timeout: 300000, // 5 分钟超时
      maxBuffer: 50 * 1024 * 1024 // 50MB
    });
    return JSON.parse(stdout);
  } catch (err) {
    log('collect', `${scriptName} 失败: ${err.message}`);
    return { errors: [{ script: scriptName, error: err.message }] };
  }
}

// -- 主流程 ----------------------------------------------------------------

async function main() {
  log('collect', '开始全量采集...');
  const startTime = Date.now();

  // 并行运行所有采集器
  const [rssResult, scrapeResult, banksResult, calendarResult, sentimentResult] =
    await Promise.all([
      runCollector('collect-rss.js'),
      runCollector('collect-scrape.js'),
      runCollector('collect-central-banks.js'),
      runCollector('collect-calendar.js'),
      runCollector('collect-sentiment.js')
    ]);

  // 合并所有 articles
  const articles = [
    ...(rssResult.articles || []),
    ...(scrapeResult.articles || [])
  ];

  const centralBanks = banksResult.centralBanks || [];
  const events = calendarResult.events || [];
  const sentiment = sentimentResult.sentiment || [];
  const sentimentSummary = sentimentResult.sentimentSummary || {};

  // 合并所有 errors
  const errors = [
    ...(rssResult.errors || []),
    ...(scrapeResult.errors || []),
    ...(banksResult.errors || []),
    ...(calendarResult.errors || []),
    ...(sentimentResult.errors || [])
  ];

  // 按语言统计
  const byLanguage = {};
  for (const a of articles) {
    byLanguage[a.language] = (byLanguage[a.language] || 0) + 1;
  }

  const stats = {
    totalArticles: articles.length,
    totalCentralBanks: centralBanks.length,
    totalEvents: events.length,
    totalSentiment: sentiment.length,
    byLanguage,
    sentimentSummary,
    topKeywords: extractKeywords([...articles, ...centralBanks], 15)
  };

  const feed = {
    generatedAt: dayjs().toISOString(),
    lookbackHours: 24,
    articles,
    centralBanks,
    events,
    sentiment,
    stats,
    errors: errors.length > 0 ? errors : undefined
  };

  // 写入 feed-financial.json
  await writeFile(FEED_PATH, JSON.stringify(feed, null, 2), 'utf-8');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log('collect', `采集完成: ${stats.totalArticles} 篇文章, ${stats.totalCentralBanks} 条央行声明, ${stats.totalEvents} 条日历, ${stats.totalSentiment} 条情绪信号, 耗时 ${elapsed}s`);

  if (errors.length > 0) {
    log('collect', `${errors.length} 个采集错误`);
  }

  console.log(JSON.stringify({ status: 'ok', stats, errorCount: errors.length }, null, 2));
}

main().catch(err => {
  console.error(`采集失败: ${err.message}`);
  process.exit(1);
});
