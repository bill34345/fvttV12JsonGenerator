# Forge 生物生成结果页 UX 调研

2026-11-14 · 生产环境的更新前页面 · 样本为第三方 PDF 第 3 页的噬智怪 Intellect Devourer。目标用户会在 Foundry 备团、看 NPC 角色卡和用 Token，无需理解 JSON、校验规则或字段路径。

## 实际页面

1. **看生成结果 · 表意冲突。** 页面保留了候选、原始来源和导出，但同时显示「候选可获取」「严格检查状态 accepted」和重复的英文错误。GM 无法由此判断哪一项需要处理。
2. **找到问题 · 缺少可用的对照。** 「当前问题与处理」显示数据路径和 `Expected 450, got undefined`，只给「查看审核记录」。同一窗口的原始资料里已有「XP 450」，这次仍得靠 GM 自己找到并解释。
3. **决定是否导入 · 操作离信息太远。** 导入确实保留了明确确认步骤，但勾选框和按钮在长滚动区域末端，按钮禁用时没有就地说明如何启用。已见按 Tab 可聚焦部分控件及焦点轮廓，未做完整键盘、读屏或缩放验收。

本次 Chrome 截图保留在本机验收记录中，文件名 `forge-candidate-ux-audit-01.jpg` 至 `forge-candidate-ux-audit-03.jpg`。观测范围是已生成的单只生物结果、问题和确认入口。未导入世界，未重跑生成。

## XP 这条提示为何容易误导

PDF 第 3 页写着 450 XP。Forge 候选的 CR 为 2，当前检查通过读取保存的数据判断 XP 字段缺省。官方 dnd5e 6.0.6 的 NPC 根据 CR 计算 XP，普通 CR 2 为 450。开发环境安装的 6.0.6+local.3 源码也含相同计算，参考缓存校验已通过。未在 8080 上创建此角色并读回角色卡，所以这里只确认了计算规则与候选提示，线上实际结果仍需用无持久化角色预览或开发环境读回验证。

若计算后的数字和原文相同，页面应呈现「经验值 450 XP · Foundry 按挑战等级计算」，无需让 GM 修复。若原文自定义了不同 XP，才给出「原文值 / Foundry 按 CR 显示值」，并解释影响和系统实际支持的处理方式。

- [Forge 的 XP 比较与读取逻辑](../../packages/intake-ai/src/verifier.ts#L119)
- [Foundry dnd5e 6.0.6 NPC 经验值计算](https://github.com/foundryvtt/dnd5e/blob/release-6.0.6/module/data/actor/npc.mjs#L376-L381)
- [Foundry dnd5e 6.0.6 CR/XP 对照表](https://github.com/foundryvtt/dnd5e/blob/release-6.0.6/module/config.mjs#L4154-L4160)

## 设计工具与真实案例

- **本机已装的 Product Design 和 Impeccable。** 用 Product Design 从完整操作截图推敲页面顺序和交互，用 Impeccable 的操作界面原则检查信息层级、用词、键盘焦点和窄窗。理解 GM 的依据来自原生 Foundry 角色卡、角色目录及真人任务观察。工具可组织设计和检查，真人反馈用来检验理解。
- **[fvtt-applications](https://github.com/ImproperSubset/hh-agentics/blob/main/fvtt-dev/skills/fvtt-applications/SKILL.md)。** 查了原文，覆盖 Foundry 窗口、表单、事件和滚动位置恢复，可作为实现时的候选参考。本次未安装。实现时以 [Foundry v14 官方文档](https://foundryvtt.com/api/modules/foundry.applications.html) 和项目已锁定版本为准。
- **[5e Statblock Importer](https://foundryvtt.com/packages/5e-statblock-importer)。** 维护者演示了粘贴怪物资料、在预览中标出识别到的原文、确认后在角色目录看到新角色。适合借鉴「核对原文 → 创建角色」的连续操作。一位 GM 用它导入了《Flee, Mortals!》几乎全部怪物，也记录了人工修正的成本。另一位报告了导入快，但属性值有时漏掉，且会配合 Tokenizer。案例支持让 GM 直接在易认的角色预览里发现并处理差异，尚无证据表明其界面能解决 Forge 的多怪物审核和自动化差异。[Flee, Mortals! 导入者原帖](https://www.reddit.com/r/mattcolville/comments/1byhqg4/i_imported_every_monster_and_item_from_flee/)，[Foundry 用户关于漏读字段和 Token 的经验](https://www.reddit.com/r/FoundryVTT/comments/1lcbpi6/is_there_any_npc_collection_for_5e_that_is_easily/)
- **错误摘要与真人看板测试。** GOV.UK 的做法是用同一句明白话显示问题和对应字段，摘要可跳到问题，键盘焦点跟上。设计草图应让会备团的 GM 在无说明的情况下做任务并说出他们看到的内容。[GOV.UK Error summary](https://design-system.service.gov.uk/components/error-summary/)，[NN/g 的出声思考测试](https://www.nngroup.com/articles/thinking-aloud-the-1-usability-tool/)

这次查到的专门技能偏开发，尚未发现有公开证据证明能直接代替非开发 Foundry GM 做导入审核设计的专用技能。无需安装外部模块来借鉴上述模式。

## 待判断本地化与验证

- 首屏用熟悉的 NPC 预览展示名字、生命值、护甲等级、挑战等级、经验值、特性和动作。生成结束时直接打开这个预览。多只生物时再显示怪物列表和各自待核对数量。
- 每项只呈现一次。用玩家可见的名称，例如「动作 · 汲取心智」，直接对照「PDF 第几页 / Forge 将导入什么 / 对跑团的影响」。有真实来源定位才标行和跳转，只有页证据就定位到页。用实际可用的下一步区分可修改、需 GM 手动、可在核对后导入、必须处理才能创建。
- 角色图和 Token 从角色预览直接进入，编辑后由 GM 采用或继续调整。底部持续可见「保存草稿」和「导入到角色目录」，显示实际导入目标。JSON、报告和内部诊断从「更多」进入。
- 原型先用三种任务复查：噬智怪的系统计算值、一个会影响战斗的真实数值或能力差异，以及一批怪物中有一个结果缺失。用原生 NPC 角色卡校对字段和显示，再在开发环境验证导入后目录及角色数据。宽度不足时，保证问题说明和操作仍能读到，键盘可从摘要到问题并回到确认区。
- 请至少一位会在 Foundry 备团但不写代码的 GM，在不给界面讲解的情况下找到受影响的能力、说出原文和导入差异、决定是否导入，并处理或跳过 Token。这个验收方案尚未执行，本文只记录调研和设计方向。
