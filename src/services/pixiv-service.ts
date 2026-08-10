import type { PixivItem } from '../types.ts';
import {
  checkHibi,
  fetchIllust,
  fetchMemberIllusts,
  fetchRanking,
} from './providers/hibi.ts';
import {
  checkLolicon,
  fetchRecommend,
  fetchSearch,
} from './providers/lolicon.ts';

export {
  fetchIllust,
  fetchMemberIllusts,
  fetchRanking,
  fetchRecommend,
  fetchSearch,
};

export async function checkApis(): Promise<string> {
  async function check(label: string, action: () => Promise<void>): Promise<string> {
    try {
      await action();
      return `${label} ✅`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `${label} ❌ ${message}`;
    }
  }

  const results = await Promise.all([
    check('Lolicon', checkLolicon),
    check('Pixiv/Hibi', checkHibi),
  ]);
  return results.join('\n');
}

export type { PixivItem };
