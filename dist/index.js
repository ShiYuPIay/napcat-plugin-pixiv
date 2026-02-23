/**
 * Author: 希儿 (shiYuPIay)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
"use strict";
/**
 * NapCat Pixiv 插件主入口
 *
 * 提供搜索与推荐 Pixiv 插画的功能，支持合并转发多张图片，避免刷屏。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.plugin_cleanup = exports.plugin_set_config = exports.plugin_get_config = exports.plugin_on_config_change = exports.plugin_onmessage = exports.plugin_init = exports.plugin_config_ui = void 0;
// OneBot 规范中的消息事件 post_type 为 'message'，无需从包中导入。
const config_1 = require("./config");
const state_1 = require("./core/state");
const message_handler_1 = require("./handlers/message-handler");
// 导出用于生成 WebUI 配置面板的 Schema。将在 plugin_init 中赋值。
exports.plugin_config_ui = [];
/**
 * 插件初始化。在 NapCat 加载插件时调用。用于初始化全局状态与配置。该函数必须存在。
 */
const plugin_init = async (ctx) => {
    try {
        // 初始化全局状态
        state_1.pluginState.init(ctx);
        // 初始化配置。如果系统已经有保存的配置，则 pluginState.init 会合并。
        state_1.pluginState.replaceConfig({ ...(0, config_1.defaultConfig)(), ...state_1.pluginState.config });
        // 生成配置 Schema，用于 WebUI
        exports.plugin_config_ui = (0, config_1.buildConfigSchema)(ctx);
        ctx.logger.info('Pixiv 插件初始化完成');
    }
    catch (err) {
        ctx.logger.error('Pixiv 插件初始化失败:', err);
    }
};
exports.plugin_init = plugin_init;
/**
 * 消息事件处理。仅处理 OneBot 消息事件。
 */
const plugin_onmessage = async (ctx, event) => {
    // 仅处理消息事件
    if (!event || event.post_type !== 'message')
        return;
    await (0, message_handler_1.handleMessage)(ctx, event);
};
exports.plugin_onmessage = plugin_onmessage;
/**
 * 当配置在 WebUI 中变更时触发。支持单项更新。
 */
const plugin_on_config_change = async (ctx, ui, key, value, currentConfig) => {
    try {
        // 更新内存中的配置
        state_1.pluginState.updateConfig({ [key]: value });
        ctx.logger.debug(`Pixiv 插件配置 ${String(key)} 已更新`);
    }
    catch (err) {
        ctx.logger.error('更新配置失败:', err);
    }
};
exports.plugin_on_config_change = plugin_on_config_change;
/**
 * 获取当前配置。供 NapCat 调用。
 */
const plugin_get_config = async () => {
    return state_1.pluginState.config;
};
exports.plugin_get_config = plugin_get_config;
/**
 * 替换整个配置。当用户点击保存时调用。
 */
const plugin_set_config = async (ctx, config) => {
    state_1.pluginState.replaceConfig(config);
    ctx.logger.info('Pixiv 插件配置已替换');
};
exports.plugin_set_config = plugin_set_config;
/**
 * 插件卸载或重载时的清理函数。
 */
const plugin_cleanup = async (ctx) => {
    ctx.logger.info('Pixiv 插件已卸载');
};
exports.plugin_cleanup = plugin_cleanup;
