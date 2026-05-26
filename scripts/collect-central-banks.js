#!/usr/bin/env node
// ============================================================================
// Trader Digest — 央行声明采集器
// ============================================================================
// 监控央行官网页面变化，生成声明类 article
// 策略: 抓取央行 RSS/页面 → 过滤 24h 内 → 标准化输出
// 输出: JSON { centralBanks, errors } to stdout
// ============================================================================

import Parser from 'rss-parser';
import { loadSourcesByCategory, filterRecent, makeArticle, log, fetchText } from './utils.js';
import * as cheerio from 'cheerio';

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'TraderDigest/1.0' }
});

// -- 有 RSS 的央行 ---------------------------------------------------------

async function collectFromRss(source) {
  const feed = await parser.parseURL(source.rss);
  const items = (feed.items || []).map(item =>
    makeArticle(source.id, {
      title: `[${source.name}] ${item.title}`,
      summary: (item.contentSnippet || item.content || '').slice(0, 500),
      url: item.link,
      publishedAt: item.isoDate || item.pubDate,
      language: source.language
    })
  );
  return filterRecent(items);
}

// -- 无 RSS 的央行 (页面抓取) -----------------------------------------------

async function collectFromPage(source) {
  const html = await fetchText(source.url, 15000);
  const $ = cheerio.load(html);

  const articles = [];
  // 通用策略: 查找新闻/声明链接
  $('a').each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    const href = $el.attr('href') || '';

    // 过滤央行页面常见的导航链接，只保留有实质内容的
    if (text.length < 15 || text.length > 200) return;
    if (!href) return;

    const keywords = ['statement', 'press release', 'announcement', 'decision',
      '声明', '公告', '决议', '政策', 'statement', 'release'];
    const hasKeyword = keywords.some(k =>
      text.toLowerCase().includes(k) || href.toLowerCase().includes(k)
    );
    if (!hasKeyword) return;

    let link = href;
    if (!link.startsWith('http')) {
      const base = new URL(source.url);
      link = new URL(link, base.origin).href;
    }

    articles.push(makeArticle(source.id, {
      title: `[${source.name}] ${text}`,
      summary: '',
      url: link,
      publishedAt: null,
      language: source.language
    }));
  });

  return filterRecent(articles);
}

// -- 主流程 ----------------------------------------------------------------

async function main() {
  const sources = await loadSourcesByCategory('central-bank');
  log('central-banks', `开始监控 ${sources.length} 个央行信源`);

  const results = await Promise.allSettled(
    sources.map(async source => {
      try {
        const articles = source.rss
          ? await collectFromRss(source)
          : await collectFromPage(source);
        if (articles.length > 0) {
          log(source.id, `发现 ${articles.length} 条声明`);
        }
        return { sourceId: source.id, articles };
      } catch (err) {
        log(source.id, `采集失败: ${err.message}`);
        return { sourceId: source.id, articles: [], error: err.message };
      }
    })
  );

  const allBanks = [];
  const errors = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allBanks.push(...result.value.articles);
      if (result.value.error) {
        errors.push({ sourceId: result.value.sourceId, error: result.value.error });
      }
    } else {
      errors.push({ error: result.reason?.message || 'unknown' });
    }
  }

  log('central-banks', `总计 ${allBanks.length} 条声明, ${errors.length} 个错误`);
  console.log(JSON.stringify({ centralBanks: allBanks, errors }, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({ centralBanks: [], errors: [{ error: err.message }] }));
  process.exit(1);
});
