# NapCat Pixiv 插件

一个用于 NapCat Bot 的 Pixiv 插件，支持通过指令快速搜索或随机推荐插画，并将多张图片合并转发，避免刷屏。插件使用开源的 [Lolicon API](https://api.lolicon.app/#/setu) 作为数据源，无需登录 Pixiv 即可获取作品信息和图片直链。

## 特性

- **关键词搜索**：使用 `#pixiv <关键词>` 搜索匹配关键词的插画，返回作品标题、作者、标签和图片预览。
- **随机推荐**：使用 `#pixiv rec` 或 `#pixiv 推荐` 获取随机推荐的插画，体验惊喜。
- **合并转发**：当返回多张插画时，将每张作品包装为转发消息节点，最终以一条“合并转发”消息发送，避免一连串刷屏。
- **配置灵活**：支持在 NapCat 的 WebUI 中设置指令前缀、最大返回数量以及是否允许显示 R18 作品。

## 安装与使用

1. **克隆仓库**：
2. https://gh-proxy.org/https://github.com/ShiYuPIay/napcat-plugin-pixiv.git
3. **放置插件**：将构建好的插件目录复制到 NapCat 配置中的插件目录下（通常为 `napcat-data/plugins/`）。也可以直接通过 [napcat-plugin-template](https://github.com/NapNeko/napcat-plugin-template) 的仓库模板创建自己的仓库，拉取后修改 `package.json` 的 `name`、`description` 等信息，并将本插件的 `src` 文件覆盖模板。

4. **启用插件**：登录 NapCat 管理后台，在插件管理页面启用 **Pixiv 插件**。可在“配置”栏中调整参数：

   - **启用插件**：控制功能是否生效。
   - **指令前缀**：默认 `#pixiv`，可根据需要修改，如 `/pixiv`。
   - **最大结果数量**：每次返回的作品数量，范围 1–10，默认为 3。
   - **允许 R18**：是否允许返回 R18 作品，默认为不允许。

5. **使用指令**：

   - `#pixiv 初音ミク`：搜索所有包含“初音ミク”标签的插画。
   - `#pixiv rec` 或 `#pixiv 推荐`：随机推荐多张高质量插画。
   - `#pixiv help`：查看帮助信息。

## 运行要求

- 最低要求NapCat 版本需 **>= 4.14.0**

## 注意事项

- 插件使用的 Lolicon API 来源于第三方服务，与 Pixiv 官方无关。因网络波动或 API 限制，某些请求可能失败，可稍后重试。
- 当搜索或推荐返回的作品超过 1 张时，插件会使用 OneBot 的 `send_group_forward_msg` 或 `send_private_forward_msg` 接口发送合并转发消息。请确保当前的 NapCat 版本支持合并转发；如果不支持，将自动退回单条消息发送。
- **R18 内容**：默认情况下插件不会返回 R18 插画。若开启此选项，请确保使用环境允许此类内容，并遵守相关法律法规和社区规范。

## 致谢

- 插件使用开源的 [Lolicon API](https://api.lolicon.app/#/setu) 作为数据源，无需登录 Pixiv 即可获取作品信息和图片直链。

## 作者

希儿（shiYuPIay）

## License

本项目使用 **GNU Affero General Public License v3.0 (AGPL-3.0-only)** 授权，详见 LICENSE 文件。
