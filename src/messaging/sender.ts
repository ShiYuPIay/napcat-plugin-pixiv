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

function caption(item: PixivItem): string {
  return `${item.title} - ${item.author}\npid: ${item.pid}`;
}

function itemSegments(item: PixivItem): MessageSegment[] {
  const content: MessageSegment[] = [
    { type: 'text', data: { text: caption(item) } },
  ];
  if (item.url) {
    content.push({ type: 'image', data: { file: item.url } });
  }
  return content;
}

function buildNode(item: PixivItem, selfId: Id | undefined): ForwardNode {
  return {
    type: 'node',
    data: {
      name: item.author || 'Pixiv',
      uin: String(selfId ?? '10000'),
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
): Promise<void> {
  const segments = itemSegments(item);
  try {
    await sendMessage(bot, event, segments);
  } catch (error) {
    if (!item.url) throw error;
    log.warn(`图片发送失败，降级为文字：${error instanceof Error ? error.message : String(error)}`);
    await sendMessage(bot, event, [
      { type: 'text', data: { text: `${caption(item)}\nhttps://www.pixiv.net/artworks/${item.pid}` } },
    ]);
  }
}

export async function sendItems(
  bot: BotAdapter,
  event: MessageEvent,
  items: PixivItem[],
): Promise<void> {
  if (!items.length) return;

  // 单图直接发送；两张及以上才使用合并转发，避免“只有一张图也套一层转发”。
  if (items.length >= 2 && getConfig().enableForward) {
    try {
      await sendMergedForward(bot, event, items);
      log.info(`已发送 ${items.length} 张图片的合并转发`);
      return;
    } catch (error) {
      log.warn(`多图合并转发失败，回退逐条发送：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const item of items) {
    await sendOne(bot, event, item);
  }
}
