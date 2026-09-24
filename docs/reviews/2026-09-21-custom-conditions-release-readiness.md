# Custom Conditions 与 Trigger Engine：候选版本收尾

> 历史节点：本页的“当前”、ZIP 哈希、模块启停和本地合并授权均只对应 2026-09-21 当时的旧候选，不能作为 2026-09-24 HUD／伤势／恍惚三选一候选的发布凭据。新候选在 `codex/20260922-134014-condition-hud-localization` 尚未提交、合并或推送；最新的 [全 19 项 HUD 审计](2026-09-24-all-custom-condition-hud-audit.md)、[恍惚／震愕三选一验收](2026-09-24-dazed-three-choice-rule.md)和[候选计划收尾盘点](../plans/2026-09-22-condition-hud-and-injury-integration.md)分别记录新增范围及未执行边界。旧授权不自动扩大到这些后续改动。

更新时间：2026-09-21。下文为当时已获本地提交与 master 整合授权的候选及其收尾门禁证据；保留键盘长按工具限制、Valor 目标 GM 辅助和 serverNext 未验收边界，不代表远程发布。旧计划中按日期追加的失败、未执行与暂停记录保留为历史证据，不代表后来所有项目仍未完成。

## 候选与使用范围

- 原开发载体：`20260916-154837-trigger-engine` worktree。本次功能已整理为提交 `ec826a2`；干净集成验证位于 `20260921-conditions-master-integration`，排除原worktree尚未提交的伤势模块桥接代码及其手册改动。
- 两个独立模块：`fvtt-trigger-engine`、`fvtt-custom-conditions`，当前版本均为 `0.1.0`。
- 验收目标：Foundry `14.364` / dnd5e `5.3.3`，现有 server-mirror / `fvtt-v14-module-matrix` / 30001。
- server-mirror 按用户要求常驻至关机；E2E 不负责启停。serverNext / Foundry `14.368` / dnd5e `6.0.2` 的兼容性尚未验收，不修改其环境。

## 已有证据

| 范围 | 结论与边界 |
| --- | --- |
| 19种状态实现 | 定义、参数、实例、管理面板和运行规则已实现；多轮真实操作覆盖核心规则，不等于每次构建都重跑全部状态 |
| Bleeding / Burning | 跨来源取较高期望值、同值保留原实例、真实回合结算与流血治疗解除已有证据；Burning的不同伤害类型同组比较，抗性/免疫已测 |
| 生成链路 | Bleeding/Burning来源→正式CLI JSON→原生导入→公开模板应用→Actor实例→结算已测；模板不作用于持有者已有负向对照 |
| 骰式与行动 | 攻击/检定/豁免修饰、Helpless与Frozen重击范围、Weakened实际HP结算、施法/Reaction/weapon attack限制已有证据 |
| 修复回归 | Sickened只影响CON豁免、取消未掷骰攻击不耗Action、Shocked提示名称已修正并有实测证据 |
| 移动与组合 | Immobilized阻止拖拽且移除恢复；Dazed/Shocked移动与Action双向互斥；Frozen/Immobilized玩家HUD高度拦截/恢复已有证据 |
| 机械检查 | 最近模块检查29项/154断言通过；模块类型检查、构建及手册一致性通过。更早全仓测试出现过超时，独立复跑通过，不称当前最终树全仓已全绿 |

## 本次收尾门禁

| 项目 | 当前状态 | 验收要求 |
| --- | --- | --- |
| Frozen来源完整链路 | PASS | 正式JSON原生导入后无holder Actor effect；applyFromItem实例DC14，面板真实Athletics26成功解除 |
| Jinxed / Valor来源完整链路 | PASS（显式选目标的公开API路径） | Jinxed1d6与Valor1d4实际攻击公式为1d20-(1d6)+(1d4)+5；Valor utility target/range仍未结构化，需GM显式选目标 |
| 世界页面重载后持久化 | Bleeding启用实例与checkpoint PASS；未覆盖全部停用状态 | 同GM reload/rejoin后HP21、Chat78、instanceID/参数/origin/turnState/checkpoint不变，0次结算；真实Next Turn后仅1次roll3、HP21→18、Chat79，新key完成 |
| active GM切换 | PASS | 两临时GM在线：A处理真实HP18→19一次、combatTurnStart一次；A正常退出后B接管，HP19→20也只执行一次。临时用户已清理 |
| 通用Trigger手工配置 | UI与真实事件PASS；完整reload门待补 | Manager创建/编辑/停用/重开读回；匹配HP29→28调用一次，停用及无关Actor调用0次；真实Combat start调用一次 |
| KeyD输入路径 | 工具能力限制，长按未执行 | 原生输入keydown/up仅约2ms，Foundry延迟50ms才处理；未验证真实>100ms hold，CDP路径被工具拒绝，不将短按失败判为状态bug |
| 重复生成Effect ID稳定性 | PASS（离线生成回归） | 已用来源动作身份替代随机ID；Item内相同名称/描述的独立动作以logicalPath区分。重复CLI/兼容入口的Effect IDs及引用一致，原碰撞P2已修并复查 |
| 交付文档 | PASS | 简明使用说明、模块README与当前结论已统一；handbook review/build/check通过（28项），历史检查点单独标注 |
| 本地整合与发布 | 用户已授权本地提交/master合并 | 本次不推送远端、不生产部署；实际master提交以Git记录为准。原worktree未提交伤势改动保留 |
| 最终fixture清理 | PASS | 用户确认后清除全部精确测试IDs：3Actor/1Scene/3Macro/19Chat/2Trigger/2临时GM及关联数据。基线恢复，原GM未修改，常驻服务保留 |

## 自动化边界

本期是19种既定状态及其参数配置，并非任意新规则的无代码编译器。Manager目前使用JSON参数/Trigger定义编辑器。已有规则可改骰式/DC/来源；新增全新规则或新Macro逻辑仍可能需要脚本。

API位置变更和GM坐标编辑保留给强制位移/裁定；自主移动限制不是对不可信脚本的安全隔离。飞行坠落落点、接触距离、环境解除由GM裁定。

## 证据入口

- R6：`F:\FoundryLab\foundry-v14\evidence\custom-conditions-e2e\2026-09-20-r6-complete-remaining-luna-max\CC-R6-report.md`
- R7：同根 `2026-09-20-r7-coverage-gaps-luna-max\CC-R7-report.md`
- R11：同根 `2026-09-21-r11-four-condition-closeout-luna-max`，包含HUD闭环及各恢复记录。
- R11F：上述R11目录的 `input-diagnostics\CC-R11F-report.md`，仅纠正数据目录后的PID43532阶段有效；误指任务工作区的Setup步骤不算server-mirror证据。
- 常驻服务：`F:\FoundryLab\foundry-v14\evidence\server-mirror-resident-20260921\HANDOFF.md`。

相关使用说明：[两模块使用说明](../runbooks/custom-conditions-and-trigger-engine-usage.md)。

## 本地候选包

两个ZIP已构建，尚未对外发布。当前包内运行JavaScript与浏览器验收的Lab安装字节一致，README更新不改变运行行为；未为同步文档重启常驻服务。

| 模块 | ZIP SHA-256 | 运行JS SHA-256（与已验收安装一致） |
| --- | --- | --- |
| Trigger Engine | `0C3FCC1076D5058D8201002104EAACDA4FF76F5666D9E65C83592097EC3D881C` | `3B9EF04243BADDA5DCFB7612CA591DAE76FE51E771EF78D86FF04FF1485F85DA` |
| Custom Conditions | `B4EA0E0287A3B44450153217AB1275EFB0D0746F1754261C526A2B61FB0A67DB` | `B160ACC84F6440B919A19DEDA3600DC41C8B19B92C1C86DB2BBEDA6623021D6B` |

位置分别为各模块的 `dist/fvtt-trigger-engine.zip` 与 `dist/fvtt-custom-conditions.zip`。支持边界仍是Foundry14.364/dnd5e5.3.3，不以包已生成代替serverNext兼容性验证。

## 收尾生成样本

`.pui/custom-conditions-closeout/source.md` 与正式CLI输出 `core.json`，SHA-256 `521BEFC7B45A25B83FB7E9763D26C351DBD12CAF015D943605DF2B6840B3316F`。Frozen escapeDC14、Jinxed1d6、Valor1d4。为修复描述错误，仅补齐Melee/Ranged Spell Attack本地化短语并给range添加词界；局部回归4项、packages类型检查通过，父任务anti-overfit检查10个来源通过。verifier没有警告，不替代上表记录的Valor目标投影及ID稳定性边界。

后续稳定ID回归使用独立目录 `.pui/custom-conditions-id-stability/`，未覆盖已验收的上述旧JSON。`generateEnhancedConditionEffects`采用既有稳定ID工具，加入来源描述、状态ID、动作名及可选logicalPath；ItemGenerator传其稳定group/index路径。新增完整Actor/Item输出回归3项/49断言，packages类型检查与anti-overfit11来源通过；父任务扩大受影响generator回归278项/1239断言通过，审查者确认重复动作碰撞问题已关闭。时间戳字段仍可随生成时间变化，不承诺整份JSON逐字节一致；最终生成修复属离线身份/引用验证，不能伪称新ID文件再次做过浏览器导入。

最终稳定ID样本 `core.json` SHA-256：`AB4B56A35CE43C8ED9215C818F98825ED38AD183A47DC54C5474B612C5655D70`。最终architecture:verify通过，handbook:build/check通过28项；未重复未受影响的全仓测试，不将早期全仓结果自动提升为最终树全仓验收。

收尾浏览器报告：`F:\FoundryLab\foundry-v14\evidence\custom-conditions-e2e\2026-09-21-final-acceptance-luna-max\final-acceptance-report.md`；清理报告同目录 `cleanup-report.md`。Bleeding reload、activeGM与精确清理现均通过。动作确认等待过程属于历史记录，不再作为当前阻碍。最终10Actor/13world Item/53embedded Item/3Scene/6Macro/1Combat/63Chat/1User，Task8 active+paused、CC off/TE on、Trigger列表为空，server-mirror常驻。
