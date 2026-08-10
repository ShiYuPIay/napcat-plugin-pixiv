#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

function commandExists(command) {
  const result = spawnSync('sh', ['-lc', `command -v ${command}`], { stdio: 'ignore' });
  return result.status === 0;
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.env.CI || process.env.PIXIV_CHECK_ONLY === '1') {
  console.log('[napcat-plugin-pixiv] check 完成：CI/纯检查模式，不启动生产守护。');
  process.exit(0);
}

if (process.platform !== 'linux') {
  console.log('[napcat-plugin-pixiv] check 完成：非 Linux 环境，不自动安装 SnowLuma systemd 守护。');
  process.exit(0);
}

if (!commandExists('docker') || !commandExists('systemctl')) {
  console.log('[napcat-plugin-pixiv] check 完成：未检测到 Docker + systemd，跳过自动守护。');
  process.exit(0);
}

const container = process.env.SNOWLUMA_CONTAINER?.trim() || 'snowluma';
const inspect = spawnSync('docker', ['inspect', container], { stdio: 'ignore' });
if (inspect.status !== 0) {
  console.log(`[napcat-plugin-pixiv] check 完成：未找到 SnowLuma 容器 ${container}，跳过自动守护。`);
  process.exit(0);
}

if (typeof process.getuid === 'function' && process.getuid() !== 0) {
  console.log('[napcat-plugin-pixiv] check 已通过，但自动安装 systemd 守护需要 root。');
  console.log('[napcat-plugin-pixiv] 请使用 sudo/root 执行 npm run deploy:snowluma。');
  process.exit(0);
}

const root = process.cwd();
const distEntry = resolve(root, 'dist/snowluma.mjs');
if (!existsSync(distEntry)) {
  console.error('[napcat-plugin-pixiv] check 后未找到 dist/snowluma.mjs，无法启动生产守护。');
  process.exit(1);
}

const env = {
  ...process.env,
  SNOWLUMA_CONTAINER: container,
};

console.log('\n[napcat-plugin-pixiv] 检测到 Linux + SnowLuma Docker，开始生产链路自检和守护启动。');
console.log('[napcat-plugin-pixiv] 先迁移旧版 SnowLuma wsClient(name=Pixiv)，避免 WebUI 持续“重连中”。');
run(process.execPath, [resolve(root, 'scripts/migrate-legacy-snowluma.mjs')], env);

console.log('\n[napcat-plugin-pixiv] 真实连接 SnowLuma wsServer 并执行 get_login_info，不再把 FakeWebSocket 测试当成生产连接。');
run(process.execPath, [distEntry, '--doctor', '--auto'], env);

console.log('\n[napcat-plugin-pixiv] 安装/刷新 systemd 守护，SSH 断开后继续运行。');
run('bash', [resolve(root, 'scripts/ensure-snowluma-service.sh')], env);

console.log('\n✅ npm run check 已完成，并已确保 napcat-plugin-pixiv 后台常驻。');
console.log('QQ 现在可发送：#pixivping');
