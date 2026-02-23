/**
 * Author: 希儿 (shiYuPIay)
 * SPDX-License-Identifier: AGPL-3.0-only
 */

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchIllusts = searchIllusts;
exports.recommendIllusts = recommendIllusts;
/**
 * 第三方接口地址。我们使用 lolicon.app 提供的公开接口，它会从 Pixiv 抽取插画信息并提供 CDN 直链。
 * 文档: https://api.lolicon.app/#/setu
 */
const API_BASE = 'https://api.lolicon.app/setu/v2';
/**
 * 兼容不同 Node 版本：优先使用全局 fetch（Node 18+），否则尝试使用 undici 的 fetch。
 */
const _fetch = globalThis.fetch
    ?? (() => {
        try {
            return require('undici').fetch;
        }
        catch {
            return undefined;
        }
    })();
/**
 * 带超时的 fetch，避免第三方接口卡死导致消息处理挂起。
 */
async function fetchWithTimeout(url, timeoutMs = 9000) {
    if (typeof _fetch !== 'function') {
        throw new Error('当前运行环境不支持 fetch（请使用 Node 18+ 或安装 undici 依赖）');
    }
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await _fetch(url, { signal: controller.signal });
    }
    finally {
        clearTimeout(t);
    }
}

/**
 * 向第三方接口发起请求，获取插画信息。
 * @param params 请求参数
 */
async function fetchIllusts(params) {
    try {
        // 构造查询字符串
        const sp = new URLSearchParams();
        for (const [k, v] of Object.entries(params))
            sp.set(k, String(v));
        const query = sp.toString();
        const url = `${API_BASE}?${query}`;
        const res = await fetchWithTimeout(url, 9000);
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        const json = (await res.json());
        const data = (json === null || json === void 0 ? void 0 : json.data) || [];
        const illusts = data.map((item) => {
            var _a, _b;
            return {
                pid: item.pid,
                title: item.title,
                author: item.author,
                tags: item.tags || [],
                url: ((_a = item.urls) === null || _a === void 0 ? void 0 : _a.original) || ((_b = item.urls) === null || _b === void 0 ? void 0 : _b.regular) || '',
                r18: Boolean(item.r18),
            };
        });
        return illusts;
    }
    catch (err) {
        console.warn('请求插画接口失败', err);
        return [];
    }
}
/**
 * 根据关键词搜索插画。
 * @param tag 关键词（可为中文或日文标签）
 * @param num 返回数量
 * @param allowR18 是否允许返回 R18 作品
 */
async function searchIllusts(tag, num, allowR18) {
    const params = {
        tag,
        num,
        r18: allowR18 ? 1 : 0,
        size: 'regular',
    };
    return fetchIllusts(params);
}
/**
 * 获取随机推荐插画。如果不指定关键词则随机推荐。
 * @param num 返回数量
 * @param allowR18 是否允许返回 R18 作品
 */
async function recommendIllusts(num, allowR18) {
    const params = {
        num,
        r18: allowR18 ? 1 : 0,
        size: 'regular',
    };
    return fetchIllusts(params);
}
