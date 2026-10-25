# 中文 Babele 补丁内容盘点

日期2026-10-25。按当前维护项目1.0.194本地合并包逐文件提取，ZIP SHA-256 `17d6a6dfd381d55551d6ecdc7bbf284a2f01a2741ed38ddab95daeb7287b11bd`；本次没有查询或切换新的上游发行版，也没有操作Foundry服务。

## 结论与交付

独立维护项目根文件 `I:/OpenCode/fvtt-babele-zh-maintenance/中文Babele内容目录.html` 为可离线检索、筛选、排序、展开合集明细和打印的单文件HTML。源码、逐项来源和生成数据均在该项目，当前生成器仓库只维护入口。

共99个来源目标，13项WotC官方出版物、1项D&D系统/SRD、82项第三方内容、2项工具/自动化、1项身份待确认。619份JSON分成606份常规Babele译文、11份原始合集导出、2份共享名称表；53,666个顶层译文记录与627个导出文档分别计数，不当作实体数或汉化完整度。

11份导出按自身metadata归入Bloodpunk的A Guide to Tolia、Heritage of the Damned两个目标，导入/自动加载尚未验证。仅水晶浩劫的21法术有既有实际验收，本目录没有扩大为其他项目的运行通过。

## 来源与分类

公开来源读取覆盖99个目标。92个Foundry注册页读到正文；7个精确ID的注册页404，6个经作者原站确认作者/产品线但未确认精确包manifest。Blade, Bone, & Benefit原产品正文403，保持来源待确认。每项来源链接、证据状态和限制记录在维护项目source-metadata.json，原始响应/哈希在本次worktree的runs/catalog-20261025。

- [Player's Handbook](https://foundryvtt.com/packages/dnd-players-handbook)、[Monster Manual](https://foundryvtt.com/packages/dnd-monster-manual)等13项的Publisher明确为Wizards of the Coast，才归D&D官方。
- [Abomination Vaults 5E](https://foundryvtt.com/packages/dnd-abomination-vaults)为Paizo出版；dnd-前缀与Foundry商店位置不构成WotC官方依据。
- [Crystal Chaos](https://foundryvtt.com/packages/crystal-chaos)发布者Kelfecil's Tales；本地增补仅一个法术合集。
- [Chris's Premades](https://foundryvtt.com/packages/chris-premades)当前公开名为Cauldron of Plentiful Resources；[Boss Loot assets](https://foundryvtt.com/packages/boss-loot-assets-premium)当前为BLFX Animation Editor Premium。保留原目标ID，公开新名称不证明旧译文已覆盖新内容。

中文书名只是检索用包内/编辑别名；英文原站标题和发布信息保留。未新增任何引入推荐，缺少运行证据的目标不能据本目录提升为可用模块。

## 验证与复查

619文件归属及SHA逐一读回、99目标分类计数、HTML内嵌数据一致性、无外部资源和脚本转义检查通过；非浏览器DOM逻辑覆盖搜索、组合筛选、排序、空状态、重置和打印状态恢复。真实Chrome截图、390px布局及打印预览NOT_EXECUTED：官方连接器明确拒绝file://，未换通道或启动服务绕过。

下次更新先锁定实际ZIP身份，再按独立项目docs/catalog/README.md重建；只在需要时更新来源资料，保留未确认项，不从文件存在推断完整度或兼容性。
