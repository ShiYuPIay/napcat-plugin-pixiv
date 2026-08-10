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

function item(pid: string): PixivItem {
  return {
    pid,
    title: `title-${pid}`,
    author: 'author',
    url: `https://example.com/${pid}.jpg`,
    tags: [],
    r18: false,
    ai: false,
  };
}

class FakeBot implements BotAdapter {
  groupMessages: Array<{ id: Id; message: string | MessageSegment[] }> = [];
  privateMessages: Array<{ id: Id; message: string | MessageSegment[] }> = [];
  groupForwards: Array<{ id: Id; nodes: ForwardNode[] }> = [];
  privateForwards: Array<{ id: Id; nodes: ForwardNode[] }> = [];
  failForward = false;

  async sendGroupMessage(id: Id, message: string | MessageSegment[]): Promise<void> {
    this.groupMessages.push({ id, message });
  }

  async sendPrivateMessage(id: Id, message: string | MessageSegment[]): Promise<void> {
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
  await sendItems(bot, {
    message_type: 'group',
    group_id: '100',
    self_id: '200',
  }, [item('1'), item('2'), item('3')]);

  assert.equal(bot.groupForwards.length, 1);
  assert.equal(bot.groupForwards[0].nodes.length, 3);
  assert.equal(bot.groupMessages.length, 0);
});

test('single image is sent directly instead of wrapping it in a forward', async () => {
  const bot = new FakeBot();
  await sendItems(bot, {
    message_type: 'group',
    group_id: '100',
    self_id: '200',
  }, [item('1')]);

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
