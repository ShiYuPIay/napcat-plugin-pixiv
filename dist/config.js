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
        enableForward: true,
        enableAnonymousForward: false,
        rateLimitSeconds: 15,
        blockedKeywords: '萝莉,未成年,幼女,乱伦,强奸',
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
        NapCatConfig.boolean({
            key: 'enableForward',
            label: '启用合并转发',
            default: true,
            description: '是否优先使用合并转发发送多图结果',
        }),
        NapCatConfig.boolean({
            key: 'enableAnonymousForward',
            label: '匿名转发节点',
            default: false,
            description: '是否使用匿名昵称发送转发节点（默认关闭，便于审计）',
        }),
        NapCatConfig.number({
            key: 'rateLimitSeconds',
            label: '用户请求间隔(秒)',
            default: 15,
            min: 3,
            max: 300,
            description: '同一用户再次调用指令的最小间隔，防止刷屏和恶意触发',
        }),
        NapCatConfig.text({
            key: 'blockedKeywords',
            label: '拦截关键词',
            default: '萝莉,未成年,幼女,乱伦,强奸',
            placeholder: '逗号分隔，例如: 违禁词1,违禁词2',
            description: '命中后直接拒绝请求，降低违规和举报风险',
        }),
    ];
}
