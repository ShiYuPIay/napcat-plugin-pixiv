import { getConfig } from '../config.ts';
import { log } from '../core/logger.ts';
import type {
  BotAdapter,
  ForwardNode,
  Id,
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

export async function sendText(
  bot: BotAdapter,
  groupId: Id,
  text: string,
): Promise<void> {
  await bot.sendGroupMessage(groupId, [
    { type: 'text', data: { text } },
  ]);
}

async function sendOne(
  bot: BotAdapter,
  groupId: Id,
  item: PixivItem,
): Promise<void> {
  const segments = itemSegments(item);
  try {
    await bot.sendGroupMessage(groupId, segments);
  } catch (error) {
    if (!item.url) throw error;
    log.warn(`图片发送失败，降级为文字：${error instanceof Error ? error.message : String(error)}`);
    await bot.sendGroupMessage(groupId, [
      { type: 'text', data: { text: `${caption(item)}\nhttps://www.pixiv.net/artworks/${item.pid}` } },
    ]);
  }
}

export async function sendItems(
  bot: BotAdapter,
  groupId: Id,
  selfId: Id | undefined,
  items: PixivItem[],
): Promise<void> {
  if (!items.length) return;

  if (getConfig().enableForward) {
    try {
      await bot.sendGroupForwardMessage(groupId, items.map((item) => buildNode(item, selfId)));
      return;
    } catch (error) {
      log.warn(`合并转发失败，回退逐条发送：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const item of items) {
    await sendOne(bot, groupId, item);
  }
}
