'use strict';

const config = require('../config');
const pixivService = require('../services/pixiv-service');

const { prefix } = config;

// Ranking command → API mode mapping
const RANKING_CMDS = {
  [`${prefix}日榜`]: 'day',
  [`${prefix}周榜`]: 'week',
  [`${prefix}月榜`]: 'month',
};

/**
 * Entry point called for every incoming message event.
 *
 * Routing order (all under a single prefix guard — no early-exit issues):
 *   1. Ranking commands  (#pixiv日榜 / 周榜 / 月榜)
 *   2. Help              (#pixiv帮助)
 *   3. Search / random   (#pixiv [keyword])
 */
async function handleMessage(event, send) {
  const msg = event.raw_message.trim();

  // Single guard: ignore anything that isn't our command prefix
  if (!msg.startsWith(prefix)) return;

  // ── Ranking commands ────────────────────────────────────────────────────
  if (msg in RANKING_CMDS) {
    return handleRanking(RANKING_CMDS[msg], send);
  }

  // ── Help ────────────────────────────────────────────────────────────────
  if (msg === `${prefix}帮助`) {
    return handleHelp(send);
  }

  // ── Search / random fallback ────────────────────────────────────────────
  // Strip the prefix, then strip a leading "随机" so both
  // "#pixiv" and "#pixiv随机" behave as random requests.
  const raw = msg.slice(prefix.length).trim();
  const keyword = raw.startsWith('随机') ? raw.slice(2).trim() : raw;
  return handleSearch(keyword, send);
}

// ── Individual handlers ────────────────────────────────────────────────────

function handleHelp(send) {
  send(
    [
      '📖 Pixiv插件指令',
      `${prefix} — 随机一张插图`,
      `${prefix} <关键词> — 搜索插图`,
      `${prefix}随机 — 随机一张插图`,
      `${prefix}日榜 — 今日排行 TOP ${config.rankingCount}`,
      `${prefix}周榜 — 本周排行 TOP ${config.rankingCount}`,
      `${prefix}月榜 — 本月排行 TOP ${config.rankingCount}`,
      `${prefix}帮助 — 显示本帮助`,
    ].join('\n')
  );
}

async function handleSearch(keyword, send) {
  const result = await pixivService.getIllust({ keyword });
  if (!result) {
    const label = keyword ? `"${keyword}"相关的插图` : '随机插图';
    return send(`❌ 获取${label}失败，请稍后再试`);
  }
  send(formatIllust(result));
}

async function handleRanking(mode, send) {
  const modeLabel = { day: '日榜', week: '周榜', month: '月榜' }[mode];

  const items = await pixivService.getRanking(mode, config.rankingCount);
  if (!items?.length) {
    return send(`❌ 获取${modeLabel}失败，请稍后再试`);
  }

  const valid = await checkImages(items);
  if (!valid.length) {
    return send(`❌ ${modeLabel}图片暂时无法访问`);
  }

  const lines = [`📊 Pixiv${modeLabel} TOP ${valid.length}`];
  for (let i = 0; i < valid.length; i++) {
    const { title, author, url } = valid[i];
    lines.push(`\n第${i + 1}名: ${title}  by ${author}`);
    if (url) lines.push(`[CQ:image,file=${url}]`);
  }
  send(lines.join('\n'));
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parallel HEAD-check for all items. Returns only the reachable ones.
 * Using Promise.all instead of sequential awaits for speed.
 */
async function checkImages(items) {
  const results = await Promise.all(
    items.map(async (item) => {
      if (!item.url) return null;
      try {
        const res = await fetch(item.url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5_000),
        });
        return res.ok ? item : null;
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean);
}

function formatIllust({ id, title, author, url, tags }) {
  const tagStr = tags.slice(0, 5).join(' ');
  return [
    `🎨 ${title}`,
    `👤 ${author}`,
    tagStr ? `🏷 ${tagStr}` : null,
    `🔗 https://www.pixiv.net/artworks/${id}`,
    url ? `[CQ:image,file=${url}]` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

module.exports = { handleMessage };
