import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { resetConfig } from '../src/config.ts';
import {
  checkApis,
  fetchIllust,
  fetchMemberIllusts,
  fetchRanking,
  fetchSearch,
} from '../src/services/pixiv-service.ts';

const realFetch = globalThis.fetch;

function stubFetch(route: (url: string) => unknown, status = 200): void {
  globalThis.fetch = (async (input: unknown) =>
    new Response(JSON.stringify(route(String(input))), { status })) as typeof fetch;
}

beforeEach(() => resetConfig());
afterEach(() => {
  globalThis.fetch = realFetch;
});

const loliconItem = {
  pid: 1,
  title: 'ok',
  author: 'artist',
  r18: false,
  aiType: 1,
  tags: ['flower'],
  urls: { regular: 'https://i.pximg.net/a.jpg' },
};

test('Lolicon returning an error field fails the search with the upstream message', async () => {
  stubFetch(() => ({ error: 'quota exceeded', data: [] }));
  await assert.rejects(fetchSearch('miku'), /Lolicon API error: quota exceeded/);
});

test('status check reports a Lolicon API-level error instead of a green check', async () => {
  stubFetch((url) => (url.includes('lolicon')
    ? { error: 'service down', data: [] }
    : { illusts: [] }));

  const report = await checkApis();
  assert.match(report, /Lolicon ❌ Lolicon API error: service down/);
  assert.match(report, /Pixiv\/Hibi ✅/);
});

test('status check reports a Hibi API-level error', async () => {
  stubFetch((url) => (url.includes('lolicon')
    ? { error: '', data: [] }
    : { error: { message: 'Rate Limit' } }));

  const report = await checkApis();
  assert.match(report, /Lolicon ✅/);
  assert.match(report, /Pixiv\/Hibi ❌ Pixiv ranking API error: Rate Limit/);
});

test('Lolicon success and empty results are not errors', async () => {
  stubFetch(() => ({ error: '', data: [loliconItem] }));
  assert.equal((await fetchSearch('flower')).length, 1);

  for (const body of [{ error: '', data: [] }, {}]) {
    stubFetch(() => body);
    assert.deepEqual(await fetchSearch('nothing'), []);
  }
});

test('Lolicon data that is not an array is reported as malformed', async () => {
  stubFetch(() => ({ error: '', data: 'oops' }));
  await assert.rejects(fetchSearch('x'), /Lolicon returned malformed data/);
});

test('Hibi list endpoints surface error fields and malformed lists', async () => {
  stubFetch(() => ({ error: { message: 'Rate Limit' } }));
  await assert.rejects(fetchRanking('day'), /Pixiv ranking API error: Rate Limit/);
  await assert.rejects(fetchMemberIllusts('1'), /Pixiv member API error: Rate Limit/);

  stubFetch(() => ({ illusts: 'nope' }));
  await assert.rejects(fetchRanking('day'), /Pixiv ranking returned malformed data/);
  await assert.rejects(fetchMemberIllusts('1'), /Pixiv member returned malformed data/);

  stubFetch(() => ({ illusts: [] }));
  assert.deepEqual(await fetchRanking('week'), []);
});

test('Hibi illust lookup surfaces an error field and still returns real works', async () => {
  stubFetch(() => ({ error: { user_message: '该作品已被删除' } }));
  await assert.rejects(fetchIllust('1'), /Pixiv illust API error: 该作品已被删除/);

  stubFetch(() => ({
    illust: {
      id: 7,
      title: 'work',
      user: { name: 'artist' },
      image_urls: { large: 'https://i.pximg.net/work.jpg' },
      tags: [],
      x_restrict: 0,
      illust_ai_type: 1,
    },
  }));
  const [item] = await fetchIllust('7');
  assert.equal(item.pid, '7');
});

test('upstream HTTP failures keep their status code', async () => {
  stubFetch(() => ({}), 429);
  await assert.rejects(fetchSearch('x'), /Lolicon HTTP 429/);
  await assert.rejects(fetchRanking('day'), /Pixiv ranking HTTP 429/);
});
