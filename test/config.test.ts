import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  applyConfig,
  getConfig,
  isAdmin,
  isBlockedText,
  normalizeText,
  resetConfig,
} from '../src/config.ts';

beforeEach(() => resetConfig());

test('configuration validation applies valid values and rejects invalid values', () => {
  const result = applyConfig({
    r18: '2',
    num: 8,
    excludeAI: 'off',
    requestTimeoutMs: 10_000,
    bogus: true,
  });

  assert.equal(getConfig().r18, 2);
  assert.equal(getConfig().num, 8);
  assert.equal(getConfig().excludeAI, false);
  assert.deepEqual(result.invalid, ['bogus']);
});

test('blocked keyword normalization resists width, case and whitespace bypasses', () => {
  assert.equal(normalizeText(' ＬＯＬＩ 天使 '), 'loli天使');
  assert.equal(isBlockedText('Ｌｏ Ｌｉ angel'), true);
  assert.equal(isBlockedText('初音ミク'), false);
});

test('admin parsing accepts only numeric QQ ids', () => {
  applyConfig({ adminUsers: '123, 456，abc 7x' });
  assert.equal(isAdmin(123), true);
  assert.equal(isAdmin('456'), true);
  assert.equal(isAdmin('abc'), false);
});
