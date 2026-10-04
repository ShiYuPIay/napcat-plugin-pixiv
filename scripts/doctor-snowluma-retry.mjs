#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

function integerFromEnv(name, fallback, min) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (/^\d+$/.test(raw)) return Math.max(min, Number(raw));
  console.warn(`[napcat-plugin-pixiv] 已忽略无效的 ${name}（需为整数），改用默认值 ${fallback}`);
  return fallback;
}

const attempts = integerFromEnv('SNOWLUMA_DOCTOR_ATTEMPTS', 6, 1);
const delayMs = integerFromEnv('SNOWLUMA_DOCTOR_DELAY_MS', 5_000, 1_000);
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
