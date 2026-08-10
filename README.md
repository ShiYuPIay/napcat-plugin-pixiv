# napcat-plugin-pixiv

Pixiv 图片搜索与推荐插件，同时支持 **NapCat 原生插件模式** 和 **SnowLuma / OneBot v11 WebSocket 模式**。

## 1.4.0 重点改进

- **systemd 进程守护**：部署后插件与 SSH 会话完全分离，关闭终端、断开 SSH 后仍继续运行。
- **异常自动恢复**：Node 进程退出后由 systemd 自动重启；OneBot WebSocket 自身仍保留指数退避重连。
- **开机自启**：部署脚本自动 `systemctl enable napcat-plugin-pixiv`。
- **日志统一进入 journald**，方便查看最近日志和实时日志。
- **多图合并转发**：一次获取 2 张及以上图片时，优先把多张图片放入一个合并转发；群聊与私聊都支持。
- **单图不套转发**：只有 1 张图片时直接发送图片。
- **合并转发失败自动降级**：风控、平台或 Action 不支持时自动逐张发送，不让指令静默失败。

> 这里的“多选图片”实现为“一次获取多张结果并合并转发”。标准 OneBot 消息没有通用的 QQ 原生多选复选框交互，因此暂不做“用户点选缩略图后再提交”的交互 UI。

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

第一次安装先发送：

```text
#pixivping
```

只要回复“Pixiv 插件在线”，就说明 QQ → SnowLuma → 插件 → QQ 链路正常。

---

# 零基础：SnowLuma Docker 一键部署

适用于 SnowLuma 和插件运行在同一台 Linux 服务器的情况。

## 第 1 步：进入插件目录

```bash
cd /root/SnowLuma/plugins/napcat-plugin-pixiv
```

## 第 2 步：更新到最新版

```bash
git fetch --all --prune
git switch main
git pull --ff-only
```

## 第 3 步：一键部署 + 守护

单 QQ 环境：

```bash
bash scripts/deploy-snowluma.sh
```

多 QQ 环境建议明确指定机器人 QQ：

```bash
SNOWLUMA_UIN=2304493370 bash scripts/deploy-snowluma.sh
```

也可以使用 npm：

```bash
SNOWLUMA_UIN=2304493370 npm run deploy:snowluma
```

部署脚本会自动完成：

1. 同步 `main`。
2. 固定 npm `11.19.0`。
3. 安装依赖。
4. 执行 `typecheck + tests + build`。
5. 自动发现 SnowLuma Docker 容器、配置目录、OneBot WS 端口与有效配置。
6. 运行真实 WebSocket 鉴权 + `get_login_info` doctor。
7. 安装 `/etc/systemd/system/napcat-plugin-pixiv.service`。
8. 开启开机自启。
9. 启动并检查守护服务。

成功后会看到：

```text
✅ 部署完成，插件已由 systemd 守护。
```

此时可以直接退出 SSH：

```bash
exit
```

插件不会因为 SSH 关闭而停止。

---

# 进程守护 / SSH 断开后继续运行

服务名称：

```text
napcat-plugin-pixiv.service
```

当前守护策略：

```text
Restart=always
RestartSec=5s
StartLimitIntervalSec=0
```

含义：插件进程异常退出、意外正常退出时都会自动重新启动；systemd 不会因为短时间连续失败而永久停止重试。手动执行 `systemctl stop` 时则会正常停止。

## 小白管理命令

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

实时看日志：

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

服务器重启后确认自启动：

```bash
systemctl is-enabled napcat-plugin-pixiv
systemctl is-active napcat-plugin-pixiv
```

预期：

```text
enabled
active
```

---

# SnowLuma 自动发现

插件不要求小白手工寻找 OneBot Token。

自动模式会：

- 查找 Docker 容器，默认名称 `snowluma`。
- 兼容 `/app/data/config`、`/app/snowluma-data/config`、`/app/config`。
- 读取 `onebot.json` 和 `onebot_<QQ号>.json`。
- 按 SnowLuma 当前 global/per-UIN adapter 规则解析实际生效配置。
- 自动读取 Docker 的宿主机端口映射。
- 只选择能够同时接收事件和发送 Action 的 `Universal` WebSocket Server。
- 不把完整 accessToken 打印到日志或保存到仓库。

手工诊断：

```bash
SNOWLUMA_UIN=2304493370 npm run doctor:snowluma
```

成功时：

```text
✅ SnowLuma 连接诊断通过：WebSocket 鉴权、OneBot Action 均正常。
```

---

# 多图片合并转发

插件配置中的 `num` 决定一次最多返回多少条结果，范围为 `1~20`。

例如管理员设置一次返回 5 张：

```text
#pixiv设置 num 5
```

然后：

```text
#pixiv 初音ミク
```

如果上游返回 5 条有效结果，插件会优先发送：

```text
一个合并转发
├── 图片 1 + 标题/PID
├── 图片 2 + 标题/PID
├── 图片 3 + 标题/PID
├── 图片 4 + 标题/PID
└── 图片 5 + 标题/PID
```

行为规则：

- 结果数 `>= 2` 且 `enableForward=true`：优先合并转发。
- 群聊：使用 `send_group_forward_msg`。
- 私聊：使用 `send_private_forward_msg`。
- 只有 1 张：直接发送，不套合并转发。
- 合并转发失败：自动回退逐张图片。
- 单张图片发送失败：继续降级成文字 + Pixiv 作品链接。

关闭合并转发：

```text
#pixiv设置 forward off
```

重新开启：

```text
#pixiv设置 forward on
```

---

# QQ 输入指令完全无响应

先检查进程：

```bash
npm run service:status
```

再看日志：

```bash
npm run service:follow
```

然后在 QQ 发送：

```text
#pixivping
```

日志应该出现类似：

```text
收到 Pixiv 指令：群 ... / user=... / #pixivping
```

判断：

- 服务不是 `active`：`npm run service:restart`。
- 服务反复重启：`npm run service:logs` 查看启动错误。
- doctor 失败：先修 SnowLuma WebSocket。
- doctor 成功，但完全没有“收到 Pixiv 指令”：检查 SnowLuma OneBot 事件链路。
- 收到 `#pixivping` 但 QQ 没回复：检查 `send_group_msg` / `send_private_msg` Action。
- `#pixivping` 正常但搜图失败：发送 `#pixivstatus` 检查上游。

插件支持：

- 群聊。
- 私聊。
- `raw_message`。
- `message` 字符串。
- OneBot 数组消息中的 `text` 段。
- `@机器人 #pixivping`。
- CQ 字符串形式 `[CQ:at,...] #pixivping`。

---

# 1006 / WebSocket 重新连接

```bash
npm run doctor:snowluma
```

自动模式会重新读取容器实际 OneBot WS 配置，而不是继续使用旧 shell 中错误的 `6099` 等地址。

正常生产服务无需手工导出：

```text
ONEBOT_WS_URL
ONEBOT_ACCESS_TOKEN
```

systemd 服务每次启动都会通过 Docker 自动发现当前 SnowLuma 配置。

---

# 环境要求

- Node.js `>=22.12.0`，推荐 Node 24 LTS。
- npm `>=11.18.0`，推荐 npm `11.19.0`。

升级 npm：

```bash
npm install --global npm@11.19.0
```

安装依赖只能使用：

```bash
npm install
```

不要使用：

```bash
npm install --allow-scripts=all
```

项目已经在 `package.json` 中精确批准 `esbuild@0.25.12`。

---

# 多 QQ / 自定义 Docker 容器名

指定 QQ：

```bash
SNOWLUMA_UIN=2304493370 npm run doctor:snowluma
SNOWLUMA_UIN=2304493370 npm run deploy:snowluma
```

自定义容器：

```bash
SNOWLUMA_CONTAINER=my-snowluma npm run deploy:snowluma
```

---

# 远程 / 非 Docker SnowLuma

自动发现主要针对本机 Docker。

远程 SnowLuma 可以手工运行：

```bash
export ONEBOT_WS_URL='ws://127.0.0.1:3001/'
export ONEBOT_ACCESS_TOKEN='你的 OneBot WebSocket Token'
node dist/snowluma.mjs
```

兼容：

```text
SNOWLUMA_WS_URL / SNOWLUMA_TOKEN
NAPCAT_WS_URL / NAPCAT_WS_TOKEN
```

---

# Pixiv 配置

默认：

```text
./config.json
```

可设置：

```bash
PIXIV_CONFIG_FILE=/实际/存在的/config.json
```

教程占位符 `/path/to/config.json` 会自动忽略并退回 `./config.json`。

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

---

# NapCat 原生插件模式

NapCat 模式使用 NapCat 原生插件生命周期，不需要插件自己连接 NapCat WebSocket。

```bash
npm install
npm run check
```

构建产物：

```text
dist/
├── index.mjs
├── snowluma.mjs
├── chunks/
├── package.json
├── README.md
└── LICENSE
```

---

# 开发验证

```bash
npm run typecheck
npm test
npm run build
npm install-scripts ls
```

## 默认上游

- Lolicon：`https://api.lolicon.app/setu/v2`
- Pixiv/Hibi：`https://api.obfs.dev/api/pixiv`
- 图片反代：`i.pixiv.re`

第三方接口可能限流、故障或改变接口。使用：

```text
#pixivstatus
```

区分机器人链路故障与 Pixiv 上游故障。

## 安全建议

SnowLuma OneBot、WebUI、VNC/noVNC 不建议直接暴露公网。插件与 SnowLuma 位于同一服务器时，优先只通过 localhost 使用 OneBot 端口，并及时更换曾经暴露在截图或日志中的旧 Token。

## 许可证

GNU AGPL v3 (`AGPL-3.0-only`).
