# 中文工具手册：维护与合并

## 日常打开

双击仓库根目录 `工具手册.html`。这是包含中文工具说明、全文搜索、分类目录、命令和选定原始文档的单文件页面；不依赖 Bun、Foundry、网络、CDN 或后台服务。

推荐收藏 **master 工作区里的文件**，或给该文件创建桌面快捷方式。功能和手册一起合并后，刷新这个页面即可。单独复制到其他位置的 HTML 是当时的快照，需要重新复制才会更新；没有文件监控或远程自动更新。

## 内容放在哪里

- `docs/handbook/catalog.json`：生成器、资料处理、检查与开发工具。
- `docs/handbook/modules.json`：每个 Foundry 模块的独立用户说明。
- 已迁移模块的`foundry-modules/<owner>/docs/manual.json`：该模块唯一正文；`modules.json`仅保留`source`指针。当前Deck、框选Token同步、法术解析器、聊天内存保护、会话监测、随机表翻译、Painter、House Rules、Species与Blood Hunter已迁移，其他条目按模块逐个接续。
- `renderModuleManual(document, manual)`为独立模块的公开正文渲染出口，返回脱离宿主的只读article，命令仅作为文字。TokenSync、Resolver、Chat Guard与Monitor共用此实现，各自仍负责权限、窗口及可选Suite接线；源码依赖随浏览器bundle打包，不增加Foundry必装模块。
- `docs/handbook/reviewed.json`：作者对照实现和来源后的核对日期、说明与内容指纹。
- `docs/handbook/delivery.json`：显式划分Foundry用户条目与离线专用条目，排除项登记原因；每个稳定ID必须且只能登记一次，不影响完整离线目录和watch覆盖。
- `packages/suite-handbook/`：browser-safe内容契约、搜索、局部导航和阅读视图；只操作传入的root，不访问Foundry数据、URL、存储或全局主题。
- `docs/handbook/standalone.ts`：静态页面宿主，负责hash/history、页面标题、本机主题、全局快捷键和剪贴板；窗口关闭时可释放订阅。
- `docs/handbook/template.html`、`style.css`、`client.js`：离线页面模板、静态样式与启动入口。构建时用与CI一致的Bun 1.3.14打包为内联脚本；打开成品仍不需要Bun。
- `docs/handbook/build.mjs`：构建与只读一致性检查，不修改生成器和 Foundry。
- 根 `工具手册.html`：确定性生成、随功能一起提交的用户交付物，不能手工修补。

## 两种宿主的同源交付

静态HTML与Foundry窗口复用`mountHandbook(root, content, host)`。共享包返回`navigate(entryIdOrRoute, section?)`与`dispose()`；默认宿主使用局部按钮和内存状态。只有standalone adapter负责浏览器URL、标题和主题保存。命令是文字，只能经明确点击复制；阅读/导航不启动工具。

内容只在catalog、尚未迁移的modules条目或owner的manual.json维护，不另建Foundry正文。构建使用`schemaVersion: 1`；完整HTML保留全部38个稳定ID与来源，Foundry根据delivery策略选28个用户条目，并只带它们引用的sources/reviews。10个工程/历史入口仍在完整离线手册。内部模块ID读取实际manifest（支持src或根module.json）；Midi-QOL显式映射上游ID，外部候选没有单一runtime ID。缺失的内部manifest不猜目录名。

Foundry更新页显示工具用途摘要和说明核对日期，适用版本/实际接受仍由具体条目说明。详细作者review note只进入完整离线投影；Foundry导出将其替换为同条目的用户摘要，保留原核对日期和fingerprint，不把工程过程塞进用户更新卡片，也不改写原始review记录。

```powershell
bun run test:suite-handbook
bun run typecheck:handbook
bun run handbook:export
bun run handbook:export:foundry
```

`handbook:export`在人工核对有效时写出`dist/handbook/content.json`，与HTML内嵌JSON相同；`handbook:export:foundry`写出content.foundry.json和projection.foundry.json。投影侧文件登记保留/省略ID和引用/排除来源，未知/重复/未登记ID及无理由省略均拒绝。导出不安装模块、不连接世界、不形成另一份可编辑正文；handbook:check不要求克隆预先有dist。新增共享包/页面/策略由verification-development监测，reviewed.json不进watch避免循环。

H1完成共享包和静态宿主；H2在`foundry-modules/fvtt-suite-console/`接入GM只读ApplicationV2窗口，使用应用根内样式与容器宽度布局。通过`bun run test:suite-console`与`bun run build:suite-console`验证并构建；精确Core14.368的实际接受见执行总账，不能用静态测试追认。安装/启用状态与各模块帮助接通属于H3。

H4通过`release:suite-console`准备本地交付：模块ZIP仅5个白名单文件，独立同字节manifest、完整HTML、SHA256SUMS和release-candidate.json位于本模块dist/release。完整HTML不进入模块ZIP或安装目录。真实build先检查review与根HTML同步，再编译Foundry投影；`verify-release:suite-console`做实际档案/CRC/逐文件字节/hash/两次确定性检查。路径链接/硬链接或未知输出拒绝，不清空目录。正式品牌/授权/渠道/下载地址未定时，只能称本地候选，不能编造在线安装地址或宣称公开发行。

共享视图的`surface`区分静态与Foundry重开/更新说明；默认静态行为保持。Foundry host只提供根内滚动、内存主题与剪贴板，不提供URL/title/全局shortcut订阅或持久设置写入。新模块必须新增独立目录条目；当前目录合计38项，保留master新增的中文Babele维护入口及原有稳定ID。

## 按实际变化同步手册

变更用户可执行入口、输入或输出、支持版本、操作步骤或安全限制时，按本节更新说明。内部实现、测试或重构先核对这些信息是否改变，并记录具体结论；用户结果或限制发生变化的修复仍须更新说明，不能仅凭入口名称没变就归为内部变化。

现有 `watch` 和目录覆盖检查继续保留。已登记实现或来源变化使本次必需的 `handbook:check`／CI 报 stale 时，人工核对所有受影响条目、更新 review 并重新生成页面；没有文义变化可写“不影响说明”的具体理由，不要求为消除 stale 改写正确文字。不得缩小 watch、漏登记内部共享 package 的所属条目，或批量确认未审阅内容。

1. 在同一个功能 worktree 中更新对应条目的用途、选择时机、准备、操作步骤、产物和限制。新增模块必须有独立条目；新增 app/package/tool 必须登记 `watch` 归属。共享实现可被多个条目关注。
   已迁移的模块只改owner目录内的manual.json；引用必须指向本owner的该文件，watch继续覆盖来源。不得在中央目录增加第二份正文或局部覆盖字段；loader拒绝越界路径、链接、错误owner、未监测来源和重复ID。Deck构建把同一JSON的用户说明编入独立后备窗口。
2. 核对 `sources` 中的权威 Markdown 和实际入口。来源出现矛盾时优先查明实现与最新支持边界，在条目中明确限制；不能把历史文档的“通过”提升为当前运行时通过。
3. `watch` 覆盖对应实现目录或文件。检查读取 Git 已跟踪和未忽略的新文件，忽略测试、scratch、dist；生产逻辑、文档或入口变化会使指纹过期。不要缩小 watch 来绕过检查。
4. 查看受影响条目：

   ```powershell
   bun run handbook:status
   ```

5. 对照确认后，记录具体核对内容。下面的 `<id>` 替换为报告里的真实 ID；多个已经核对的 ID 可用逗号分隔。

   ```powershell
   bun run handbook:review -- <id> --note "已对照入口与来源，更新新功能步骤和适用限制"
   bun run handbook:build
   bun run handbook:check
   ```

   若实现变化确实不影响用户说明，记录具体核对结论，例如“仅调整内部缓存，入口、结果与限制保持一致”；已有 watch 报 stale 的条目仍按本步骤更新 review 并生成页面。review 是作者确认记录，不是自动语义验收，不可盲目批量确认。

6. 实际双击 HTML，检索新功能，打开受影响条目，对照文义和命令。如果修改页面交互，还要检查桌面与窄屏、主题、返回导航、深链接和复制命令。修改检查器运行 `bun run handbook:test`，它在随机临时仓库验证失效来源、新工具漏登记和过期页面等拒绝路径。变更测试或运行器时，可用安全入口 `bun run handbook:test:bun` 有界核对全仓 CI 所用的 Bun runner 兼容性，不直接执行内部 raw 脚本。
7. 在已有发布授权范围内，把实现、说明、核对记录和生成页面一起提交并合并到 master。合并产生新组合时，重新核对受影响条目并生成页面；不要保留两侧都已过期的 HTML。
8. 合并后在 master 运行 `bun run handbook:check`，刷新固定入口并检查本次新增/修改条目。记录同步结果；用户基线、索引与发布门禁仍按 worktree runbook 执行。

## 自动检查会做什么

`handbook:check` 接入 `ci:verify`。它会拒绝缺失来源、重复 ID、无效步骤、不存在的 Bun 命令、内部 raw 测试入口、新工具目录未登记、实现/来源指纹过期，以及生成 HTML 和当前内容不一致。

检查不会自动改写文字，不访问网络，不安装 Git hook，也不会自动 commit、merge 或 push。默认 build 同样不会更新核对记录。仓库 CI 的失败会报告不同步；是否阻止远端合并由仓库既有分支保护设置决定，本任务没有修改该设置。

使用已提交 HTML 是刻意的：这样仅凭仓库文件就能阅读。合并同时带来新的说明和页面，不要求用户每次打开前再启动构建器。

## 内容边界

- 常规生成示例显式使用 v14/core，默认 icon-mode off；专门的图标操作才展示 safe。
- 原始文档按原文离线展示，其中可能有历史状态和旧运维例子。当前推荐操作以人工核对的条目为先。
- 当前旧 Vault Sync 的备份行为与用户无备份规则冲突，手册明确标注，不提供默认执行捷径。模块安装、迁移等旧文档也不能绕过无备份和授权规则。
- 不把 `.local`、私有文档、真实生产地址或凭据加入 sources。不要将“构建可打开”写成“功能全部实测通过”。
