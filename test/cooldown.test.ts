import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { applyConfig, resetConfig } from '../src/config.ts';
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
