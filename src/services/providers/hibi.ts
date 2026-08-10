import { getConfig } from '../../config.ts';
import type { PixivItem } from '../../types.ts';
import { fetchJson } from '../http.ts';
import { applyContentPolicy, proxyImageUrl } from './common.ts';

interface AppApiTag {
  name?: string;
  translated_name?: string;
}

interface AppApiImageUrls {
  large?: string;
  medium?: string;
  original?: string;
}

interface AppApiIllust {
  id?: string | number;
  title?: string;
  user?: { name?: string };
  image_urls?: AppApiImageUrls;
  meta_single_page?: { original_image_url?: string };
  meta_pages?: Array<{ image_urls?: AppApiImageUrls }>;
  tags?: AppApiTag[];
  x_restrict?: number;
  illust_ai_type?: number;
}

interface RankingResponse {
  illusts?: AppApiIllust[];
  data?: AppApiIllust[];
}

interface IllustResponse {
  illust?: AppApiIllust;
  data?: AppApiIllust;
}

export function mapAppApiItem(item: AppApiIllust): PixivItem {
  const tags = (item.tags ?? [])
    .flatMap((tag) => [tag?.name, tag?.translated_name])
    .filter((tag): tag is string => typeof tag === 'string' && Boolean(tag));

  return {
    pid: String(item.id ?? ''),
    title: item.title || '未知标题',
    author: item.user?.name || '未知作者',
    url: proxyImageUrl(
      item.image_urls?.large ??
      item.image_urls?.medium ??
      item.meta_single_page?.original_image_url,
    ),
    tags,
    r18: (item.x_restrict ?? 0) > 0,
    ai: item.illust_ai_type === 2,
  };
}

function endpoint(path: string, params: Record<string, string>): string {
  const base = getConfig().hibiApi.replace(/\/+$/, '');
  const url = new URL(`${base}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

export async function fetchRanking(mode: 'day' | 'week' | 'month'): Promise<PixivItem[]> {
  const json = await fetchJson<RankingResponse>(
    'Pixiv ranking',
    endpoint('rank', { mode, page: '1' }),
  );
  const items = json.illusts ?? json.data ?? [];
  return applyContentPolicy(items.map(mapAppApiItem)).slice(0, getConfig().num);
}

export async function fetchIllust(pid: string): Promise<PixivItem[]> {
  const json = await fetchJson<IllustResponse>(
    'Pixiv illust',
    endpoint('illust', { id: pid }),
  );
  const illust = json.illust ?? json.data;
  if (!illust?.id) return [];

  const [accepted] = applyContentPolicy([mapAppApiItem(illust)]);
  if (!accepted) return [];

  const pageUrls = illust.meta_pages?.length
    ? illust.meta_pages.map((page) =>
        page.image_urls?.large ??
        page.image_urls?.medium ??
        page.image_urls?.original,
      )
    : [
        illust.image_urls?.large ??
        illust.image_urls?.medium ??
        illust.meta_single_page?.original_image_url,
      ];

  const total = pageUrls.length;
  return pageUrls.slice(0, getConfig().num).map((url, index) => ({
    ...accepted,
    title: total > 1 ? `${accepted.title} (${index + 1}/${total})` : accepted.title,
    url: proxyImageUrl(url),
  }));
}

export async function fetchMemberIllusts(uid: string): Promise<PixivItem[]> {
  const json = await fetchJson<RankingResponse>(
    'Pixiv member',
    endpoint('member_illust', { id: uid }),
  );
  const items = json.illusts ?? json.data ?? [];
  return applyContentPolicy(items.map(mapAppApiItem)).slice(0, getConfig().num);
}

export async function checkHibi(): Promise<void> {
  await fetchJson<RankingResponse>(
    'Pixiv ranking',
    endpoint('rank', { mode: 'day', page: '1' }),
  );
}
