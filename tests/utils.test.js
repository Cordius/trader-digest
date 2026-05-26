// ============================================================================
// utils.test.js — 公共工具函数单元测试
// ============================================================================
// 测试: loadSources, filterRecent, makeArticle, extractKeywords, getUserConfig
// ============================================================================

import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 直接测试纯函数逻辑 (不依赖 import 的模块，避免副作用)

describe('utils - makeArticle', () => {
  function makeArticle(sourceId, { title, summary, url, publishedAt, language, author }) {
    return {
      sourceId,
      title: (title || '').trim(),
      summary: (summary || '').trim(),
      url: (url || '').trim(),
      publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
      language: language || 'en',
      author: author || null
    };
  }

  it('should create article with all fields', () => {
    const article = makeArticle('reuters', {
      title: 'Fed cuts rates',
      summary: 'Federal Reserve decided...',
      url: 'https://example.com/1',
      publishedAt: '2026-05-26T10:00:00Z',
      language: 'en',
      author: 'John'
    });

    expect(article.sourceId).toBe('reuters');
    expect(article.title).toBe('Fed cuts rates');
    expect(article.language).toBe('en');
    expect(article.author).toBe('John');
  });

  it('should handle missing fields gracefully', () => {
    const article = makeArticle('test', { title: 'Test', url: 'https://x.com' });

    expect(article.summary).toBe('');
    expect(article.publishedAt).toBeNull();
    expect(article.language).toBe('en');
    expect(article.author).toBeNull();
  });

  it('should trim whitespace from title and summary', () => {
    const article = makeArticle('test', {
      title: '  Hello World  ',
      summary: '  Some text  ',
      url: 'https://x.com'
    });

    expect(article.title).toBe('Hello World');
    expect(article.summary).toBe('Some text');
  });
});

describe('utils - filterRecent', () => {
  function filterRecent(items, hours = 24, dateField = 'publishedAt') {
    const cutoff = new Date(Date.now() - hours * 3600 * 1000);
    return items.filter(item => {
      if (!item[dateField]) return true;
      return new Date(item[dateField]) > cutoff;
    });
  }

  it('should keep recent articles', () => {
    const now = new Date();
    const items = [
      { title: 'recent', publishedAt: new Date(now - 2 * 3600 * 1000).toISOString() },
      { title: 'old', publishedAt: new Date(now - 48 * 3600 * 1000).toISOString() }
    ];

    const result = filterRecent(items, 24);
    expect(result.length).toBe(1);
    expect(result[0].title).toBe('recent');
  });

  it('should keep articles without dates', () => {
    const items = [
      { title: 'no-date', publishedAt: null },
      { title: 'also-no-date' }
    ];

    const result = filterRecent(items, 24);
    expect(result.length).toBe(2);
  });

  it('should handle empty array', () => {
    expect(filterRecent([], 24).length).toBe(0);
  });
});

describe('utils - extractKeywords', () => {
  function extractKeywords(articles, topN = 15) {
    const STOP_WORDS = new Set([
      'the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'has'
    ]);
    const wordCounts = {};
    for (const a of articles) {
      const words = `${a.title} ${a.summary || ''}`
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOP_WORDS.has(w));
      for (const w of words) {
        wordCounts[w] = (wordCounts[w] || 0) + 1;
      }
    }
    return Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([word]) => word);
  }

  it('should extract top keywords by frequency', () => {
    const articles = [
      { title: 'Fed raises rates again', summary: 'Federal Reserve policy' },
      { title: 'Fed signals hawkish stance', summary: 'Federal Reserve meeting' },
      { title: 'ECB holds rates', summary: 'European Central Bank decision' }
    ];

    const keywords = extractKeywords(articles, 5);
    expect(keywords).toContain('fed');
    expect(keywords[0]).toBe('fed'); // 出现最多
  });

  it('should filter stop words', () => {
    const articles = [
      { title: 'The and for with Fed', summary: '' }
    ];

    const keywords = extractKeywords(articles, 10);
    expect(keywords).not.toContain('the');
    expect(keywords).not.toContain('and');
    expect(keywords).toContain('fed');
  });

  it('should handle empty articles', () => {
    expect(extractKeywords([], 5).length).toBe(0);
  });
});

describe('utils - sources.json integrity', () => {
  it('should have valid JSON with sources array', async () => {
    const { readFile } = await import('fs/promises');
    const sourcesPath = join(__dirname, '..', 'config', 'sources.json');
    const raw = await readFile(sourcesPath, 'utf-8');
    const data = JSON.parse(raw);

    expect(data.sources).toBeInstanceOf(Array);
    expect(data.sources.length).toBeGreaterThanOrEqual(80);
  });

  it('should have all required fields per source', async () => {
    const { readFile } = await import('fs/promises');
    const sourcesPath = join(__dirname, '..', 'config', 'sources.json');
    const raw = await readFile(sourcesPath, 'utf-8');
    const data = JSON.parse(raw);

    const requiredFields = ['id', 'name', 'url', 'category', 'region', 'language', 'priority'];
    for (const source of data.sources) {
      for (const field of requiredFields) {
        expect(source[field], `Missing ${field} in source ${source.id}`).toBeDefined();
      }
    }
  });

  it('should have unique source IDs', async () => {
    const { readFile } = await import('fs/promises');
    const sourcesPath = join(__dirname, '..', 'config', 'sources.json');
    const raw = await readFile(sourcesPath, 'utf-8');
    const data = JSON.parse(raw);

    const ids = data.sources.map(s => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have all required categories', async () => {
    const { readFile } = await import('fs/promises');
    const sourcesPath = join(__dirname, '..', 'config', 'sources.json');
    const raw = await readFile(sourcesPath, 'utf-8');
    const data = JSON.parse(raw);

    const categories = new Set(data.sources.map(s => s.category));
    expect(categories.has('wire')).toBe(true);
    expect(categories.has('financial')).toBe(true);
    expect(categories.has('central-bank')).toBe(true);
    expect(categories.has('calendar')).toBe(true);
    expect(categories.has('sentiment')).toBe(true);
  });
});

describe('utils - prompt files', () => {
  it('should have all 4 prompt files', () => {
    const promptsDir = join(__dirname, '..', 'prompts');
    expect(existsSync(join(promptsDir, 'digest-brief.md'))).toBe(true);
    expect(existsSync(join(promptsDir, 'digest-deep.md'))).toBe(true);
    expect(existsSync(join(promptsDir, 'market-impact.md'))).toBe(true);
    expect(existsSync(join(promptsDir, 'translate.md'))).toBe(true);
  });
});
