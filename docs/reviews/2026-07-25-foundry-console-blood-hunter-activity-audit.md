# Foundry 控制台与“血猎手&塔尔多雷”审计及修复报告

日期：2026-07-25
初始审计范围：本地 `http://127.0.0.1:30001/game`，只读检查；当时未修改 world、合集包、Actor、模块、代码或设置。
后续修复范围：项目代码、项目本地 Plutonium 安装和可重复生成的 homebrew artifact；始终未修改 world、合集包、Actor 或 LevelDB。

## 修复结果（2026-07-25）

- Quick Insert：已通过项目命令对精确的 `plutonium-cn 2.15.6` Bundle 加入缺失依赖兼容层，并保留相邻上游备份。补丁有版本/源码形状守卫且幂等。
- 血猎手：已生成本地可导入文件
  `.local/foundry-v14/data/server-mirror/Data/assets/homebrew/blood-hunter-2024.activities.json`
- 产物包含：
  - 4 个职业特性 side-data；
  - 11 个突变/弑灵/渎魂子职特性 side-data；
  - 42 个可选特性 side-data（血咒、血仪、诱变剂及诱变武者）；
  - 合计 59 个 native dnd5e Activity。
- 鲜血秘法新增共享次数刻度 `2/3/4/5`，血咒 Activity 使用 Plutonium 的 `consumes.name = 鲜血秘法` 引用，在 Actor 多条目导入时解析为共享 Item uses。
- 武器精通、战斗风格、诅咒专家、契约魔法、炼金代谢等被动/选择条目仍无 Activity；这属于刻意保留，不是漏做。
- 条件状态、持续效果、武器 rider、增幅分支和形态变化主要保留在 Activity 的 chat flavor 中，没有声称已实现完整自动化。

## 验证结论

- 机械验证：
  - Foundry Lab：`164 pass / 0 fail / 602 assertions`；
  - production/all TypeScript：通过；
  - anti-overfit：通过；
  - 真实生成产物结构验证：0 findings，且无重复 Activity ID；
  - live HTTP：`200 application/json`，计数为 `4 / 11 / 42 / 59`。
- 短 Chrome 冒烟：
  - 刷新后未出现 `Omnidexer`、`FoundryOmnidexerUtils`、`ReferenceError` 或 error-level console 项；
  - 控制台出现 `world.and` 44 条目的索引构建完成日志；
  - Chrome 扩展阻止了新标签直接打开本地 JSON（`ERR_BLOCKED_BY_CLIENT`），因此 JSON 可取性只由 live HTTP 验证，不冒充浏览器通过。
- 语义验收：
  - 逐类区分主动、触发、资源容器与纯被动/选择特性；
  - 保存 DC 统一采用血猎手智力 DC；
  - 血仪伤害使用 `@scale.blood-hunter.crimson-rite`；
  - 鲜血秘法与血咒骰使用锁定 class scale；
  - 复杂条件效果明确保留为人工结算边界。
- 未完成且不声称完成：未把新 homebrew 导入世界、未更新卡勒姆现有嵌入 Item、未做三子职高等级测试 Actor、未执行实战 Activity、未验证 MIDI/DAE 自动效果。按用户要求，这些留作人工验证。

## 最短人工验证步骤

1. 在 Plutonium 的 Homebrew 管理中暂时停用旧的 `BloodHunter2024` 远程源，添加：
   `http://127.0.0.1:30001/assets/homebrew/blood-hunter-2024.activities.json`
2. 复制卡勒姆或新建测试 Actor，再重新导入血猎手；不要先覆盖正式 Actor。
3. 检查鲜血秘法、印记/焦虑血咒、猩红仪式/烈焰血仪是否出现 Activity，并确认血咒使用后扣除鲜血秘法次数。
4. 分别用突变、弑灵、渎魂测试 Actor 抽查一个低级和一个高级主动特性。
5. 若结构与扣次正确，再决定是否替换正式卡勒姆；条件状态与复杂增幅仍按原文人工结算。

## 结论

1. 当前没有发现 Foundry 核心崩溃。最明确的代码错误是 `plutonium-cn 2.15.6` 与 `quick-insert 3.7.7` 的索引集成：Quick Insert 建索引时，Plutonium 调用了不存在的全局 `Omnidexer`。
2. “血猎手 (2024)”远程 JSON 在本次页面初始化/升级流程中曾加载失败，但复查时源站、CORS、JSON 解析均正常（HTTP 200）。因此目前只能判定为一次瞬时网络/加载失败，不能把 URL 格式或源站永久失效定为根因。
3. 玩家反馈的方向基本正确，但“合集包条目没有 Activity”和“角色特性不能用”是两个不同问题：
   - `血猎手&塔尔多雷`（`world.and`）共 44 个 Item；其中职业/子职条目是 Plutonium 的展示条目，本来就不承载可点击特性。
   - 真正应可用的特性是在导入时嵌入 Actor。卡勒姆·维雷当前为 2 级血猎手，共有 7 个血猎手相关嵌入特性；仅“焦虑血咒”有 1 个 Activity，其余 6 个为 0。
4. 不能把所有 0 Activity 都算成缺陷。“武器精通”“战斗风格”主要是被动/选择型；但“印记血咒”“猩红仪式”明显是主动特性，当前没有 Activity、资源消耗或效果实现，属于真实缺失。“焦虑血咒”虽有 Activity，但缺少附赠动作、血咒次数消耗和恐慌/增幅效果，只能算部分实现。
5. 突变、弑灵、渎魂三种结社的远程源数据分别包含 7、7、9 个子职特性，但卡勒姆尚未达到 3 级、Actor 内没有这些子职特性，所以本轮不能声称它们“导入后全部没有 Activity”。可以确认的是：源 JSON 只有文本规则，没有逐特性的 Foundry Activity/Effect side-data，复杂机制将依赖 Plutonium 文本推断，缺失风险很高。

## 控制台错误分级

| 优先级 | 现象 | 当前判断 | 可修方向 |
|---|---|---|---|
| 高 | `ReferenceError: Omnidexer is not defined` | 已复现；运行时 `QuickInsert` 存在，但 `Omnidexer` 与 `FoundryOmnidexerUtils` 均为 `undefined`。Plutonium 的 `Bundle.js` 仍直接调用它们。影响 Quick Insert 的 Plutonium 扩展索引，不等于 Foundry 核心不可用。 | 短期可关闭 Plutonium 的 Quick Insert 集成；正式修复应在模块中保证索引依赖先加载，或在依赖缺失时安全跳过扩展索引。 |
| 中 | `Failed to load homebrew ... 血猎手 (2024).json` / `status=0` | 页面当时加载失败；随后从同一 Foundry 页面 `fetch` 成功，HTTP 200、CORS `*`、JSON 可解析。 | 先观察是否可重复；若稳定复现，再做重试/本地缓存源。现在不建议凭一次瞬时错误改 URL。 |
| 低 | `item-piles` 使用全局 `Tour` 的弃用警告 | Foundry 14 仍兼容，Foundry 15 将移除旧入口。 | 模块升级或把调用迁移到 `foundry.nue.Tour`；不影响本次血猎手问题。 |
| 低 | `FoundryVTT` 字体加载失败 | 当前未看到与血猎手或索引错误的因果关系。 | 只有实际出现图标/字体显示异常时再单独查。 |

## 卡勒姆·维雷：2 级血猎手特性

| 特性 | Activity | 语义验收 |
|---|---:|---|
| 鲜血秘法 | 0 | 不只是被动说明；还承载血咒次数与增幅规则。当前 uses、Actor 三个资源槽均为 0/空，血咒没有共享资源消耗链。需要建模，但具体放在 Item uses 还是 Actor resource 需先定方案。 |
| 武器精通 | 0 | 选择/被动型，0 Activity 不构成直接缺陷。 |
| 血咒：印记血咒 | 0 | 明确的附赠动作、30 尺目标、持续与额外伤害机制；属于真实缺失。 |
| 血咒：焦虑血咒 | 1 个 save | DC 12 与卡勒姆当前 `8 + INT 2 + 熟练 2` 一致；但 Activity 的 activation 为空，也没有次数消耗、恐慌状态或增幅效果，属于部分实现。 |
| 猩红仪式 | 0 | 明确的附赠动作、自损鲜血秘法骰、武器额外伤害与持续时间；属于真实缺失。 |
| 战斗风格 | 0 | 选择/被动型，0 Activity 本身合理；若选择“诱变武者”，具体诱变剂才需要可用项。 |
| 猩红仪式：烈焰血仪 | 0 | 单独看是伤害类型选择；若由“猩红仪式”活动统一驱动，可不单建 Activity。但当前父特性也没有 Activity/Effect，因此整条机制尚未实现。 |

## 建议的最小修复顺序（未执行）

1. 先处理 Quick Insert 集成错误：选择“关闭集成止血”或“修模块加载/守卫”。这是独立于血猎手数据的模块兼容问题。
2. 为卡勒姆当前等级先做最小可玩闭环：鲜血秘法共享次数、印记血咒、焦虑血咒完整化、猩红仪式/烈焰血仪。
3. 不直接修改卡勒姆一个 Actor 作为最终方案。应在 homebrew 导入源或可重复的导入后处理流程中实现，再重新导入测试 Actor 验证，避免以后升级/重新导入丢失。
4. 三个结社要用测试 Actor 分别导入到至少 3/7/11/15/18 级后做矩阵审计；在未执行这一步前，不应宣称所有子职 Activity 已修好。

## 验收层级

- 机械验证：确认 Foundry `14.364`、dnd5e `5.3.3`、world `cor-cotn`；读取当前控制台；核对模块版本与运行时全局；统计合集包 44 项、Actor 32 项及各特性的 Activity 数；验证远程 JSON 为 HTTP 200 且可解析。
- 语义验收：逐条对照卡勒姆 7 个血猎手特性的规则文本，区分被动/选择型与真正需要点击、消耗、豁免、伤害或状态的特性。
- 尚未完成：未导入三种子职测试 Actor，未执行 Activity，未在战斗中验证 MIDI/DAE 行为；因此本报告是修复范围结论，不是修复完成报告。
