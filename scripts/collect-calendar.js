#!/usr/bin/env node
// ============================================================================
// Trader Digest — 经济日历采集器
// ============================================================================
// 采集今日及未来 48h 的经济数据发布日历
// 数据来源: Trading Economics RSS + Investing.com 页面抓取
// 输出: JSON { events, errors } to stdout
// ============================================================================

import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { loadSourcesByCategory, log, fetchText } from './utils.js';

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'TraderDigest/1.0' }
});

// -- Trading Economics 采集 ------------------------------------------------

async function collectTradingEconomics() {
  const url = 'https://tradingeconomics.com/calendar';
  const html = await fetchText(url, 15000);
  const $ = cheerio.load(html);

  const events = [];
  // Trading Economics 的日历表格
  $('table tbody tr').each((_, row) => {
    const $row = $(row);
    const cells = $row.find('td');
    if (cells.length < 4) return;

    const time = $(cells[0]).text().trim();
    const country = $(cells[1]).text().trim();
    const event = $(cells[2]).text().trim();
    const importance = $(cells[3]).text().trim();
    const actual = cells.length > 4 ? $(cells[4]).text().trim() : '';
    const forecast = cells.length > 5 ? $(cells[5]).text().trim() : '';
    const previous = cells.length > 6 ? $(cells[6]).text().trim() : '';

    if (event && country) {
      events.push({
        time,
        country,
        event,
        importance: importance || 'medium',
        actual: actual || null,
        forecast: forecast || null,
        previous: previous || null,
        source: 'trading-economics'
      });
    }
  });

  return events;
}

// -- Investing.com 采集 ----------------------------------------------------

async function collectInvestingCalendar() {
  const url = 'https://www.investing.com/economic-calendar/';
  const html = await fetchText(url, 15000);
  const $ = cheerio.load(html);

  const events = [];
  $('table#economicCalendarData tbody tr').each((_, row) => {
    const $row = $(row);
    const cells = $row.find('td');
    if (cells.length < 5) return;

    const time = $(cells[0]).text().trim();
    const country = $(cells[1]).find('span').attr('title') || $(cells[1]).text().trim();
    const importance = $(cells[2]).text().trim();
    const event = $(cells[3]).text().trim();
    const actual = cells.length > 4 ? $(cells[4]).text().trim() : '';
    const forecast = cells.length > 5 ? $(cells[5]).text().trim() : '';
    const previous = cells.length > 6 ? $(cells[6]).text().trim() : '';

    if (event) {
      events.push({
        time,
        country,
        event,
        importance: importance || 'medium',
        actual: actual || null,
        forecast: forecast || null,
        previous: previous || null,
        source: 'investing-calendar'
      });
    }
  });

  return events;
}

// -- ForexFactory 采集 -----------------------------------------------------

async function collectForexFactory() {
  const url = 'https://www.forexfactory.com/calendar';
  const html = await fetchText(url, 15000);
  const $ = cheerio.load(html);

  const events = [];
  $('tr.calendar__row').each((_, row) => {
    const $row = $(row);
    const time = $row.find('.calendar__time').text().trim();
    const currency = $row.find('.calendar__currency').text().trim();
    const impact = $row.find('.calendar__impact').text().trim();
    const event = $row.find('.calendar__event').text().trim();
    const actual = $row.find('.calendar__actual').text().trim();
    const forecast = $row.find('.calendar__forecast').text().trim();
    const previous = $row.find('.calendar__previous').text().trim();

    if (event && currency) {
      events.push({
        time,
        country: currency,
        event,
        importance: impact || 'medium',
        actual: actual || null,
        forecast: forecast || null,
        previous: previous || null,
        source: 'forexfactory'
      });
    }
  });

  return events;
}

// -- 主流程 ----------------------------------------------------------------

async function main() {
  const sources = await loadSourcesByCategory('calendar');
  log('calendar', `开始采集 ${sources.length} 个经济日历源`);

  const collectors = {
    'trading-economics': collectTradingEconomics,
    'investing-calendar': collectInvestingCalendar,
    'forexfactory': collectForexFactory
  };

  const results = await Promise.allSettled(
    sources.map(async source => {
      const collector = collectors[source.id];
      if (!collector) {
        log(source.id, '无对应采集器，跳过');
        return { sourceId: source.id, events: [] };
      }
      try {
        const events = await collector();
        log(source.id, `采集到 ${events.length} 条日历`);
        return { sourceId: source.id, events };
      } catch (err) {
        log(source.id, `采集失败: ${err.message}`);
        return { sourceId: source.id, events: [], error: err.message };
      }
    })
  );

  const allEvents = [];
  const errors = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allEvents.push(...result.value.events);
      if (result.value.error) {
        errors.push({ sourceId: result.value.sourceId, error: result.value.error });
      }
    } else {
      errors.push({ error: result.reason?.message || 'unknown' });
    }
  }

  // 去重: 按 (country + event) 去重，保留第一个来源
  const seen = new Set();
  const deduped = allEvents.filter(e => {
    const key = `${e.country}|${e.event}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  log('calendar', `总计 ${deduped.length} 条日历 (去重前 ${allEvents.length}), ${errors.length} 个错误`);
  console.log(JSON.stringify({ events: deduped, errors }, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({ events: [], errors: [{ error: err.message }] }));
  process.exit(1);
});
