# Foundry 生物创建界面调研（历史归档）

- 日期：2026-10-05。
- 目的：回应用户“先去外部调研，看看别人在 Foundry 内直接创建生物时界面长什么样”，为 Forge 下一轮布局设计提供真实界面依据。
- 研究基线：master 95447df；独立工作树 20261005-215400-creature-creation-ui-research。
- 本次产出：公开资料、固定版本源码、作者截图和演示画面的比较；没有修改 Forge、购买或安装模块、操作 Mirror，亦未提交、合并或推送。

## 2026-10-10 归档状态

本次将 2026-10-05 至 2026-10-06 的研究记录纳入主线，归档前基线为 `15b4a5b05b5150167f4a73418352f8ad18937c3c`。下文的版本、下载数、许可识别与源码观察保留原调查日期，未刷新为当前发布或当前运行结果。原研究的“未提交、合并或推送”描述只针对当时的研究阶段；本次仅归档文档，不修改产品实现。

| 内容 | 归档时判断 | 依据与边界 |
| --- | --- | --- |
| 统一工作台、生物蓝图与可读预览 | 已在主线；不是本研究树中漏合的功能 | [创作研究归档](2026-09-22-creature-item-authoring-opportunities.md)、[资料块依据](2026-09-24-dnd2024-statblock-preview-reference.md) |
| 同一页编辑生物数值与全部特性／动作 | 保留为尚未完成的产品要求；本树没有对应实现可合并 | 主线 [application.ts](../../foundry-modules/fvtt-json-forge/src/application.ts) 仍使用基础、能力、变体、审核分页；下述独立设计稿只完成离线交互检查 |
| 按钮翻页、分段编辑与独立审核的旧提案 | 已被 2026-10-06 用户意见取代 | 以第 5 节的单页原位编辑方向为准；外部工具有这些交互，不表示 Forge 应采用 |
| 外部工具的能力编辑深度与借鉴清单 | 有用的历史研究，尚未批准新功能、购买或安装 | 第 10 节区分文字编辑、实际规则字段和运行时自动化；候选继续保持 Untested |

独立设计稿位于 `H:/CodexData/visualizations/2026/10/03/01a10117-3f4e-77c2-b7d3-e99e6da803af/forge-creature-workbench.html`，对应 `forge-creature-workbench-review/current-status.json` 与 `offline-receipt.json`。归档时已读回设计稿 SHA-256 `04ad4075dd95ef83ec2f8a34f46bed1e59b0afda4cc6a7fa43ca220da7ff4b05`，与既有离线收据一致；状态仍为 `PASS_SINGLE_PAGE_OFFLINE`，浏览器视觉和正式 Foundry 运行均为 `NOT_EXECUTED`。它没有接入正式生成或创建角色卡，不能作为功能已经交付的证明。

报告原文、来源数据的必要字段、截图与已有独立审查均保留在工作树外。归档前已做两轮必要性筛选，不另外复制原件；完整报告可从原外部审查的 `source-untracked-full.patch` 还原并匹配原 SHA-256 `2e7ec7d688e69971908789f9ff6ff6ca3c8b46914ab343ca12c25455d7dc6206`。来源数据的保留位置见第 6 节；视觉证据位置见第 8 节。本次不把历史证据提升为新的产品或运行验收。

## 结论与证据层级

当前应优先调整编辑流程与信息层级。窗口尺寸需要配合设计，但不能单独解决常驻蓝图库、编辑表单和完整结果同时竞争空间的问题。

这次实际看到了两种不同处理方式：

- PF2E Creature Builder：主要宽度给表单，右边只保留紧凑的关键数值预览，表单按类别组织。
- Archive Creature Brewer：窄步骤导航 + 当前步骤编辑 + 完整预览；行动块可折叠，另有集中审核和保存／导出页面。

这说明“左右布局”本身不足以判断优劣。真正要比较的是：右侧展示多少信息、一次展开多少编辑内容、库是否常驻，以及完整结果是否必须一直占据半个窗口。

另一个值得后续验证的方向来自 Giffyglyph Monster Maker Continued 的固定提交源码：结果与编辑器分离，编辑面板可以展开或滑入。此次未取得它的可用实景截图，因此仅记为源码发现，不把它当成已观察的视觉效果。

| 层级 | 本次结果 | 边界 |
| --- | --- | --- |
| 官方说明／manifest／源码 | 已核实下面列出的公开来源及固定提交 | 声明和代码不能证明本地运行正确 |
| 作者静态图 | 已审 PF2E 表单及其在 Foundry 内的位置 | 图像未标注精确模块版本，不能绑定当前发布 |
| 作者公开视频 | 已审 Creature Brewer 的行动与审核页面，另有笔记页辅助画面 | 2026-03-07 视频；画面未显示版本，不能当成当前 3.0.0 证明 |
| 本地模块运行与语义 | NOT_EXECUTED | 所有外部候选均保持 Untested，不更新健康矩阵为可用 |
| Forge 新布局 | 设计建议 | 尚未实现或作真实任务比较，之前原型操作不构成最终方案批准 |

## 1. Archive Creature Brewer：任务最接近，但不应整套照搬

来源：[官方包页](https://foundryvtt.com/packages/archive-creature-brewer)、[作者演示](https://www.youtube.com/watch?v=kn7JT6a-ooY)。

作者 Shadowdrake Creations 的演示发布于 2026-03-07，片长约 15 分 43 秒。本次静音观看关键片段并截取真实画面，不是完整视频内容审阅。

### 亲眼可见

- 独立居中浮窗，背景仍能看见 Foundry 场景。
- 最左边是很窄的步骤导航：基础、笔记、属性、行动、库、审核。
- 中间编辑区与右侧完整预览分配剩余宽度；右侧还有立绘。
- [10:59 行动页](https://www.youtube.com/watch?v=kn7JT6a-ooY&t=659s)：多重攻击、武器攻击、其他行动分别成块；有展开／折叠、上下移动和删除入口。展开块编辑名称、类型、机制和说明。
- [12:34 审核页](https://www.youtube.com/watch?v=kn7JT6a-ooY&t=754s)：校验提示与保存蓝图、导出入口集中在一个步骤，右侧保留成品预览。
- 03:08 的辅助画面显示公开说明和 GM 笔记分开编辑。

### 对 Forge 的启发与不足

值得借鉴的是按制作任务分段，以及每个行动只在需要时展开。库在导航中有位置，并不意味着整份库必须一直作为宽列占屏。

也能看见它的局限：部分控制很小，完整属性块与立绘继续消耗横向空间；审核页左侧存在较大留白。不能因为是外部产品，就把这套布局当作最优答案。

Library 按钮可见，但此次没有捕获库内页；不推断它的蓝图库卡片、筛选、派生或重用交互。

### 版本边界

当前官方包页列 3.0.0，Foundry 最低 13、verified 14.359。[公开 manifest](https://r2.foundryvtt.com/packages-public/archive-creature-brewer/module-3.0.0.json) 声明 protected，并依赖 archive-tab 与 archive-brewer-core。没有取得针对 dnd5e 5.3.3 或 6.x 的本地运行证明。

[旧公开模板](https://github.com/DamondSD/archive-creature-brewer/blob/6a1e05fc2e9a6487403906666ea73056fc85e7ae/templates/brewer-app.hbs) 也包含分步骤结构，但该仓库 manifest 是 1.0.0；它与商业 3.0.0 必须分开。视频未标版本，同样不能补齐这个差距。

## 2. PF2E Creature Builder：表单为主，预览只给关键反馈

来源：[官方包页及作者截图](https://foundryvtt.com/packages/pf2e-creature-builder)、[公开仓库](https://github.com/Dosexe/pf2e-creature-builder)。

### 亲眼可见

- 作者表单图中，主要表单约占四分之三宽度，右侧数值预览约占四分之一。这是目测比例，非本地运行测量。
- 名称、等级、设计路线放在上方；属性、防御、攻击、施法、技能按区排列，有折叠指示。
- 多个字段使用下拉选择，旁边显示计算后的数值。
- 右侧预览是一列生命、护甲、感知、豁免、攻击、伤害等关键数字，并非完整怪物描述。
- 底部有物品／行动拖入区域，然后是重置与提交入口。
- 全屏作者图里，创建器是右侧的小浮窗，旁边同时存在另一张 NPC 表。

### 来源确认与设计判断

官方说明称 UI 2.0 为默认界面、右侧预览实时更新并保持可见、部分细节默认折叠。静态图可以确认布局，不能单独验证实时更新、吸附或折叠操作。

固定源码：[表单类](https://github.com/Dosexe/pf2e-creature-builder/blob/e919b615216e7aeb4dd7a29ef66f23fe4cb03bfa/src/CreatureBuilderForm.ts)、[现代模板](https://github.com/Dosexe/pf2e-creature-builder/blob/e919b615216e7aeb4dd7a29ef66f23fe4cb03bfa/public/forms/creatureBuilderFormModern.html)、[样式](https://github.com/Dosexe/pf2e-creature-builder/blob/e919b615216e7aeb4dd7a29ef66f23fe4cb03bfa/public/styles/module.css)。

当前源码为现代界面配置 530 × 620，经典界面为 400 × 833；这只是该源码的默认值，不是 Forge 尺寸建议。其模板与样式支持分组、滚动表单和紧凑预览的解释。

可借鉴的是“输入变化的简短反馈”。小字号、密集三列控件、PF2E 的等级与数值规则均不应照搬到中文 dnd5e 工具。它让预览更轻，未证明同样的小窗口适合我们的内容量。

当前发布 v2.0.0（2026-05-01），官方包页 verified 14.367，仅支持 PF2E。main 中的中文语言声明不构成已发布包翻译质量或本地适用性证明。

## 3. Giffyglyph Monster Maker Continued：可展开的编辑工具，源码支持、视觉待补

来源：[项目仓库](https://github.com/Skyl3lazer/giffyglyph-monster-maker-continued)、[官方包页](https://foundryvtt.com/packages/giffyglyph-monster-maker-continued/)、[当前发布](https://github.com/Skyl3lazer/giffyglyph-monster-maker-continued/releases/tag/2.1.0.2)。

作者说明提供按等级、位阶和战斗角色创建怪物的入口；这些是第三方造怪规则，不是官方 CR 平衡保证。

固定提交 85ff1517d21ad52fae9af18b18441815ca932f97：

- [MonsterSheet.js](https://github.com/Skyl3lazer/giffyglyph-monster-maker-continued/blob/85ff1517d21ad52fae9af18b18441815ca932f97/scripts/classes/MonsterSheet.js)：替换 NPC sheet 的主要区域，默认 540 × 900、可调整尺寸；结果与蓝图区域分别滚动。
- [forge.html](https://github.com/Skyl3lazer/giffyglyph-monster-maker-continued/blob/85ff1517d21ad52fae9af18b18441815ca932f97/templates/monster/forge.html)：区分 artifact 与 blueprint，并有展开编辑工具的入口。
- [_forge.scss](https://github.com/Skyl3lazer/giffyglyph-monster-maker-continued/blob/85ff1517d21ad52fae9af18b18441815ca932f97/stylesheets/components/_forge.scss)：包含从左右滑入及向外展开的布局规则，编辑区在未展开状态可隐藏。

这支持一个设计备选：以结果为主要阅读区域，需要时展开编辑工具。但本次未核实默认布局、实际比例、交互连贯性或可访问性，不据此宣布这种方案更好。

Chrome 打开仓库时跳转到 GitHub 登录页，已停止该访问，没有登录或绕过。fire-elemental 与 frightful-presence 作者截图未被实际看到；不把 README 和 CSS 描述成亲眼观察。

版本更新需覆盖旧记录：2026-09-22 调研记录中的 dnd5e 上限 5.3.3 已不是本次读取的 manifest 声明。2.1.0.2（2026-10-04）声明 Core 最低 13.347／verified 14.365，dnd5e 最低 5.3.2／verified 5.3.3／最高 6.0.999，依赖 lib-wrapper。这个变化仅代表发布声明，不是新系统运行 PASS。

## 4. Monster Blocks：历史上的阅读优先参考

来源：[官方包页](https://foundryvtt.com/packages/monsterblock/)、[作者仓库](https://github.com/zeel01/MonsterBlocks)。

作者说明强调紧凑、随内容自动定尺寸的怪物属性块，以及按需编辑特性、法术和物品的入口。可作为“阅读成品时减少编辑控件”这一方向的历史参考。

本次未执行可选截图任务，不能用它补足 GMMC 的视觉缺口。最新公开发布 v3.5.1 为 2025-01-27，官方包页支持范围仍是 Core 12；不把它列为本轮 v14 安装候选。自动尺寸与手动缩放之间的取舍也不能直接移植到用户已选定的可最大化浮窗。

## 5. 对 Forge 的下一步建议

2026-10-06 用户修正：明确反对把制作拆成需要按钮翻页的步骤，也反感通过更多滚动容纳全部内容。因此，下面原先的“分段编辑 + 独立审核”建议已被取代，不作为实施默认。当前设计方向为单页可编辑生物卡：基础数值与全部特性／动作摘要同时可见，选中条目原位展开；来源与完整预览按需打开，保持编辑卡在场；保留浮窗与最大化。新版仅完成离线交互检查，未声称已测得滚动减少或通过浏览器视觉验收。

以下是根据画面与源码提出的设计推论，不是外部工具已经证明的效果。

### 先前提案，已由 2026-10-06 用户意见取代

1. 保留浮窗，加明确的最大化／还原按钮，遵从用户已确认的选择。
2. 蓝图库作为“选择起点／打开草稿／派生”的入口；进入制作后可收起，不永久占一整列。
3. 将制作内容按实际任务分组，例如基础、属性、能力／行动。先显示当前组，较复杂条目默认概览，按需展开。
4. 制作中保留较窄的关键数值和错误摘要，先让用户看清本次修改的影响。
5. 完整属性块、来源核对、校验详情与创建入口集中到完整审核视图；切换时保留草稿、展开状态和合理的滚动位置。
6. 最大化时可提供可调宽度的完整对照。最终是否作为默认，需要用真实内容比较，不能由原型中一次点击来决定。

备选方案是 GMMC 源码启发的“成品为主、按需展开编辑”。它需要额外确认复杂表单、长行动文字和中文标签是否方便编辑，目前优先级低于上述方案。

### 下一轮设计稿如何比较

使用同一份已有、允许测试的生物样本比较两版：一个短基础表单与一个包含多个较长行动的表单；分别在普通浮窗和最大化状态检查。

评估实际任务：找到并修改生命值、增加或重排行动、查看相关反馈、完整核对并回到编辑、打开已有草稿继续。观察是否丢内容、是否需要横向滚动、是否频繁来回切页、错误能否定位，以及保存／创建语义是否清楚。

新稿应复用现有 Forge 能力，不把外部的数值平衡规则、自动生成或整套模板库顺便加入本次布局改动。

## 6. 样本规模、版本与许可

2026-10-05 的公开 GitHub API 快照如下。ZIP 下载不是独立用户数，manifest 下载常受更新检查影响，不能用于代表安装数。星标也不是设计质量证据。

| 对象 | Stars / Forks | 最新发布 ZIP 下载快照 | 固定源码 HEAD | 许可边界 |
| --- | --- | --- | --- | --- |
| PF2E Creature Builder | 2 / 0 | v2.0.0：1,737 | e919b615216e7aeb4dd7a29ef66f23fe4cb03bfa | API 识别 MIT；代码复用仍需保留许可并核实文件来源 |
| GMMC | 8 / 3 | 2.1.0.2：v14 包 58、v13 包 2 | 85ff1517d21ad52fae9af18b18441815ca932f97 | API 未识别许可，不据此认定没有许可或可任意复用 |
| Archive Creature Brewer 旧公开仓库 | 0 / 0 | 商业包公开下载规模未知 | 6a1e05fc2e9a6487403906666ea73056fc85e7ae | 当前产品受保护；旧公开仓库不能替代商业授权 |
| Monster Blocks | 30 / 29 | v3.5.1：4,327 | 42e9636b775ea9dbf234bf6d86689a3cb4781083 | API 识别 MIT；本次只作历史界面思路参考 |

若以单个公开 ZIP 的 500–5,000 次下载作为本样本的中等传播档，PF2E 和 Monster Blocks 落在其中；这不是整个 Foundry 生态的热度分类。GMMC 的新发布样本时间短，ACB 是商业包，不能硬归为中等热度。保留它们是因为与“在 Foundry 内直接造怪”高度相关。

原来源快照为研究树内的 `.local/creature-ui-research/source-metadata.json`。归档时已逐项读回外部独立审查记录 `H:/CodexData/visualizations/2026/10/07/01a11584-2153-7350-8ac6-e42a8f829b91/creature-creation-ui-research-audit/ignored-original-review.json`：四个候选的精确观察时刻、固定 HEAD、API 许可识别、stars／forks、发行版本、下载计数、发行资产地址及 release 404 均与原快照一致。该记录保留了本报告使用的来源字段；原 JSON 的仓库更新时间和初步候选文件列表不再另存。旧调研仅用于定位候选，不作为这次视觉或最新兼容性证据。

## 7. 待判断本地化／借鉴清单

| 对象 | 值得继续判断的内容 | 当前状态与下一门槛 |
| --- | --- | --- |
| Archive Creature Brewer | 制作步骤、行动折叠、集中审核 | Untested；当前 3.0.0 需合法取得对应包及依赖，再明确目标系统与测试范围；此次只借鉴公开交互思路 |
| PF2E Creature Builder | 精简预览、分组表单、字段旁反馈 | Untested；PF2E 数学规则不移植到 dnd5e；中文界面仍需独立核对 |
| GMMC | 可展开编辑区、角色／位阶的设计入口 | Untested；先补公开实景和许可文件，再判断是否值得按精确版本运行 |
| Monster Blocks | 阅读成品时隐藏编辑复杂度 | Untested／历史参考；旧版不进入 Mirror 安装范围 |

这些条目描述外部工具可供研究的内容，其中制作步骤、集中审核不是 Forge 的现行设计要求；实施方向以第 5 节的用户修正为准。它们不改变 docs/acceptance/foundry-v14-module-health.md 的状态；声明支持、源码存在或截图可见，都不是本地运行与语义验收。

### 新候选复查顺序

1. 确认是否真在 Foundry 内创建生物，区分外部生成网站、内容包和单纯战斗阅读页。
2. 优先找作者公开截图或演示，记录日期、时间点与版本绑定；缺失就保持未知。
3. 分辨建模起点、填写过程、反馈、保存／创建四个环节，避免只看一张漂亮成品图。
4. 记录常驻区域、折叠方式、预览内容量、浮窗缩放和长内容行为。
5. 核对精确 manifest、依赖、语言和许可；源代码与发行包不同步时分别记录。
6. 只有确有必要时，再按明确对象安排合法的本地测试；不以界面研究自动扩大到购买、安装或发布。

## 8. 视觉证据与访问限制

证据根目录：
H:/CodexData/visualizations/2026/10/03/01a10117-3f4e-77c2-b7d3-e99e6da803af/creature-ui-research-20261005/

主控已亲自查看以下四张原始页面截图：

| 文件 | 用途 |
| --- | --- |
| pf2e-author-form.png | 官方页公开显示的表单作者图，含主要字段、紧凑预览及底部操作 |
| pf2e-author-full-ui.png | 作者全屏图中创建器与 NPC sheet 的相对位置 |
| archive-brewer-10m59.png | 作者视频行动页，时间 659.8956 秒 |
| archive-brewer-12m34.png | 作者视频审核页，时间 754.1664 秒 |

receipt.json 记录原 URL、图片天然尺寸、观察／作者声明／未知项、访问限制及清理。03:08 和 11:12 截图仅作辅助，后者仍是行动页；被裁掉顶部的 11:52 截图排除，未伪称蓝图库。

AnySearch 无法提取一篇公开 Patreon 更新正文及 PF2E release 附件；未把搜索摘要写成全文观察。原始图片读取也曾超时。Chrome 中部分 GitHub 链接跳登录后停止；PF2E 的图片在 Foundry 官方公开页面正常显示，视觉证据来自该页面。GMMC 未转用其他通道补看被登录挡住的图片。

Chrome 原生区域截图两次超时后停止该方式，普通页面截图成功；没有下载远程图片／视频来绕过展示限制，没有改 DOM、拼图或生成替代画面。自有浏览器标签已关闭，用户标签、Foundry 与服务均未操作。

## 9. 文档与验证范围

本次只新增调研记录，不改变产品入口、输入输出、支持版本、操作步骤或安全限制，因此无需更新工具手册或运行产品 CI。已核对主要来源、固定提交、画面与结论的对应关系；未执行外部模块功能测试。

研究范围内的结论可用于下一轮草图比较。当前还不能据此声称某个 Forge 新布局已经更好用，也不推进之前的示意稿为正式产品。

## 10. 动作、特性与反应的编辑深度补查（2026-10-06）

用户追问：其他工具如何编辑动作、特性、角色能力和反应，是否完全可编辑。此次仅核实公开资料、固定源码和既有作者演示证据，没有新增运行测试或扩大产品修改范围。

结论：必须区分文字编辑、结构化规则编辑、运行时自动化。常见能力可以有很完整的编辑器，但“任何文字都可输入”与“任意规则会自动执行”不是同一项能力。

### Archive Creature Brewer

- 2026-03-07 作者演示 10:59 已观察到名称、类别、机制、说明，以及展开、排序和删除入口。可确认它按条目编辑，而非把整张卡作为不可拆分的一段文本。
- 固定旧公开版本的[行动模板](https://github.com/DamondSD/archive-creature-brewer/blob/6a1e05fc2e9a6487403906666ea73056fc85e7ae/templates/partials/section-actions.hbs)包含 trait、action、bonus、reaction、legendary 分类，以及名称和文字编辑。该仓库为旧 1.0.0，不据此枚举商业 3.0.0 的完整字段。
- [当前官方介绍](https://foundryvtt.com/packages/archive-creature-brewer)声明支持特性、动作、豁免、攻击、特性／法术库及可用 Actor 导出，并提到传奇动作和施法。声明不是本地验收；当前付费版本任意复杂能力的完整编辑与自动化范围仍未确认。

### Giffyglyph Monster Maker Continued

固定提交 85ff1517d21ad52fae9af18b18441815ca932f97 的[能力模板](https://github.com/Skyl3lazer/giffyglyph-monster-maker-continued/blob/85ff1517d21ad52fae9af18b18441815ca932f97/templates/action/skins/vanity/blueprint.html)显示它有专门的能力编辑表单，并以折叠区组织大量参数：

- 名称与富文本说明；
- 使用类型、消耗成本与使用条件；
- 攻击／豁免等机制、关联属性和加值；
- 多段伤害公式及类型、未命中比例、两用伤害；
- 范围、目标、持续时间、次数与恢复；
- 主动效果，以及与其他模块有关的扩展配置。

[使用类型枚举](https://github.com/Skyl3lazer/giffyglyph-monster-maker-continued/blob/85ff1517d21ad52fae9af18b18441815ca932f97/scripts/consts/GmmActionActivationTypes.js)明确包括动作、附赠动作、反应、传奇动作、巢穴动作等。[机制枚举](https://github.com/Skyl3lazer/giffyglyph-monster-maker-continued/blob/85ff1517d21ad52fae9af18b18441815ca932f97/scripts/consts/GmmActionAttackTypes.js)另行区分近／远程武器或法术攻击、豁免、治疗、其他和通用机制。两组不是一个下拉菜单。

[ActionSheet](https://github.com/Skyl3lazer/giffyglyph-monster-maker-continued/blob/85ff1517d21ad52fae9af18b18441815ca932f97/scripts/classes/ActionSheet.js)继承 Item sheet、提供自身表单，并通过[ActionBlueprint](https://github.com/Skyl3lazer/giffyglyph-monster-maker-continued/blob/85ff1517d21ad52fae9af18b18441815ca932f97/scripts/classes/ActionBlueprint.js)构造 Item 与 Activity 更新。不是只修改预览文字。

“完全可编辑”也有例外：ActionSheet 主动隐藏由 GMMC 自动生成、保存时会重建的效果，避免用户编辑后又被覆盖。部分区域／持续效果配置依赖额外模块。源码可证明入口和映射，未证明每种机制在本地 5.3.3 或 6.x 正常运行。

### PF2E Creature Builder

本次读取的[创建表单](https://github.com/Dosexe/pf2e-creature-builder/blob/e919b615216e7aeb4dd7a29ef66f23fe4cb03bfa/src/CreatureBuilderForm.ts)支持接收已有 Item 数据并在生成时加入 Actor；[拖入行界面](https://github.com/Dosexe/pf2e-creature-builder/blob/e919b615216e7aeb4dd7a29ef66f23fe4cb03bfa/src/CreatureBuilderFormUI.ts)显示图标、名称、类型和移除操作，没有提供该能力全部规则字段的编辑器。

因此，它偏向生物数值生成与已有能力的组合，不能与 GMMC 的完整能力表单划等号。生成后的能力如何编辑，还需要走对应系统的 Item 编辑方式。本轮未测试该后续交互。

### 官方 dnd5e 的参照模型

[Activities 官方项目 Wiki](https://github.com/foundryvtt/dnd5e/wiki/Activities)说明一个 Item 可以拥有多个 Activity；Activity 按攻击、豁免、治疗等机制提供不同配置，共享身份、使用时间、消耗、目标和效果等概念。原生 UI 本身使用专门窗口和分页，字段模型值得参考，不能因此照搬其翻页方式。

该 Wiki 于 2026-09-10 更新，可能覆盖比本地 5.3.3 更新的功能；这里只用来解释通用结构，不将其中每种新活动宣布为本地支持。配置反应的使用条件与自动侦测触发事件、主动提示或替玩家执行，仍须分别验证。

### Forge 当前事实与设计含义

只读核对主仓库 HEAD 6a7845650a04b8a78b458e5edd5f74fb2bb35ab3：

- packages/forge-browser-runtime/src/creatureBlueprint.ts 的手工蓝图组件类型目前仅为 attack 与 save。
- foundry-modules/fvtt-json-forge/src/creatureBlueprintEditor.ts 已有名称、范围、攻击模式／命中加值，或豁免属性／固定 DC／成功结果，以及伤害公式和类型。
- 这个结论只针对手工蓝图组件，不代表标准资料解析、Actor 导入或整个项目的能力上限。
- 当前可操作设计稿中的名称／说明、特性文本和保留的施法原文，只验证布局与交互；它不是“全部能力已经结构化可编辑”的产品证明。

下一步在确定产品范围时，应明确条目的使用类别与具体机制两条轴，再按机制显示所需字段，并保留自由说明。字段在单页卡中原位展开，不重新引入整卡步骤分页。新增反应、附赠动作、传奇／巢穴动作或自动触发支持会涉及数据模型与生成验证，不能作为纯排版改动悄悄加入。

### 待判断与复查

- 继续借鉴 GMMC 的两轴分类与结构化字段；直接复用代码前核实许可，当前保持 Untested。
- ACB 现有公开演示与旧模板用于解释已观察的操作；商业当前版完整机制列表需要匹配版本的合法实测，当前保持 Untested。
- PF2E 的拖入列表作为组合式交互参考，未把它认定为任意能力编辑器。
- 新候选复查需同时记录：可改哪些字段、字段是否写入真正的 Item／Activity、哪些效果会被重建、自动化依赖与未支持分支。所有候选的状态继续与健康矩阵口径一致，本轮没有新增 runtime PASS。
