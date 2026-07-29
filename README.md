# napcat-plugin-pixiv

Pixiv 图片搜索推荐插件，适用于 NapCat 机器人。

## 指令

| 指令 | 说明 |
|------|------|
| `#pixiv` | 随机一张插图 |
| `#pixiv 关键词` | 按关键词搜索插图 |
| `#pixiv随机` | 同上，随机一张插图 |
| `#pixiv日榜` | 今日 Pixiv 排行榜 |
| `#pixiv周榜` | 本周 Pixiv 排行榜 |
| `#pixiv月榜` | 本月 Pixiv 排行榜 |
| `#pixiv帮助` | 显示指令列表 |

## 部署（无需构建步骤）

**要求：** Node.js 18 或更高版本（运行 `node -v` 确认）。

```bash
# 1. 安装依赖
npm install

# 2. 启动插件
node src/index.js
```

### 配置

通过环境变量调整，或在启动前 `export` 设定：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NAPCAT_WS_URL` | `ws://127.0.0.1:3001` | NapCat WebSocket 地址 |
| `NAPCAT_WS_TOKEN` | （空） | NapCat 鉴权 Token |
| `PIXIV_R18` | `0` | `0`=关闭 / `1`=仅R18 / `2`=混合 |
| `PIXIV_EXCLUDE_AI` | `true` | 是否过滤 AI 作品 |
| `PIXIV_RANKING_COUNT` | `5` | 排行榜显示数量 |
| `PIXIV_IMAGE_PROXY` | `i.pixiv.re` | 图片反代域名 |

### 以 NapCat 反向 WebSocket 接入

在 NapCat 配置文件中，将 WebSocket 服务端口设为 `3001`（或修改 `NAPCAT_WS_URL`），插件启动后会自动连接并在断线时重连。

## 文件结构

```
src/
├── index.js                  # 入口：WebSocket 连接与事件分发
├── config.js                 # 全局配置
├── handlers/
│   └── message-handler.js    # 指令路由与响应逻辑
└── services/
    └── pixiv-service.js      # Lolicon API + obfs.dev 排行榜 API
```
