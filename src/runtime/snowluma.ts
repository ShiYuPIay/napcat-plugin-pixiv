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

bindLogger(null);

const configPath = resolve(process.env.PIXIV_CONFIG_FILE || './config.json');
setConfigPath(configPath);
loadConfig();
applyEnvironment();

const url =
  process.env.ONEBOT_WS_URL ||
  process.env.SNOWLUMA_WS_URL ||
  process.env.NAPCAT_WS_URL ||
  'ws://127.0.0.1:3001/';

const accessToken =
  process.env.ONEBOT_ACCESS_TOKEN ||
  process.env.SNOWLUMA_TOKEN ||
  process.env.NAPCAT_WS_TOKEN ||
  '';

const bot = new OneBotWsAdapter({
  url,
  accessToken,
  requestTimeoutMs: Number(process.env.ONEBOT_REQUEST_TIMEOUT_MS || 30_000),
  minReconnectDelayMs: 1_000,
  maxReconnectDelayMs: 30_000,
});

bot.start(async (event) => {
  if (event.post_type && event.post_type !== 'message') return;
  await handleMessage(event, bot);
});

log.info(`SnowLuma/OneBot 模式已启动，目标 ${url}`);

function shutdown(signal: string): void {
  log.info(`收到 ${signal}，正在关闭`);
  bot.stop();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
