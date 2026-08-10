import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { applyConfig, resetConfig } from '../src/config.ts';
import { applyContentPolicy } from '../src/services/providers/common.ts';
import { mapAppApiItem } from '../src/services/providers/hibi.ts';
import { mapLoliconItem } from '../src/services/providers/lolicon.ts';

beforeEach(() => resetConfig());

test('Lolicon mapping proxies Pixiv CDN and preserves metadata', () => {
  const item = mapLoliconItem({
    pid: 1,
    title: 'Test',
    author: 'Artist',
    urls: { regular: 'https://i.pximg.net/a.jpg' },
    tags: ['flower'],
    aiType: 1,
  });
  assert.equal(item.pid, '1');
  assert.match(item.url ?? '', /i\.pixiv\.re/);
  assert.deepEqual(item.tags, ['flower']);
});

test('App API mapping prefers large image and flattens translated tags', () => {
  const item = mapAppApiItem({
    id: 2,
    title: 'Test',
    user: { name: 'Artist' },
    image_urls: { large: 'https://i.pximg.net/large.jpg' },
    tags: [{ name: 'ミク', translated_name: 'miku' }],
  });
  assert.deepEqual(item.tags, ['ミク', 'miku']);
  assert.match(item.url ?? '', /i\.pixiv\.re/);
});

test('content policy filters R18, AI and blocked content by default', () => {
  const base = {
    author: 'A',
    url: null,
    tags: [] as string[],
  };
  const items = [
    { ...base, pid: '1', title: 'ok', r18: false, ai: false },
    { ...base, pid: '2', title: 'adult', r18: true, ai: false },
    { ...base, pid: '3', title: 'ai', r18: false, ai: true },
    { ...base, pid: '4', title: '萝莉图', r18: false, ai: false },
  ];
  assert.deepEqual(applyContentPolicy(items).map((item) => item.pid), ['1']);

  applyConfig({ r18: 2, excludeAI: false });
  assert.deepEqual(applyContentPolicy(items).map((item) => item.pid), ['1', '2', '3']);
});
