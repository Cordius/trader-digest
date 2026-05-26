#!/usr/bin/env node
// ============================================================================
// Trader Digest — 市场情绪采集器
// ============================================================================
// 采集金融 KOL 推文、Reddit/雪球热帖，进行简单情绪评分
// 输出: JSON { sentiment, errors } to stdout
// ============================================================================

import { loadSourcesByCategory, filterRecent, log, fetchText, fetchJSON } from './utils.js';
import * as cheerio from 'cheerio';

// -- 情绪关键词词典 ---------------------------------------------------------

const BULLISH_WORDS = [
  'rally', 'surge', 'bull', 'bullish', 'breakout', 'high', 'gain', 'buy',
  'optimistic', 'growth', 'up', 'boom', 'strong', 'recovery', 'stimulus',
  '涨', '利好', '看多', '突破', '反弹', '牛市', '乐观', '上涨', '新高'
];

const BEARISH_WORDS = [
  'crash', 'drop', 'bear', 'bearish', 'sell', 'decline', 'low', 'fear',
  'recession', 'risk', 'down', 'bubble', 'weak', 'crisis', 'inflation',
  '跌', '利空', '看空', '崩盘', '暴跌', '熊市', '悲观', '下跌', '新低'
];

function analyzeSentiment(text) {
  const lower = text.toLowerCase();
  const bullCount = BULLISH_WORDS.filter(w => lower.includes(w)).length;
  const bearCount = BEARISH_WORDS.filter(w => lower.includes(w)).length;

  if (bullCount > bearCount + 1) return 'bullish';
  if (bearCount > bullCount + 1) return 'bearish';
  return 'neutral';
}

// -- Reddit JSON API 采集 --------------------------------------------------

async function collectReddit(source) {
  const data = await fetchJSON(source.rss, 15000);
  const posts = (data?.data?.children || []).map(child => {
    const post = child.data;
    return {
      source: 'reddit',
      platform: 'Reddit',
      handle: `r/${post.subreddit}`,
      text: `${post.title} ${post.selftext || ''}`.slice(0, 500),
      url: `https://reddit.com${post.permalink}`,
      sentiment: analyzeSentiment(`${post.title} ${post.selftext || ''}`),
      score: post.score || 0,
      timestamp: new Date(post.created_utc * 1000).toISOString()
    };
  });

  return filterRecent(posts, 24, 'timestamp');
}

// -- Twitter/X 通过 RSSHub 采集 --------------------------------------------

async function collectTwitter(source) {
  const Parser = (await import('rss-parser')).default;
  const parser = new Parser({
    timeout: 10000,
    headers: { 'User-Agent': 'TraderDigest/1.0' }
  });

  const feed = await parser.parseURL(source.rss);
  const tweets = (feed.items || []).map(item => ({
    source: 'twitter',
    platform: 'X/Twitter',
    handle: source.nameEn || source.name,
    text: (item.contentSnippet || item.content || '').slice(0, 500),
    url: item.link,
    sentiment: analyzeSentiment(item.contentSnippet || item.content || ''),
    score: 0,
    timestamp: item.isoDate || new Date().toISOString()
  }));

  return filterRecent(tweets, 24, 'timestamp');
}

// -- 雪球热帖采集 ----------------------------------------------------------

async function collectXueqiu(source) {
  const Parser = (await import('rss-parser')).default;
  const parser = new Parser({
    timeout: 10000,
    headers: { 'User-Agent': 'TraderDigest/1.0' }
  });

  const feed = await parser.parseURL(source.rss);
  const posts = (feed.items || []).map(item => ({
    source: 'xueqiu',
    platform: '雪球',
    handle: item.creator || '雪球用户',
    text: (item.contentSnippet || item.title || '').slice(0, 500),
    url: item.link,
    sentiment: analyzeSentiment(item.contentSnippet || item.title || ''),
    score: 0,
    timestamp: item.isoDate || new Date().toISOString()
  }));

  return filterRecent(posts, 24, 'timestamp');
}

// -- 主流程 ----------------------------------------------------------------

async function main() {
  // 安全超时: 270s 内必须完成
  const safetyTimer = setTimeout(() => {
    log('sentiment', '安全超时 (270s), 强制退出');
    process.exit(1);
  }, 270_000);

  const sources = await loadSourcesByCategory('sentiment');
  log('sentiment', `开始采集 ${sources.length} 个情绪信源`);

  const results = await Promise.allSettled(
    sources.map(async source => {
      try {
        let signals;
        if (source.id.startsWith('reddit')) {
          signals = await collectReddit(source);
        } else if (source.id.startsWith('twitter')) {
          signals = await collectTwitter(source);
        } else if (source.id.startsWith('xueqiu')) {
          signals = await collectXueqiu(source);
        } else {
          log(source.id, '未知情绪源类型，跳过');
          return { sourceId: source.id, signals: [] };
        }

        if (signals.length > 0) {
          log(source.id, `采集到 ${signals.length} 条信号`);
        }
        return { sourceId: source.id, signals };
      } catch (err) {
        log(source.id, `采集失败: ${err.message}`);
        return { sourceId: source.id, signals: [], error: err.message };
      }
    })
  );

  const allSignals = [];
  const errors = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allSignals.push(...result.value.signals);
      if (result.value.error) {
        errors.push({ sourceId: result.value.sourceId, error: result.value.error });
      }
    } else {
      errors.push({ error: result.reason?.message || 'unknown' });
    }
  }

  // 统计情绪分布
  const sentimentSummary = {
    bullish: allSignals.filter(s => s.sentiment === 'bullish').length,
    bearish: allSignals.filter(s => s.sentiment === 'bearish').length,
    neutral: allSignals.filter(s => s.sentiment === 'neutral').length
  };

  log('sentiment', `总计 ${allSignals.length} 条信号, 情绪: ${JSON.stringify(sentimentSummary)}`);
  clearTimeout(safetyTimer);
  console.log(JSON.stringify({ sentiment: allSignals, sentimentSummary, errors }, null, 2));
}

main().catch(err => {
  console.log(JSON.stringify({ sentiment: [], sentimentSummary: {}, errors: [{ error: err.message }] }));
});
