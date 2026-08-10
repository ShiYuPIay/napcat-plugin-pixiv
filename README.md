# napcat-plugin-pixiv

Pixiv 图片搜索与推荐插件。业务逻辑只维护一份，同时支持 **NapCat 原生插件模式** 和 **SnowLuma / OneBot v11 WebSocket 模式**。

版本 1.3.0 起重点解决两类问题：

- SnowLuma Docker 用户不再需要手工寻找 OneBot WS 端口、复制 `accessToken` 或猜 `onebot_<uin>.json` 的实际生效规则。
- QQ 群聊和私聊都支持指令；即使 SnowLuma 使用数组消息格式、消息前有 `@机器人`，插件也会提取文本并回复。

## QQ 指令

| 指令 | 说明 |
|---|---|
| `#pixivping` | 最快的收发自检，不访问 Pixiv 上游 |
| `#pixiv` / `#pixiv随机` | 随机推荐插画 |
| `#pixiv <关键词>` | 关键词搜索 |
| `#pixivpid <作品ID>` | 按 PID 查询作品，多页作品自动展开 |
| `#pixiv画师 <UID>` / `#pixivuid <UID>` | 查看画师最新作品 |
| `#pixiv日榜` / `#pixiv周榜` / `#pixiv月榜` | Pixiv 排行榜 |
| `#pixivstatus` | 检查 Lolicon 与 Pixiv/Hibi 上游 |
| `#pixiv设置` | 管理员查看/修改常用配置 |
| `#pixivhelp` / `#pixiv帮助` | 显示帮助 |

> 第一次安装不要先测试图片搜索。先发送 `#pixivping`。只要它回复“Pixiv 插件在线”，就说明 QQ → SnowLuma → 插件 → QQ 的消息链路已经正常。

## 零基础：SnowLuma Docker 安装

适合这种环境：SnowLuma 在同一台 Linux 服务器的 Docker 容器中运行，容器名通常是 `snowluma`。

### 1. 进入插件目录

```bash
cd /root/SnowLuma/plugins/napcat-plugin-pixiv
```

### 2. 确认 Node / npm

要求：

- Node.js `>=22.12.0`，推荐 Node 24 LTS。
- npm `>=11.18.0`，推荐 npm `11.19.0`。

```bash
node -v
npm -v
```

npm 太旧时：

```bash
npm install --global npm@11.19.0
```

### 3. 安装依赖

只运行普通安装：

```bash
npm install
```

**不要运行：**

```bash
npm install --allow-scripts=all
```

项目已经在 `package.json` 中精确批准需要的 `esbuild@0.25.12` 安装脚本。

### 4. 一键检测 SnowLuma

```bash
npm run setup:snowluma
```

这个命令会自动：

1. 构建插件。
2. 查找 Docker 容器 `snowluma`。
3. 在容器中查找 SnowLuma OneBot 配置目录，兼容 `/app/data/config`、`/app/snowluma-data/config`、`/app/config`。
4. 读取 `onebot.json` 和 `onebot_<QQ号>.json`。
5. 按 SnowLuma 当前 `snapshot / overlay` 和 adapter-name 规则解析真正生效的 WS Server：账号文件未定义 WS adapter 时保留全局 adapter；账号文件定义同名且有效的 adapter 时，以账号 adapter 整体替换全局同名 adapter，不错误做字段级 Token 合并。
6. 自动读取 Docker 的宿主机端口映射，不再把 `5099`、错误的 `6099`、`3001` 搞混。
7. 连接 WebSocket 并调用 `get_login_info` 做真实 OneBot Action 自检。

插件不会把完整 Token 打印到终端，也不会把 Token 写入仓库。

成功时会看到类似：

```text
✅ SnowLuma 连接诊断通过：WebSocket 鉴权、OneBot Action 均正常。
下一步：运行 npm run start:snowluma，然后在 QQ 发送 #pixivping。
```

### 5. 启动插件

```bash
npm run start:snowluma
```

`start:snowluma` 使用 Docker 自动发现模式，会忽略以前 shell 中手工写错的 `ONEBOT_WS_URL=ws://127.0.0.1:6099/` 等连接变量，重新以当前 SnowLuma 容器的实际 OneBot 配置为准。

看到：

```text
OneBot WebSocket 已连接
```

以后就不要关闭这个进程。如果需要长期运行，建议交给 systemd、TRSS 的守护功能或其他进程管理器。

### 6. QQ 验证

可以在 **群聊或私聊** 输入：

```text
#pixivping
```

正常回复：

```text
✅ Pixiv 插件在线，QQ 消息收发正常
当前前缀：#pixiv
发送 #pixiv帮助 查看指令。
```

然后再试：

```text
#pixiv帮助
#pixiv 初音ミク
#pixiv日榜
#pixivstatus
```

## 多 QQ 账号

如果 SnowLuma 容器里登录了多个 QQ，建议明确指定要连接的账号：

```bash
SNOWLUMA_UIN=2304493370 npm run setup:snowluma
SNOWLUMA_UIN=2304493370 npm run start:snowluma
```

把 `2304493370` 换成机器人自己的 QQ 号。

## Docker 容器名不是 snowluma

例如容器名叫 `my-snowluma`：

```bash
SNOWLUMA_CONTAINER=my-snowluma npm run setup:snowluma
SNOWLUMA_CONTAINER=my-snowluma npm run start:snowluma
```

## 连接远程 SnowLuma / 非 Docker

自动发现仅针对本机 Docker。远程 SnowLuma 可以手动设置：

```bash
export ONEBOT_WS_URL='ws://127.0.0.1:3001/'
export ONEBOT_ACCESS_TOKEN='你的 OneBot WebSocket Token'
node dist/snowluma.mjs
```

兼容旧变量：

```text
SNOWLUMA_WS_URL / SNOWLUMA_TOKEN
NAPCAT_WS_URL / NAPCAT_WS_TOKEN
```

手动模式的连接变量优先级是 `ONEBOT_*` → `SNOWLUMA_*` → `NAPCAT_*`。

## 为什么以前会看到 Token length = 0

SnowLuma 有全局 `onebot.json` 和账号级 `onebot_<uin>.json`。当前源码在非 snapshot 模式下会先读取全局源，再读取账号源；WS adapter 按 `name` 收集，后出现的同名有效 adapter 会整体替换前一项。

因此手工写这种命令并不可靠：

```js
account.networks.wsServers.find(x => x.enabled)?.accessToken
```

原因有两个：

- 账号配置可能根本没有定义 `wsServers`，这时实际使用的是全局配置中的 WS adapter。
- `enabled` 字段可以省略；省略并不等于禁用，所以 `.find(x => x.enabled)` 可能找不到实际有效的 adapter。

1.3.0 的 Docker 自动发现不再靠这种单文件/单字段猜测，而是同时读取全局与账号配置，并按 SnowLuma 当前 adapter-name 替换规则解析后再做真实 WebSocket + `get_login_info` 验证。

## QQ 输入指令完全无响应

按这个顺序检查，避免盲目改配置：

```bash
# 1. 先做服务器链路诊断
npm run doctor:snowluma

# 2. 正常启动
npm run start:snowluma

# 3. QQ 发送
#pixivping
```

运行日志中收到命令时会显示类似：

```text
收到 Pixiv 指令：群 ... / user=... / #pixivping
```

判断方法：

- `doctor:snowluma` 失败：先修 SnowLuma WebSocket，不要查 Pixiv API。
- doctor 成功，但日志完全没有“收到 Pixiv 指令”：检查 SnowLuma WS Server 的 `role`；插件需要 `Universal`，并确认 QQ Hook / OneBotInstance 已正常工作。
- 日志收到 `#pixivping`，但 QQ 没回复：检查 `send_group_msg` / `send_private_msg` Action 的错误日志。
- `#pixivping` 正常但图片命令失败：发送 `#pixivstatus`，这时才检查 Lolicon / Hibi / 图片代理网络。

插件会同时读取：

- OneBot `raw_message`。
- `message` 字符串。
- `message` 数组中的 `text` 段。

因此群里使用 `@机器人 #pixivping` 时，前面的 `at` 消息段不会再导致指令失效。

## 1006 / 一直重新连接

日志出现：

```text
OneBot WebSocket 已断开 (1006)
```

直接运行：

```bash
npm run doctor:snowluma
```

自动模式会重新读取容器实际端口、路径和有效配置。SnowLuma 默认 OneBot WS 容器端口通常为 `3001`，WebUI 是 `5099`，两者不是同一个服务。

## Pixiv 配置

默认使用插件目录下：

```text
config.json
```

可以通过环境变量覆盖：

```bash
PIXIV_CONFIG_FILE=/实际/存在的/config.json
```

如果误把教程中的 `/path/to/config.json` 原样复制进去，1.3.0 会识别该占位符并自动退回 `./config.json`。

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

## NapCat 原生插件模式

NapCat 模式不需要自行连接 WebSocket，使用当前 NapCat 插件生命周期和 `ctx.actions.call(...)`。

开发构建：

```bash
npm install
npm run check
```

构建后的插件包在：

```text
dist/
├── index.mjs       # NapCat 原生插件入口
├── snowluma.mjs    # SnowLuma / OneBot 独立入口
├── chunks/
├── package.json
├── README.md
└── LICENSE
```

将 `dist/` 的内容作为 NapCat 插件包部署即可。

## 功能与可靠性

- 群聊 + 私聊指令。
- SnowLuma Docker 零配置自动发现。
- OneBot 全局 / 账号配置按当前 SnowLuma adapter-name 规则解析。
- `#pixivping` 本地链路自检。
- R18 / AI 过滤。
- 搜索词、标题、标签的 NFKC / 大小写 / 空白归一化过滤。
- 每用户冷却，网络失败自动退款。
- 群聊优先合并转发，失败回退逐条。
- 私聊自动逐条发送。
- 图片发送失败降级为文字 + Pixiv 作品链接。
- WebSocket action `echo` 关联、超时、指数退避重连。
- 1006 给出明确诊断提示。

## 默认上游

- Lolicon：`https://api.lolicon.app/setu/v2`
- Pixiv/Hibi：`https://api.obfs.dev/api/pixiv`
- 图片反代：`i.pixiv.re`

这些是第三方服务，可能限流、故障或改接口。使用 `#pixivstatus` 区分“机器人链路故障”和“Pixiv 上游故障”。

## 安全建议

SnowLuma OneBot、WebUI、VNC/noVNC 不建议直接暴露到公网。插件和 SnowLuma Docker 在同一服务器时，优先只通过 localhost 使用 OneBot 端口，并及时更换已经出现在截图、日志或聊天中的旧 Token。

## 开发验证

```bash
npm run typecheck
npm test
npm run build
npm install-scripts ls
```

## 许可证

GNU AGPL v3 (`AGPL-3.0-only`).
