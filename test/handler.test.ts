import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import {
  applyConfig,
  applyEnvironment,
  getConfig,
  resetConfig,
  setConfigPath,
} from '../src/config.ts';
import { clearCooldowns } from '../src/core/cooldown.ts';
import { handleMessage } from '../src/handlers/message-handler.ts';
import type {
  BotAdapter,
  ForwardNode,
  Id,
  MessageEvent,
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

let tempDir = '';
const realFetch = globalThis.fetch;

beforeEach(() => {
  resetConfig();
  setConfigPath(null);
  clearCooldowns();
  applyConfig({ rateLimitSecs: 0 });
  tempDir = mkdtempSync(join(tmpdir(), 'pixiv-handler-'));
});

afterEach(() => {
  setConfigPath(null);
  globalThis.fetch = realFetch;
  rmSync(tempDir, { recursive: true, force: true });
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

test('own sent messages and non-message events are never treated as commands', async () => {
  const bot = new FakeBot();
  for (const post_type of ['message_sent', 'meta_event', 'notice', 'request']) {
    await handleMessage({
      post_type,
      message_type: 'group',
      group_id: '1',
      user_id: '2',
      raw_message: '#pixivping',
    }, bot);
  }
  assert.equal(bot.groupMessages.length, 0);
});

function groupEvent(userId: Id, text: string): MessageEvent {
  return { post_type: 'message', message_type: 'group', group_id: '1', user_id: userId, raw_message: text };
}

function privateEvent(userId: Id, text: string): MessageEvent {
  return { post_type: 'message', message_type: 'private', user_id: userId, raw_message: text };
}

function groupTexts(bot: FakeBot): string[] {
  return bot.groupMessages.map(({ message }) => textOf(message));
}

function useConfigFile(content?: unknown): string {
  const file = join(tempDir, 'config.json');
  if (content !== undefined) {
    writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  }
  setConfigPath(file);
  return file;
}

const NOT_ADMIN = '仅管理员可查看/修改插件配置';

test('settings: a non-admin can neither read, change nor reload anything', async () => {
  const file = useConfigFile();
  applyConfig({ adminUsers: '999' });
  const bot = new FakeBot();

  await handleMessage(groupEvent('2', '#pixiv设置 r18 2'), bot);
  await handleMessage(groupEvent('2', '#pixiv设置'), bot);
  await handleMessage(groupEvent('2', '#pixiv重载'), bot);

  assert.deepEqual(groupTexts(bot), [NOT_ADMIN, NOT_ADMIN, NOT_ADMIN]);
  assert.equal(getConfig().r18, 0);
  assert.equal(existsSync(file), false);
});

test('settings: nobody is an admin until adminUsers is configured', async () => {
  const file = useConfigFile();
  const bot = new FakeBot();

  await handleMessage(groupEvent('999', '#pixiv设置 r18 2'), bot);
  await handleMessage(groupEvent('999', '#pixiv重载'), bot);

  assert.equal(bot.groupMessages.length, 2);
  for (const text of groupTexts(bot)) assert.match(text, /^未配置管理员/);
  assert.equal(getConfig().r18, 0);
  assert.equal(existsSync(file), false);
});

test('settings: an admin changes a value, sees old → new and the change is persisted', async () => {
  const file = useConfigFile();
  applyConfig({ adminUsers: '999' });
  const bot = new FakeBot();

  await handleMessage(groupEvent(999, '#pixiv设置 num 8'), bot);
  await handleMessage(groupEvent('999', '#pixiv设置 excludeai off'), bot);
  await handleMessage(groupEvent('999', '#pixiv设置 forward off'), bot);
  await handleMessage(groupEvent('999', '#pixiv设置 r18 2'), bot);

  assert.deepEqual(groupTexts(bot), [
    '已更新 num：5 → 8',
    '已更新 excludeai：on → off',
    '已更新 forward：on → off',
    '已更新 r18：0 → 2',
  ]);
  const saved = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  assert.deepEqual(
    { num: saved.num, excludeAI: saved.excludeAI, enableForward: saved.enableForward, r18: saved.r18 },
    { num: 8, excludeAI: false, enableForward: false, r18: 2 },
  );
});

test('settings: invalid values are rejected, nothing is changed and nothing is written', async () => {
  const file = useConfigFile();
  applyConfig({ adminUsers: '999' });
  const bot = new FakeBot();
  const attempts = [
    'r18 true', 'r18 3', 'r18 [1]', 'num abc', 'num 0', 'num 21', 'num 1.5',
    'cooldown -1', 'cooldown abc', 'excludeai maybe',
  ];

  for (const attempt of attempts) await handleMessage(groupEvent('999', `#pixiv设置 ${attempt}`), bot);

  assert.equal(bot.groupMessages.length, attempts.length);
  for (const text of groupTexts(bot)) assert.match(text, /^无效配置值：/);
  assert.equal(getConfig().r18, 0);
  assert.equal(getConfig().num, 5);
  assert.equal(getConfig().excludeAI, true);
  assert.equal(existsSync(file), false);
});

test('settings: unknown or inherited keys fall back to the summary', async () => {
  useConfigFile();
  applyConfig({ adminUsers: '999' });
  const bot = new FakeBot();

  for (const key of ['bogus', 'constructor', '__proto__', 'toString', 'adminusers']) {
    await handleMessage(groupEvent('999', `#pixiv设置 ${key} 1`), bot);
  }

  assert.equal(bot.groupMessages.length, 5);
  for (const text of groupTexts(bot)) assert.match(text, /^当前配置：/);
  assert.equal(getConfig().adminUsers, '999');
});

test('settings: a failed write is reported and the change only lives in memory', async () => {
  const blocker = join(tempDir, 'blocker');
  writeFileSync(blocker, 'a file where a directory would be needed');
  setConfigPath(join(blocker, 'config.json'));
  applyConfig({ adminUsers: '999' });
  const bot = new FakeBot();

  await handleMessage(groupEvent('999', '#pixiv设置 num 9'), bot);

  assert.equal(groupTexts(bot)[0], '已更新 num：5 → 9（配置文件写入失败，仅本次运行有效）');
  assert.equal(getConfig().num, 9);
});

test('settings: the summary shows the effective configuration but no admin ids or upstream URLs', async () => {
  useConfigFile();
  applyConfig({ adminUsers: '987654321', r18: 1 });
  const bot = new FakeBot();

  await handleMessage(groupEvent('987654321', '#pixiv设置'), bot);

  const [summary] = groupTexts(bot);
  assert.match(summary, /r18=1（仅 R18）/);
  assert.match(summary, /num=5/);
  assert.match(summary, /excludeai=on/);
  assert.match(summary, /forward=on/);
  assert.doesNotMatch(summary, /987654321|lolicon|obfs|pixiv\.re|blockedKeywords/i);
});

test('reload: an admin re-reads the config file and sees the effective values', async () => {
  const file = useConfigFile({ adminUsers: '999', num: 3, r18: 1 });
  applyConfig({ adminUsers: '999' });
  const before = readFileSync(file, 'utf8');
  const bot = new FakeBot();

  await handleMessage(groupEvent('999', '#pixiv重载'), bot);

  const [reply] = groupTexts(bot);
  assert.match(reply, /^配置已重载\n当前配置：/);
  assert.match(reply, /r18=1（仅 R18）/);
  assert.match(reply, /num=3/);
  assert.equal(getConfig().num, 3);
  assert.equal(readFileSync(file, 'utf8'), before, 'reload must not write the file');
});

test('reload: an unusable file keeps the running configuration and the admin rights', async () => {
  const file = useConfigFile();
  applyConfig({ adminUsers: '999', num: 8 });
  const bot = new FakeBot();

  for (const content of ['{ not json', '[]', 'null']) {
    writeFileSync(file, content);
    await handleMessage(groupEvent('999', '#pixiv重载'), bot);
  }
  rmSync(file);
  await handleMessage(groupEvent('999', '#pixiv重载'), bot);

  assert.equal(bot.groupMessages.length, 4);
  for (const text of groupTexts(bot)) assert.match(text, /^重载失败：/);
  assert.equal(getConfig().num, 8);
  assert.equal(getConfig().adminUsers, '999');
});

test('reload: ends in the same state as a restart (defaults, then file, then environment)', async () => {
  // What the external runtime does at startup; reload has to repeat it.
  applyEnvironment({ PIXIV_NUM: '4', PIXIV_R18: 'abc' });
  const file = useConfigFile({ adminUsers: '999', num: 9, r18: 1, bogus: true });
  applyConfig({ adminUsers: '999' });
  const bot = new FakeBot();

  await handleMessage(groupEvent('999', '#pixiv重载'), bot);

  assert.equal(getConfig().num, 4, 'the environment still wins over the file');
  assert.equal(getConfig().r18, 1);
  assert.match(groupTexts(bot)[0], /已忽略无效项：bogus, PIXIV_R18/);

  // A key that disappeared from the file goes back to its default instead of keeping the old value.
  writeFileSync(file, JSON.stringify({ adminUsers: '999' }));
  await handleMessage(groupEvent('999', '#pixiv重载'), bot);
  assert.equal(getConfig().r18, 0);
  assert.equal(getConfig().num, 4);
});

test('help lists the reload command', async () => {
  const bot = new FakeBot();
  await handleMessage(groupEvent('2', '#pixiv帮助'), bot);
  assert.match(groupTexts(bot)[0], /#pixiv重载/);
});

const loliconItem = {
  pid: 1,
  title: 'ok',
  author: 'artist',
  r18: false,
  aiType: 1,
  tags: [],
  urls: { regular: 'https://i.pximg.net/a.jpg' },
};

function stubFetch(respond: () => Response): void {
  globalThis.fetch = (async () => respond()) as typeof fetch;
}

test('cooldown is per user and shared between group and private chats', async () => {
  applyConfig({ rateLimitSecs: 15, num: 1 });
  stubFetch(() => Response.json({ error: '', data: [loliconItem] }));
  const bot = new FakeBot();

  await handleMessage(groupEvent('2', '#pixiv miku'), bot);
  await handleMessage(privateEvent('2', '#pixiv miku'), bot);
  await handleMessage(groupEvent('3', '#pixiv miku'), bot);

  assert.equal(bot.groupMessages.length, 2, 'users 2 and 3 each get their image');
  assert.equal(bot.privateMessages.length, 1);
  assert.match(textOf(bot.privateMessages[0].message), /^冷却中，请 \d+ 秒后再试$/);
});

test('a failed upstream request refunds the cooldown so the user can retry at once', async () => {
  applyConfig({ rateLimitSecs: 15, num: 1 });
  const bot = new FakeBot();

  stubFetch(() => new Response('busy', { status: 503 }));
  await handleMessage(groupEvent('2', '#pixiv miku'), bot);
  assert.match(groupTexts(bot)[0], /^执行失败：Lolicon HTTP 503/);

  stubFetch(() => Response.json({ error: '', data: [loliconItem] }));
  await handleMessage(groupEvent('2', '#pixiv miku'), bot);
  assert.equal(bot.groupMessages.length, 2);
  assert.doesNotMatch(groupTexts(bot)[1], /冷却中/);
});
