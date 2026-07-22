import { Config } from '../config.js';

const LOLICON = 'https://api.lolicon.app/setu/v2';
const RANK    = 'https://api.obfs.dev/api/pixiv/rank';

// i.pximg.net requires Referer: https://www.pixiv.net/
// i.pixiv.re is an open reverse proxy — no auth header needed
function proxyUrl(url) {
  return url ? url.replace('i.pximg.net', 'i.pixiv.re') : null;
}

function normalizeLolicon(it) {
  return {
    pid:    it.pid,
    title:  it.title,
    author: it.author,
    url:    proxyUrl(it.urls?.regular || it.urls?.original),
  };
}

/** Shared Lolicon POST helper. Pass extra body fields via `extra`. */
async function lolicon(extra = {}) {
  const res = await fetch(LOLICON, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    signal:  AbortSignal.timeout(8_000),
    body:    JSON.stringify({
      num:       Config.num,
      r18:       Config.r18,
      excludeAI: Config.excludeAI,
      ...extra,
    }),
  });
  if (!res.ok) throw new Error(`Lolicon ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return (json.data || []).map(normalizeLolicon);
}

/** Random recommendations. */
export const fetchRecommend = () => lolicon();

/** Tag-based keyword search. */
export const fetchSearch = (keyword) => lolicon({ tag: [keyword] });

/** Pixiv ranking (mode: 'day' | 'week' | 'month'). */
export async function fetchRanking(mode) {
  const res = await fetch(`${RANK}?mode=${mode}&page=1`, {
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Ranking ${res.status}`);
  const json = await res.json();
  return (json.illusts || []).slice(0, Config.num).map(it => ({
    pid:    it.id,
    title:  it.title,
    author: it.user?.name || '未知作者',
    url:    proxyUrl(it.meta_single_page?.original_image_url || it.image_urls?.large),
  }));
}

/** Ping both upstream APIs and return a human-readable status string. */
export async function checkApis() {
  async function ping(label, fn) {
    try   { await fn(); return `${label} ✅`; }
    catch (e) { return `${label} ❌ ${e.message}`; }
  }
  const results = await Promise.all([
    ping('Lolicon', () => fetch(LOLICON, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5_000), body: JSON.stringify({ num: 1 }),
    })),
    ping('Ranking', () => fetch(`${RANK}?mode=day&page=1`, {
      signal: AbortSignal.timeout(5_000),
    })),
  ]);
  return results.join('\n');
}
