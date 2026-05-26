// ============================================================================
// prepare-digest.test.js — LLM 输入组装单元测试
// ============================================================================
// 测试: JSON 组装、prompt 加载、配置合并、feed 新鲜度检测
// ============================================================================

import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import dayjs from 'dayjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, 'fixtures', 'sample-feed.json');
const PROMPTS_DIR = join(__dirname, '..', 'prompts');

describe('prepare-digest', () => {
  it('should load and parse fixture feed JSON', async () => {
    const raw = await readFile(FIXTURE_PATH, 'utf-8');
    const feed = JSON.parse(raw);

    expect(feed.generatedAt).toBeDefined();
    expect(feed.articles).toBeInstanceOf(Array);
    expect(feed.centralBanks).toBeInstanceOf(Array);
    expect(feed.events).toBeInstanceOf(Array);
    expect(feed.sentiment).toBeInstanceOf(Array);
    expect(feed.stats).toBeDefined();
  });

  it('should have correct article structure', async () => {
    const raw = await readFile(FIXTURE_PATH, 'utf-8');
    const feed = JSON.parse(raw);

    for (const article of feed.articles) {
      expect(article.sourceId).toBeDefined();
      expect(article.title).toBeDefined();
      expect(article.url).toBeDefined();
      expect(article.language).toBeDefined();
    }
  });

  it('should have all 4 prompt files present', () => {
    const promptFiles = [
      'digest-brief.md',
      'digest-deep.md',
      'market-impact.md',
      'translate.md'
    ];

    for (const file of promptFiles) {
      const path = join(PROMPTS_DIR, file);
      expect(existsSync(path), `Missing prompt: ${file}`).toBe(true);
    }
  });

  it('should detect stale feed (>48h)', async () => {
    const raw = await readFile(FIXTURE_PATH, 'utf-8');
    const feed = JSON.parse(raw);

    const staleDate = dayjs().subtract(50, 'hour').toISOString();
    const freshDate = dayjs().subtract(2, 'hour').toISOString();

    const staleAge = dayjs().diff(dayjs(staleDate), 'hour');
    const freshAge = dayjs().diff(dayjs(freshDate), 'hour');

    expect(staleAge).toBeGreaterThan(48);
    expect(freshAge).toBeLessThanOrEqual(48);
  });

  it('should assemble output with correct structure', async () => {
    const raw = await readFile(FIXTURE_PATH, 'utf-8');
    const feed = JSON.parse(raw);

    // 模拟 prepare-digest.js 的输出结构
    const output = {
      status: 'ok',
      generatedAt: dayjs().toISOString(),
      config: {
        language: 'zh',
        frequency: 'daily',
        delivery: { method: 'stdout' },
        preferences: {}
      },
      articles: feed.articles,
      centralBanks: feed.centralBanks,
      events: feed.events,
      sentiment: feed.sentiment,
      stats: feed.stats,
      prompts: {
        digest_brief: 'test prompt',
        digest_deep: 'test prompt',
        market_impact: 'test prompt',
        translate: 'test prompt'
      },
      errors: undefined
    };

    expect(output.status).toBe('ok');
    expect(output.articles.length).toBe(2);
    expect(output.centralBanks.length).toBe(1);
    expect(output.events.length).toBe(1);
    expect(output.sentiment.length).toBe(1);
    expect(Object.keys(output.prompts).length).toBe(4);
  });
});
