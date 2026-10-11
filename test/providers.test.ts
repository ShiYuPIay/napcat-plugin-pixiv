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
import { fetchSearch as fetchLoliconSearch } from '../src/services/providers/lolicon.ts';

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

test('Lolicon provider reports an API-level search error', async () => {
  stubFetch(() => ({ error: 'quota exceeded', data: [] }));
  await assert.rejects(fetchLoliconSearch('miku'), /Lolicon API error: quota exceeded/);
});

test('a failed Lolicon search falls back once to Hibi and retains content policy', async () => {
  const requests: URL[] = [];
  globalThis.fetch = (async (input: unknown) => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.hostname === 'api.lolicon.app') {
      return Response.json({ error: 'quota exceeded', data: [] });
    }
    return Response.json({ illusts: [
      {
        id: 1,
        title: 'ok',
        user: { name: 'artist' },
        image_urls: { large: 'https://i.pximg.net/a.jpg' },
        tags: [{ name: 'flower' }],
      },
      { id: 2, title: '萝莉图', user: { name: 'blocked' } },
      { id: 3, title: 'ai', user: { name: 'ai' }, illust_ai_type: 2 },
    ] });
  }) as typeof fetch;

  const results = await fetchSearch('miku');

  assert.equal(requests.length, 2);
  assert.equal(requests[1].pathname, '/api/pixiv/search');
  assert.equal(requests[1].searchParams.get('word'), 'miku');
  assert.deepEqual(results.map((item) => item.pid), ['1']);
  assert.match(results[0].url ?? '', /i\.pixiv\.re/);
});

test('an empty Lolicon result does not call the Hibi fallback', async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return Response.json({ error: '', data: [] });
  }) as typeof fetch;

  assert.deepEqual(await fetchSearch('nothing'), []);
  assert.equal(calls, 1);
});

test('failed primary and fallback searches return safe provider labels, not upstream text', async () => {
  globalThis.fetch = (async () =>
    Response.json({ error: { message: 'private upstream detail' } })) as typeof fetch;

  await assert.rejects(fetchSearch('miku'), (error: Error) => {
    assert.equal(error.name, 'SearchProvidersUnavailableError');
    assert.match(error.message, /Lolicon API error; Pixiv\/Hibi API error/);
    assert.doesNotMatch(error.message, /private upstream detail/);
    return true;
  });
});

test('status check classifies a Lolicon API-level error instead of a green check', async () => {
  stubFetch((url) => (url.includes('lolicon')
    ? { error: 'service down', data: [] }
    : { illusts: [] }));

  const report = await checkApis();
  assert.match(report, /Lolicon ❌ 上游 API 返回错误/);
  assert.match(report, /Pixiv\/Hibi ✅/);
});

test('status check reports a Hibi API-level error', async () => {
  stubFetch((url) => (url.includes('lolicon')
    ? { error: '', data: [] }
    : { error: { message: 'Rate Limit' } }));

  const report = await checkApis();
  assert.match(report, /Lolicon ✅/);
  assert.match(report, /Pixiv\/Hibi ❌ 上游请求受限/);
});

test('status output redacts credentials echoed by either upstream', async () => {
  stubFetch(() => ({
    error: { message: 'Invalid token private-token; API key another-secret' },
  }));

  const report = await checkApis();

  assert.doesNotMatch(report, /private-token|another-secret/);
});

test('Lolicon success and empty results are not errors', async () => {
  stubFetch(() => ({ error: '', data: [loliconItem] }));
  assert.equal((await fetchSearch('flower')).length, 1);

  stubFetch(() => ({ error: '', data: [] }));
  assert.deepEqual(await fetchSearch('nothing'), []);

  stubFetch(() => ({}));
  await assert.rejects(fetchLoliconSearch('nothing'), /Lolicon returned malformed data/);
});

test('Lolicon data that is not an array is reported as malformed', async () => {
  stubFetch(() => ({ error: '', data: 'oops' }));
  await assert.rejects(fetchLoliconSearch('x'), /Lolicon returned malformed data/);
});

test('Hibi list endpoints surface error fields and malformed lists', async () => {
  stubFetch(() => ({ error: { message: 'Rate Limit' } }));
  await assert.rejects(fetchRanking('day'), /Pixiv ranking API error: Rate Limit/);
  await assert.rejects(fetchMemberIllusts('1'), /Pixiv member API error: Rate Limit/);

  stubFetch(() => ({ illusts: 'nope' }));
  await assert.rejects(fetchRanking('day'), /Pixiv ranking returned malformed data/);
  await assert.rejects(fetchMemberIllusts('1'), /Pixiv member returned malformed data/);

  stubFetch(() => ({}));
  await assert.rejects(fetchRanking('day'), /Pixiv ranking returned malformed data/);
  await assert.rejects(fetchMemberIllusts('1'), /Pixiv member returned malformed data/);

  stubFetch(() => ({ illusts: [] }));
  assert.deepEqual(await fetchRanking('week'), []);
});

test('Hibi list mappings use original and the first meta_pages image as fallbacks', async () => {
  stubFetch(() => ({ illusts: [
    { id: 1, title: 'original', image_urls: { original: 'https://i.pximg.net/original.jpg' } },
    { id: 2, title: 'page', meta_pages: [{ image_urls: { original: 'https://i.pximg.net/page.jpg' } }] },
  ] }));

  const results = await fetchRanking('day');
  assert.equal(results.length, 2);
  assert.match(results[0].url ?? '', /original\.jpg$/);
  assert.match(results[1].url ?? '', /page\.jpg$/);
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
