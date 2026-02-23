/**
 * Author: 希儿 (shiYuPIay)
 * SPDX-License-Identifier: AGPL-3.0-only
 */

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultConfig = defaultConfig;
exports.buildConfigSchema = buildConfigSchema;
/**
 * 默认配置。当用户未在配置界面设置时，会使用这些值。
 */
function defaultConfig() {
    return {
        enabled: true,
        commandPrefix: '#pixiv',
        maxResults: 3,
        allowR18: false,
    };
}
/**
 * 构建插件配置的 Schema，用于在 NapCat WebUI 自动生成配置面板。
 * @param ctx 插件上下文
 */
function buildConfigSchema(ctx) {
    const { NapCatConfig } = ctx;
    return [
        NapCatConfig.boolean({
            key: 'enabled',
            label: '启用插件',
            default: true,
            description: '是否启用 Pixiv 搜索与推荐功能',
        }),
        NapCatConfig.text({
            key: 'commandPrefix',
            label: '指令前缀',
            default: '#pixiv',
            placeholder: '例如 #pixiv',
            description: '调用本插件的指令前缀',
        }),
        NapCatConfig.number({
            key: 'maxResults',
            label: '最大结果数量',
            default: 3,
            min: 1,
            max: 10,
            description: '每次搜索或推荐返回图片的最大数量',
        }),
        NapCatConfig.boolean({
            key: 'allowR18',
            label: '允许 R18',
            default: false,
            description: '是否允许返回 R18 插画',
        }),
    ];
}
