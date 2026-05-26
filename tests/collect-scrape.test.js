// ============================================================================
// collect-scrape.test.js — 网页抓取采集器单元测试
// ============================================================================
// 测试: cheerio 解析、CSS selector 提取、链接补全
// ============================================================================

import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, 'fixtures', 'sample-page.html');

describe('collect-scrape', () => {
  it('should parse HTML and extract news items', async () => {
    const html = await readFile(FIXTURE_PATH, 'utf-8');
    const $ = cheerio.load(html);

    const items = [];
    $('.news-list .news-item').each((_, el) => {
      const $el = $(el);
      const title = $el.find('h3 a').first().text().trim();
      const link = $el.find('h3 a').first().attr('href');
      const date = $el.find('.date').first().text().trim();
      items.push({ title, link, date });
    });

    expect(items.length).toBe(3);
    expect(items[0].title).toBe('Saudi Arabia GDP grows 3.2% on oil revenue boost');
    expect(items[0].link).toBe('/en/news/12345');
    expect(items[0].date).toBe('2026-05-26 09:00');
  });

  it('should resolve relative URLs to absolute', async () => {
    const html = await readFile(FIXTURE_PATH, 'utf-8');
    const $ = cheerio.load(html);
    const baseUrl = 'https://www.spa.gov.sa';

    const items = [];
    $('.news-list .news-item').each((_, el) => {
      const $el = $(el);
      let link = $el.find('h3 a').first().attr('href') || '';
      if (link && !link.startsWith('http')) {
        link = new URL(link, baseUrl).href;
      }
      items.push({ link });
    });

    expect(items[0].link).toBe('https://www.spa.gov.sa/en/news/12345');
    expect(items[1].link).toBe('https://www.spa.gov.sa/en/news/12346');
  });

  it('should extract description from sibling elements', async () => {
    const html = await readFile(FIXTURE_PATH, 'utf-8');
    const $ = cheerio.load(html);

    const items = [];
    $('.news-list .news-item').each((_, el) => {
      const $el = $(el);
      const paragraphs = $el.find('p').not('.date');
      const desc = paragraphs.first().text().trim();
      items.push({ desc });
    });

    expect(items[0].desc).toContain('petroleum sector growth');
    expect(items[1].desc).toContain('production levels');
  });

  it('should handle empty pages gracefully', () => {
    const $ = cheerio.load('<html><body></body></html>');
    const items = [];
    $('.news-list .news-item').each((_, el) => {
      items.push(el);
    });
    expect(items.length).toBe(0);
  });
});
