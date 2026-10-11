import { getConfig } from '../config.ts';
import { log } from '../core/logger.ts';
import type {
  BotAdapter,
  ForwardNode,
  Id,
  MessageEvent,
  MessageSegment,
  PixivItem,
} from '../types.ts';

export type SendItemsResult = {
  total: number;
  delivered: number;
  failed: number;
};

function caption(item: PixivItem): string {
  return `${item.title} - ${item.author}\npid: ${item.pid}`;
}

function pixivLink(item: PixivItem): string {
  return /^\d+$/.test(item.pid)
    ? `\nhttps://www.pixiv.net/artworks/${item.pid}`
    : '';
}

function textFallback(item: PixivItem): string {
  return `${caption(item)}${pixivLink(item)}`;
}

function itemSegments(item: PixivItem): MessageSegment[] {
  if (!item.url) {
    return [{ type: 'text', data: { text: textFallback(item) } }];
  }
  return [
    { type: 'text', data: { text: caption(item) } },
    { type: 'image', data: { file: item.url } },
  ];
}

function buildNode(item: PixivItem, selfId: Id | undefined): ForwardNode {
  const nickname = item.author || 'Pixiv';
  const userId = String(selfId ?? '10000');
  return {
    type: 'node',
    data: {
      user_id: userId,
      nickname,
      uin: userId,
      name: nickname,
      content: itemSegments(item),
    },
  };
}

function requireTarget(event: MessageEvent): { type: 'group' | 'private'; id: Id } {
  if (event.message_type === 'group' && event.group_id !== undefined) {
    return { type: 'group', id: event.group_id };
  }
  if (event.message_type === 'private' && event.user_id !== undefined) {
    return { type: 'private', id: event.user_id };
  }
  throw new Error(`Unsupported message target: ${String(event.message_type ?? 'unknown')}`);
}

async function sendMessage(
  bot: BotAdapter,
  event: MessageEvent,
  message: string | MessageSegment[],
): Promise<void> {
  const target = requireTarget(event);
  if (target.type === 'group') {
    await bot.sendGroupMessage(target.id, message);
  } else {
    await bot.sendPrivateMessage(target.id, message);
  }
}

async function sendMergedForward(
  bot: BotAdapter,
  event: MessageEvent,
  items: PixivItem[],
): Promise<void> {
  const target = requireTarget(event);
  const nodes = items.map((item) => buildNode(item, event.self_id));
  if (target.type === 'group') {
    await bot.sendGroupForwardMessage(target.id, nodes);
  } else {
    await bot.sendPrivateForwardMessage(target.id, nodes);
  }
}

export async function sendText(
  bot: BotAdapter,
  event: MessageEvent,
  text: string,
): Promise<void> {
  await sendMessage(bot, event, [
    { type: 'text', data: { text } },
  ]);
}

async function sendOne(
  bot: BotAdapter,
  event: MessageEvent,
  item: PixivItem,
): Promise<boolean> {
  if (!item.url) {
    try {
      await sendMessage(bot, event, [{ type: 'text', data: { text: textFallback(item) } }]);
      return true;
    } catch (error) {
      log.warn(`作品文字发送失败：${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  try {
    await sendMessage(bot, event, itemSegments(item));
    return true;
  } catch (error) {
    log.warn(`图片发送失败，降级为文字：${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    await sendMessage(bot, event, [{ type: 'text', data: { text: textFallback(item) } }]);
    return true;
  } catch (error) {
    log.warn(`作品文字回退发送失败：${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

export async function sendItems(
  bot: BotAdapter,
  event: MessageEvent,
  items: PixivItem[],
): Promise<SendItemsResult> {
  if (!items.length) return { total: 0, delivered: 0, failed: 0 };

  // A single result is sent directly; forwarding is only useful for multiple results.
  if (items.length >= 2 && getConfig().enableForward) {
    try {
      await sendMergedForward(bot, event, items);
      log.info(`已发送 ${items.length} 张图片的合并转发`);
      return { total: items.length, delivered: items.length, failed: 0 };
    } catch (error) {
      log.warn(`多图合并转发失败，回退逐条发送：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let delivered = 0;
  for (const item of items) {
    try {
      if (await sendOne(bot, event, item)) delivered += 1;
    } catch (error) {
      // Keep one malformed target or adapter failure from discarding later works.
      log.warn(`跳过无法发送的作品：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const failed = items.length - delivered;
  if (failed > 0) log.warn(`有 ${failed}/${items.length} 个作品未能发送`);
  return { total: items.length, delivered, failed };
}
