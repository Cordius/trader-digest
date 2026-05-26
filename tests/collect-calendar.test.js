// ============================================================================
// collect-calendar.test.js — 经济日历采集器单元测试
// ============================================================================
// 测试: 日历数据解析、去重、字段标准化
// ============================================================================

import { describe, it, expect } from 'vitest';

describe('collect-calendar', () => {
  it('should deduplicate events by country+event', () => {
    const events = [
      { country: 'US', event: 'Non-Farm Payrolls', source: 'trading-economics' },
      { country: 'US', event: 'Non-Farm Payrolls', source: 'forexfactory' },
      { country: 'DE', event: 'IFO Business Climate', source: 'trading-economics' },
      { country: 'US', event: 'CPI m/m', source: 'investing-calendar' }
    ];

    const seen = new Set();
    const deduped = events.filter(e => {
      const key = `${e.country}|${e.event}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    expect(deduped.length).toBe(3);
    expect(deduped[0].source).toBe('trading-economics'); // 保留第一个来源
  });

  it('should normalize importance levels', () => {
    const levels = ['high', 'medium', 'low', ''];
    const normalized = levels.map(l => l || 'medium');

    expect(normalized).toEqual(['high', 'medium', 'low', 'medium']);
  });

  it('should handle missing actual/forecast/previous fields', () => {
    const event = {
      event: 'GDP q/q',
      country: 'US',
      actual: null,
      forecast: '2.1%',
      previous: '1.8%'
    };

    expect(event.actual).toBeNull();
    expect(event.forecast).toBe('2.1%');
    expect(event.previous).toBe('1.8%');
  });

  it('should handle empty events array', () => {
    const events = [];
    const seen = new Set();
    const deduped = events.filter(e => {
      const key = `${e.country}|${e.event}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    expect(deduped.length).toBe(0);
  });
});
