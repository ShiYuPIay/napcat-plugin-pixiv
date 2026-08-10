import { getConfig } from '../../config.ts';
import type { PixivItem } from '../../types.ts';
import { fetchJson } from '../http.ts';
import { applyContentPolicy, proxyImageUrl } from './common.ts';

interface LoliconItem {
  pid?: string | number;
  title?: string;
  author?: string;
  r18?: boolean;
  aiType?: number;
  tags?: string[];
  urls?: {
    regular?: string;
    original?: string;
  };
}

interface LoliconResponse {
  error?: string;
  data?: LoliconItem[];
}

export function mapLoliconItem(item: LoliconItem): PixivItem {
  return {
    pid: String(item.pid ?? ''),
    title: item.title || '未知标题',
    author: item.author || '未知作者',
    url: proxyImageUrl(item.urls?.regular ?? item.urls?.original),
    tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    r18: Boolean(item.r18),
    ai: item.aiType === 2,
  };
}

async function request(extra: Record<string, unknown> = {}): Promise<PixivItem[]> {
  const config = getConfig();
  const body = {
    r18: config.r18,
    num: config.num,
    size: ['regular'],
    excludeAI: config.excludeAI,
    proxy: config.imageProxy,
    ...extra,
  };

  const json = await fetchJson<LoliconResponse>('Lolicon', config.loliconApi, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (json.error) throw new Error(`Lolicon API error: ${json.error}`);
  return applyContentPolicy((json.data ?? []).map(mapLoliconItem));
}

export function fetchRecommend(): Promise<PixivItem[]> {
  return request();
}

export function fetchSearch(keyword: string): Promise<PixivItem[]> {
  return request({ keyword });
}

export async function checkLolicon(): Promise<void> {
  const config = getConfig();
  await fetchJson<LoliconResponse>('Lolicon', config.loliconApi, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ num: 1, r18: 0 }),
  });
}
