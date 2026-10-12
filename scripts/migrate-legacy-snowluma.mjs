#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const container = process.env.SNOWLUMA_CONTAINER?.trim() || 'snowluma';
const preferredUin = process.env.SNOWLUMA_UIN?.trim() || '';

const script = String.raw`
const fs = require('fs');
const path = require('path');
const preferredUin = process.argv[1] || '';
const dirs = ['/app/data/config', '/app/snowluma-data/config', '/app/config'];
const configDir = dirs.find((dir) => fs.existsSync(dir) && fs.readdirSync(dir).some((name) => /^onebot(?:_\d+)?\.json$/.test(name)));
if (!configDir) {
  process.stdout.write(JSON.stringify({ changed: [], warning: 'onebot config directory not found' }));
  process.exit(0);
}
const names = fs.readdirSync(configDir)
  .filter((name) => /^onebot(?:_\d+)?\.json$/.test(name))
  .filter((name) => !preferredUin || name === 'onebot.json' || name === 'onebot_' + preferredUin + '.json')
  .sort();
const pending = [];
for (const name of names) {
  const file = path.join(configDir, name);
  const metadata = fs.lstatSync(file);
  if (!metadata.isFile()) throw new Error('refusing to migrate a non-regular config file: ' + file);
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error('invalid JSON in ' + file);
  }
  const networks = cfg && typeof cfg === 'object' ? cfg.networks : null;
  const clients = Array.isArray(networks?.wsClients)
    ? networks.wsClients
    : Array.isArray(cfg.wsClients) ? cfg.wsClients : [];
  let touched = false;
  for (const client of clients) {
    if (!client || typeof client !== 'object') continue;
    const adapterName = String(client.name || '').trim().toLowerCase();
    if (adapterName !== 'pixiv') continue;
    if (client.enabled === false) continue;
    client.enabled = false;
    touched = true;
  }
  if (!touched) continue;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid;
  pending.push({
    file,
    backup: file + '.bak-napcat-plugin-pixiv-' + stamp,
    temp: file + '.tmp-napcat-plugin-pixiv-' + process.pid,
    uid: metadata.uid,
    gid: metadata.gid,
    mode: metadata.mode & 0o7777,
    content: JSON.stringify(cfg, null, 2) + '\n',
  });
}
if (pending.length === 0) {
  process.stdout.write(JSON.stringify({ configDir, changed: [] }));
  process.exit(0);
}

const staged = [];
const committed = [];
try {
  for (const item of pending) {
    fs.copyFileSync(item.file, item.backup, fs.constants.COPYFILE_EXCL);
    staged.push(item);
    fs.chownSync(item.backup, item.uid, item.gid);
    fs.chmodSync(item.backup, item.mode);
    fs.writeFileSync(item.temp, item.content, { flag: 'wx', mode: item.mode });
    fs.chownSync(item.temp, item.uid, item.gid);
    fs.chmodSync(item.temp, item.mode);
  }
  for (const item of pending) {
    fs.renameSync(item.temp, item.file);
    committed.push(item);
  }
} catch (error) {
  const rollbackErrors = [];
  for (const item of committed.reverse()) {
    try {
      const restoreTemp = item.file + '.restore-napcat-plugin-pixiv-' + process.pid;
      fs.copyFileSync(item.backup, restoreTemp, fs.constants.COPYFILE_EXCL);
      fs.chownSync(restoreTemp, item.uid, item.gid);
      fs.chmodSync(restoreTemp, item.mode);
      fs.renameSync(restoreTemp, item.file);
    } catch (rollbackError) {
      rollbackErrors.push(String(rollbackError));
    }
  }
  for (const item of staged) {
    try { fs.rmSync(item.temp, { force: true }); } catch {}
  }
  if (committed.length === 0) {
    for (const item of staged) {
      try { fs.rmSync(item.backup, { force: true }); } catch {}
    }
  }
  const detail = error instanceof Error ? error.message : String(error);
  throw new Error(rollbackErrors.length
    ? 'migration failed: ' + detail + '; rollback also failed: ' + rollbackErrors.join('; ')
    : 'migration failed and changed files were restored: ' + detail);
}

process.stdout.write(JSON.stringify({
  configDir,
  changed: pending.map(({ file, backup }) => ({ file, backup })),
}));
`;

try {
  const output = execFileSync(
    'docker',
    ['exec', container, 'node', '-e', script, preferredUin],
    { encoding: 'utf8', timeout: 10_000, maxBuffer: 2 * 1024 * 1024 },
  ).trim();
  const result = JSON.parse(output || '{}');
  if (result.warning) {
    console.warn(`[napcat-plugin-pixiv] SnowLuma 旧配置迁移：${result.warning}`);
    process.exit(0);
  }
  if (!Array.isArray(result.changed) || result.changed.length === 0) {
    console.log('[napcat-plugin-pixiv] 未发现需要迁移的旧 Pixiv 反向 WebSocket 客户端配置。');
    process.exit(0);
  }
  console.log(`[napcat-plugin-pixiv] 已禁用 ${result.changed.length} 个旧版 SnowLuma wsClient(name=Pixiv)。`);
  for (const item of result.changed) {
    console.log(`[napcat-plugin-pixiv] 已备份：${item.backup}`);
  }
  console.log('[napcat-plugin-pixiv] 当前版本改用插件主动连接 SnowLuma wsServer；旧 wsClient 正是 WebUI 持续显示“注意 · 重连中”的来源。');
  console.log(`[napcat-plugin-pixiv] 正在重启 SnowLuma 容器 ${container} 使迁移立即生效...`);
  execFileSync('docker', ['restart', container], { stdio: 'inherit', timeout: 60_000 });
  console.log('[napcat-plugin-pixiv] SnowLuma 已重启，接下来会自动重试真实 OneBot 连接。');
} catch (error) {
  console.error(`[napcat-plugin-pixiv] SnowLuma 旧配置迁移失败，部署已中止：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
