import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { checkCooldown, refundCooldown, clearCooldowns } from '../src/core/cooldown.js';
import { applyConfig, resetConfig } from '../src/config.js';

const T0 = 1_000_000;

beforeEach(() => {
  resetConfig();
  clearCooldowns();
});

test('disabled when rateLimitSecs is 0', () => {
  applyConfig({ rateLimitSecs: 0 });
  assert.equal(checkCooldown('u', T0), 0);
  assert.equal(checkCooldown('u', T0 + 1), 0);
});

test('enforces the window and reports remaining seconds', () => {
  applyConfig({ rateLimitSecs: 15 });
  assert.equal(checkCooldown('u', T0), 0);
  assert.equal(checkCooldown('u', T0 + 1_000), 14);
  assert.equal(checkCooldown('u', T0 + 14_999), 1);
  assert.equal(checkCooldown('u', T0 + 15_000), 0);
});

test('users are independent', () => {
  applyConfig({ rateLimitSecs: 15 });
  assert.equal(checkCooldown('a', T0), 0);
  assert.equal(checkCooldown('b', T0), 0);
  assert.ok(checkCooldown('a', T0 + 1) > 0);
});

test('refund clears the stamp so a failed command costs nothing', () => {
  applyConfig({ rateLimitSecs: 15 });
  assert.equal(checkCooldown('u', T0), 0);
  refundCooldown('u');
  assert.equal(checkCooldown('u', T0 + 1), 0);
});

test('a full map does not lock out new users', () => {
  applyConfig({ rateLimitSecs: 15 });
  for (let i = 0; i < 1000; i++) checkCooldown(`u${i}`, T0);
  // all expired → evicted, new user proceeds
  assert.equal(checkCooldown('late', T0 + 16_000), 0);
  clearCooldowns();
  // all still inside the window → oldest half dropped, new user still proceeds
  for (let i = 0; i < 1000; i++) checkCooldown(`u${i}`, T0);
  assert.equal(checkCooldown('fresh', T0 + 1_000), 0);
});
