# NapCat Pixiv 插件

面向 NapCat 的 Pixiv 搜索与推荐插件。支持关键词搜索、随机推荐、日榜浏览，并优先使用合并转发发送多图结果，减少聊天刷屏。

## 功能

- 关键词搜索：`#pixiv<关键词>`
- 随机推荐：`#pixivrec` / `#pixiv推荐`
- 日榜 Top10：`#pixiv日榜` / `!pixiv日榜`
- 健康检查：`#pixivstatus`
- 帮助说明：`#pixivhelp`
- 多图合并转发：搜索结果优先以合并转发形式发送

## 环境要求

- NapCat：`4.14.0` 或更高
- Node.js：建议 `18+`
- 网络可访问以下第三方接口：
  - `https://api.lolicon.app`
  - `https://api.obfs.dev`

## 安装

1. 将仓库放入 NapCat 的插件目录。
2. 在仓库目录执行：

```bash
npm install
npm run build
```

3. 打开 NapCat 管理后台，启用 **Pixiv 搜索与推荐** 插件。

## 配置项

插件配置来自 `package.json` 中的 `napcat.configSchema`。

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 是否启用插件 |
| `commandPrefix` | `#pixiv` | 指令前缀 |
| `maxResults` | `3` | 单次返回的最大图片数量 |
| `allowR18` | `false` | 是否允许返回 R18 插画 |
| `enableForward` | `true` | 是否优先使用合并转发发送多图结果 |
| `enableAnonymousForward` | `false` | 是否使用匿名昵称发送转发节点 |
| `rateLimitSeconds` | `15` | 同一用户再次调用指令的最小间隔 |
| `blockedKeywords` | `萝莉,未成年,幼女,乱伦,强奸` | 逗号分隔的拦截关键词 |

## 使用示例

```text
#pixiv初音ミク
#pixivrec
#pixiv日榜
#pixivstatus
#pixivhelp
```

## 部署说明

- 本项目使用第三方聚合 API，并非 Pixiv 官方接口。
- 建议合理控制 `maxResults`，避免刷屏与发送失败。
- 如需开放 R18 内容，请先确认群规和当地法律要求。

## 常见问题

### 没有响应

- 确认插件已启用
- 确认前缀配置正确
- 确认发送的是文本消息

### 只有文字没有图片

- 可能是图片链接临时失效
- 可减少返回数量后重试

### 日榜失败

- 先执行 `#pixivstatus`
- 检查网络、DNS、第三方接口限流情况

### 合并转发发送失败

- 检查 NapCat 与适配器是否支持 `send_group_forward_msg`

## 许可证

AGPL-3.0-only
