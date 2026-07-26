import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  Config, DEFAULTS, applyConfig, resetConfig, normalizeText,
  getBlockedList, isBlockedText, getAdminList, isAdmin, loadConfigFile,
} from '../src/config.js';

beforeEach(() => resetConfig());

test('applyConfig accepts valid values with coercion', () => {
  const { applied, invalid } = applyConfig({ r18: '2', num: 7, excludeAI: 'off', rateLimitSecs: 0 });
  assert.deepEqual(invalid, []);
  assert.equal(applied.r18, 2);
  assert.equal(Config.r18, 2);
  assert.equal(Config.num, 7);
  assert.equal(Config.excludeAI, false);
  assert.equal(Config.rateLimitSecs, 0);
});

test('applyConfig rejects out-of-range and unknown keys', () => {
  const { applied, invalid } = applyConfig({ r18: 9, num: 0, bogus: 1, rateLimitSecs: -5 });
  assert.deepEqual(applied, {});
  assert.deepEqual(invalid.sort(), ['bogus', 'num', 'r18', 'rateLimitSecs']);
  assert.equal(Config.r18, DEFAULTS.r18);
  assert.equal(Config.num, DEFAULTS.num);
});

test('applyConfig accepts Chinese boolean words', () => {
  applyConfig({ enableForward: '关' });
  assert.equal(Config.enableForward, false);
  applyConfig({ enableForward: '开' });
  assert.equal(Config.enableForward, true);
});

test('normalizeText folds width, case and whitespace', () => {
  assert.equal(normalizeText('ＬＯＬＩ 天使'), 'loli天使');
  assert.equal(normalizeText('  Mi Ku  '), 'miku');
  assert.equal(normalizeText(null), '');
});

test('blocked keyword matching resists trivial bypasses', () => {
  assert.equal(isBlockedText('萝莉'), true);
  assert.equal(isBlockedText('可爱的萝莉图'), true);
  assert.equal(isBlockedText('ＬｏＬｉ angel'), true); // full-width + case
  assert.equal(isBlockedText('ロリ神'), true);
  assert.equal(isBlockedText('初音ミク'), false);
  assert.equal(isBlockedText(''), false);
});

test('custom blocklist is parsed with Chinese commas and normalized', () => {
  applyConfig({ blockedKeywords: 'Foo，bar , ' });
  assert.deepEqual(getBlockedList(), ['foo', 'bar']);
  assert.equal(isBlockedText('FOOBAR'), true);
});

test('admin list parses ids and rejects junk', () => {
  assert.deepEqual(getAdminList(), []);
  assert.equal(isAdmin(123), false);
  applyConfig({ adminUsers: '123，456, abc, 7x' });
  assert.deepEqual(getAdminList(), ['123', '456']);
  assert.equal(isAdmin(123), true);
  assert.equal(isAdmin('456'), true);
  assert.equal(isAdmin(789), false);
});

test('loadConfigFile returns null when no config.json exists', () => {
  assert.equal(loadConfigFile(), null);
});
