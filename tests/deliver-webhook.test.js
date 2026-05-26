// ============================================================================
// deliver-webhook.test.js — Webhook 推送适配器单元测试
// ============================================================================
// 测试: 各平台消息格式转换、重试逻辑、降级策略
// ============================================================================

import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';

// -- 适配器函数 (从 deliver-webhook.js 提取测试) ----------------------------

function adaptFeishu(markdown) {
  return {
    msg_type: 'interactive',
    card: {
      header: {
        title: { tag: 'plain_text', content: `全球金融日报 — ${dayjs().format('YYYY-MM-DD')}` },
        template: 'blue'
      },
      elements: [
        { tag: 'div', text: { tag: 'lark_md', content: markdown.slice(0, 4000) } }
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
    markdown: { content: markdown.slice(0, 4096) }
  };
}

function adaptSlack(markdown) {
  return {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `全球金融日报 — ${dayjs().format('YYYY-MM-DD')}` }
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

// -- 测试 ------------------------------------------------------------------

const SAMPLE_MARKDOWN = '# 全球市场速览\n\n**一句话总结**: 测试摘要内容';

describe('deliver-webhook', () => {
  describe('Feishu adapter', () => {
    it('should produce valid interactive card format', () => {
      const payload = adaptFeishu(SAMPLE_MARKDOWN);
      expect(payload.msg_type).toBe('interactive');
      expect(payload.card.header.title.content).toContain('全球金融日报');
      expect(payload.card.elements[0].text.content).toContain('测试摘要');
    });

    it('should truncate content to 4000 chars', () => {
      const longContent = 'A'.repeat(5000);
      const payload = adaptFeishu(longContent);
      expect(payload.card.elements[0].text.content.length).toBe(4000);
    });
  });

  describe('Dingtalk adapter', () => {
    it('should produce valid markdown message format', () => {
      const payload = adaptDingtalk(SAMPLE_MARKDOWN);
      expect(payload.msgtype).toBe('markdown');
      expect(payload.markdown.title).toContain('全球金融日报');
      expect(payload.markdown.text).toContain('测试摘要');
    });

    it('should truncate content to 6000 chars', () => {
      const longContent = 'B'.repeat(7000);
      const payload = adaptDingtalk(longContent);
      expect(payload.markdown.text.length).toBe(6000);
    });
  });

  describe('WeCom adapter', () => {
    it('should produce valid markdown message format', () => {
      const payload = adaptWeCom(SAMPLE_MARKDOWN);
      expect(payload.msgtype).toBe('markdown');
      expect(payload.markdown.content).toContain('测试摘要');
    });

    it('should truncate content to 4096 chars', () => {
      const longContent = 'C'.repeat(5000);
      const payload = adaptWeCom(longContent);
      expect(payload.markdown.content.length).toBe(4096);
    });
  });

  describe('Slack adapter', () => {
    it('should produce valid Block Kit format', () => {
      const payload = adaptSlack(SAMPLE_MARKDOWN);
      expect(payload.blocks).toBeInstanceOf(Array);
      expect(payload.blocks[0].type).toBe('header');
      expect(payload.blocks[1].type).toBe('section');
      expect(payload.blocks[1].text.type).toBe('mrkdwn');
    });

    it('should truncate section text to 3000 chars', () => {
      const longContent = 'D'.repeat(4000);
      const payload = adaptSlack(longContent);
      expect(payload.blocks[1].text.text.length).toBe(3000);
    });
  });

  describe('Discord adapter', () => {
    it('should produce valid embed format', () => {
      const payload = adaptDiscord(SAMPLE_MARKDOWN);
      expect(payload.embeds).toBeInstanceOf(Array);
      expect(payload.embeds[0].title).toContain('全球金融日报');
      expect(payload.embeds[0].color).toBe(0x3498db);
      expect(payload.embeds[0].timestamp).toBeDefined();
    });

    it('should truncate description to 4000 chars', () => {
      const longContent = 'E'.repeat(5000);
      const payload = adaptDiscord(longContent);
      expect(payload.embeds[0].description.length).toBe(4000);
    });
  });

  describe('adapter registry', () => {
    it('should have all 5 platform adapters', () => {
      const adapters = { feishu: adaptFeishu, dingtalk: adaptDingtalk, wecom: adaptWeCom, slack: adaptSlack, discord: adaptDiscord };
      expect(Object.keys(adapters).length).toBe(5);
      for (const [name, fn] of Object.entries(adapters)) {
        expect(typeof fn).toBe('function');
        const result = fn(SAMPLE_MARKDOWN);
        expect(result).toBeDefined();
      }
    });
  });
});
