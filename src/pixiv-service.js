'use strict';

const config = require('../config');

/**
 * Fetch one illustration from the Lolicon API.
 * @param {object}  opts
 * @param {string}  [opts.keyword='']  Search keyword; empty = random.
 * @param {number}  [opts.num=1]       Number of results (1–20).
 * @returns {Promise<{id,title,author,url,tags}|null>}
 */
async function getIllust({ keyword = '', num = 1 } = {}) {
  const body = {
    r18: config.r18,
    num,
    size: ['regular'],
    excludeAI: config.excludeAI,
    proxy: config.imageProxy, // Lolicon will return URLs under this host
  };
  if (keyword) body.keyword = keyword;

  let res;
  try {
    res = await fetch(config.loliconApi, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error('[Pixiv] Lolicon API unreachable:', err.message);
    return null;
  }

  if (!res.ok) {
    console.error('[Pixiv] Lolicon API error:', res.status);
    return null;
  }

  const json = await res.json();
  const item = json?.data?.[0];
  if (!item) return null;

  return {
    id: item.pid,
    title: item.title,
    author: item.author,
    url: item.urls?.regular ?? item.urls?.original ?? '',
    tags: item.tags ?? [],
  };
}

/**
 * Fetch ranking illustrations from the obfs.dev Pixiv proxy.
 * @param {'day'|'week'|'month'} mode
 * @param {number}               count  Max items to return.
 * @returns {Promise<Array<{id,title,author,url}>|null>}
 */
async function getRanking(mode, count = 5) {
  const url = `${config.pixivRankingApi}?mode=${mode}&page=1`;

  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    console.error('[Pixiv] Ranking API unreachable:', err.message);
    return null;
  }

  if (!res.ok) {
    console.error('[Pixiv] Ranking API error:', res.status);
    return null;
  }

  const json = await res.json();
  // obfs.dev follows the Pixiv app-API shape: { illusts: [...] }
  const illusts = json?.illusts ?? json?.data ?? [];

  return illusts.slice(0, count).map((item) => ({
    id: item.id,
    title: item.title ?? '未知标题',
    author: item.user?.name ?? '未知',
    url: proxyUrl(
      item.image_urls?.large ??
      item.image_urls?.medium ??
      item.meta_single_page?.original_image_url ??
      ''
    ),
  }));
}

/**
 * Replace Pixiv's CDN host (i.pximg.net) with the configured image proxy.
 * Required because i.pximg.net rejects requests without a Pixiv Referer.
 */
function proxyUrl(url) {
  if (!url || !config.imageProxy) return url;
  return url.replace('i.pximg.net', config.imageProxy);
}

module.exports = { getIllust, getRanking };
