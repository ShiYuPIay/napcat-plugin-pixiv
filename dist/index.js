import { handleMessage } from './handlers/message-handler.js';

const TAG = '[Plugin: napcat-plugin-pixiv]';

export async function plugin_init(ctx) {
  // NapCat provides ctx.logger in newer versions — use it when available so
  // the log line appears with the correct [Plugin: X] prefix in NapCat's output
  if (ctx?.logger) {
    ctx.logger.info('Pixiv 插件初始化完成');
  } else {
    console.log(`\x1b[30m[INFO] ${TAG} Pixiv 插件初始化完成\x1b[0m`);
  }
}

export async function plugin_onunload(ctx) {
  if (ctx?.logger) {
    ctx.logger.info('Pixiv 插件已卸载');
  } else {
    console.log(`\x1b[30m[INFO] ${TAG} Pixiv 插件已卸载\x1b[0m`);
  }
}

export async function plugin_onmessage(event, bot) {
  await handleMessage(event, bot);
}
