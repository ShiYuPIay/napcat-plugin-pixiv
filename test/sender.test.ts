import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { applyConfig, resetConfig } from '../src/config.ts';
import { sendItems } from '../src/messaging/sender.ts';
import type {
  BotAdapter,
  ForwardNode,
  Id,
  MessageSegment,
  PixivItem,
} from '../src/types.ts';

function item(pid: string, url: string | null = `https://example.com/${pid}.jpg`): PixivItem {
  return {
    pid,
    title: `title-${pid}`,
    author: 'author',
    url,
    tags: [],
    r18: false,
    ai: false,
  };
}

function textOf(message: string | MessageSegment[]): string {
  if (typeof message === 'string') return message;
  return message
    .filter((segment) => segment.type === 'text')
    .map((segment) => String(segment.data.text ?? ''))
    .join('');
}

class FakeBot implements BotAdapter {
  groupMessages: Array<{ id: Id; message: string | MessageSegment[] }> = [];
  privateMessages: Array<{ id: Id; message: string | MessageSegment[] }> = [];
  groupForwards: Array<{ id: Id; nodes: ForwardNode[] }> = [];
  privateForwards: Array<{ id: Id; nodes: ForwardNode[] }> = [];
  failForward = false;
  failImageUrls = new Set<string>();
  failTextFragments = new Set<string>();

  private shouldFail(message: string | MessageSegment[]): boolean {
    if (typeof message === 'string') {
      return [...this.failTextFragments].some((fragment) => message.includes(fragment));
    }
    for (const segment of message) {
      if (segment.type === 'image' && this.failImageUrls.has(String(segment.data.file))) return true;
    }
    const text = textOf(message);
    return [...this.failTextFragments].some((fragment) => text.includes(fragment));
  }

  async sendGroupMessage(id: Id, message: string | MessageSegment[]): Promise<void> {
    if (this.shouldFail(message)) throw new Error('message send failed');
    this.groupMessages.push({ id, message });
  }

  async sendPrivateMessage(id: Id, message: string | MessageSegment[]): Promise<void> {
    if (this.shouldFail(message)) throw new Error('message send failed');
    this.privateMessages.push({ id, message });
  }

  async sendGroupForwardMessage(id: Id, nodes: ForwardNode[]): Promise<void> {
    if (this.failForward) throw new Error('forward failed');
    this.groupForwards.push({ id, nodes });
  }

  async sendPrivateForwardMessage(id: Id, nodes: ForwardNode[]): Promise<void> {
    if (this.failForward) throw new Error('forward failed');
    this.privateForwards.push({ id, nodes });
  }
}

beforeEach(() => {
  resetConfig();
  applyConfig({ enableForward: true });
});

test('two or more group images are sent as one merged forward', async () => {
  const bot = new FakeBot();
  const result = await sendItems(bot, {
    message_type: 'group',
    group_id: '100',
    self_id: '200',
  }, [item('1'), item('2'), item('3')]);

  assert.deepEqual(result, { total: 3, delivered: 3, failed: 0 });
  assert.equal(bot.groupForwards.length, 1);
  assert.equal(bot.groupForwards[0].nodes.length, 3);
  assert.equal(bot.groupMessages.length, 0);
});

test('single image is sent directly instead of wrapping it in a forward', async () => {
  const bot = new FakeBot();
  const result = await sendItems(bot, {
    message_type: 'group',
    group_id: '100',
    self_id: '200',
  }, [item('1')]);

  assert.deepEqual(result, { total: 1, delivered: 1, failed: 0 });
  assert.equal(bot.groupForwards.length, 0);
  assert.equal(bot.groupMessages.length, 1);
});

test('private multi-image result also uses merged forward when supported', async () => {
  const bot = new FakeBot();
  await sendItems(bot, {
    message_type: 'private',
    user_id: '300',
    self_id: '200',
  }, [item('1'), item('2')]);

  assert.equal(bot.privateForwards.length, 1);
  assert.equal(bot.privateForwards[0].nodes.length, 2);
  assert.equal(bot.privateMessages.length, 0);
});

test('merged-forward failure falls back to individual image messages', async () => {
  const bot = new FakeBot();
  bot.failForward = true;

  await sendItems(bot, {
    message_type: 'group',
    group_id: '100',
    self_id: '200',
  }, [item('1'), item('2')]);

  assert.equal(bot.groupForwards.length, 0);
  assert.equal(bot.groupMessages.length, 2);
});

test('forward nodes preserve title, author and PID metadata', async () => {
  const bot = new FakeBot();
  await sendItems(bot, {
    message_type: 'group',
    group_id: '100',
    self_id: '200',
  }, [item('1'), { ...item('2'), author: '' }]);

  const [first, second] = bot.groupForwards[0].nodes;
  assert.equal(first.data.nickname, 'author');
  assert.equal(first.data.user_id, '200');
  assert.equal(first.data.name, 'author');
  assert.equal(first.data.uin, '200');
  assert.match(textOf(first.data.content), /title-1 - author\npid: 1/);
  assert.ok(second.data.content.length > 0);
  assert.equal(second.data.nickname, 'Pixiv');
});

test('forward nodes fall back to a placeholder sender id when self_id is missing', async () => {
  const bot = new FakeBot();
  await sendItems(bot, { message_type: 'private', user_id: '300' }, [item('1'), item('2')]);
  assert.equal(bot.privateForwards[0].nodes[0].data.user_id, '10000');
});

test('a failed image falls back to a Pixiv link and does not stop later results', async () => {
  const bot = new FakeBot();
  bot.failForward = true;
  bot.failImageUrls.add('https://example.com/1.jpg');

  const result = await sendItems(bot, {
    message_type: 'group',
    group_id: '100',
  }, [item('1'), item('2')]);

  assert.deepEqual(result, { total: 2, delivered: 2, failed: 0 });
  assert.equal(bot.groupMessages.length, 2);
  assert.match(textOf(bot.groupMessages[0].message), /title-1 - author\npid: 1/);
  assert.match(textOf(bot.groupMessages[0].message), /https:\/\/www\.pixiv\.net\/artworks\/1/);
  assert.ok(Array.isArray(bot.groupMessages[1].message));
  assert.ok((bot.groupMessages[1].message as MessageSegment[]).some((segment) => segment.type === 'image'));
});

test('a result without an image URL is delivered as text with a Pixiv link', async () => {
  const bot = new FakeBot();
  const result = await sendItems(bot, {
    message_type: 'private',
    user_id: '300',
  }, [item('9', null)]);

  assert.deepEqual(result, { total: 1, delivered: 1, failed: 0 });
  assert.equal(bot.privateMessages.length, 1);
  assert.match(textOf(bot.privateMessages[0].message), /title-9 - author\npid: 9/);
  assert.match(textOf(bot.privateMessages[0].message), /https:\/\/www\.pixiv\.net\/artworks\/9/);
});

test('a failed text fallback is isolated and later results are still delivered', async () => {
  const bot = new FakeBot();
  bot.failForward = true;
  bot.failImageUrls.add('https://example.com/1.jpg');
  bot.failTextFragments.add('title-1');

  const result = await sendItems(bot, {
    message_type: 'group',
    group_id: '100',
  }, [item('1'), item('2')]);

  assert.deepEqual(result, { total: 2, delivered: 1, failed: 1 });
  assert.equal(bot.groupMessages.length, 1);
  assert.ok((bot.groupMessages[0].message as MessageSegment[]).some((segment) => segment.type === 'image'));
});
