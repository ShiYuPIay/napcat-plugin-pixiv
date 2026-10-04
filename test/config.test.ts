import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';
import {
  applyConfig,
  applyEnvironment,
  DEFAULT_CONFIG,
  getConfig,
  isAdmin,
  isBlockedText,
  normalizeText,
  reloadConfig,
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

test('integer settings accept numbers and plain numeric strings only', () => {
  const accepted: Array<[unknown, number]> = [[8, 8], ['8', 8], [' 7 ', 7], ['+5', 5], [1, 1], [20, 20]];
  for (const [input, expected] of accepted) {
    resetConfig();
    assert.deepEqual(applyConfig({ num: input }).invalid, [], String(input));
    assert.equal(getConfig().num, expected);
  }

  const rejected: unknown[] = [
    true, false, null, undefined, [], [8], ['8'], {}, '', '   ', 'abc',
    '0x10', '1e1', '8.5', 8.5, 0, 21, -1, Number.NaN, Infinity, '9007199254740993',
  ];
  for (const input of rejected) {
    resetConfig();
    applyConfig({ num: 8 });
    assert.deepEqual(applyConfig({ num: input }).invalid, ['num'], String(input));
    assert.equal(getConfig().num, 8, `${String(input)} must not change num`);
  }
});

test('r18 is never derived from booleans, arrays or blanks', () => {
  for (const [input, expected] of [[0, 0], [1, 1], [2, 2], ['2', 2], [' 1 ', 1]] as const) {
    resetConfig();
    assert.deepEqual(applyConfig({ r18: input }).invalid, [], String(input));
    assert.equal(getConfig().r18, expected);
  }

  for (const input of [true, false, [1], ['2'], [], {}, null, '', ' ', 3, -1, 1.5, 'true']) {
    resetConfig();
    applyConfig({ r18: 2 });
    assert.deepEqual(applyConfig({ r18: input }).invalid, ['r18'], JSON.stringify(input));
    assert.equal(getConfig().r18, 2, `${JSON.stringify(input)} must not change r18`);
  }
});

test('invalid rate-limit values are rejected instead of turning the cooldown off', () => {
  for (const input of ['', '  ', null, false, true, [], [0], {}, -1, 86_401, 'abc']) {
    resetConfig();
    applyConfig({ rateLimitSecs: 30 });
    assert.deepEqual(applyConfig({ rateLimitSecs: input }).invalid, ['rateLimitSecs'], JSON.stringify(input));
    assert.equal(getConfig().rateLimitSecs, 30);
  }

  // 0 is the documented way to disable the cooldown, so it stays valid.
  for (const input of [0, '0', 86_400]) {
    resetConfig();
    assert.deepEqual(applyConfig({ rateLimitSecs: input }).invalid, [], String(input));
  }
  assert.equal(getConfig().rateLimitSecs, 86_400);
});

test('request timeout is bounded to 1000-60000 ms', () => {
  for (const input of [1_000, '60000', 60_000]) {
    assert.deepEqual(applyConfig({ requestTimeoutMs: input }).invalid, [], String(input));
  }
  for (const input of [999, 60_001, '', null, true, [5_000]]) {
    resetConfig();
    assert.deepEqual(applyConfig({ requestTimeoutMs: input }).invalid, ['requestTimeoutMs'], JSON.stringify(input));
    assert.equal(getConfig().requestTimeoutMs, DEFAULT_CONFIG.requestTimeoutMs);
  }
});

test('boolean settings reject arrays, objects, null and unknown strings', () => {
  for (const [input, expected] of [[false, false], ['off', false], ['否', false], [0, false], [' ON ', true], [1, true]] as const) {
    resetConfig();
    assert.deepEqual(applyConfig({ excludeAI: input }).invalid, [], String(input));
    assert.equal(getConfig().excludeAI, expected);
  }

  for (const input of [[0], ['off'], [], {}, null, 'maybe', 2, '']) {
    resetConfig();
    assert.deepEqual(applyConfig({ excludeAI: input }).invalid, ['excludeAI'], JSON.stringify(input));
    assert.equal(getConfig().excludeAI, true, `${JSON.stringify(input)} must not switch the AI filter off`);
  }
});

test('only declared keys are accepted, including inherited object keys', () => {
  const before = { ...getConfig() };
  const hostile = JSON.parse('{"toString":"x","constructor":"x","hasOwnProperty":1,"__proto__":{"num":1}}');
  const { applied, invalid } = applyConfig(hostile);

  assert.deepEqual(applied, {});
  assert.deepEqual(invalid.sort(), ['__proto__', 'constructor', 'hasOwnProperty', 'toString']);
  assert.deepEqual(getConfig(), before);
});

test('rejected environment variables are reported by name and leave the config alone', () => {
  const rejected = applyEnvironment({
    PIXIV_NUM: 'abc',
    PIXIV_COOLDOWN: '',
    PIXIV_R18: 'true',
    PIXIV_PREFIX: '#p',
  });

  assert.deepEqual(rejected.sort(), ['PIXIV_COOLDOWN', 'PIXIV_NUM', 'PIXIV_R18']);
  assert.equal(getConfig().prefix, '#p');
  assert.equal(getConfig().num, DEFAULT_CONFIG.num);
  assert.equal(getConfig().rateLimitSecs, DEFAULT_CONFIG.rateLimitSecs);
  assert.equal(getConfig().r18, 0);
});

test('valid environment values still override the defaults', () => {
  const rejected = applyEnvironment({ PIXIV_NUM: ' 7 ', PIXIV_R18: '2', PIXIV_EXCLUDE_AI: 'off' });

  assert.deepEqual(rejected, []);
  assert.equal(getConfig().num, 7);
  assert.equal(getConfig().r18, 2);
  assert.equal(getConfig().excludeAI, false);
});

test('reloadConfig does nothing without a config file path', () => {
  applyConfig({ num: 8 });
  assert.deepEqual(reloadConfig(), { ok: false, reason: '未设置配置文件路径' });
  assert.equal(getConfig().num, 8);
});
