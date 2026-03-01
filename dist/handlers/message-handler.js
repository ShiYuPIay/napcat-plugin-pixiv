/**
 * Author: 希儿 (shiYuPIay)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMessage = handleMessage;
// 定义消息事件类型常量，OneBot 规范中消息事件的 post_type 为 'message'。
const MESSAGE_POST_TYPE = 'message';
const state_1 = require("../core/state");
const pixiv_service_1 = require("../services/pixiv-service");
// 匿名合并转发配置：使用系统账号头像，减少机器人身份暴露。
const ANON_FORWARD_QQ = '10001';
const ANON_FORWARD_NAME = '匿名用户';
/**
 * 消息段构造函数：文本消息
 */
function textSegment(text) {
    return { type: 'text', data: { text } };
}
/**
 * 消息段构造函数：图片消息
 * NapCat 支持通过网络链接发送图片，需填写 file 字段。
 */
function imageSegment(url) {
    return { type: 'image', data: { file: url } };
}
/**
 * 尽量从事件中提取纯文本内容，兼容不同 OneBot 实现（raw_message 可能为空）。
 */
function getPlainText(event) {
    var _a, _b, _c, _d;
    if (typeof (event === null || event === void 0 ? void 0 : event.raw_message) === 'string' && event.raw_message.trim()) {
        return event.raw_message.trim();
    }
    const msg = event === null || event === void 0 ? void 0 : event.message;
    if (typeof msg === 'string')
        return msg.trim();
    if (Array.isArray(msg)) {
        return msg
            .map((seg) => {
            var _a, _b;
            if (!seg)
                return '';
            if (typeof seg === 'string')
                return seg;
            if (seg.type === 'text')
                return String((_b = (_a = seg.data) === null || _a === void 0 ? void 0 : _a.text) !== null && _b !== void 0 ? _b : '');
            return '';
        })
            .join('')
            .trim();
    }
    return '';
}
/**
 * 根据事件发送回复。自动处理群聊和私聊。
 */
async function sendReply(ctx, event, message) {
    try {
        const params = {
            message,
            message_type: event.message_type,
            ...(event.message_type === 'group' && event.group_id
                ? { group_id: String(event.group_id) }
                : {}),
            ...(event.message_type === 'private' && event.user_id
                ? { user_id: String(event.user_id) }
                : {}),
        };
        await ctx.actions.call('send_msg', params, ctx.adapterName, ctx.pluginManager.config);
        return true;
    }
    catch (err) {
        state_1.pluginState.logger.error('发送回复失败:', err);
        return false;
    }
}
/**
 * 发送合并转发消息。将多条消息合并为一条可展开查看的聊天记录，避免刷屏。
 */
async function sendForwardMsg(ctx, target, isGroup, nodes) {
    if (isGroup) {
        // 优先使用 send_forward_msg，并设置 prompt/summary/source 隐藏机器人身份。
        try {
            await ctx.actions.call('send_forward_msg', {
                group_id: String(target),
                messages: nodes,
                prompt: '[Pixiv 消息转发]',
                summary: `查看${nodes.length}条插画`,
                source: '匿名转发',
            }, ctx.adapterName, ctx.pluginManager.config);
            return true;
        }
        catch (e1) {
            var _a;
            (_a = state_1.pluginState.logger.warn) === null || _a === void 0 ? void 0 : _a.call(state_1.pluginState.logger, 'send_forward_msg 发送失败，尝试群聊合并转发回退:', e1);
        }
    }
    const actionName = isGroup ? 'send_group_forward_msg' : 'send_private_forward_msg';
    const base = isGroup ? { group_id: String(target) } : { user_id: String(target) };
    // 兼容不同 OneBot 实现：优先 messages，失败回退 message。
    try {
        await ctx.actions.call(actionName, { ...base, messages: nodes }, ctx.adapterName, ctx.pluginManager.config);
        return true;
    }
    catch (e2) {
        var _b;
        (_b = state_1.pluginState.logger.warn) === null || _b === void 0 ? void 0 : _b.call(state_1.pluginState.logger, '合并转发参数 messages 失败，尝试 message 回退:', e2);
    }
    try {
        await ctx.actions.call(actionName, { ...base, message: nodes }, ctx.adapterName, ctx.pluginManager.config);
        return true;
    }
    catch (e3) {
        state_1.pluginState.logger.error('发送合并转发失败:', e3);
        return false;
    }
}
/**
 * 创建一个合并转发节点，用于展示单条插画信息。
 */
function buildForwardNode(illust, isGroup, botId) {
    // 构造插画标题与标签信息
    const titleLine = `${illust.title} - ${illust.author}`;
    const tagLine = illust.tags.length > 0 ? `标签: ${illust.tags.join(', ')}` : '';
    const content = [
        textSegment(`${titleLine}\n${tagLine}\n`),
        imageSegment(illust.url),
    ];
    const node = {
        type: 'node',
        data: {
            nickname: isGroup ? ANON_FORWARD_NAME : 'PixivBot',
            content,
        },
    };
    // 群聊默认使用匿名头像；私聊保留机器人头像。
    node.data.user_id = isGroup ? ANON_FORWARD_QQ : (botId || ANON_FORWARD_QQ);
    return node;
}
/**
 * 主消息处理函数。当收到消息事件时由 plugin_onmessage 调用。
 * 判断是否匹配指令并执行搜索或推荐操作。
 */
async function handleMessage(ctx, event) {
    try {
        // 仅处理消息事件
        if (event.post_type !== MESSAGE_POST_TYPE)
            return;
        if (!state_1.pluginState.config.enabled)
            return;
        const rawMessage = getPlainText(event);
        if (!rawMessage)
            return;
        const prefix = state_1.pluginState.config.commandPrefix || '#pixiv';
        if (!rawMessage.startsWith(prefix))
            return;
        const commandText = rawMessage.slice(prefix.length).trim();
        // 如果没有参数，发送帮助
        if (!commandText) {
            const helpLines = [
                'Pixiv 插件帮助',
                `${prefix}<关键词> - 搜索含有关键词的插画`,
                `${prefix}rec - 获取随机推荐插画`,
                `${prefix}推荐 - 获取随机推荐插画`,
                `${prefix}help - 显示本帮助`,
            ];
            await sendReply(ctx, event, helpLines.join('\n'));
            return;
        }
        const normalizedCommand = commandText.replace(/\s+/g, '').toLowerCase();
        // 处理帮助指令
        if (normalizedCommand === 'help' || normalizedCommand === '帮助') {
            const helpLines = [
                'Pixiv 插件帮助',
                `${prefix}<关键词> - 搜索含有关键词的插画`,
                `${prefix}rec - 获取随机推荐插画`,
                `${prefix}推荐 - 获取随机推荐插画`,
                `${prefix}help - 显示本帮助`,
            ];
            await sendReply(ctx, event, helpLines.join('\n'));
            return;
        }
        const maxResults = Math.min(10, Math.max(1, Number(state_1.pluginState.config.maxResults) || 3));
        const allowR18Config = Boolean(state_1.pluginState.config.allowR18);
        const allowR18 = event.message_type === 'private' ? allowR18Config : false;
        // 推荐指令
        if (normalizedCommand === 'rec' || normalizedCommand === '推荐') {
            const illusts = await (0, pixiv_service_1.recommendIllusts)(maxResults, allowR18);
            if (illusts.length === 0) {
                await sendReply(ctx, event, '未找到推荐插画，请稍后再试。');
                return;
            }
            // 如果只有一张图片，直接发送
            if (illusts.length === 1) {
                const illust = illusts[0];
                const segments = [
                    textSegment(`${illust.title} - ${illust.author}\n` + (illust.tags.length > 0 ? `标签: ${illust.tags.join(', ')}\n` : '')),
                    imageSegment(illust.url),
                ];
                await sendReply(ctx, event, segments);
                return;
            }
            // 多张图片，构建合并转发。显式传入机器人的 QQ 号用于隐藏触发者信息。
            const botId = event.self_id ? String(event.self_id) : undefined;
            const isGroup = event.message_type === 'group';
            const nodes = illusts.map((i) => buildForwardNode(i, isGroup, botId));
            const target = isGroup ? event.group_id : event.user_id;
            await sendForwardMsg(ctx, target, isGroup, nodes);
            return;
        }
        // 默认认为剩余参数是搜索关键字
        const query = commandText;
        const illusts = await (0, pixiv_service_1.searchIllusts)(query, maxResults, allowR18);
        if (illusts.length === 0) {
            await sendReply(ctx, event, `未找到与 “${query}” 相关的插画。`);
            return;
        }
        // 如果只有一张图片，直接发送
        if (illusts.length === 1) {
            const illust = illusts[0];
            const segments = [
                textSegment(`${illust.title} - ${illust.author}\n` + (illust.tags.length > 0 ? `标签: ${illust.tags.join(', ')}\n` : '')),
                imageSegment(illust.url),
            ];
            await sendReply(ctx, event, segments);
            return;
        }
        // 多张图片，构建合并转发。显式传入机器人的 QQ 号用于隐藏触发者信息。
        const botId2 = event.self_id ? String(event.self_id) : undefined;
        const isGroup = event.message_type === 'group';
        const nodes = illusts.map((i) => buildForwardNode(i, isGroup, botId2));
        const target = isGroup ? event.group_id : event.user_id;
        await sendForwardMsg(ctx, target, isGroup, nodes);
    }
    catch (err) {
        state_1.pluginState.logger.error('处理消息时出错:', err);
    }
}
