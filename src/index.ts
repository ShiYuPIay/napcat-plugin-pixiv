import type {
  NapCatPluginContext,
  PluginConfigSchema,
  PluginModule,
} from 'napcat-types/napcat-onebot/network/plugin/types';
import { NapCatAdapter, type NapCatContextLike } from './adapters/napcat-adapter.ts';
import {
  applyConfig,
  getConfig,
  loadConfig,
  saveConfig,
  setConfigPath,
} from './config.ts';
import { bindLogger, log } from './core/logger.ts';
import { handleMessage } from './handlers/message-handler.ts';
import type { MessageEvent, PluginConfig } from './types.ts';

export let plugin_config_ui: PluginConfigSchema = [];

function buildConfigSchema(ctx: NapCatPluginContext): PluginConfigSchema {
  const c = ctx.NapCatConfig;
  return c.combine(
    c.boolean('enabled', '启用插件', true, '关闭后不再响应 Pixiv 指令', true),
    c.text('prefix', '指令前缀', '#pixiv', '例如 #pixiv', true),
    c.select(
      'r18',
      'R18 模式',
      [
        { label: '关闭 R18', value: 0 },
        { label: '仅 R18', value: 1 },
        { label: '混合', value: 2 },
      ],
      0,
      '控制返回作品的 R18 范围',
    ),
    c.number('num', '返回数量', 5, '每次最多返回 1-20 张', true),
    c.boolean('excludeAI', '过滤 AI 作品', true, '默认过滤 AI 生成作品', true),
    c.boolean('enableForward', '优先合并转发', true, '失败时自动回退逐条发送', true),
    c.number('rateLimitSecs', '用户冷却（秒）', 15, '0 表示关闭冷却', true),
    c.text(
      'blockedKeywords',
      '屏蔽关键词',
      '萝莉,loli,ロリ,正太,shota,ショタ,未成年,幼女,小学生,乱伦',
      '逗号分隔；同时检查搜索词、作品标题和标签',
      true,
    ),
    c.text('adminUsers', '插件管理员 QQ', '', '多个 QQ 号使用逗号分隔', true),
    c.text('loliconApi', 'Lolicon API', 'https://api.lolicon.app/setu/v2', '', true),
    c.text('hibiApi', 'Pixiv/Hibi API', 'https://api.obfs.dev/api/pixiv', '', true),
    c.text('imageProxy', 'Pixiv 图片反代', 'i.pixiv.re', '', true),
    c.number('requestTimeoutMs', '上游请求超时（毫秒）', 8000, '范围 1000-60000', true),
  );
}

function prepareContext(ctx: NapCatPluginContext): NapCatContextLike {
  bindLogger(ctx.logger);
  setConfigPath(ctx.configPath);
  return ctx as unknown as NapCatContextLike;
}

export const plugin_init: PluginModule['plugin_init'] = async (ctx) => {
  prepareContext(ctx);
  plugin_config_ui = buildConfigSchema(ctx);
  const result = loadConfig();
  if (result?.invalid.length) {
    log.warn(`忽略无效配置项：${result.invalid.join(', ')}`);
  }
  log.info('Pixiv 插件初始化完成（NapCat 原生模式）');
};

export const plugin_onmessage: PluginModule['plugin_onmessage'] = async (ctx, event) => {
  const napcatCtx = prepareContext(ctx);
  const bot = new NapCatAdapter(napcatCtx);
  await handleMessage(event as unknown as MessageEvent, bot);
};

export const plugin_get_config: PluginModule['plugin_get_config'] = async (ctx) => {
  prepareContext(ctx);
  loadConfig();
  return { ...getConfig() };
};

export const plugin_set_config: PluginModule['plugin_set_config'] = async (ctx, config) => {
  prepareContext(ctx);
  const { applied, invalid } = applyConfig(config as Record<string, unknown>);
  if (invalid.length) {
    log.warn(`忽略无效配置项：${invalid.join(', ')}`);
  }
  if (!saveConfig(applied)) {
    log.warn('插件配置写入失败');
  }
};

export const plugin_on_config_change: PluginModule['plugin_on_config_change'] =
  async (ctx, _ui, _key, _value, currentConfig) => {
    prepareContext(ctx);
    const { applied, invalid } = applyConfig(currentConfig as Record<string, unknown>);
    if (invalid.length) log.warn(`忽略无效配置项：${invalid.join(', ')}`);
    saveConfig(applied);
  };

export const plugin_cleanup: PluginModule['plugin_cleanup'] = async (ctx) => {
  prepareContext(ctx);
  log.info('Pixiv 插件已卸载');
  bindLogger(null);
};

export type { PluginConfig };
