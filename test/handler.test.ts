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
  forwards: Array<{ groupId: Id; nodes: ForwardNode[] }> = [];

  async sendGroupMessage(groupId: Id, message: string | MessageSegment[]): Promise<void> {
    this.groupMessages.push({ groupId, message });
  }

  async sendGroupForwardMessage(groupId: Id, nodes: ForwardNode[]): Promise<void> {
    this.forwards.push({ groupId, nodes });
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

test('private messages and unrelated text are ignored', async () => {
  const bot = new FakeBot();
  await handleMessage({
    message_type: 'private',
    user_id: 2,
    raw_message: '#pixiv帮助',
  }, bot);
  await handleMessage({
    message_type: 'group',
    group_id: 1,
    user_id: 2,
    raw_message: 'hello',
  }, bot);
  assert.equal(bot.groupMessages.length, 0);
});
