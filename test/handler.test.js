import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Redirect config.json persistence away from the repo before modules load
const tmp = mkdtempSync(join(tmpdir(), 'pixiv-plugin-test-'));
process.env.NAPCAT_PIXIV_CONFIG = join(tmp, 'config.json');

const plugin                        = await import('../src/index.js');
const { handleMessage }             = await import('../src/handlers/message-handler.js');
const { Config, applyConfig, resetConfig } = await import('../src/config.js');
const { clearCooldowns }            = await import('../src/core/cooldown.js');

after(() => rmSync(tmp, { recursive: true, force: true }));

// ── Test doubles ──────────────────────────────────────────────────────────────

const realFetch = globalThis.fetch;

function fakeBot(behavior = {}) {
  const calls = [];
  return {
    calls,
    byName: name => calls.filter(c => c.name === name),
    async call_api(name, payload) {
      calls.push({ name, payload });
      if (behavior[name]) return behavior[name](payload);
      return {};
    },
  };
}

function groupMsg(raw, { uid = 10, gid = 1, selfId = 99 } = {}) {
  return { message_type: 'group', raw_message: raw, group_id: gid, user_id: uid, self_id: selfId };
}

function stubFetch(dataForUrl) {
  globalThis.fetch = async (url) => ({
    ok: true,
    status: 200,
    json: async () => dataForUrl(String(url)),
  });
}

function textOf(call) {
  return (call.payload.message ?? []).filter(s => s.type === 'text').map(s => s.data.text).join('');
}

const LOLICON_OK = {
  data: [{
    pid: 111, title: '作品', author: '画师',
    urls: { regular: 'https://i.pximg.net/img/r.jpg' },
    tags: ['flower'], r18: false, aiType: 1,
  }],
};

beforeEach(() => {
  resetConfig();
  clearCooldowns();
  applyConfig({ rateLimitSecs: 0 });
  globalThis.fetch = realFetch;
});

// ── Entry points ──────────────────────────────────────────────────────────────

test('plugin exports the NapCat entry points and init tolerates a bare ctx', async () => {
  assert.equal(typeof plugin.plugin_init, 'function');
  assert.equal(typeof plugin.plugin_onmessage, 'function');
  assert.equal(typeof plugin.plugin_onunload, 'function');
  const silent = { info() {}, warn() {}, error() {} };
  await plugin.plugin_init({ logger: silent });
  await plugin.plugin_init(undefined);
  await plugin.plugin_onunload();
});

test('ignores private messages and non-command text', async () => {
  const bot = fakeBot();
  await handleMessage({ message_type: 'private', raw_message: '#pixivhelp', user_id: 1 }, bot);
  await handleMessage(groupMsg('hello'), bot);
  await handleMessage(groupMsg(''), bot);
  assert.equal(bot.calls.length, 0);
});

// ── Help / blocking ───────────────────────────────────────────────────────────

test('help is served for #pixivhelp, #pixiv帮助 and bare #pixiv', async () => {
  for (const raw of ['#pixivhelp', '#pixiv帮助', '#pixiv']) {
    const bot = fakeBot();
    await handleMessage(groupMsg(raw), bot);
    assert.match(textOf(bot.calls[0]), /使用指南/, raw);
  }
});

test('blocked keywords are refused, including full-width bypasses', async () => {
  for (const raw of ['#pixiv萝莉', '#pixivＬＯＬＩ天使', '#pixiv可爱 萝 莉']) {
    const bot = fakeBot();
    await handleMessage(groupMsg(raw), bot);
    assert.equal(textOf(bot.calls[0]), '该关键词已被屏蔽', raw);
  }
});

// ── Recommend / forward behavior ──────────────────────────────────────────────

test('recommend sends a forward message with proxied image and bot uin', async () => {
  stubFetch(() => LOLICON_OK);
  const bot = fakeBot();
  await handleMessage(groupMsg('#pixivrec'), bot);
  const fwd = bot.byName('send_group_forward_msg');
  assert.equal(fwd.length, 1);
  const node = fwd[0].payload.messages[0];
  assert.equal(node.data.uin, '99');
  const img = node.data.content.find(c => c.type === 'image');
  assert.equal(img.data.file, 'https://i.pixiv.re/img/r.jpg');
});

test('falls back to per-node sends when forward fails', async () => {
  stubFetch(() => LOLICON_OK);
  const bot = fakeBot({
    send_group_forward_msg: () => { throw new Error('forward unsupported'); },
  });
  await handleMessage(groupMsg('#pixiv推荐'), bot);
  assert.equal(bot.byName('send_group_msg').length, 1);
});

test('empty recommend results produce a friendly reply, not silence', async () => {
  stubFetch(() => ({ data: [] }));
  const bot = fakeBot();
  await handleMessage(groupMsg('#pixiv推荐'), bot);
  assert.match(textOf(bot.calls[0]), /暂时没有/);
});

// ── Cooldown ──────────────────────────────────────────────────────────────────

test('second command inside the window is rejected with remaining seconds', async () => {
  applyConfig({ rateLimitSecs: 15 });
  stubFetch(() => LOLICON_OK);
  const bot = fakeBot();
  await handleMessage(groupMsg('#pixivrec'), bot);
  await handleMessage(groupMsg('#pixivrec'), bot);
  const last = textOf(bot.calls.at(-1));
  assert.match(last, /冷却中/);
});

test('an upstream failure refunds the cooldown and replies generically', async () => {
  applyConfig({ rateLimitSecs: 15 });
  globalThis.fetch = async () => { throw new Error('ECONNRESET secret-internals'); };
  const bot = fakeBot();
  await handleMessage(groupMsg('#pixivrec'), bot);
  assert.equal(textOf(bot.calls.at(-1)), '执行失败，请稍后再试');

  stubFetch(() => LOLICON_OK);
  await handleMessage(groupMsg('#pixivrec'), bot); // cooldown was refunded
  assert.equal(bot.byName('send_group_forward_msg').length, 1);
});

// ── pid / artist lookup ───────────────────────────────────────────────────────

const ILLUST_OK = {
  illust: {
    id: 123, title: '多页作品', user: { name: 'A' },
    x_restrict: 0, illust_ai_type: 1, tags: [{ name: 'ok' }],
    image_urls: { large: 'https://i.pximg.net/p0.jpg' },
    meta_pages: [
      { image_urls: { large: 'https://i.pximg.net/p0.jpg' } },
      { image_urls: { large: 'https://i.pximg.net/p1.jpg' } },
    ],
  },
};

test('pid lookup expands multi-page works with page numbering', async () => {
  stubFetch(() => ILLUST_OK);
  const bot = fakeBot();
  await handleMessage(groupMsg('#pixivpid 123'), bot);
  const nodes = bot.byName('send_group_forward_msg')[0].payload.messages;
  assert.equal(nodes.length, 2);
  assert.match(nodes[0].data.content[0].data.text, /\(1\/2\)/);
  assert.match(nodes[1].data.content[0].data.text, /\(2\/2\)/);
});

test('pid and artist commands print usage when the id is missing', async () => {
  for (const [raw, usage] of [['#pixivpid', /#pixivpid/], ['#pixiv画师', /画师UID/]]) {
    const bot = fakeBot();
    await handleMessage(groupMsg(raw), bot);
    assert.match(textOf(bot.calls[0]), usage, raw);
  }
});

test('artist lookup fetches member illusts', async () => {
  stubFetch(url => (url.includes('member_illust') ? { illusts: [ILLUST_OK.illust] } : {}));
  const bot = fakeBot();
  await handleMessage(groupMsg('#pixivuid 456'), bot);
  assert.equal(bot.byName('send_group_forward_msg').length, 1);
});

// ── Settings command ──────────────────────────────────────────────────────────

test('settings requires a configured admin', async () => {
  const bot = fakeBot();
  await handleMessage(groupMsg('#pixiv设置'), bot);
  assert.match(textOf(bot.calls[0]), /未配置管理员/);

  applyConfig({ adminUsers: '42' });
  await handleMessage(groupMsg('#pixiv设置', { uid: 10 }), bot);
  assert.match(textOf(bot.calls.at(-1)), /仅管理员/);
});

test('admin can view and persist settings; invalid values are rejected', async () => {
  applyConfig({ adminUsers: '42' });
  const bot = fakeBot();

  await handleMessage(groupMsg('#pixiv设置', { uid: 42 }), bot);
  assert.match(textOf(bot.calls.at(-1)), /当前配置/);

  await handleMessage(groupMsg('#pixiv设置 num 7', { uid: 42 }), bot);
  assert.match(textOf(bot.calls.at(-1)), /已更新 num = 7/);
  assert.equal(Config.num, 7);
  const saved = JSON.parse(readFileSync(process.env.NAPCAT_PIXIV_CONFIG, 'utf8'));
  assert.equal(saved.num, 7);

  await handleMessage(groupMsg('#pixiv设置 r18 5', { uid: 42 }), bot);
  assert.match(textOf(bot.calls.at(-1)), /无效的值/);
});
