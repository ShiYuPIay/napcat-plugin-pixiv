import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { applyConfig, resetConfig } from '../src/config.ts';
import { clearCooldowns } from '../src/core/cooldown.ts';
import { handleMessage } from '../src/handlers/message-handler.ts';
import type {
  BotAdapter,
  ForwardNode,
  Id,
  MessageSegment,
} from '../src/types.ts';

class FakeBot implements BotAdapter {
  groupMessages: Array<{ groupId: Id; message: string | MessageSegment[] }> = [];
  privateMessages: Array<{ userId: Id; message: string | MessageSegment[] }> = [];
  forwards: Array<{ groupId: Id; nodes: ForwardNode[] }> = [];
  privateForwards: Array<{ userId: Id; nodes: ForwardNode[] }> = [];

  async sendGroupMessage(groupId: Id, message: string | MessageSegment[]): Promise<void> {
    this.groupMessages.push({ groupId, message });
  }

  async sendPrivateMessage(userId: Id, message: string | MessageSegment[]): Promise<void> {
    this.privateMessages.push({ userId, message });
  }

  async sendGroupForwardMessage(groupId: Id, nodes: ForwardNode[]): Promise<void> {
    this.forwards.push({ groupId, nodes });
  }

  async sendPrivateForwardMessage(userId: Id, nodes: ForwardNode[]): Promise<void> {
    this.privateForwards.push({ userId, nodes });
  }
}

function textOf(message: string | MessageSegment[]): string {
  if (typeof message === 'string') return message;
  return message
    .filter((segment) => segment.type === 'text')
    .map((segment) => String(segment.data.text ?? ''))
    .join('');
}

beforeEach(() => {
  resetConfig();
  clearCooldowns();
  applyConfig({ rateLimitSecs: 0 });
});

test('help works without an upstream request', async () => {
  const bot = new FakeBot();
  await handleMessage({
    message_type: 'group',
    group_id: '1',
    user_id: '2',
    raw_message: '#pixiv帮助',
  }, bot);

  assert.equal(bot.groupMessages.length, 1);
  assert.match(textOf(bot.groupMessages[0].message), /Pixiv 插件使用指南/);
});

test('blocked keyword is rejected before calling upstream', async () => {
  const bot = new FakeBot();
  await handleMessage({
    message_type: 'group',
    group_id: 1,
    user_id: 2,
    raw_message: '#pixiv ＬＯＬＩ',
  }, bot);

  assert.equal(bot.groupMessages.length, 1);
  assert.equal(textOf(bot.groupMessages[0].message), '该关键词已被屏蔽');
});

test('private ping receives an immediate reply', async () => {
  const bot = new FakeBot();
  await handleMessage({
    post_type: 'message',
    message_type: 'private',
    user_id: '2',
    raw_message: '#pixivping',
  }, bot);

  assert.equal(bot.privateMessages.length, 1);
  assert.match(textOf(bot.privateMessages[0].message), /Pixiv 插件在线/);
});

test('structured OneBot message ignores leading at segment and recognizes command', async () => {
  const bot = new FakeBot();
  await handleMessage({
    post_type: 'message',
    message_type: 'group',
    group_id: '1',
    user_id: '2',
    raw_message: '[CQ:at,qq=10000] #pixivping',
    message: [
      { type: 'at', data: { qq: '10000' } },
      { type: 'text', data: { text: ' #pixivping' } },
    ],
  }, bot);

  assert.equal(bot.groupMessages.length, 1);
  assert.match(textOf(bot.groupMessages[0].message), /QQ 消息收发正常/);
});

test('CQ-string message ignores leading at code and recognizes command', async () => {
  const bot = new FakeBot();
  await handleMessage({
    post_type: 'message',
    message_type: 'group',
    group_id: '1',
    user_id: '2',
    raw_message: '[CQ:at,qq=10000] #pixivping',
    message: '[CQ:at,qq=10000] #pixivping',
  }, bot);

  assert.equal(bot.groupMessages.length, 1);
  assert.match(textOf(bot.groupMessages[0].message), /QQ 消息收发正常/);
});

test('unrelated text is ignored', async () => {
  const bot = new FakeBot();
  await handleMessage({
    message_type: 'group',
    group_id: 1,
    user_id: 2,
    raw_message: 'hello',
  }, bot);
  assert.equal(bot.groupMessages.length, 0);
  assert.equal(bot.privateMessages.length, 0);
});
