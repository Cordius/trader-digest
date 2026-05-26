#!/usr/bin/env node
// ============================================================================
// Trader Digest — RSS 采集器
// ============================================================================
// 遍历 sources.json 中所有有 RSS 的信源，解析 feed，过滤 24h 内文章
// 输出: JSON array of articles to stdout
// ============================================================================

import Parser from 'rss-parser';
import { loadSources, filterRecent, makeArticle, log } from './utils.js';

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'TraderDigest/1.0' }
});

async function collectOne(source) {
  const feed = await parser.parseURL(source.rss);
  const articles = (feed.items || []).map(item =>
    makeArticle(source.id, {
      title: item.title,
      summary: (item.contentSnippet || item.content || '').slice(0, 500),
      url: item.link,
      publishedAt: item.isoDate || item.pubDate,
      language: source.language,
      author: item.creator || item.author || null
    })
  );
  return filterRecent(articles);
}

async function main() {
  // 安全超时: 270s 内必须完成，否则强制退出
  const safetyTimer = setTimeout(() => {
    log('rss', '安全超时 (270s), 强制退出');
    process.exit(1);
  }, 270_000);

  const sources = await loadSources();
  const rssSources = sources.filter(s => s.rss);
  log('rss', `开始采集 ${rssSources.length} 个 RSS 源`);

  const results = await Promise.allSettled(
    rssSources.map(async source => {
      try {
        const articles = await collectOne(source);
        if (articles.length > 0) {
          log(source.id, `采集到 ${articles.length} 篇文章`);
        }
        return { sourceId: source.id, articles };
      } catch (err) {
        log(source.id, `采集失败: ${err.message}`);
        return { sourceId: source.id, articles: [], error: err.message };
      }
    })
  );

  const allArticles = [];
  const errors = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allArticles.push(...result.value.articles);
      if (result.value.error) {
        errors.push({ sourceId: result.value.sourceId, error: result.value.error });
      }
    } else {
      errors.push({ error: result.reason?.message || 'unknown' });
    }
  }

  log('rss', `总计采集 ${allArticles.length} 篇文章, ${errors.length} 个错误`);

  clearTimeout(safetyTimer);
  const output = { articles: allArticles, errors };
  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => {
  console.log(JSON.stringify({ articles: [], errors: [{ error: err.message }] }));
});
