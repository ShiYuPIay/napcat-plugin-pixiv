import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';
import {
  applyConfig,
  DEFAULT_CONFIG,
  getConfig,
  isAdmin,
  isBlockedText,
  normalizeText,
  resetConfig,
  saveConfig,
  setConfigPath,
} from '../src/config.ts';

beforeEach(() => {
  resetConfig();
  setConfigPath(null);
});

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

test('saveConfig creates a missing config.json with defaults', () => {
  const dir = mkdtempSync(join(tmpdir(), 'napcat-plugin-pixiv-'));
  const file = join(dir, 'config.json');
  try {
    setConfigPath(file);
    assert.equal(saveConfig(DEFAULT_CONFIG), true);
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    assert.equal(parsed.prefix, '#pixiv');
    assert.equal(parsed.num, 5);
    assert.equal(parsed.enableForward, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
