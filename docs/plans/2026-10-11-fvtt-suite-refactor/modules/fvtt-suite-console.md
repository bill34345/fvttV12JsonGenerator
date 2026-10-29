# 合集操作台与统一操作手册

总计划：[PLAN](../PLAN.md)；共同实施约定：[MODULE_CONTRACT](../MODULE_CONTRACT.md)；进度：[总账](../EXECUTION_LEDGER.md)。H1/H2证据保留，H3本批状态/Deck帮助已在Core14.368/dnd5e6.0.5 ServerNext完成限定功能接受；原整批恢复审计仍PARTIAL/UNKNOWN。源码为未合并候选，具体证据与未执行层级由总账维护。

## 目标与职责

GM 在 Foundry 内打开一个统一手册窗口，搜索用途、阅读各模块步骤与版本限制，查看安装/启用状态。合集入口只做导航和帮助；既有模块继续独立使用。第一切片是只读手册，功能启动按钮随后按真实公开接口逐项加入。

技术模块 ID `fvtt-suite-console`，归属 `foundry-modules/fvtt-suite-console/`；H2版本0.1.0、H3为0.2.0，当前H4候选0.3.0，帮助ABI1。商业品牌仍待确定；现有模块和手册 ID 不改，不新增持久的手册偏好设置。

## 规划基线与可复用事实（H1前）

- `docs/handbook/build.mjs` 聚合现有 35 条说明，校验目录覆盖、来源、命令、watch 与人工 review 指纹；`client.js` 已实现分类、搜索、条目/原文导航和复制。
- 当前 renderer 使用全局 document/window、hash/history、localStorage、剪贴板和全局 CSS；不能直接作为 Foundry 模板载入。
- Forge `src/index.ts` / `connectionApplication.ts`、CC `manager.ts`、Deck `surfaces.ts` 有 GM 菜单、ApplicationV2 或公开入口模式，适合按精确 Core 源码复核后复用；当前没有通用手册窗口。
- 内容条目 ID 与真实 module ID 必须分开：`monster-spell-resolver` → `fvtt-json-generator-spell-resolver`，`session-monitor` → `fvtt-session-monitor`；外部候选目录没有单一 runtime ID。

## 内容和接口

H1已建立 browser-safe `packages/suite-handbook/`，仅承载内容契约、搜索/导航状态与视图；文件读取、内容发现和来源指纹仍在构建端。静态HTML与H2 ApplicationV2宿主均复用它；不引入必装的公共运行库模块。

| 接口信息 | 必须表达的事实 |
| --- | --- |
| `entryId` | 稳定手册 ID，保留旧深链接 |
| `ownerDirectory` | 维护内容的真实目录，供构建/覆盖检查 |
| `foundryModuleId` | 可选真实 manifest ID；资料/开发条目可以没有 |
| 内容 | 用途、准备、步骤、产物、限制、公开来源；正文和命令按数据处理 |
| 文档身份 | 对应模块版本、内容 revision、人工核对记录和已接受目标的来源指针 |
| 阅读面 | Foundry 用户帮助、独立离线工程说明或两者；投影须显式，不能静默丢条目 |
| 宿主能力 | 主题、剪贴板、当前安装状态和明确的导航/工具入口；不暴露任意脚本求值或文件执行 |

H1已实现`mountHandbook(root, content, host)`，返回 `navigate(entryIdOrRoute, section?)` 与 `dispose()`。宿主提供能力，内容不拥有权限。H2已公开 `openHelp({ entryId, section? })`；H3各模块只可选择性调用，缺失时使用本模块随包帮助。只有确实存在公开操作入口并通过目标模块权限检查后，才加功能启动入口。

## 切片顺序

### H1 内容与宿主分离

保留现有内容、35 个条目 ID、sources/watch/review 和单文件输出。先抽出 browser-safe 内容/搜索/局部导航，再提供 standalone adapter；所有 DOM 查找和事件限制在 root。Foundry 不改写全局 location.hash，关闭/重绘可以 dispose，不留重复监听器。

**完成证据**：同一内容生成两种目标所需的数据；旧深链接、目录覆盖、文本安全与 review 拒绝路径保留；现有静态行为不因抽取消失。先运行现有 `handbook:test`，新增测试仅针对两个宿主的真实差异。

### H2 最小 Foundry 只读入口

用本模块 ApplicationV2 提供 GM 设置菜单与单窗口聚焦。内容以随包数据载入，不依赖 CDN、AI 或联网搜索。样式限定在应用根，不引入全局 body/nav/button 规则；按应用容器宽度重排，不能只按浏览器视口判断窄窗。

**完成证据**：真实入口→搜索→条目→准备/步骤/限制→原始说明→返回；窗口缩窄、关闭/重开、重绘、主题、复制/fallback。手册打开、浏览、搜索和复制导致的世界文档写入与game.settings值变更均为零；渲染/路由/复制不触发模块操作。H2主题只跟随宿主或在窗口内存中切换，不保存Foundry设置；standalone adapter保留原本机主题行为。文档中的命令只能复制，不在 Foundry 执行。

### H3 安装状态与模块帮助接通

构建期显式映射 runtime ID，只读检查 `game.modules` 的安装/启用状态；接受状态来自有来源的版本矩阵，不由 manifest 字段自动判定。未安装、停用、未知版本都可以看文档，操作入口显示明确不可用原因。

先选 Deck 接通模块帮助，验证合集关闭时 Deck 仍可用。只有后续明确添加的功能启动按钮，才能在用户显式点击并经目标模块权限检查后执行操作；阅读/导航保持零业务写入。然后随各模块小计划迁入 owner 内容文件，例如 `docs/manual.json`；集中 registry 只登记来源和目标映射。每次完整迁移一个条目，保留旧 ID 和全部来源/监测，不同时保留两份可编辑正文。

### H4 发行与离线交付

构建分别产生 Foundry 包和原单文件 HTML。Foundry 默认收录用户操作内容，开发/运维材料可保留在离线工程说明；通过显式投影和覆盖校验说明差异。测量实际包大小与首次打开成本，再决定是否按本地静态分段加载，不预先引入搜索服务或复杂插件系统。

本批delivery策略显式分区28个用户条目和8个离线专用条目，完整离线36ID保留。Suite0.3.0提供5文件白名单模块ZIP、同字节独立manifest、独立完整HTML与校验/交付清单；完整工程HTML不进模块ZIP。静态生成、实际档案读回、Core窗口接受和外部发行分别记账，具体接口见[H4交付契约](../../../reviews/2026-10-12-suite-handbook-h4-delivery.md)。

新增模块/package 后补现有手册目录覆盖、workspace/typecheck/build 路由和发行文件白名单。模块初次安装只提供手册，不安装其他模块或修改游戏数据。

## 版本、权限与接受

首轮产品范围为 Foundry V14、GM 入口。手册阅读逻辑不依赖 dnd5e 数据；5.3.3/6.x 不同支持信息正常展示，具体工具仍自行严格验权和验版本。玩家阅读面留作明确需求，不把隐藏导航当作保密或权限措施。

机械拒绝包括重复/失踪条目、错 runtime ID、陈旧指纹、未知 owner、脚本边界/XSS、视图跨 root、重复挂载、dispose 后回调；H1/H2实际结果见总账。H2已完成当前Next模块组合中的真实阅读、宽窄窗口与重开；没有宣称仅安装合集的独立环境已实测。H3接入第一个模块帮助消费者时，继续接受仅安装合集、只启用部分模块、独立模块和合集停用的组合，验证可选依赖/后备帮助。H1新增 `bun run test:suite-handbook`、`bun run typecheck:handbook`、`bun run handbook:export`；原有 `handbook:test/build/check`继续可用。

当前离线 file URL 的 Chrome 拒绝保持 NOT_EXECUTED；不能为消除旧缺口临时托管。未来在 Foundry 正式安装的手册是新产品入口，按其实际源码/manifest/构建身份重新接受，不能据此追认旧 HTML 视觉通过。

## 当前实施切片与停止条件

用户已授权的H3状态与Deck帮助切片已实现并限定接受：只读模块状态、帮助ABI1、Deck面板/同会话副屏入口与独立后备，完整迁移Deck唯一说明，保留36个ID及全部来源。帮助观察严格零文档/设置写入；原跨维护客户端总哈希差异的历史恢复无法追认，新无帮助对照的服务器读回稳定且捕获User事件，均按总账保留。H3收尾时installed-disabled实际UI、其他组合/模块帮助与H4尚未执行；后续范围按下一段连续授权推进，持续避开Forge占用的Mirror。

2026-10-12连续授权下，H4本地双交付与Foundry更新页已在14.368/6.0.5限定接受：28条目、用途/日期摘要、5文件ZIP及独立完整36条目HTML已读回，严格阅读观察零文档/设置/resize事件。原工程review正文留在离线资料；GET采集的MLD User事件及H3历史恢复UNKNOWN保留，离线file视觉仍NOT_EXECUTED。详细候选SHA见总账，尚无公开渠道/发行接受。

已连续接续Deck D1/D2，当前推进D3的Next6.0.6前置；不为普通切片逐次询问，不启用goal。新手册说明或实现变化需重新核review/build，不把已冻结包的运行证据自动推广给新内容digest。Forge占用、数据异常与缺失发行权限仍按真实边界处理。
