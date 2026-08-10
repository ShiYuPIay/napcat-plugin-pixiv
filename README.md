# napcat-plugin-pixiv

Pixiv 图片搜索与推荐插件。业务逻辑只维护一份，同时支持：

- **NapCat 原生插件模式**：使用 NapCat 当前插件生命周期与 `ctx.actions.call(...)`。
- **SnowLuma / 通用 OneBot v11 模式**：通过 WebSocket 连接 OneBot `Universal` 端点。

## 功能

| 指令 | 说明 |
|---|---|
| `#pixiv` / `#pixiv随机` | 随机推荐插画 |
| `#pixiv <关键词>` | 关键词搜索 |
| `#pixivpid <作品ID>` | 按 PID 查询作品，多页作品自动展开 |
| `#pixiv画师 <UID>` / `#pixivuid <UID>` | 查看画师最新作品 |
| `#pixiv日榜` / `#pixiv周榜` / `#pixiv月榜` | Pixiv 排行榜 |
| `#pixivstatus` | 检查 Lolicon 与 Pixiv/Hibi 上游 |
| `#pixiv设置` | 管理员查看/修改常用配置 |
| `#pixivhelp` / `#pixiv帮助` | 帮助 |

内置能力：

- R18 / AI 过滤。
- 搜索词、标题和标签的屏蔽词策略（NFKC + 大小写 + 空白归一化）。
- 每用户冷却与失败退款。
- 合并转发失败自动回退逐条发送。
- 图片发送失败自动降级为文字 + Pixiv 链接。
- API 超时与错误隔离。
- SnowLuma/OneBot WebSocket 断线指数退避重连、`echo` 请求关联和 action 超时。
- 无图片 `HEAD` 预检，避免额外 RTT 和 CDN 对 HEAD 的兼容问题。

## 环境要求

- Node.js `>=22.12.0`。
- npm `>=11.18.0`；推荐 npm `11.19.0`。

npm 11.16 是 `allowScripts` 首批实现版本，存在已知的审批/告警问题。本项目使用项目级 `allowScripts` 并固定 `esbuild@0.25.12`，不要对项目执行 `npm install --allow-scripts=all`。

升级 npm：

```bash
npm install --global npm@11.19.0
npm --version
```

## 开发

```bash
npm install
npm run typecheck
npm test
npm run build
```

如需检查是否仍有未审核的依赖安装脚本：

```bash
npm install-scripts ls
```

构建后：

```text
dist/
├── index.mjs       # NapCat 插件入口
├── snowluma.mjs    # SnowLuma / OneBot 独立运行入口
├── chunks/
├── package.json
├── README.md
└── LICENSE
```

## NapCat 安装

构建后将 `dist/` 目录内容作为插件包使用。`dist/package.json` 的入口为 `index.mjs`。

NapCat WebUI 中可直接配置：

- 启用状态、命令前缀。
- R18 / AI 过滤。
- 返回数量与用户冷却。
- 管理员 QQ。
- 屏蔽词。
- Lolicon / Hibi API、图片反代和请求超时。

插件使用 NapCat 原生生命周期，不会自行连接 NapCat WebSocket。

## SnowLuma / OneBot v11

SnowLuma 默认 OneBot WebSocket 端口为 `3001`。确保对应 `wsServers` 已启用，并使用 `Universal` 角色。

先构建：

```bash
npm install --global npm@11.19.0
npm install
npm run build
```

运行：

```bash
ONEBOT_WS_URL=ws://127.0.0.1:3001/ \
SNOWLUMA_TOKEN=your-token \
node dist/snowluma.mjs
```

兼容的连接变量优先级：

1. `ONEBOT_WS_URL` / `ONEBOT_ACCESS_TOKEN`
2. `SNOWLUMA_WS_URL` / `SNOWLUMA_TOKEN`
3. `NAPCAT_WS_URL` / `NAPCAT_WS_TOKEN`
4. 默认 `ws://127.0.0.1:3001/`

Pixiv 配置可放在当前目录 `config.json`，也可设置：

```bash
PIXIV_CONFIG_FILE=/path/to/config.json
```

常用环境变量：

```text
PIXIV_ENABLED
PIXIV_PREFIX
PIXIV_R18
PIXIV_NUM
PIXIV_EXCLUDE_AI
PIXIV_ENABLE_FORWARD
PIXIV_COOLDOWN
PIXIV_BLOCKED_KEYWORDS
PIXIV_ADMIN_USERS
PIXIV_LOLICON_API
PIXIV_HIBI_API
PIXIV_IMAGE_PROXY
PIXIV_REQUEST_TIMEOUT_MS
```

## 默认上游

- Lolicon：`https://api.lolicon.app/setu/v2`
- Pixiv/Hibi：`https://api.obfs.dev/api/pixiv`
- 图片反代：`i.pixiv.re`

上游属于第三方服务，可能出现限流、网络故障或接口变更。`#pixivstatus` 可用于快速定位。

## 项目结构

```text
src/
├── index.ts
├── adapters/
│   ├── napcat-adapter.ts
│   └── onebot-ws-adapter.ts
├── core/
│   ├── cooldown.ts
│   └── logger.ts
├── handlers/
│   └── message-handler.ts
├── messaging/
│   └── sender.ts
├── runtime/
│   └── snowluma.ts
├── services/
│   ├── http.ts
│   ├── pixiv-service.ts
│   └── providers/
│       ├── common.ts
│       ├── hibi.ts
│       └── lolicon.ts
├── config.ts
└── types.ts
```

## 许可证

GNU AGPL v3 (`AGPL-3.0-only`).
