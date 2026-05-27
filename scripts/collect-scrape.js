#!/usr/bin/env node
// ============================================================================
// Trader Digest — 网页抓取采集器 (RSS 降级兜底)
// ============================================================================
// 对 rss=null 且 scrapeFallback=true 的信源，用 cheerio 抓取新闻列表
// 输出: JSON { articles, errors } to stdout
// ============================================================================

import * as cheerio from 'cheerio';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  loadSources, filterRecent, makeArticle, log,
  fetchText
} from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRAPERS_DIR = join(__dirname, '..', 'config', 'scrapers');

// -- 加载 scraper 配置 -----------------------------------------------------

async function loadScraperConfig(sourceId) {
  const configPath = join(SCRAPERS_DIR, `${sourceId}.json`);
  if (!existsSync(configPath)) return null;
  const raw = await readFile(configPath, 'utf-8');
  return JSON.parse(raw);
}

// -- 通用页面抓取 ----------------------------------------------------------

async function scrapePage(source, scraperConfig) {
  const html = await fetchText(source.url, 15000);
  const $ = cheerio.load(html);

  const {
    listSelector,
    titleSelector,
    linkSelector,
    linkAttr = 'href',
    dateSelector,
    dateFormat
  } = scraperConfig;

  const articles = [];
  $(listSelector).each((_, el) => {
    const $el = $(el);
    const title = $el.find(titleSelector).first().text().trim();
    let link = $el.find(linkSelector).first().attr(linkAttr) || '';

    if (link && !link.startsWith('http')) {
      const base = new URL(source.url);
      link = new URL(link, base.origin).href;
    }

    const dateText = dateSelector ? $el.find(dateSelector).first().text().trim() : null;

    if (title && link) {
      articles.push(makeArticle(source.id, {
        title,
        summary: '',
        url: link,
        publishedAt: dateText || null,
        language: source.language
      }));
    }
  });

  return filterRecent(articles);
}

// -- 默认抓取策略 (无自定义 scraper 时) -------------------------------------

async function defaultScrape(source) {
  const html = await fetchText(source.url, 15000);
  const $ = cheerio.load(html);

  const articles = [];
  // 通用策略: 找所有 <article> 或 <h2>/<h3> 内的 <a> 标签
  $('article a, h2 a, h3 a').each((_, el) => {
    const $el = $(el);
    const title = $el.text().trim();
    let link = $el.attr('href') || '';

    if (title.length < 10) return;
    if (link && !link.startsWith('http')) {
      const base = new URL(source.url);
      link = new URL(link, base.origin).href;
    }

    if (title && link) {
      articles.push(makeArticle(source.id, {
        title,
        summary: $el.parent().next('p').text().trim().slice(0, 300),
        url: link,
        publishedAt: null,
        language: source.language
      }));
    }
  });

  return filterRecent(articles);
}

// -- 主流程 ----------------------------------------------------------------

async function main() {
  // 安全超时: 200s 内必须完成 (必须小于父进程 spawn timeout 240s)
  const safetyTimer = setTimeout(() => {
    log('scrape', '安全超时 (200s), 强制退出');
    process.exit(1);
  }, 200_000);

  const sources = await loadSources();
  const scrapeSources = sources.filter(s => !s.rss && s.scrapeFallback);
  log('scrape', `开始抓取 ${scrapeSources.length} 个无 RSS 信源`);

  const results = await Promise.allSettled(
    scrapeSources.map(async source => {
      try {
        const scraperConfig = await loadScraperConfig(source.id);
        const articles = scraperConfig
          ? await scrapePage(source, scraperConfig)
          : await defaultScrape(source);
        if (articles.length > 0) {
          log(source.id, `抓取到 ${articles.length} 篇文章`);
        }
        return { sourceId: source.id, articles };
      } catch (err) {
        log(source.id, `抓取失败: ${err.message}`);
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

  log('scrape', `总计抓取 ${allArticles.length} 篇文章, ${errors.length} 个错误`);
  clearTimeout(safetyTimer);
  console.log(JSON.stringify({ articles: allArticles, errors }, null, 2));

  // 强制退出: 防止 pending HTTP 连接拖住事件循环
  setTimeout(() => process.exit(0), 1000);
}

main().catch(err => {
  console.log(JSON.stringify({ articles: [], errors: [{ error: err.message }] }));
  setTimeout(() => process.exit(0), 1000);
});
