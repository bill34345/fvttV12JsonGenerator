# Forge：2024 Vampire 重新测试

日期：2026-10-20。用户要求重新使用2024 Vampire测试；本轮不使用2014规则或Actor作为当前标准。沿用 `codex/20261019-forge-ab-fixed-replies`，不改旧冻结回复/评分及历史收据，不新增真实模型调用，不提交、合并、push或操作生产。

## 来源、目标与证据边界

指定原生实现参照为已安装Monster Manual 1.3.0的 `dnd-monster-manual.actors / mmVampire0000000`，`MM 2024 / rules=2024`。实际环境为唯一Mirror `cor-cotn` / Core14.368 / dnd5e5.3.3，既有80模块组合和PID30932继续保留。

已从该Actor正常只读采集11项怪物能力、2项关联Spell定义及其独立巢穴地区说明，不将缓存Spell误计为新增怪物特性。MCP会过滤名为save的字段，所以Bite CON17等由正常原生卡片交叉核对，工具返回不作无损原始JSON宣称。锁定合集没有正常导出入口，本轮未解锁或绕行。

完整英文statblock取自官方开放的[SRD5.2.1](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf)第335–336页，并逐页视觉核对；这份同属2024规则的来源用于正式文本链，指定MM Actor用于比较原生实现。PDF SHA-256 `8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87`。新测试fixture为 `tests/fixtures/forge-vampire-2024-srd521.json`，含CC-BY4.0归属、11项能力身份及全部格式规范化记录，源SHA `fa4306f92887058775d167f201e7c96e19de45f4dd545482e1917bad9a40c2b5`。只去页眉/换页、恢复字段换行及校正PDF断行丢失的Shape-Shift连字符；不删规则或数字。

本机MM中文化与官方英文源有两处已观察到的差异：Grave Strike的原文是Large or smaller，本机写成中型或更小；Shape-Shift的原文限定wearing，本机写成所有携带物。用官方英文来源判断原规则，不据本地译文收窄或扩大输入，也不修改安装合集。本轮测试覆盖完整2024 statblock；MM独立地区效应材料单独保留，不宣称已测试其自动化。

## 本轮验收目标

- 基础：HP195/23d8+92、先攻+14、步行/攀爬40、CON豁免+9；保留Medium or Small、巢穴XP10000/11500等来源选择和条件。
- Grave Strike：来源中立近战+9、触及5、1d8+4钝击及2d6黯蚀，Large-or-smaller擒抱、逃脱DC14与双手限制。
- Bite：CON17 Save、单个5尺内合格生物、失败1d4+4穿刺及3d8黯蚀；完整实际伤害恢复量、HP-max及次日日落衍体条件，无旧版攻击或虚假固定Heal。
- Charm：附赠动作、Recharge5–6、CHA17的Charm Person、免成分、24小时及Bite/知情例外；Beguile为传奇Command、免成分、CHA17及到自身下回合的使用限制。
- Shape-Shift：完整蝙蝠/迷雾形态、速度、日光流水前置和例外；Deathless Strike为半速移动及Grave Strike引用。
- 资源：传奇抗性3/4次每日、传奇预算3/4及每项1次，不把条件上限强行写成无条件3。字段、完整GM规则与实际消费分别记录。

不存在的旧版Regeneration20、Children of the Night动作及旧传奇选项不进入这次来源。独立MM地区说明里的同名用词不当作旧版动作恢复。

## 测试方式与当前状态

以完整2024来源编写独立明确填写契约，通过实际 `generateEncounterFromHumanMarkdown` → staged provider → V2来源绑定 → IR → renderer/parser/workflow → generation/verifier。fake transport只注入填写回复，不手写最终Actor，不把官方Actor JSON直接当输出，不测新模型准确率或费用。先测试当前候选，不先修改产品以迎合新来源。

2024整源首跑结果 **FAIL**。Bun1.3.14下运行独立安全入口 `bun run test:forge-vampire-2024`，0 pass / 1 fail / 6断言，exit1；没有把预期改成“应阻断”来取得绿色。实际正常provider只到source行分区与base事实两次fake transport，真实HTTP0；报告状态needs_review，首阻断为 `UNSUPPORTED_STATIC_FACT at /creature/identity/size`。11项能力的whole请求、正式IR、rendered Markdown、Actor及整包均未到达。没有可导入正式产物，2024导入/活动使用/资源消费/刷新验收 **NOT_EXECUTED**，未创建世界Actor/Token/Macro/聊天。

父控逐一核对首收据的8个文件SHA、实际formal report与requests，确认不是仅测试断言报错：生产来源验证已经拒绝。新TS helper/test局部类型检查0诊断；它只说明测试代码可用，不抵消产品失败。输入基础事实选择当前合法接口的medium与XP10000（与指定官方Actor当前默认值一致），完整源仍含Small、巢穴XP及两套3/4条件，没有人为填写非法枚举或删字段。

原因已定位在 `packages/intake-ai/src/staged-source-facts.ts` 的 `identityHeaderRows`：第18行自然身份行及第24行initialSizes模式要求单个尺寸后直接接类型或swarm，不能识别原文 `Medium or Small Undead, Lawful Evil`；declaredSizes因此为空，第423行触发不支持尺寸守卫。实际链为generateEncounterFromHumanMarkdown → analyzeBrowserActorSourceWithAi → provider.extract/runStagedMonsterExtraction → validateStagedBaseFacts → validateStagedStaticSourceFacts → identityHeaderRows/size守卫。这是当前2024来源接入缺口，不是模型漏填Small，也不是通过修改最终JSON可补救的问题。

原自动source splitter还报告UNKNOWN_ABILITY_BOUNDARY at /source/1233，正式source阶段已使用现有行分区接口和精确物理行所有权继续，未改原文；这层可恢复分区结果不能掩盖后续base失败。

## 能力层诊断边界

为避免首个base错误遮住所有后续线索，使用现有inspectCategoryFormV2和assembler作一次独立诊断；base明确标为 `UNACCEPTED_INSPECTOR_SCAFFOLD`，从未反馈到正式生成。11项中Misty Escape出现V2_HEALING_TARGET_UNSUPPORTED、Bite出现V2_HEALING_SOURCE_RELATION_UNSUPPORTED、Charm出现V2_SPELLCASTING_COMPONENT_CONFLICT、Beguile出现V2_SPELLCASTING_GRANT_UNSUPPORTED。其余7项只到局部组装，不是整源、正式产物或运行PASS。法术额外限制与条件资源还存在填写接口表达边界，因此这4项只作后续检查线索，不冒称实际whole请求已逐项失败，更不能说只有这4处问题。

本轮未修改产品源码来修复这些问题，也未删除尺寸选择、固定巢穴模式或把2014 Actor作为生成替代。下一次实施应先让来源身份契约无损表达2024尺寸选项，再以同一完整原源续测；其后仍须重新验证其他字段和能力，不能预先宣布都已解决。

## 实际证据与归还

首跑收据 `vampire-2024-current-chain-2026-10-20T09-09-10-499Z.receipt.json`，SHA `49b35877f81cd68b7ad609fc64d460efcd2da3ebea1b4bbb4638816c98c3afc0`；同前缀保存source/base facts/完整新form及reply/formal report/source plan/fake transport/capability inspection共8文件。首红色日志 `current-chain-first-attempt.log` 不覆盖，局部types日志 `vampire-2024-types.log` 保存。

只读采集结束后，父控比较before/after的318 Actor完整目录和原场景/7Token完整JSON均相等；本轮没有世界写入，未停止或重启PID30932/30001，仅关闭本任务Chrome tab651347753。原场景、暂停和时间保持。官方Chrome收据为 `stage1-final-receipt.json`。

私有原件和后续唯一收据保存在 `.local/forge-vampire-2024-retest-20261020/`。旧2014通过仅作历史，不用于满足本轮2024目标。

本批收尾：两份README、支持矩阵及手册已明确旧Vampire为2014历史证据和当前2024失败；5项受影响条目人工核对，33项handbook build/check通过，生成HTML中的规则年份/失败边界已读回。16项本次实现hash与首跑收据一致，原产品及既有测试实现未改；343冻结文件与4份历史语料SHA保持。最终汇总见 `.local/forge-vampire-2024-retest-20261020/retest-final-receipt.json`。业务结果仍FAIL，未将文档或类型检查通过算作2024接受。
