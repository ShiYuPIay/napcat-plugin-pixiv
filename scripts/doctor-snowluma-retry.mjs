#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function boundedRetryValue(raw, fallback, min, max) {
  if (!raw?.trim()) return fallback;
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return fallback;
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value > max) return fallback;
  return Math.max(min, value);
}

function integerFromEnv(name, fallback, min, max) {
  const raw = process.env[name]?.trim();
  const value = boundedRetryValue(raw, fallback, min, max);
  const numeric = raw && /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (raw && (!Number.isSafeInteger(numeric) || numeric > max)) {
    console.warn(`[napcat-plugin-pixiv] ${name} 无效或超出安全范围，改用默认值 ${fallback}`);
  }
  return value;
}

async function main() {
  const attempts = integerFromEnv('SNOWLUMA_DOCTOR_ATTEMPTS', 6, 1, 20);
  const delayMs = integerFromEnv('SNOWLUMA_DOCTOR_DELAY_MS', 5_000, 1_000, 60_000);
  const entry = resolve(process.cwd(), 'dist/snowluma.mjs');

  function sleep(ms) {
    return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    console.log(`[napcat-plugin-pixiv] SnowLuma doctor 尝试 ${attempt}/${attempts}`);
    const result = spawnSync(
      process.execPath,
      [entry, '--doctor', '--auto'],
      { stdio: 'inherit', env: process.env },
    );
    if (!result.error && result.status === 0) {
      process.exit(0);
    }
    if (attempt < attempts) {
      console.log(`[napcat-plugin-pixiv] SnowLuma/QQ 可能仍在启动，${delayMs / 1000}s 后重试...`);
      await sleep(delayMs);
    }
  }

  console.error('[napcat-plugin-pixiv] SnowLuma doctor 多次失败，拒绝启动后台守护。');
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
