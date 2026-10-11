import { log } from '../core/logger.ts';
import {
  checkHibi,
  fetchIllust,
  fetchMemberIllusts,
  fetchRanking,
  fetchSearch as fetchHibiSearch,
} from './providers/hibi.ts';
import {
  checkLolicon,
  fetchRecommend,
  fetchSearch as fetchLoliconSearch,
} from './providers/lolicon.ts';

export {
  fetchIllust,
  fetchMemberIllusts,
  fetchRanking,
  fetchRecommend,
};

function providerFailure(label: string, error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const status = /\bHTTP\s+(\d{3})\b/i.exec(message)?.[1];
  if (status) return `${label} HTTP ${status}`;
  if (/timeout|abort/i.test(message)) return `${label} timed out`;
  if (/API error/i.test(message)) return `${label} API error`;
  return `${label} request failed`;
}

class SearchProvidersUnavailableError extends Error {
  constructor(primaryError: unknown, fallbackError: unknown) {
    super(
      `Search providers unavailable: ${providerFailure('Lolicon', primaryError)}; ` +
      `${providerFailure('Pixiv/Hibi', fallbackError)}`,
    );
    this.name = 'SearchProvidersUnavailableError';
  }
}

export async function fetchSearch(keyword: string) {
  try {
    return await fetchLoliconSearch(keyword);
  } catch (primaryError) {
    try {
      const items = await fetchHibiSearch(keyword);
      log.warn(`Lolicon 搜索失败（${providerFailure('Lolicon', primaryError)}），已切换到 Pixiv/Hibi 搜索回退`);
      return items;
    } catch (fallbackError) {
      throw new SearchProvidersUnavailableError(primaryError, fallbackError);
    }
  }
}

function diagnosticFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const status = /\bHTTP\s+(\d{3})\b/i.exec(message)?.[1];
  if (status) return `HTTP ${status}`;
  if (/timeout|abort/i.test(message)) return '请求超时';
  if (/rate.?limit|quota|too many requests/i.test(message)) return '上游请求受限';
  if (/unauthori[sz]ed|forbidden|invalid.*(?:token|key)|authentication|auth/i.test(message)) return '上游鉴权失败';
  if (/invalid JSON|malformed|unexpected JSON/i.test(message)) return '上游响应格式错误';
  if (/API error/i.test(message)) return '上游 API 返回错误';
  if (/fetch failed|econn|enotfound|network/i.test(message)) return '网络请求失败';
  return '请求失败';
}

export async function checkApis(): Promise<string> {
  async function check(label: string, action: () => Promise<void>): Promise<string> {
    try {
      await action();
      return `${label} ✅`;
    } catch (error) {
      return `${label} ❌ ${diagnosticFailure(error)}`;
    }
  }

  const results = await Promise.all([
    check('Lolicon', checkLolicon),
    check('Pixiv/Hibi', checkHibi),
  ]);
  return results.join('\n');
}
