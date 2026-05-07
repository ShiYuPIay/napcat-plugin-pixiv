# NapCat Pixiv 插件

NapCatBot 的 Pixiv 插件，支持通过指令快速搜索、随机推荐与日榜浏览，并将多张图片合并转发，避免刷屏。

## 功能总览

- **关键词搜索**：`#pixiv<关键词>` 搜索匹配关键词的插画。
- **随机推荐**：`#pixivrec` / `#pixiv推荐` 获取随机插画。
- **日榜 Top10**：`#pixiv日榜` 或 `!pixiv日榜` 获取每日热门作品。
- **状态自检**：`#pixivstatus` 检查第三方 API 连通性，便于部署验收。
- **合规防滥用**：内置限流、拦截关键词、可关闭匿名转发，降低违规与恶意举报风险。
- **合并转发**：多图结果会优先以合并转发发送，减少聊天刷屏。

## 快速开始

1. 下载仓库并放入 NapCat 插件目录（通常为 `napcat-data/plugins/`）。
2. 在 NapCat 管理后台启用 **Pixiv 插件**。
3. 在群聊或私聊发送 `#pixivhelp` 查看指令。

---

## 超详细部署教程（生产可用）

> 适用于首次部署、迁移服务器、以及线上故障排查。

## 0. 前置条件

- NapCat 版本：**>= 4.14.0**
- Node.js：建议 **18+**（支持全局 `fetch`）
- 服务器可访问以下接口：
  - `https://api.lolicon.app`
  - `https://api.obfs.dev`

## 1. 准备插件目录

1. 登录你的 NapCat 运行环境。
2. 进入插件目录（示例）：
   ```bash
   cd /path/to/napcat-data/plugins
   ```
3. 下载插件：
   ```bash
   git clone https://github.com/ShiYuPIay/napcat-plugin-pixiv.git
   ```

> 如果服务器无法直连 GitHub，可先本地下载 zip 再上传。

## 2. 安装依赖并构建

进入插件目录：

```bash
cd napcat-plugin-pixiv
npm install
npm run build
```

构建后应生成/更新 `dist/` 下的入口文件。

## 3. 在 NapCat 中启用插件

1. 打开 NapCat WebUI。
2. 进入「插件管理」。
3. 找到 **Pixiv 搜索与推荐** 并启用。
4. 配置以下参数：

- `enabled`：是否启用插件。
- `commandPrefix`：指令前缀，默认 `#pixiv`。
- `maxResults`：搜索/推荐单次返回数量（1~10）。
- `allowR18`：是否允许返回 R18 插画。

## 4. 部署后验收（建议逐条执行）

### 4.1 基础命令验收

- `#pixivhelp`：应返回帮助菜单。
- `#pixiv初音ミク`：应返回搜索结果（图片或合并转发）。
- `#pixivrec`：应返回随机推荐。
- `#pixiv日榜`：应返回日榜 Top10。

### 4.2 连通性验收（新增）

发送：

- `#pixivstatus`

期望返回：

- Lolicon API：✅ 可访问
- Pixiv 日榜 API：✅ 可访问

若返回不可访问，请按第 6 节排查。

## 5. 生产环境建议

- 为机器人所在机器配置稳定 DNS（如 1.1.1.1 / 8.8.8.8）。
- 推荐开启系统级时间同步（NTP），避免 TLS/证书问题。
- 建议在反向代理或防火墙中放行上述 API 域名。
- `maxResults` 不建议超过 5，降低消息风控概率与发送失败率。

## 6. 故障排查手册

## 问题 A：命令无响应

- 检查插件是否启用（`enabled=true`）。
- 检查前缀是否被修改（例如改成 `/pixiv`）。
- 检查是否发送了文本消息（非图片/语音）。

## 问题 B：只有文字没有图片

- 可能是第三方图片链接临时失效。
- 插件会自动过滤不可访问链接，可重试或减少数量。

## 问题 C：日榜失败

- 先执行 `#pixivstatus` 查看日榜 API 状态。
- 若 `Pixiv 日榜 API` 不可访问，通常是网络或第三方限流问题。

## 问题 D：群内发不出合并转发

- 插件会自动尝试多个 OneBot 接口并回退。
- 请确认 NapCat 与适配器版本支持 `send_group_forward_msg`。

## 7. 常用指令清单

- `#pixiv<关键词>`：搜索插画
- `#pixivrec` / `#pixiv推荐`：随机推荐
- `#pixiv日榜` / `#pixivdaily`：日榜 Top10
- `!pixiv日榜`：无前缀快捷日榜
- `#pixivstatus`：接口健康检查
- `#pixivhelp`：帮助

## 8. 安全与合规提醒

- 本插件使用第三方聚合 API，**非 Pixiv 官方接口**。
- `allowR18` 默认关闭；开启前请确保符合群规与当地法律。
- 建议仅在明确授权和合规的聊天场景中使用。


## 9. 防检测/防举报的正确做法（合规版）

> 不建议、也不提供绕过平台审核/规避监管的方案。应采用合规治理策略。

- 开启 `rateLimitSeconds`，避免刷屏触发风控。
- 配置 `blockedKeywords` 拦截高风险请求。
- 建议关闭 `enableAnonymousForward`，保留可审计身份。
- 在群规中明确：禁止未成年人、暴力、违法内容检索。
- 发生举报时：先停用插件，再通过日志复盘请求来源。

### 新增配置项说明

- `enableForward`：是否使用合并转发。
- `enableAnonymousForward`：是否匿名转发（默认关闭）。
- `rateLimitSeconds`：同一用户请求最小间隔。
- `blockedKeywords`：逗号分隔的敏感词拦截列表。

## License

本项目使用 **GNU Affero General Public License v3.0 (AGPL-3.0-only)** 授权，详见 `LICENSE`。
