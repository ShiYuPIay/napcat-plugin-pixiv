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
async function fetchWithTimeout(url, timeoutMs = 9000, init) {
    if (typeof _fetch !== 'function') {
        throw new Error('当前运行环境不支持 fetch（请使用 Node 18+ 或安装 undici 依赖）');
    }
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await _fetch(url, { ...init, signal: controller.signal });
    }
    finally {
        clearTimeout(t);
    }
}

/**
 * 从接口返回的多种图片链接中挑选最稳定可下载的 URL。
 * 对 NapCat 来说，优先使用 regular / small，避免 original 在部分场景 404。
 */
function pickImageUrl(urls) {
    if (!urls)
        return '';
    const candidates = [urls.regular, urls.small, urls.thumb, urls.original]
        .filter((u) => typeof u === 'string' && /^https?:\/\//.test(u));
    return candidates[0] || '';
}

/**
 * 预检查图片 URL 是否可访问，避免在发送合并转发时由 NapCat 下载失败导致整条消息报错。
 */
async function isImageUrlAvailable(url) {
    if (!url)
        return false;
    try {
        const headRes = await fetchWithTimeout(url, 5000, { method: 'HEAD' });
        if (headRes.ok)
            return true;
    }
    catch {
        // 某些 CDN 不支持 HEAD，继续尝试 GET 探测。
    }
    try {
        const getRes = await fetchWithTimeout(url, 7000, {
            method: 'GET',
            headers: { Range: 'bytes=0-0' },
        });
        return getRes.ok;
    }
    catch {
        return false;
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
        const illusts = [];
        for (const item of data) {
            const pickedUrl = pickImageUrl(item.urls);
            if (!(await isImageUrlAvailable(pickedUrl))) {
                continue;
            }
            illusts.push({
                pid: item.pid,
                title: item.title,
                author: item.author,
                tags: item.tags || [],
                url: pickedUrl,
                r18: Boolean(item.r18),
            });
        }
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
