# napcat-plugin-pixiv

面向 NapCat 的 Pixiv 搜索与推荐插件。支持关键词搜索、随机推荐、日/周/月榜浏览，带每人冷却与关键词屏蔽，优先以合并转发发送多图。

## 功能

| 指令 | 说明 |
|---|---|
| `#pixiv推荐` / `#pixivrec` | 随机推荐插画 |
| `#pixiv<关键词>` | 关键词搜索（如 `#pixiv初音ミク`） |
| `#pixiv日榜` | Pixiv 日榜 Top 3 |
| `#pixiv周榜` | Pixiv 周榜 Top 3 |
| `#pixiv月榜` | Pixiv 月榜 Top 3 |
| `#pixivstatus` | 上游接口连通性检查 |
| `#pixivhelp` | 显示帮助 |

## 环境要求

- NapCat `4.14.0+`
- Node.js `18+`
- 网络可访问（非中国大陆直连环境）：
  - `https://api.lolicon.app` — 推荐与关键词搜索
  - `https://api.obfs.dev` — 排行榜
  - `https://i.pixiv.re` — 图片反代

## 安装

将本仓库放入 NapCat 插件目录，在管理后台启用即可，**无需安装依赖或执行构建**。

```
plugins/         ← 放这里
└── napcat-plugin-pixiv/   
    ├── dist/
    └── package.json
```

## 配置

在 `src/config.js`（及对应的 `dist/config.js`）中修改以下选项：

| 选项 | 默认值 | 说明 |
|---|---|---|
| `r18` | `0` | R18 过滤：0 = 关闭，1 = 仅 R18，2 = 混合 |
| `num` | `3` | 每次返回图片数量 |
| `excludeAI` | `true` | 排除 AI 生成作品 |
| `enableForward` | `true` | 优先使用合并转发 |
| `rateLimitSecs` | `15` | 每人冷却时间（秒），0 = 关闭 |
| `blockedKeywords` | `'萝莉,...'` | 屏蔽关键词，逗号分隔 |

## 常见问题

**没有响应** — 确认服务器能访问 `api.lolicon.app`，可发 `#pixivstatus` 验证。接口请求超时上限为 8 秒。

**只有文字没有图片** — NapCat Highway 图片上传失败（通常是 QQ CDN 连接问题），插件会自动降级为标题 + pid 文字。

**搜索无结果** — Lolicon API 未找到该标签，建议使用日文关键词（如 `初音ミク` 而非 `初音未来`）。

## 许可证

[AGPL-3.0-only](LICENSE)
