import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { applyConfig, applyEnvironment, resetConfig } from '../src/config.ts';
import {
  checkCooldown,
  clearCooldowns,
  refundCooldown,
} from '../src/core/cooldown.ts';

const T0 = 1_000_000;

beforeEach(() => {
  resetConfig();
  clearCooldowns();
});

test('cooldown is per-user and reports remaining seconds', () => {
  applyConfig({ rateLimitSecs: 15 });
  assert.equal(checkCooldown('a', T0), 0);
  assert.equal(checkCooldown('a', T0 + 1_000), 14);
  assert.equal(checkCooldown('b', T0 + 1_000), 0);
});

test('failed commands can refund cooldown', () => {
  applyConfig({ rateLimitSecs: 15 });
  assert.equal(checkCooldown('a', T0), 0);
  refundCooldown('a');
  assert.equal(checkCooldown('a', T0 + 1), 0);
});

test('zero disables the cooldown, which is the documented way to turn it off', () => {
  applyConfig({ rateLimitSecs: 0 });
  assert.equal(checkCooldown('a', T0), 0);
  assert.equal(checkCooldown('a', T0 + 1), 0);
});

test('invalid cooldown values do not switch rate limiting off', () => {
  applyConfig({ rateLimitSecs: 15 });
  for (const bad of ['', null, false, [], -5, 'abc']) applyConfig({ rateLimitSecs: bad });
  assert.equal(checkCooldown('a', T0), 0);
  assert.equal(checkCooldown('a', T0 + 1_000), 14);
});

test('a malformed PIXIV_COOLDOWN is rejected and the cooldown stays active', () => {
  for (const value of ['', 'abc', '-1', '1.5']) {
    resetConfig();
    clearCooldowns();
    assert.deepEqual(applyEnvironment({ PIXIV_COOLDOWN: value }), ['PIXIV_COOLDOWN']);
    assert.equal(checkCooldown('a', T0), 0);
    assert.ok(checkCooldown('a', T0 + 1_000) > 0, `cooldown was disabled by ${JSON.stringify(value)}`);
  }
});

test('numeric and string user ids share one cooldown', () => {
  applyConfig({ rateLimitSecs: 15 });
  assert.equal(checkCooldown(2, T0), 0);
  assert.equal(checkCooldown('2', T0 + 1_000), 14);
});
