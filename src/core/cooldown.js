import { Config } from '../config.js';

const cooldowns = new Map(); // user_id → last-invoke timestamp
const MAX_ENTRIES = 1000;

/**
 * Returns remaining cooldown seconds, or 0 if the user may proceed.
 * Stamps the user's timestamp on proceed.
 */
export function checkCooldown(uid, now = Date.now()) {
  if (!Config.rateLimitSecs) return 0;
  const windowMs = Config.rateLimitSecs * 1000;
  const last = cooldowns.get(uid) ?? 0;
  const wait = windowMs - (now - last);
  if (wait > 0) return Math.ceil(wait / 1000);
  if (cooldowns.size >= MAX_ENTRIES) evictExpired(now, windowMs);
  cooldowns.set(uid, now);
  return 0;
}

// Evict only expired entries instead of wiping everyone's active cooldown.
function evictExpired(now, windowMs) {
  for (const [uid, ts] of cooldowns) {
    if (now - ts >= windowMs) cooldowns.delete(uid);
  }
  // Pathological case: MAX_ENTRIES users all still inside the window
  if (cooldowns.size >= MAX_ENTRIES) {
    const oldestFirst = [...cooldowns.entries()].sort((a, b) => a[1] - b[1]);
    for (const [uid] of oldestFirst.slice(0, MAX_ENTRIES / 2)) cooldowns.delete(uid);
  }
}

/** Give the cooldown back when a command fails through no fault of the user. */
export function refundCooldown(uid) {
  cooldowns.delete(uid);
}

/** Test helper. */
export function clearCooldowns() {
  cooldowns.clear();
}
