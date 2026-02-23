/**
 * Author: 希儿 (shiYuPIay)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pluginState = void 0;
const config_1 = require("../config");
/**
 * 插件全局状态管理。
 * 在插件初始化时保存上下文和配置，后续可以在消息处理器中访问。
 */
class PluginState {
    constructor() {
        /** 当前插件上下文 */
        this.ctx = null;
        /** 当前配置 */
        this.config = (0, config_1.defaultConfig)();
    }
    /** 初始化状态，记录上下文并加载配置 */
    init(ctx) {
        var _a;
        this.ctx = ctx;
        // 合并已有配置（如果存在）
        try {
            const storedConfig = (_a = ctx.pluginData) === null || _a === void 0 ? void 0 : _a.config;
            if (storedConfig) {
                this.config = { ...this.config, ...storedConfig };
            }
        }
        catch {
            // ignore
        }
    }
    /** 更新配置（用于 WebUI 单项变更） */
    updateConfig(partial) {
        var _c, _d;
        this.config = { ...this.config, ...partial };
        // 尝试写回到 NapCat 的持久化存储（如果存在）
        try {
            if ((_c = this.ctx) === null || _c === void 0 ? void 0 : _c.pluginData) {
                this.ctx.pluginData.config = { ...((_d = this.ctx.pluginData.config) !== null && _d !== void 0 ? _d : {}), ...partial };
            }
        }
        catch {
            // ignore
        }
    }
    /** 替换整个配置 */
    replaceConfig(conf) {
        var _c;
        this.config = conf;
        // 尝试写回到 NapCat 的持久化存储（如果存在）
        try {
            if ((_c = this.ctx) === null || _c === void 0 ? void 0 : _c.pluginData) {
                this.ctx.pluginData.config = conf;
            }
        }
        catch {
            // ignore
        }
    }
    /** 获取日志记录器，若上下文不存在则返回 console */
    get logger() {
        var _a, _b;
        return (_b = (_a = this.ctx) === null || _a === void 0 ? void 0 : _a.logger) !== null && _b !== void 0 ? _b : console;
    }
}
exports.pluginState = new PluginState();
