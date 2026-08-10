import { getConfig, isBlockedText } from '../../config.ts';
import type { PixivItem } from '../../types.ts';

export function proxyImageUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string' || !rawUrl) return null;
  const { imageProxy } = getConfig();

  try {
    const url = new URL(rawUrl);
    if (url.hostname === 'i.pximg.net' && imageProxy) {
      const [host, port] = imageProxy.split(':');
      url.hostname = host;
      if (port) url.port = port;
    }
    return url.toString();
  } catch {
    return rawUrl.replace('i.pximg.net', imageProxy);
  }
}

export function applyContentPolicy(items: PixivItem[]): PixivItem[] {
  const config = getConfig();
  return items.filter((item) => {
    if (config.r18 === 0 && item.r18) return false;
    if (config.r18 === 1 && !item.r18) return false;
    if (config.excludeAI && item.ai) return false;
    if (isBlockedText(item.title)) return false;
    return !item.tags.some(isBlockedText);
  });
}
