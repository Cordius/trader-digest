#!/usr/bin/env node
// ============================================================================
// Trader Digest — 准备 LLM 输入
// ============================================================================
// 拉取 feed-financial.json + prompts + config → 输出单个 JSON blob
// Agent 的唯一职责: 读取这个 JSON → 按 prompts 生成摘要 → 推送
// 用法: node scripts/prepare-digest.js
// ============================================================================

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import dayjs from 'dayjs';
import { getUserConfig, fetchText, log } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USER_DIR = join(homedir(), '.trader-digest');
const LOCAL_FEED_PATH = join(__dirname, '..', 'feed-financial.json');
const LOCAL_PROMPTS_DIR = join(__dirname, '..', 'prompts');

const PROMPT_FILES = [
  'digest-brief.md',
  'digest-deep.md',
  'market-impact.md',
  'translate.md'
];

// -- 加载 feed -------------------------------------------------------------

async function loadFeed(remoteUrl) {
  // 优先本地 feed (GitHub Actions 生成后 clone 到本地)
  if (existsSync(LOCAL_FEED_PATH)) {
    const raw = await readFile(LOCAL_FEED_PATH, 'utf-8');
    return JSON.parse(raw);
  }

  // 降级: 从配置的远程 URL 拉取 (可选)
  if (remoteUrl) {
    try {
      const text = await fetchText(remoteUrl);
      return JSON.parse(text);
    } catch (err) {
      log('prepare', `远程 feed 不可达: ${err.message}`);
    }
  }

  log('prepare', '无本地 feed 且未配置远程 URL');
  return null;
}

// -- 加载 prompts ----------------------------------------------------------
// 优先级: 用户自定义 > GitHub 远程 > 本地分发副本

async function loadPrompts(remoteBaseUrl) {
  const prompts = {};
  const userPromptsDir = join(USER_DIR, 'prompts');

  for (const filename of PROMPT_FILES) {
    const key = filename.replace('.md', '').replace(/-/g, '_');
    const userPath = join(userPromptsDir, filename);
    const localPath = join(LOCAL_PROMPTS_DIR, filename);

    // 优先级 1: 用户自定义 prompt
    if (existsSync(userPath)) {
      prompts[key] = await readFile(userPath, 'utf-8');
      log('prepare', `使用用户自定义 prompt: ${filename}`);
      continue;
    }

    // 优先级 2: 远程最新 (可选)
    if (remoteBaseUrl) {
      try {
        const remote = await fetchText(`${remoteBaseUrl}/${filename}`, 5000);
        prompts[key] = remote;
        continue;
      } catch {
        // 远程不可达，降级到本地
      }
    }

    // 优先级 3: 本地分发副本
    if (existsSync(localPath)) {
      prompts[key] = await readFile(localPath, 'utf-8');
      continue;
    }

    log('prepare', `无法加载 prompt: ${filename}`);
  }

  return prompts;
}

// -- 主流程 ----------------------------------------------------------------

async function main() {
  const errors = [];

  // 1. 加载用户配置
  let config;
  try {
    config = getUserConfig();
  } catch (err) {
    config = { language: 'zh', delivery: { method: 'stdout' } };
    errors.push(`配置读取失败，使用默认: ${err.message}`);
  }

  // 2. 加载 feed
  const remoteFeedUrl = config.remote?.feedUrl || null;
  const feed = await loadFeed(remoteFeedUrl);
  if (!feed) {
    errors.push('无法加载 feed-financial.json');
  }

  // 3. 检查 feed 新鲜度
  if (feed?.generatedAt) {
    const age = dayjs().diff(dayjs(feed.generatedAt), 'hour');
    if (age > 48) {
      errors.push(`feed 数据可能过期 (${age}h 前生成)`);
    }
  }

  // 4. 加载 prompts
  const remotePromptsBase = config.remote?.promptsBaseUrl || null;
  const prompts = await loadPrompts(remotePromptsBase);

  // 5. 组装输出
  const output = {
    status: feed ? 'ok' : 'error',
    generatedAt: dayjs().toISOString(),
    config: {
      language: config.language || 'zh',
      frequency: config.frequency || 'daily',
      delivery: config.delivery || { method: 'stdout' },
      preferences: config.preferences || {}
    },
    articles: feed?.articles || [],
    centralBanks: feed?.centralBanks || [],
    events: feed?.events || [],
    sentiment: feed?.sentiment || [],
    stats: feed?.stats || {},
    prompts,
    errors: errors.length > 0 ? errors : undefined
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({
    status: 'error',
    message: err.message
  }));
  process.exit(1);
});
