#!/usr/bin/env node
// ============================================================================
// Trader Digest — Webhook 推送适配器
// ============================================================================
// 接收 Markdown 摘要文本，根据配置转换为各 IM 平台格式并推送
// 支持: 飞书 / 钉钉 / 企微 / Slack / Discord / stdout
// 用法: echo "摘要内容" | node scripts/deliver-webhook.js
//   或: node scripts/deliver-webhook.js --file digest.md
// ============================================================================

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { existsSync, readFileSync } from 'fs';
import dayjs from 'dayjs';
import { log } from './utils.js';

// -- 配置加载 --------------------------------------------------------------

function loadConfig() {
  const configPath = join(homedir(), '.trader-digest', 'config.json');
  if (!existsSync(configPath)) {
    return { delivery: { method: 'stdout' } };
  }
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}

// -- 输入读取 --------------------------------------------------------------

async function readInput() {
  const args = process.argv.slice(2);
  const fileArg = args.findIndex(a => a === '--file');
  if (fileArg !== -1 && args[fileArg + 1]) {
    return readFile(args[fileArg + 1], 'utf-8');
  }

  // 从 stdin 读取
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.resume();
  });
}

// -- 平台适配器 -----------------------------------------------------------

function adaptFeishu(markdown) {
  return {
    msg_type: 'interactive',
    card: {
      header: {
        title: { tag: 'plain_text', content: `全球金融日报 — ${dayjs().format('YYYY-MM-DD')}` },
        template: 'blue'
      },
      elements: [
        {
          tag: 'div',
          text: { tag: 'lark_md', content: markdown.slice(0, 4000) }
        }
      ]
    }
  };
}

function adaptDingtalk(markdown) {
  return {
    msgtype: 'markdown',
    markdown: {
      title: `全球金融日报 — ${dayjs().format('YYYY-MM-DD')}`,
      text: markdown.slice(0, 6000)
    }
  };
}

function adaptWeCom(markdown) {
  return {
    msgtype: 'markdown',
    markdown: {
      content: markdown.slice(0, 4096)
    }
  };
}

function adaptSlack(markdown) {
  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `全球金融日报 — ${dayjs().format('YYYY-MM-DD')}`
        }
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: markdown.slice(0, 3000) }
      }
    ]
  };
}

function adaptDiscord(markdown) {
  return {
    embeds: [{
      title: `全球金融日报 — ${dayjs().format('YYYY-MM-DD')}`,
      description: markdown.slice(0, 4000),
      color: 0x3498db,
      timestamp: dayjs().toISOString()
    }]
  };
}

const ADAPTERS = {
  feishu: adaptFeishu,
  dingtalk: adaptDingtalk,
  wecom: adaptWeCom,
  slack: adaptSlack,
  discord: adaptDiscord
};

// -- 推送逻辑 --------------------------------------------------------------

async function pushWithRetry(url, payload, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) return { success: true, status: res.status };
      log('deliver', `推送失败 HTTP ${res.status}, 重试 ${i + 1}/${retries}`);
    } catch (err) {
      log('deliver', `推送异常: ${err.message}, 重试 ${i + 1}/${retries}`);
    }
    if (i < retries - 1) {
      await new Promise(r => setTimeout(r, 30000)); // 30s 间隔
    }
  }
  return { success: false };
}

// -- 主流程 ----------------------------------------------------------------

async function main() {
  const markdown = await readInput();
  if (!markdown || markdown.trim().length === 0) {
    log('deliver', '无内容可推送');
    process.exit(0);
  }

  const config = loadConfig();
  const { method, platform, webhookUrl } = config.delivery || {};

  // stdout 模式: 直接输出
  if (method === 'stdout' || !platform) {
    console.log(markdown);
    return;
  }

  // Webhook 模式
  if (!webhookUrl) {
    log('deliver', '未配置 webhookUrl，降级为 stdout');
    console.log(markdown);
    return;
  }

  const adapter = ADAPTERS[platform];
  if (!adapter) {
    log('deliver', `未知平台 ${platform}，降级为 stdout`);
    console.log(markdown);
    return;
  }

  const payload = adapter(markdown);
  const result = await pushWithRetry(webhookUrl, payload);

  if (result.success) {
    log('deliver', `推送成功 → ${platform} (HTTP ${result.status})`);
  } else {
    log('deliver', `推送失败，降级为 stdout`);
    console.log(markdown);
  }
}

main().catch(err => {
  log('deliver', `致命错误: ${err.message}`);
  process.exit(1);
});
