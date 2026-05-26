// ============================================================================
// Trader Digest — Shared Utilities
// ============================================================================
// 所有采集脚本的公共函数: 加载 sources、时间过滤、统一日志
// ============================================================================

import { readFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'config', 'sources.json');

// -- 加载信源配置 ---------------------------------------------------------

export async function loadSources() {
  const raw = await readFile(CONFIG_PATH, 'utf-8');
  const data = JSON.parse(raw);
  return data.sources || [];
}

export async function loadSourcesByCategory(category) {
  const sources = await loadSources();
  return sources.filter(s => s.category === category);
}

export async function loadSourcesByField(field, value) {
  const sources = await loadSources();
  return sources.filter(s => s[field] === value);
}

// -- 时间过滤 -------------------------------------------------------------

export function filterRecent(items, hours = 24, dateField = 'publishedAt') {
  const cutoff = dayjs().subtract(hours, 'hour');
  return items.filter(item => {
    if (!item[dateField]) return true; // 无日期的保留
    return dayjs(item[dateField]).isAfter(cutoff);
  });
}

// -- 统一 Article 格式 ----------------------------------------------------

export function makeArticle(sourceId, { title, summary, url, publishedAt, language, author }) {
  return {
    sourceId,
    title: (title || '').trim(),
    summary: (summary || '').trim(),
    url: (url || '').trim(),
    publishedAt: publishedAt ? dayjs(publishedAt).toISOString() : null,
    language: language || 'en',
    author: author || null
  };
}

// -- 日志 -----------------------------------------------------------------

export function log(sourceId, msg) {
  const ts = dayjs().format('HH:mm:ss');
  console.error(`[${ts}] [${sourceId}] ${msg}`);
}

// -- 超时 fetch -----------------------------------------------------------

export async function fetchWithTimeout(url, timeoutMs = 10000, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(url, timeoutMs = 10000) {
  const res = await fetchWithTimeout(url, timeoutMs, {
    headers: { 'User-Agent': 'TraderDigest/1.0' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

export async function fetchJSON(url, timeoutMs = 10000) {
  const text = await fetchText(url, timeoutMs);
  return JSON.parse(text);
}

// -- 关键词提取 (简易版) ---------------------------------------------------

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'this', 'that', 'as', 'are',
  'was', 'were', 'be', 'been', 'has', 'have', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'can', 'not', 'no',
  'its', 'their', 'our', 'your', 'his', 'her', 'all', 'new', 'more',
  'than', 'also', 'just', 'about', 'after', 'before', 'over', 'under',
  'up', 'down', 'out', 'off', 'so', 'if', 'he', 'she', 'we', 'they',
  'me', 'him', 'them', 'my', 'his', 'her', 'us', 'who', 'what', 'which',
  'when', 'where', 'how', 'say', 'said', 'says'
]);

export function extractKeywords(articles, topN = 15) {
  const wordCounts = {};
  for (const a of articles) {
    const words = `${a.title} ${a.summary}`
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿\s]/g, ' ')
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

// -- 配置读取 (~/.trader-digest/config.json) --------------------------------

export function getUserConfig() {
  const configPath = join(homedir(), '.trader-digest', 'config.json');
  if (!existsSync(configPath)) {
    return {
      language: 'zh',
      frequency: 'daily',
      timezone: 'Asia/Shanghai',
      delivery: { method: 'stdout' },
      preferences: {
        includeDeepAnalysis: true,
        focusRegions: [],
        focusSectors: []
      }
    };
  }
  const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
  return raw;
}
