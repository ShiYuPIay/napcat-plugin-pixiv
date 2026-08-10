#!/usr/bin/env node
import { resolve } from 'node:path';
import { OneBotWsAdapter } from '../adapters/onebot-ws-adapter.ts';
import {
  applyEnvironment,
  loadConfig,
  setConfigPath,
} from '../config.ts';
import { bindLogger, log } from '../core/logger.ts';
import { handleMessage } from '../handlers/message-handler.ts';
import { resolveSnowLumaConnection } from './snowluma-discovery.ts';

bindLogger(null);

const args = new Set(process.argv.slice(2));
const forceDocker = args.has('--auto');
const doctorMode = args.has('--doctor');

function configurePixiv(): void {
  const requested = process.env.PIXIV_CONFIG_FILE?.trim();
  const placeholder = requested === '/path/to/config.json';
  if (placeholder) {
    log.warn('检测到教程占位符 PIXIV_CONFIG_FILE=/path/to/config.json，已自动忽略并改用 ./config.json');
  }
  const configPath = resolve(!requested || placeholder ? './config.json' : requested);
  setConfigPath(configPath);
  loadConfig();
  applyEnvironment();
  log.info(`Pixiv 配置文件：${configPath}`);
}

configurePixiv();

let connection;
try {
  connection = resolveSnowLumaConnection({ forceDocker });
} catch (error) {
  log.error(`SnowLuma 自动发现失败：${error instanceof Error ? error.message : String(error)}`);
  log.error('请确认 Docker 容器正在运行，默认容器名应为 snowluma；自定义容器名可设置 SNOWLUMA_CONTAINER。');
  process.exitCode = 2;
  throw error;
}

const requestTimeoutMs = Number(process.env.ONEBOT_REQUEST_TIMEOUT_MS || 30_000);
const bot = new OneBotWsAdapter({
  url: connection.url,
  accessToken: connection.accessToken,
  requestTimeoutMs: Number.isFinite(requestTimeoutMs) ? requestTimeoutMs : 30_000,
  minReconnectDelayMs: 1_000,
  maxReconnectDelayMs: 30_000,
});

bot.start(async (event) => {
  if (event.post_type && event.post_type !== 'message') return;
  await handleMessage(event, bot);
});

log.info(`SnowLuma/OneBot 模式已启动，目标 ${connection.url}`);
log.info(
  `连接配置来源：${connection.source}${connection.uin ? ` / QQ=${connection.uin}` : ''} / tokenLength=${connection.accessToken.length}`,
);

async function waitUntilConnected(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (bot.isConnected) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`等待 OneBot WebSocket 连接超时（${timeoutMs}ms）`);
}

async function runDoctor(): Promise<void> {
  try {
    await waitUntilConnected(10_000);
    const login = await bot.call('get_login_info', {});
    log.info(`✅ SnowLuma 连接诊断通过：WebSocket 鉴权、OneBot Action 均正常。登录信息：${JSON.stringify(login)}`);
    log.info('下一步：运行 npm run start:snowluma，然后在 QQ 发送 #pixivping。');
  } catch (error) {
    log.error(`❌ SnowLuma 连接诊断失败：${error instanceof Error ? error.message : String(error)}`);
    log.error('检查项：容器是否运行、3001 是否映射、wsServers role 是否为 Universal、账号配置是否继承了正确 accessToken。');
    process.exitCode = 1;
  } finally {
    bot.stop();
  }
}

if (doctorMode) {
  await runDoctor();
}

function shutdown(signal: string): void {
  log.info(`收到 ${signal}，正在关闭`);
  bot.stop();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
