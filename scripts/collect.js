#!/usr/bin/env node
// ============================================================================
// Trader Digest — 合并采集器
// ============================================================================
// 并行运行所有采集脚本，合并输出为 feed-financial.json
// 用法: node scripts/collect.js
// ============================================================================

import { spawn } from 'child_process';
import { writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { extractKeywords, log } from './utils.js';

dayjs.extend(utc);

const __dirname = dirname(fileURLToPath(import.meta.url));
const FEED_PATH = join(__dirname, '..', 'feed-financial.json');

// -- 运行子采集脚本 --------------------------------------------------------

async function runCollector(scriptName) {
  const scriptPath = join(__dirname, scriptName);
  const TIMEOUT_MS = 240_000; // 4 分钟 (必须小于父进程 safety timer)
  const KILL_GRACE_MS = 5_000; // SIGTERM → SIGKILL 宽限期

  return new Promise((resolve) => {
    const child = spawn('node', [scriptPath], {
      timeout: TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'inherit']
    });

    const chunks = [];
    child.stdout.on('data', c => chunks.push(c));

    let killTimer = null;

    const finalize = (reason) => {
      if (killTimer) clearTimeout(killTimer);
      const stdout = Buffer.concat(chunks).toString('utf-8').trim();
      if (stdout) {
        try {
          resolve(JSON.parse(stdout));
          return;
        } catch {
          log('collect', `${scriptName} JSON 解析失败 (${reason}), 前 200 字符: ${stdout.slice(0, 200)}`);
        }
      }
      resolve({ errors: [{ script: scriptName, error: `子进程 ${reason}, 无有效输出` }] });
    };

    child.on('close', (code) => finalize(`exit ${code}`));
    child.on('timeout', () => {
      log('collect', `${scriptName} 超时 ${TIMEOUT_MS / 1000}s, 发送 SIGTERM`);
      child.kill('SIGTERM');
      killTimer = setTimeout(() => {
        log('collect', `${scriptName} SIGTERM 后 ${KILL_GRACE_MS / 1000}s 未退出, 发送 SIGKILL`);
        child.kill('SIGKILL');
      }, KILL_GRACE_MS);
    });
    child.on('error', (err) => {
      log('collect', `${scriptName} 启动失败: ${err.message}`);
      finalize('spawn error');
    });
  });
}

// -- 主流程 ----------------------------------------------------------------

async function main() {
  // 安全超时: 必须大于 spawn timeout(240s) + kill grace(5s)
  const safetyTimer = setTimeout(() => {
    log('collect', '全局安全超时 (300s), 强制终止');
    process.exit(1);
  }, 300_000);

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

  clearTimeout(safetyTimer);
  console.log(JSON.stringify({ status: 'ok', stats, errorCount: errors.length }, null, 2));
}

main().catch(err => {
  log('collect', `采集失败: ${err.message}`);
  console.log(JSON.stringify({ status: 'error', error: err.message }));
});
