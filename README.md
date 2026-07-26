# napcat-plugin-pixiv

面向 NapCat 的 Pixiv 搜索与推荐插件。支持关键词搜索、随机推荐、日/周/月榜、按 pid 查看作品、按 UID 查看画师作品，带每人冷却、关键词/标签内容过滤，优先以合并转发发送多图。

仅响应**群聊**消息。

## 功能

| 指令 | 说明 |
|---|---|
| `#pixiv推荐` / `#pixivrec` | 随机推荐插画 |
| `#pixiv<关键词>` | 关键词搜索（如 `#pixiv初音ミク`） |
| `#pixivpid <作品ID>` | 按 pid 查看作品（多页作品自动展开） |
| `#pixiv画师 <UID>` / `#pixivuid <UID>` | 查看画师最新作品 |
| `#pixiv日榜` / `#pixiv周榜` / `#pixiv月榜` | Pixiv 排行榜 Top N |
| `#pixivstatus` | 上游接口连通性检查 |
| `#pixiv设置` | 查看/修改配置（仅管理员） |
| `#pixivhelp` / `#pixiv帮助` | 显示帮助 |

## 环境要求

- NapCat `4.14.0+`
- Node.js `18+`
- 网络可访问（非中国大陆直连环境）：
  - `https://api.lolicon.app` — 推荐与关键词搜索
  - `https://api.obfs.dev` — 排行榜 / pid / 画师查询
  - `https://i.pixiv.re` — 图片反代

## 安装

将本仓库放入 NapCat 插件目录，在管理后台启用即可，**无需安装依赖或执行构建**。

```
plugins/         ← 放这里
└── napcat-plugin-pixiv/
    ├── src/
    └── package.json
```

## 配置

| 选项 | 默认值 | 说明 |
|---|---|---|
| `r18` | `0` | R18 过滤：0 = 关闭，1 = 仅 R18，2 = 混合 |
| `num` | `5` | 每次返回图片数量（1–10） |
| `excludeAI` | `true` | 排除 AI 生成作品 |
| `enableForward` | `true` | 优先使用合并转发 |
| `rateLimitSecs` | `15` | 每人冷却时间（秒），0 = 关闭 |
| `blockedKeywords` | 内置默认列表 | 屏蔽关键词（逗号分隔）。同时匹配搜索词与作品标签/标题，比较前会做大小写、全角/半角与空白归一化 |
| `adminUsers` | 空 | 管理员 QQ 号（逗号分隔）。配置后才能使用 `#pixiv设置` |

配置来源与优先级（后者覆盖前者）：

1. **默认值**（见上表）；
2. **NapCat WebUI 面板**（若你的 NapCat 版本会将面板配置传给插件）；
3. **`config.json`** — 插件根目录下的覆盖文件，`#pixiv设置` 修改的项会写入此文件并在重启后保留。

`config.json` 示例（只需写想覆盖的项）：

```json
{
  "num": 3,
  "adminUsers": "12345678"
}
```

管理员在群里可用 `#pixiv设置` 查看当前配置，或修改并持久化：

```
#pixiv设置 r18 0
#pixiv设置 num 5
#pixiv设置 excludeai on
#pixiv设置 forward off
#pixiv设置 cooldown 30
```

## 常见问题

**没有响应** — 确认服务器能访问 `api.lolicon.app`，可发 `#pixivstatus` 验证（会如实报告上游 HTTP 错误码）。接口请求超时上限为 8 秒。

**只有文字没有图片** — NapCat Highway 图片上传失败（通常是 QQ CDN 连接问题），插件会自动降级为标题 + pid 文字。

**搜索无结果** — Lolicon API 未找到该标签，建议使用日文关键词（如 `初音ミク` 而非 `初音未来`）。另外命中内容过滤（R18/AI/屏蔽词）的结果会被丢弃。

**`#pixiv设置` 提示未配置管理员** — 需先在 `config.json`（或 WebUI）中设置 `adminUsers`。

## 开发

纯 JavaScript（ESM），无运行时依赖。测试基于 Node 内置 `node:test`：

```bash
npm test
```

测试通过环境变量 `NAPCAT_PIXIV_CONFIG` 将 `config.json` 重定向到临时目录，不会污染仓库；部署到只读目录时也可用该变量指定可写的配置路径。

## 许可证

[AGPL-3.0-only](LICENSE)
