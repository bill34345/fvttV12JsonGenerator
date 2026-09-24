# 状态名称、描述、图标与伤势联动审查

状态：本页保留 2026-09-22 至 23 的过程与当时尚未执行的门禁；不能将本页页内的“待验收”直接读作 2026-09-24 的最新结论。后续采用的现成图标、19 项 HUD 入口与自定义流血验收见[全量审计](2026-09-24-all-custom-condition-hud-audit.md)，恍惚／震愕三选一规则及 CoTN 定向玩法见[后续验收](2026-09-24-dazed-three-choice-rule.md)。目标仍是 Foundry 14.364 / dnd5e 5.3.3、server-mirror 的 CoTN 原模组组合。

## 2026-09-23 浏览器回传与剩余工作

当前总结果为 **PARTIAL**，不覆盖下面列明的未执行项。外部 Chrome 回传确认：中文名称、描述与图标资源路径可见；伤势管理器 0→1→2→1 通过；内部来源和外部 Trigger Engine 下的真实 HP 10→0→1 均显示伤势 1/3；TAH full/nameOnly/none 的 DOM 提示内容符合设置。实际鼠标悬停弹层未执行，不能把 DOM 内容当作弹层视觉接受。英文切换与明确死亡后的仪式邀请仍未执行。图标美术已被用户否决，当前只审一张 Addled 样稿，不扩展、不安装该样稿。

启用清单回传为 77 项；子任务曾把初次读回缺失的 `3ds-atlas`、`calendaria` 按较早原组合补回，不能将本轮描述为完全没有模块开关操作。需要以完整前后 ID 清单复核，不只比较数量。

HP 连续更新期间出现 `dnd5ebloodied000` 重复 ActiveEffect ID 警告，仍待区分原生异步状态更新、测试操作节奏与模块联动的影响，不据此直接归因为 Custom Conditions 或伤势模块缺陷。

中断时未清理的本轮对象：Actor `RiuDjZpb8JA6UDAq`、Scene `pDMFZGrI38lU282e`（Token `ZbpEOm9LB4S3aukF`）、Macro `MxFIIMTrjS5jtdM2`。场景和 IFS 来源未恢复；原始 UI 记录确认来源为 internal，enabled=true、resurrectionPrompt=true、manageNpcs=false，原场景为 landing page。后续只清理这些本轮 exact IDs 及明确新建对象。

主任务确认系统于 2026-09-23 07:37 重启，不能从浏览器标签回收与服务消失的先后推断因果。原 30001 无监听后按既有授权恢复，07:49 核对 PID29200、127.0.0.1:30001、cor-cotn、14.364/5.3.3 正常。没有操作 serverNext。服务恢复证据位于本地 `evidence/condition-hud-20260923/service-recovery/`；UI 原始回传位于 `evidence/condition-hud-20260922/chrome/`。

视觉修订：用户否决了首版 Luna 绘制的 SVG，认为造型过于简陋；此前 32px 可读性检查不能代表美术风格获得接受。用户明确指定 **Astra / medium** 重画，本轮以 dnd5e 原生图标为参照，重新检查白色剪影、负形、视觉重量和语义辨识。语言及伤势功能验收继续，图标美术结论单独重验。

Astra / medium 已完成 19 张状态与 4 张伤势 SVG 重绘。主任务审阅代表样稿后要求消除“无助”中类似医疗十字的造型，最终整套已通过 32px／64px 联系表检查；23 张 XML／栅格化、唯一内容、精确文件集合与透明背景检查通过。这是新候选的资产检查，用户美术意见和真实 HUD 展示仍独立记录。预览与校验记录位于本地 `evidence/condition-hud-20260922/astra-icons/`。

## 定位结论

1. Custom Conditions 原注册只提供英文 `name` 和复用的系统图标，管理器直接使用共享契约中的英文 label；没有完整的界面语言展示层。
2. 伤势原注册 `name=IFS.Status.Injury`，但已安装 Token Action HUD dnd5e 2.1.0 的状态构建读取 `game.i18n.localize(status.label) ?? status.name`，不会保证对 name 再做一次翻译。
3. 同版本 HUD 的状态 tooltip 读取 `CONFIG.DND5E.conditionTypes[id].reference` 并加载系统规则文档。简单地为自定义状态加 `description` 并不能让这个 HUD 显示规则。
4. Token Action HUD Core 2.1.1 提供 `tokenActionHudCorePreRender(hud, hudManager)` 扩展 Hook。可以仅装饰本模块拥有的 action，无须修改 HUD 源码或创建假规则文档引用。原生同 ID 状态保留原系统展示和规则。

## 数据来源

- 用户提供的两张 Token Action HUD 截图（2026-09-22）。
- 仓库 Custom Conditions 的 `src/runtime.ts`、`src/manager.ts`、语言文件和共享 `packages/contracts/src/conditions.ts`。
- 仓库 Injury & Fading Spirits 的 `src/projection.ts`、`src/runtime.ts` 及模块边界说明。
- server-mirror 已安装 Token Action HUD dnd5e **2.1.0**：`scripts/token-action-hud-dnd5e.min.js` 的状态构建与 tooltip 路径。
- server-mirror 已安装 Token Action HUD Core **2.1.1**：`dist/token-action-hud-core.min.mjs` 的 `tokenActionHudCorePreRender`。
- server-mirror 精确 dnd5e **5.3.3** 与 Foundry **14.364**，不据最新版 API 推断行为。

## 采用的职责划分

用户确认采用：统一名称、说明、独立图标和 Custom Conditions 管理入口；伤势层数及复活历史仍以伤势模块 Actor flags 为唯一事实。复用已授权的旧伤势 HP 桥接，内部／外部来源互斥。Trigger Engine 的死亡事件提示仅邀请活动 GM 打开仪式，不能将 HP 归零当作已死亡，不能自动掷骰或代替裁定。

## 待验收

已完成的离线证据：Custom Conditions 的模块测试 **39 PASS / 0 FAIL / 198 assertions**，模块类型检查与构建通过。覆盖语言回退、原生状态归属、HUD 提示偏好和转义、可选伤势 API、快速加减的顺序处理及失败后队列恢复。19 张状态 SVG 与 4 张伤势 SVG 已解析并渲染 32px／64px 联系表；修正了低对比的定身等图标。以上不替代真实 HUD 的悬停与视觉验收。

本轮审核发现并要求修正：对话框等待占用事件队列、关闭自动化后的提醒门禁、设置变更重新订阅、未生效死亡效果误判、缺少 revision 的重复 HP 转移，以及伤势管理器快速点击丢失层数。这些意见已通过代码复审闭环。伤势最终测试为 **77 PASS / 0 FAIL / 459 assertions**，模块类型检查与构建通过，包含延迟提示标记和 HP 恢复交错的回归。真实浏览器验收仍待执行。

- [ ] 中文和英文名称／完整描述，HUD 悬停显示以及 `none` / `nameOnly` 偏好。
- [ ] 独立 SVG 在 32px 状态栏及伤势层数图标下可辨。
- [ ] 原生同 ID 状态未被覆盖，用户自定义名称未改写。
- [ ] 伤势管理器通过公开 API 调整层数；关闭可选模块时入口安全隐藏。
- [ ] 内外 HP 事件来源互斥与重复事件保护。
- [ ] 明确死亡后只提醒活动 GM，取消提醒不改变仪式历史。
- [ ] 原 CoTN 组合、精确临时对象清理和最终查看页。

## 待判断本地化与新候选复查

本次不引入新的第三方模块。截图中 `MonksLittleDetails.Status.*` 属于另一模块的翻译问题，未扩大为本次代码修复。若后续要求处理，先核对实际安装版本、语言包覆盖顺序与 key 是否缺失，再在 `docs/acceptance/foundry-v14-module-health.md` 使用相同状态口径记录；在实际 UI 验证前不能记为可用。

## 候选安装

已更新 server-mirror 两个本模块的静态文件，manifest 保持一致，无服务重启。安装前后清单与 SHA-256 位于本地 evidence/condition-hud-20260922。首次字节校验因 Bun 在不同 cwd 下生成的源码路径注释不同而失败；对照仅有注释路径差异后，统一使用仓库根 build 入口重建并更新，两个 verify-install 均通过。Custom Conditions 27 文件、伤势模块 10 文件。未触碰第三方模块、serverNext 或生产。

伤势最终 **77 PASS / 0 FAIL / 459 assertions**，包含共享 Actor 状态队列、局部提示标记写入和交错恢复回归；先前审查意见均已闭环。手册 build/check 通过（28 项）。浏览器实测另行回传，不能把 installed bytes 验证当作运行时通过。

收尾补录（2026-09-23）：服务恢复后，子任务已通过UI清理上述exact IDs，恢复landing page、暂停状态、IFS internal及原设置，留在CC Manager。主任务对比完整ID清单，77项与最早75项加CC/TE一致。bloodied警告的静态追踪支持dnd5e原生异步创建重入假设（连续await actor.update不保证派生效果已完成），尚无隔离复现，不能归为已修复。英文切换、真实悬停弹层和仪式邀请仍未完成。用户目前禁止画SVG，改为先审现成资源；候选见2026-09-23-existing-condition-icons.md，未经确认不替换。
