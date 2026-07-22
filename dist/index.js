import { handleMessage } from './handlers/message-handler.js';

const TAG = '[Plugin: napcat-plugin-pixiv]';

export async function plugin_init() {
  console.log(`\x1b[30m[INFO] ${TAG} Pixiv 插件初始化完成\x1b[0m`);
}

export async function plugin_onunload() {
  console.log(`\x1b[30m[INFO] ${TAG} Pixiv 插件已卸载\x1b[0m`);
}

export async function plugin_onmessage(event, bot) {
  await handleMessage(event, bot);
}
