# napcat-plugin-pixiv

> Pixiv 图片搜索与推荐插件，支持 **NapCat 原生插件模式** 与 **SnowLuma / OneBot v11 WebSocket 模式**。

[![Version](https://img.shields.io/badge/version-1.4.0-blue.svg)](./package.json)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.12.0-brightgreen.svg)](./package.json)
[![License](https://img.shields.io/badge/license-AGPL--3.0--only-orange.svg)](./LICENSE)

## 项目简介

`napcat-plugin-pixiv` 为 QQ Bot 提供 Pixiv 插画搜索、随机推荐、PID 查询、画师作品、排行榜和多图合并转发等能力。

项目当前同时支持两种运行方式：

- **NapCat 原生插件模式**：由 NapCat 插件生命周期直接加载，不需要插件自行连接 NapCat WebSocket。
- **SnowLuma / OneBot v11 模式**：插件作为独立 Node.js 进程运行，通过 OneBot WebSocket 接收消息并调用 Action。

当前版本：**1.4.0**

作者：**ShiYuPIay**

许可证：**GNU AGPL v3 (`AGPL-3.0-only`)**

---

## 主要功能

- Pixiv 随机插画推荐。
- Pixiv 关键词搜索。
- 按作品 PID 查询。
- 按画师 UID 获取最新作品。
- 日榜、周榜、月榜。
- 群聊和私聊支持。
- 多图片优先使用 OneBot 合并转发。
- 合并转发失败时自动降级逐张发送。
- 图片发送失败时继续降级为文字与作品链接。
- 用户级冷却与请求限流。
- 关键词内容过滤。
- 默认过滤 AI 生成作品。
- R18 模式可配置，默认关闭。
- 管理员 QQ 白名单。
- NapCat WebUI 配置支持。
- SnowLuma Docker 自动发现。
- OneBot WebSocket 自动重连。
- SnowLuma 连接 Doctor 诊断。
- Linux systemd 进程守护、自动重启与开机自启。

> 多图片功能是“获取多条结果后合并转发”，不是 QQ 原生复选框式图片选择 UI。

---

## 环境要求

| 项目 | 要求 |
|---|---|
| Node.js | `>= 22.12.0` |
| npm | `>= 11.18.0` |
| 推荐 npm | `11.19.0` |
| NapCat | `>= 4.14.0` |
| SnowLuma | OneBot v11 WebSocket 可用 |
| Linux SnowLuma 自动部署 | Docker + systemd |

升级 npm：

```bash
npm install --global npm@11.19.0
```

安装项目依赖：

```bash
npm install
```

完整检查：

```bash
npm run check
```

`npm run check` 会依次执行 TypeScript 类型检查、测试和构建。

---

## 快速开始

### 方式一：NapCat 原生插件模式

克隆项目：

```bash
git clone https://github.com/ShiYuPIay/napcat-plugin-pixiv.git
cd napcat-plugin-pixiv
```

安装依赖并构建：

```bash
npm install
npm run check
```

构建完成后会生成：

```text
dist/
├── index.mjs
├── snowluma.mjs
├── chunks/
├── package.json
├── README.md
└── LICENSE
```

将 `dist/` 中的插件文件部署到 NapCat 插件目录，例如：

```text
<NAPCAT_PLUGIN_DIR>/napcat-plugin-pixiv/
```

然后在 NapCat 中加载或重载插件。

NapCat 原生模式下，插件直接使用 NapCat 提供的插件上下文与 OneBot Action，不需要再配置 `ONEBOT_WS_URL`。

首次验收建议发送：

```text
#pixivping
```

如果机器人回复 Pixiv 插件在线，说明消息收发链路正常。

---

### 方式二：SnowLuma Docker 一键部署

适用于 SnowLuma 与本插件运行在同一台 Linux 主机，并且 SnowLuma 使用 Docker 的场景。

进入项目目录：

```bash
cd <PLUGIN_DIR>/napcat-plugin-pixiv
```

更新代码：

```bash
git fetch --all --prune
git switch main
git pull --ff-only
```

执行自动部署：

```bash
bash scripts/deploy-snowluma.sh
```

部署脚本会自动执行：

1. 同步指定 Git 分支。
2. 检查 Node.js / npm。
3. 固定 npm 到项目推荐版本。
4. 安装依赖。
5. 执行 `typecheck + test + build`。
6. 检测 SnowLuma Docker 容器。
7. 自动读取 OneBot 配置。
8. 执行 WebSocket 鉴权和 `get_login_info` 诊断。
9. 安装或更新 systemd 服务。
10. 开启开机自启并启动插件。

默认 SnowLuma Docker 容器名称为：

```text
snowluma
```

如果容器名称不同：

```bash
SNOWLUMA_CONTAINER=<SNOWLUMA_CONTAINER> bash scripts/deploy-snowluma.sh
```

多 QQ 环境建议明确指定目标机器人 QQ：

```bash
SNOWLUMA_UIN=<BOT_QQ> bash scripts/deploy-snowluma.sh
```

也可以通过 npm 执行：

```bash
SNOWLUMA_UIN=<BOT_QQ> npm run deploy:snowluma
```

> `<BOT_QQ>` 仅为占位符，请替换为你自己的机器人 QQ。不要把真实账号、Token 或服务器信息提交到公开仓库。

部署完成后，可以断开 SSH，systemd 会继续守护插件进程。

---

## SnowLuma 自动发现

在本机 Docker 模式下，插件可以自动发现 SnowLuma OneBot WebSocket 配置，无需把 Access Token 写进 README、启动脚本或 Git 仓库。

自动发现会尝试：

- 查找 SnowLuma Docker 容器。
- 解析 SnowLuma 全局与账号级 OneBot 配置。
- 识别 `onebot.json` 和 `onebot_<UIN>.json`。
- 选择可同时收发事件与 Action 的 `Universal` WebSocket Server。
- 读取 Docker 实际端口映射。
- 获取当前有效 Access Token，但不会主动把完整 Token 输出到 README。

手动执行连接诊断：

```bash
npm run doctor:snowluma
```

多 QQ 环境：

```bash
SNOWLUMA_UIN=<BOT_QQ> npm run doctor:snowluma
```

诊断通过时会看到类似：

```text
✅ SnowLuma 连接诊断通过：WebSocket 鉴权、OneBot Action 均正常。
```

---

## 远程 / 非 Docker SnowLuma

自动发现主要面向本机 Docker。

远程 SnowLuma 或自定义 OneBot WebSocket 可以手动设置：

```bash
export ONEBOT_WS_URL='ws://127.0.0.1:3001/'
export ONEBOT_ACCESS_TOKEN='<ONEBOT_ACCESS_TOKEN>'
node dist/snowluma.mjs
```

兼容的环境变量名称：

```text
SNOWLUMA_WS_URL
SNOWLUMA_TOKEN
NAPCAT_WS_URL
NAPCAT_WS_TOKEN
```

请将：

```text
<ONEBOT_ACCESS_TOKEN>
```

替换为你自己的 Token，**不要把真实 Token 写进 README、Issue、截图、日志示例或公开提交**。

---

## QQ 指令

默认前缀为：

```text
#pixiv
```

| 指令 | 说明 |
|---|---|
| `#pixivping` | 本地收发自检，不访问 Pixiv 上游 |
| `#pixiv` | 随机推荐插画 |
| `#pixiv随机` | 随机推荐插画 |
| `#pixiv <关键词>` | 按关键词搜索 |
| `#pixivpid <作品ID>` | 按 PID 查询作品 |
| `#pixiv画师 <UID>` | 获取画师最新作品 |
| `#pixivuid <UID>` | 获取画师最新作品 |
| `#pixiv日榜` | Pixiv 日榜 |
| `#pixiv周榜` | Pixiv 周榜 |
| `#pixiv月榜` | Pixiv 月榜 |
| `#pixivstatus` | 检查上游接口状态 |
| `#pixiv设置` | 管理员查看或修改配置 |
| `#pixivhelp` | 显示帮助 |
| `#pixiv帮助` | 显示帮助 |

插件支持：

- 群聊消息。
- 私聊消息。
- `raw_message`。
- OneBot 字符串消息。
- OneBot 数组消息中的 `text` 段。
- `@机器人 #pixiv...`。
- CQ 字符串形式的 `at/reply` 前缀。

---

## 多图片合并转发

配置项 `num` 控制单次最多返回多少条结果，范围：

```text
1 ~ 20
```

例如管理员设置最多返回 5 条：

```text
#pixiv设置 num 5
```

搜索：

```text
#pixiv 初音ミク
```

当返回结果不少于 2 条且 `enableForward=true` 时，插件会优先尝试发送一个合并转发。

规则：

- `>= 2` 条：优先合并转发。
- `1` 条：直接发送图片。
- 群聊：使用 `send_group_forward_msg`。
- 私聊：使用 `send_private_forward_msg`。
- 合并转发失败：自动逐条发送。
- 单图发送失败：继续降级为文字和作品链接。

关闭合并转发：

```text
#pixiv设置 forward off
```

重新开启：

```text
#pixiv设置 forward on
```

---

## 配置

### NapCat WebUI

NapCat 原生插件模式支持通过 WebUI 修改配置，包括：

- 启用 / 禁用插件。
- 指令前缀。
- R18 模式。
- 返回数量。
- AI 作品过滤。
- 合并转发。
- 用户冷却。
- 屏蔽关键词。
- 管理员 QQ。
- 上游 API。
- 图片反代。
- 请求超时。

### 默认配置

| 配置项 | 默认值 | 说明 |
|---|---:|---|
| `enabled` | `true` | 是否启用插件 |
| `prefix` | `#pixiv` | 指令前缀 |
| `r18` | `0` | `0=关闭`、`1=仅 R18`、`2=混合` |
| `num` | `5` | 每次最多返回数量，范围 `1~20` |
| `excludeAI` | `true` | 是否过滤 AI 作品 |
| `enableForward` | `true` | 是否优先合并转发 |
| `rateLimitSecs` | `15` | 用户冷却时间，`0` 为关闭 |
| `blockedKeywords` | 内置默认内容策略 | 逗号分隔 |
| `adminUsers` | 空 | 管理员 QQ 列表 |
| `loliconApi` | `https://api.lolicon.app/setu/v2` | Lolicon API |
| `hibiApi` | `https://api.obfs.dev/api/pixiv` | Pixiv/Hibi API |
| `imageProxy` | `i.pixiv.re` | Pixiv 图片反代 |
| `requestTimeoutMs` | `8000` | 请求超时，范围 `1000~60000` ms |

管理员示例请使用脱敏占位符：

```text
<ADMIN_QQ_1>,<ADMIN_QQ_2>
```

不要把真实管理员账号写入公开文档。

### 环境变量

支持：

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

自定义配置文件：

```bash
PIXIV_CONFIG_FILE=<CONFIG_FILE_PATH>
```

例如：

```bash
PIXIV_CONFIG_FILE=/srv/napcat-plugin-pixiv/config.json
```

请确保配置文件本身没有被 Git 跟踪，尤其是包含管理员账号、自定义 Token、内部地址或其他私密信息时。

---

## 管理员在线配置

管理员可以在 QQ 中修改部分常用配置：

```text
#pixiv设置
#pixiv设置 r18 0
#pixiv设置 num 5
#pixiv设置 excludeai on
#pixiv设置 forward on
#pixiv设置 cooldown 15
```

只有 `adminUsers` 中的 QQ 才允许查看或修改这些配置。

---

## systemd 服务管理

SnowLuma 一键部署默认服务名称：

```text
napcat-plugin-pixiv.service
```

查看状态：

```bash
npm run service:status
```

重启：

```bash
npm run service:restart
```

查看最近日志：

```bash
npm run service:logs
```

实时日志：

```bash
npm run service:follow
```

也可以直接使用 systemd：

```bash
systemctl status napcat-plugin-pixiv --no-pager
systemctl restart napcat-plugin-pixiv
journalctl -u napcat-plugin-pixiv -n 100 --no-pager
journalctl -u napcat-plugin-pixiv -f
```

检查开机自启与运行状态：

```bash
systemctl is-enabled napcat-plugin-pixiv
systemctl is-active napcat-plugin-pixiv
```

正常情况下应返回：

```text
enabled
active
```

---

## 常见问题

### 1. QQ 输入指令完全无响应

先检查服务：

```bash
npm run service:status
```

查看实时日志：

```bash
npm run service:follow
```

然后发送：

```text
#pixivping
```

判断方式：

- 服务不是 `active`：执行 `npm run service:restart`。
- 服务反复重启：执行 `npm run service:logs` 查看启动错误。
- Doctor 失败：优先修复 SnowLuma WebSocket / OneBot 配置。
- Doctor 正常但日志完全没有收到指令：检查 OneBot 事件链路。
- 已收到 `#pixivping` 但 QQ 没回复：检查消息发送 Action。
- `#pixivping` 正常但搜图失败：执行 `#pixivstatus` 检查上游。

### 2. WebSocket 1006 / 一直重新连接

执行：

```bash
npm run doctor:snowluma
```

自动模式会重新读取当前 Docker 与 SnowLuma OneBot 配置，而不是依赖旧 Shell 中可能已经过期的端口或 Token。

### 3. 上游 API 超时

发送：

```text
#pixivstatus
```

也可以适当增加：

```text
PIXIV_REQUEST_TIMEOUT_MS
```

允许范围：

```text
1000 ~ 60000
```

第三方 API 可能发生限流、故障、地区网络问题或接口变更，本项目无法保证第三方服务永久可用。

------

## 隐私说明

本插件会根据功能需要访问配置的第三方 Pixiv / Lolicon / Hibi / 图片代理服务。

因此：

- 搜索关键词可能会发送给所配置的上游 API。
- 图片 URL 和作品信息由第三方接口返回。
- 第三方服务拥有各自的日志、隐私和可用性策略。

如果你对数据传输有更高要求，请自行部署可信上游服务，并通过配置项替换默认 API。

---

## 内容与使用说明

- `R18` 默认关闭。
- 默认启用 AI 作品过滤。
- 项目包含可配置的关键词内容过滤机制。
- 管理员应根据群规则、平台规则和当地法律自行调整内容策略。
- Pixiv 内容版权归原作者及相关权利人所有，本项目仅提供技术上的检索与消息转发能力。

---

## 开发

安装依赖：

```bash
npm install
```

类型检查：

```bash
npm run typecheck
```

运行测试：

```bash
npm test
```

构建：

```bash
npm run build
```

完整检查：

```bash
npm run check
```

SnowLuma Doctor：

```bash
npm run doctor:snowluma
```

SnowLuma 前台运行：

```bash
npm run start:snowluma
```

查看已批准的依赖安装脚本：

```bash
npm install-scripts ls
```

---

## 项目结构

```text
napcat-plugin-pixiv/
├── scripts/                 # SnowLuma 部署、systemd 管理脚本
├── src/
│   ├── adapters/            # NapCat / OneBot 适配层
│   ├── core/                # 日志、冷却等核心能力
│   ├── handlers/            # 消息与指令处理
│   ├── messaging/           # 消息发送与降级策略
│   ├── runtime/             # SnowLuma 独立运行入口与自动发现
│   ├── services/            # Pixiv / 上游 API 服务
│   ├── config.ts            # 配置加载、校验与持久化
│   ├── index.ts             # NapCat 原生插件入口
│   └── types.ts             # 项目类型定义
├── test/                    # 自动化测试
├── package.json
├── vite.config.ts
├── tsconfig.json
├── README.md
└── LICENSE
```

构建时 Vite 会生成 `dist/index.mjs` 和 `dist/snowluma.mjs`，并把运行所需的 `package.json`、`README.md` 与 `LICENSE` 一并复制到 `dist/`。

---

## 上游服务

项目默认使用：

- Lolicon：`https://api.lolicon.app/setu/v2`
- Pixiv / Hibi：`https://api.obfs.dev/api/pixiv`
- Pixiv 图片反代：`i.pixiv.re`

这些均为第三方服务，并非本项目维护。

当出现搜索失败时，优先使用：

```text
#pixivstatus
```

区分 QQ / OneBot 链路问题和第三方上游问题。

---

## 相关文档

- NapCat 插件开发：<https://napneko.github.io/develop/plugin/>
- NapCat 插件发布：<https://napneko.github.io/develop/plugin/publish>
- SnowLuma：<https://snowluma.github.io/>
- SnowLuma Docker 部署：<https://snowluma.github.io/guide/deploy/docker.html>
- SnowLuma 配置参考：<https://snowluma.github.io/guide/configuration.html>

---

## 问题反馈

提交 Issue 时建议提供：

1. 插件版本。
2. Node.js / npm 版本。
3. NapCat 或 SnowLuma 版本。
4. 运行模式：NapCat 原生 / SnowLuma OneBot。
5. 可复现步骤。
6. 已脱敏的关键日志。
7. `npm run doctor:snowluma` 的脱敏结果（仅 SnowLuma 模式）。

Issue：<https://github.com/ShiYuPIay/napcat-plugin-pixiv/issues>

**请勿在 Issue 中上传 Token、Cookie、密码、真实个人账号、未脱敏 IP 或完整私密配置文件。**

---

## 许可证

本项目使用：

```text
GNU Affero General Public License v3.0
SPDX: AGPL-3.0-only
```

详情见 [LICENSE](./LICENSE)。

---

## 致谢

感谢 NapCat、SnowLuma、OneBot 生态及相关开源项目提供的基础设施与协议支持。
