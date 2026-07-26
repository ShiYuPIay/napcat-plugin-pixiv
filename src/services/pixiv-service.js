import { Config, isBlockedText } from '../config.js';

const LOLICON = 'https://api.lolicon.app/setu/v2';
const HIBI    = 'https://api.obfs.dev/api/pixiv';
const TIMEOUT = 8_000;

// i.pximg.net requires Referer: https://www.pixiv.net/
// i.pixiv.re is an open reverse proxy — no auth header needed
function proxyUrl(url) {
  return url ? url.replace('i.pximg.net', 'i.pixiv.re') : null;
}

async function getJson(label, url, init = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), ...init });
  if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
  return res.json();
}

// ── Response mappers (pure, exported for tests) ───────────────────────────────

/** Lolicon /setu/v2 item → internal illust shape. */
export function mapLoliconItem(it) {
  return {
    pid:    it.pid,
    title:  it.title,
    author: it.author || '未知作者',
    url:    proxyUrl(it.urls?.regular || it.urls?.original),
    tags:   Array.isArray(it.tags) ? it.tags : [],
    r18:    !!it.r18,
    ai:     it.aiType === 2,
  };
}

/** Pixiv app-API illust (HibiAPI passthrough) → internal illust shape. */
export function mapAppApiItem(it) {
  return {
    pid:    it.id,
    title:  it.title,
    // Prefer `large` over the original: originals can be tens of MB and are
    // the main cause of Highway upload failures.
    author: it.user?.name || '未知作者',
    url:    proxyUrl(it.image_urls?.large || it.meta_single_page?.original_image_url),
    tags:   (it.tags ?? []).flatMap(t => [t?.name, t?.translated_name]).filter(Boolean),
    r18:    (it.x_restrict ?? 0) > 0,
    ai:     it.illust_ai_type === 2,
  };
}

/**
 * Content policy applied to everything we send, regardless of source:
 * blocked keywords match tags/title; R18 dropped unless enabled; AI optional.
 */
export function applyPolicy(items) {
  return items.filter(it =>
    !(Config.r18 === 0 && it.r18) &&
    !(Config.excludeAI && it.ai) &&
    !isBlockedText(it.title) &&
    !it.tags.some(isBlockedText)
  );
}

// ── Lolicon (recommend / search) ──────────────────────────────────────────────

/** Shared Lolicon POST helper. Pass extra body fields via `extra`. */
async function lolicon(extra = {}) {
  const json = await getJson('Lolicon', LOLICON, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      num:       Config.num,
      r18:       Config.r18,
      excludeAI: Config.excludeAI,
      ...extra,
    }),
  });
  if (json.error) throw new Error(json.error);
  return applyPolicy((json.data || []).map(mapLoliconItem));
}

/** Random recommendations. */
export const fetchRecommend = () => lolicon();

/** Tag-based keyword search. */
export const fetchSearch = (keyword) => lolicon({ tag: [keyword] });

// ── HibiAPI (ranking / illust / member) ───────────────────────────────────────

/** Pixiv ranking (mode: 'day' | 'week' | 'month'). */
export async function fetchRanking(mode) {
  const json = await getJson('Ranking', `${HIBI}/rank?mode=${mode}&page=1`);
  return applyPolicy((json.illusts || []).map(mapAppApiItem)).slice(0, Config.num);
}

/** Single illust by pid; multi-page works expand to at most Config.num pages. */
export async function fetchIllust(pid) {
  const json = await getJson('Illust', `${HIBI}/illust?id=${pid}`);
  const il = json.illust;
  if (!il?.id) return [];
  const [item] = applyPolicy([mapAppApiItem(il)]);
  if (!item) return []; // rejected by content policy
  const pages = il.meta_pages?.length
    ? il.meta_pages.map(p => p.image_urls?.large || p.image_urls?.original)
    : [il.image_urls?.large || il.meta_single_page?.original_image_url];
  const total = pages.length;
  return pages.slice(0, Config.num).map((u, i) => ({
    ...item,
    title: total > 1 ? `${item.title} (${i + 1}/${total})` : item.title,
    url:   proxyUrl(u),
  }));
}

/** Recent works of one artist (Pixiv member id). */
export async function fetchMemberIllusts(uid) {
  const json = await getJson('Member', `${HIBI}/member_illust?id=${uid}`);
  return applyPolicy((json.illusts || []).map(mapAppApiItem)).slice(0, Config.num);
}

// ── Health check ──────────────────────────────────────────────────────────────

/** Ping both upstream APIs and return a human-readable status string. */
export async function checkApis() {
  async function ping(label, fn) {
    try {
      await fn();
      return `${label} ✅`;
    } catch (e) {
      return `${label} ❌ ${e.message}`;
    }
  }
  const results = await Promise.all([
    ping('Lolicon', () => getJson('Lolicon', LOLICON, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ num: 1 }),
    })),
    ping('Ranking', () => getJson('Ranking', `${HIBI}/rank?mode=day&page=1`)),
  ]);
  return results.join('\n');
}
