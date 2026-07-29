'use strict';

module.exports = {
  // ── NapCat WebSocket ────────────────────────────────────────────────────
  wsUrl: process.env.NAPCAT_WS_URL || 'ws://127.0.0.1:3001',
  wsToken: process.env.NAPCAT_WS_TOKEN || '',

  // ── API endpoints ────────────────────────────────────────────────────────
  loliconApi: 'https://api.lolicon.app/setu/v2',
  pixivRankingApi: 'https://api.obfs.dev/pixiv/illust/ranking',

  // ── Content settings ─────────────────────────────────────────────────────
  // r18: 0 = no R18, 1 = R18 only, 2 = mixed
  r18: Number(process.env.PIXIV_R18 ?? 0),
  excludeAI: process.env.PIXIV_EXCLUDE_AI !== 'false', // default: true
  rankingCount: Number(process.env.PIXIV_RANKING_COUNT ?? 5),

  // Proxy that re-hosts i.pximg.net images without requiring Referer header.
  // Lolicon API will also use this for the URLs it returns.
  imageProxy: process.env.PIXIV_IMAGE_PROXY || 'i.pixiv.re',

  // ── Command prefix ───────────────────────────────────────────────────────
  prefix: '#pixiv',
};
