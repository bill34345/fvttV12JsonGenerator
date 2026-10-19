# Forge 普通／分步流程的本地 A 基线

2026-10-19。用户授权整理当前 Forge 拆分流程与此前相关修复为本地 commit，供另一项 A/B 对照使用。本基线保存当前产品行为和已知失败，不调整分步粒度，不修复普通入口的空施法列表，不扩样、不调用真实 AI、不安装、部署、push、合并或清理工作树。

父提交：`f79c25fbac747a7e08f98c48779f052c3db68599`。本次提交还须包含该父提交之后尚未提交、而当前 Forge 入口实际依赖的源码、package exports、lock、共享消费者、回归样本和中文手册；不能只挑最近的两项修复文件。

## A 的实际流程

- 普通入口：完整候选来源 → `OpenAICompatibleMonsterIntakeProvider.extract` 返回整份 `MonsterIntakeIR` → 程序锚定同源证据、恢复已证明缺值 → validator → 确定性 Markdown → workflows/parser/generation → Intake/Actor verifier → GM 审核和目标世界导入。
- 分步入口：`createEncounterIntakeProviders` 显式启用 `baseMode=facts, featureMode=auto` → `splitStagedMonsterSource` 先建立不可变来源单元；不能确定边界时只允许模型选择原行 → AI 基础事实 → 逐个完整能力。程序能证明的普通操作、治疗、固定伤害升级直接保留；未知能力才提出有界事实提案，仍经严格 assembler → 统一 IR 和正式生成链。共享上下文、共享次数、资源、真实施法及 GM 后果分别核对。
- 两条入口共用 SourceOperation、资源、来源完整性、renderer/parser/generation/verifier。CLI 旧固定标题路径仍存在，不把它与普通 Forge AI 或分步入口混称。

入口位置：`packages/forge-browser-runtime/src/{ai,encounterIntake}.ts`；来源与组装：`packages/intake-ai/src/{staged-source,staged-extraction,source-operation-contract,source-completeness,source-damage-upgrade}.ts`；普通 dispatch：`provider.ts`；共享消费：`packages/models/src/sourceOperations.ts`、`packages/parser/src/structuredAction.ts`、`packages/generation/src/actor.ts`。法术 manifest、匹配、hydration 和 Cast 的完整消费链随本基线保留，不能只提交 producer。

## 已有成果与证据边界

| 对象 | 实际证据 | A 中的边界 |
|---|---|---|
| 固定治疗动作 | 普通/分步保留 action、2d4+2、自身和黎明一次消费，正式来源核对通过 | 不是任意来源首次成功保证 |
| Regenerate | 普通/分步保留初次4d8+15与后续1、同一触碰受者、完整时机；后续不再次消费 | 不自动回血、监听回合、执行期限或断肢规则 |
| 两段固定伤害升级 | 当前代码与保存真实回复的正式链保留单一2d8、四类型择一、单命中生物和完整原条件 | GM确认已选Primal Strike与触发；不自动推定等级/选项或增加300尺射程 |
| 最新全新真实请求 | 普通1HTTP/37.571秒阻断，分步1HTTP/2.094秒首次正式链通过；0重试、0repair | 明确1/2，不把分步通过或普通IR事实正确算作普通成功 |
| 旧候选治疗原生使用 | Periapt实际10、次数1→0/重复阻断；Regenerate实际35与1，刷新读回和精确清理通过 | 安装脚本SHA为`bb10347be457c55f32b78e5924aef515d99b51c52b7eedc600b1c89607bde086`，不是当前A候选实机接受 |
| Poisons性能 | 相关最终受影响检查ordinary599.70ms、staged831.17ms，通过原5000ms上限 | 不宣称任意来源或整仓性能通过 |

当前普通失败：真实回复包含`creature.spellcasting: []`；规范化逻辑命中原文“Potent Spellcasting”后保留空数组，validator要求字段存在时为非空数组，报`INVALID_SPELLCASTING_GROUPS`。IR的2d8、类型及完整条件存在，但没有最终Actor。A原样保留这一故障。

`tests/fixtures/forge-a-fresh-first-replies.json`仅保存这次有界可见回复、来源身份、内容哈希和实测状态，不含请求头、凭据、浏览器/世界数据或私有运行信息。对应回归中的“预期拒绝”是记录A行为，不能当作普通生成的功能验收通过。既有`forge-damage-upgrade-provider-replies.json`保留更早的三请求失败/重放，不能冒充此次全新结果。

## 提交核对

本次新增两项离线回放并补齐回归中的provider必填配置与哈希类型，未修改产品源码。伤害升级21项、法术解析422项通过；包／生产类型、架构、34项指令链、33项手册及浏览器bundle安全检查通过。静态核对拟提交树423个源码／测试文件的import/export闭包无缺失；未新建独立检出或安装依赖。三个可选历史保存样本依赖本地原件，无原件时跳过。

本次提交检查和保留清单见同目录[机器可读摘要](2026-10-19-forge-a-baseline.json)。历史验收按其来源、候选哈希、日期与运行环境复用；本地commit、整理证据或测试绿色都不会自动升级实机结论。

尚未完成：当前A候选的安装、Foundry使用/重载；普通入口的全新真实首次成功；更广陌生来源稳定性；整个Forge交付。全仓测试/CI不记通过：本次`typecheck:all`仍有21条诊断（在两个既有回归文件；历史16条不是当前A结果）。本次Forge集成检查585通过、5失败，涉及攻击基础伤害、reaction投射／long-range读回和statblock显示；完整失败名见机器摘要。此前受影响wrapper的v12 renderer-verifier测试访问不存在的`claw.system.damage.base`崩溃也单独保留。

## A/B 使用与未提交范围

以包含本文件的最终本地commit为A，保留共同父提交和相同的来源、provider/model配置、版本与验收口径。B应在独立分支/worktree比较，不能用工作树未提交内容补齐A。运行时使用已存在的Bun1.3.14及锁定依赖；本次没有安装依赖或发新AI请求。

`.local`中的原始回复、失败、来源、浏览器截图、bundle、安装/启动脚本及运行时收据继续保留本地，不强制加入Git。独立Item/Species provider超时原因标记、可选历史诊断、未被当前产品文档引用的旧计划/调查和本地`.worktreeinclude`保留未提交。完整路径和分类见机器摘要；不清理任何现有工作树内容。

进一步背景：[当前限定修复与全部历史边界](../reviews/2026-10-19-forge-iterate50-rules.md)、[分步实施及历史验收](2026-10-14-forge-staged-manual.md)、[原生恢复更正](2026-10-16-forge-legacy-restoration-errata.md)、[施法链离线统一](2026-10-18-forge-spell-chain-offline.md)。
