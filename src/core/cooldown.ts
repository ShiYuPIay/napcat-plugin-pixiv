import { getConfig } from '../config.ts';

const cooldowns = new Map<string, number>();
const MAX_ENTRIES = 2_000;

export function checkCooldown(userId: unknown, now = Date.now()): number {
  const { rateLimitSecs } = getConfig();
  if (rateLimitSecs <= 0) return 0;

  const key = String(userId ?? '');
  const windowMs = rateLimitSecs * 1_000;
  const last = cooldowns.get(key) ?? 0;
  const remaining = windowMs - (now - last);

  if (remaining > 0) return Math.ceil(remaining / 1_000);

  if (cooldowns.size >= MAX_ENTRIES) {
    evictExpired(now, windowMs);
  }
  cooldowns.set(key, now);
  return 0;
}

function evictExpired(now: number, windowMs: number): void {
  for (const [key, timestamp] of cooldowns) {
    if (now - timestamp >= windowMs) cooldowns.delete(key);
  }

  if (cooldowns.size < MAX_ENTRIES) return;

  const oldest = [...cooldowns.entries()].sort((a, b) => a[1] - b[1]);
  for (const [key] of oldest.slice(0, Math.ceil(MAX_ENTRIES / 2))) {
    cooldowns.delete(key);
  }
}

export function refundCooldown(userId: unknown): void {
  cooldowns.delete(String(userId ?? ''));
}

export function clearCooldowns(): void {
  cooldowns.clear();
}
