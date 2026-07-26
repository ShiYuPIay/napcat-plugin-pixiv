import { handleMessage } from './handlers/message-handler.js';
import { adoptCtxConfig, loadConfigFile } from './config.js';
import { bindLogger, log } from './core/logger.js';

export async function plugin_init(ctx) {
  bindLogger(ctx?.logger);

  // Config precedence: defaults < WebUI/panel (when NapCat provides it) < config.json
  const fromCtx  = adoptCtxConfig(ctx);
  const fromFile = loadConfigFile();
  if (fromCtx?.invalid?.length)  log.warn(`忽略无效的面板配置项: ${fromCtx.invalid.join(', ')}`);
  if (fromFile?.invalid?.length) log.warn(`忽略无效的 config.json 配置项: ${fromFile.invalid.join(', ')}`);

  log.info('Pixiv 插件初始化完成');
}

export async function plugin_onunload() {
  log.info('Pixiv 插件已卸载');
}

export async function plugin_onmessage(event, bot) {
  await handleMessage(event, bot);
}
