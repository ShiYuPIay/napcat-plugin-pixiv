import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mapLoliconItem, mapAppApiItem, applyPolicy } from '../src/services/pixiv-service.js';
import { applyConfig, resetConfig } from '../src/config.js';

beforeEach(() => resetConfig());

test('mapLoliconItem prefers regular url and rewrites to the image proxy', () => {
  const item = mapLoliconItem({
    pid: 1, title: 'T', author: 'A',
    urls: { original: 'https://i.pximg.net/o.png', regular: 'https://i.pximg.net/r.jpg' },
    tags: ['t1'], r18: false, aiType: 1,
  });
  assert.equal(item.url, 'https://i.pixiv.re/r.jpg');
  assert.deepEqual(item.tags, ['t1']);
  assert.equal(item.r18, false);
  assert.equal(item.ai, false);
});

test('mapLoliconItem tolerates missing fields', () => {
  const item = mapLoliconItem({ pid: 2, title: 'X' });
  assert.equal(item.url, null);
  assert.equal(item.author, '未知作者');
  assert.deepEqual(item.tags, []);
});

test('mapAppApiItem prefers large over original and flattens tags', () => {
  const item = mapAppApiItem({
    id: 3, title: 'Y',
    user: { name: 'Artist' },
    image_urls: { large: 'https://i.pximg.net/large.jpg' },
    meta_single_page: { original_image_url: 'https://i.pximg.net/orig.png' },
    tags: [{ name: 'ミク', translated_name: 'miku' }, { name: 'solo' }],
    x_restrict: 0, illust_ai_type: 1,
  });
  assert.equal(item.url, 'https://i.pixiv.re/large.jpg');
  assert.deepEqual(item.tags, ['ミク', 'miku', 'solo']);
});

test('mapAppApiItem falls back to the single-page original url', () => {
  const item = mapAppApiItem({
    id: 4, title: 'Z',
    meta_single_page: { original_image_url: 'https://i.pximg.net/orig.png' },
    x_restrict: 1, illust_ai_type: 2,
  });
  assert.equal(item.url, 'https://i.pixiv.re/orig.png');
  assert.equal(item.author, '未知作者');
  assert.equal(item.r18, true);
  assert.equal(item.ai, true);
});

const clean   = { pid: 1, title: 'ok',   tags: ['flower'], r18: false, ai: false };
const r18Item = { pid: 2, title: 'r18',  tags: [],         r18: true,  ai: false };
const aiItem  = { pid: 3, title: 'ai',   tags: [],         r18: false, ai: true };
const badTag  = { pid: 4, title: 'meh',  tags: ['ロリ'],   r18: false, ai: false };
const badTitle = { pid: 5, title: '萝莉x', tags: [],        r18: false, ai: false };

test('applyPolicy drops R18, AI and blocked-keyword items under defaults', () => {
  const kept = applyPolicy([clean, r18Item, aiItem, badTag, badTitle]);
  assert.deepEqual(kept.map(i => i.pid), [1]);
});

test('applyPolicy honors r18/excludeAI settings but never blocked keywords', () => {
  applyConfig({ r18: 2, excludeAI: false });
  const kept = applyPolicy([clean, r18Item, aiItem, badTag, badTitle]);
  assert.deepEqual(kept.map(i => i.pid), [1, 2, 3]);
});
