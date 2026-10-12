import { getConfig, isBlockedText } from '../../config.ts';
import type { PixivItem } from '../../types.ts';

function configuredProxyUrl(value: string): URL | null {
  try {
    return new URL(`https://${value}`);
  } catch {
    return null;
  }
}

export function proxyImageUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string' || !rawUrl) return null;
  const { imageProxy } = getConfig();

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  // The OneBot image `file` field may make the bot server fetch arbitrary URLs.
  // Only trust Pixiv's CDN and the proxy host explicitly configured by an admin.
  if (url.protocol !== 'https:' || url.username || url.password) return null;

  if (url.hostname.toLowerCase() === 'i.pximg.net') {
    if (url.port) return null;
    if (imageProxy) {
      const proxy = configuredProxyUrl(imageProxy);
      if (!proxy) return null;
      url.hostname = proxy.hostname;
      url.port = proxy.port;
    }
    return url.toString();
  }

  const proxy = configuredProxyUrl(imageProxy);
  if (
    proxy
    && url.hostname.toLowerCase() === proxy.hostname.toLowerCase()
    && url.port === proxy.port
  ) {
    return url.toString();
  }

  return null;
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
