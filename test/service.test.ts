import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { applyConfig, resetConfig } from '../src/config.ts';
import { applyContentPolicy, proxyImageUrl } from '../src/services/providers/common.ts';
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

test('App API mapping falls back to original and the first meta_pages image', () => {
  const original = mapAppApiItem({
    id: 3,
    image_urls: { original: 'https://i.pximg.net/original.jpg' },
  });
  const page = mapAppApiItem({
    id: 4,
    meta_pages: [{ image_urls: { original: 'https://i.pximg.net/page.jpg' } }],
  });

  assert.match(original.url ?? '', /original\.jpg$/);
  assert.match(page.url ?? '', /page\.jpg$/);
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

test('image URLs from upstream are limited to the Pixiv CDN and configured proxy', () => {
  assert.equal(proxyImageUrl('https://i.pximg.net/a.jpg'), 'https://i.pixiv.re/a.jpg');
  assert.equal(proxyImageUrl('https://i.pixiv.re/a.jpg'), 'https://i.pixiv.re/a.jpg');
  assert.equal(proxyImageUrl('https://cdn.example.com/a.jpg'), null);

  // OneBot's image `file` field also accepts local paths and base64, so an
  // untrusted upstream value of that kind must never reach it.
  for (const hostile of [
    'file:///etc/passwd',
    '/etc/passwd',
    'C:\\Windows\\win.ini',
    'base64://AAAA',
    'data:image/png;base64,AAAA',
    '//i.pximg.net/a.jpg',
    'javascript:alert(1)',
    'http://i.pximg.net/a.jpg',
    'https://127.0.0.1/latest/meta-data',
    'https://169.254.169.254/latest/meta-data',
    'https://localhost/admin',
    'https://i.pximg.net.attacker.example/a.jpg',
    'https://user@i.pximg.net/a.jpg',
  ]) {
    assert.equal(proxyImageUrl(hostile), null, hostile);
  }
  assert.equal(proxyImageUrl('https://i.pximg.net:8443/a.jpg'), null);
  assert.equal(proxyImageUrl(undefined), null);

  applyConfig({ imageProxy: 'images.example.com:8443' });
  assert.equal(
    proxyImageUrl('https://i.pximg.net/a.jpg'),
    'https://images.example.com:8443/a.jpg',
  );
  assert.equal(proxyImageUrl('https://images.example.com:8443/a.jpg'), 'https://images.example.com:8443/a.jpg');
  assert.equal(proxyImageUrl('https://images.example.com:8444/a.jpg'), null);
});
