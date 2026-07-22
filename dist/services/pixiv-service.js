import { Config } from '../config.js';

const LOLICON = 'https://api.lolicon.app/setu/v2';
const RANK    = 'https://api.obfs.dev/api/pixiv/rank';

// i.pximg.net requires Referer: https://www.pixiv.net/
// i.pixiv.re is an open reverse proxy — no auth header needed
function proxyUrl(url) {
  return url ? url.replace('i.pximg.net', 'i.pixiv.re') : null;
}

export async function fetchRecommend() {
  const res = await fetch(LOLICON, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({
      num:       Config.num,
      r18:       Config.r18,
      excludeAI: Config.excludeAI,
    }),
  });
  if (!res.ok) throw new Error(`Lolicon API ${res.status}`);
  const { data } = await res.json();
  return data.map(it => ({
    pid:    it.pid,
    title:  it.title,
    author: it.author,
    url:    proxyUrl(it.urls?.regular || it.urls?.original),
  }));
}

export async function fetchRanking(mode) {
  const res = await fetch(`${RANK}?mode=${mode}&page=1`, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`Ranking API ${res.status}`);
  const json = await res.json();
  const items = (json.illusts || []).slice(0, Config.num);
  return items.map(it => ({
    pid:    it.id,
    title:  it.title,
    author: it.user?.name || '未知作者',
    url:    proxyUrl(it.meta_single_page?.original_image_url || it.image_urls?.large),
  }));
}
