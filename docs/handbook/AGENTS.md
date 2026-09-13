# 离线中文工具手册

本目录拥有工具说明数据、单文件页面模板、构建和同步检查。根 `工具手册.html` 是可独立复制、通过 `file://` 打开的生成物，不得手工编辑；阅读不启动服务或访问网络。

- `catalog.json` 维护生成器、资料和开发工具；`modules.json` 维护 Foundry 模块。每项说明回答用途、选择时机、准备、步骤、产物和限制，必须对照实际入口与权威文档。
- `sources` 只允许明确选定的仓库 Markdown，嵌入页面供离线阅读；不得加入 `.local`、凭据、私有报告或机器配置。`watch` 登记会影响说明的实现路径；新增 app/package/tool/module 必须有条目覆盖。
- 功能、入口、适用版本或限制发生变化时，在同一 topic 中更新条目；人工核对后运行 `bun run handbook:review -- <id> --note "核对内容"`，再运行 `bun run handbook:build` 和 `bun run handbook:check`。review 只记录作者确认，不证明功能通过运行时验收。
- `reviewed.json` 的内容指纹检测资料和实现漂移，普通 build/check 不更新它。不得为通过检查而批量确认尚未审阅的条目。
- 页面使用内嵌数据、CSS、普通 JavaScript 和系统字体；不添加 CDN、fetch、服务 worker、远程遥测或自动执行操作。所有文档和搜索内容按文本处理。
- 检查：`bun run handbook:test`，`bun run handbook:check`；界面变更再实际用浏览器打开 file URL，检查搜索、分类、深链接、返回、复制、移动窄屏和截图。纯说明更改核对受影响条目，不运行 Foundry。

完整维护步骤见 `../runbooks/handbook-maintenance.md`。
