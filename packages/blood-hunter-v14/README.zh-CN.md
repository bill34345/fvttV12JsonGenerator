# @fvtt-json-generator/blood-hunter-v14

这是 `BloodHunter2024` 的独立原生编译边界，目标严格锁定为 Foundry Virtual Tabletop `14.364`、dnd5e `5.3.3`、`modded-v14`。包本身只编译、校验和规划迁移；不读取或写入 Foundry World、Compendium、LevelDB，也不启动浏览器。

## 锁定源与入口

锁定的真实源 JSON 必须按原始 UTF-8 字节流校验，SHA-256 为：

```text
3526E4F2F28A81052843D0FFE71FCCA54F49015E2AB5037F7F1DA7423BE6FB65
```

生产调用应传入未 parse、未 stringify 的原始字节（或同一原始 UTF-8 文本）和精确 target。哈希检查在 JSON 解析之前执行；因此不能用 parse/stringify 的结果代替源字节验证。

```ts
import {
  BLOOD_HUNTER_V14_TARGET,
  assertBloodHunterSourceBytes,
  compileBloodHunterV14Package,
  validateNativeBloodHunterPackage,
  planNativeBloodHunterMigration,
} from '@fvtt-json-generator/blood-hunter-v14';

const bytes = new Uint8Array(await Bun.file('blood-hunter-2024.activities.json').arrayBuffer());
assertBloodHunterSourceBytes(bytes);

const nativePackage = compileBloodHunterV14Package({
  source: bytes,
  target: BLOOD_HUNTER_V14_TARGET,
});
const result = validateNativeBloodHunterPackage(nativePackage);
const plan = planNativeBloodHunterMigration(nativePackage, existingActorItems);
```

旧的 `compileBloodHunterV14Package(enrichedSourceObject)` 仍可用于已经受信任的内存对象和 fixture；它保留语义校验，但因为对象已经失去原始字节边界，**不**执行 source SHA-256 验证。发布和导入锁定源时必须使用上面的 `{ source, target }` 入口。

## 生成的原生对象

- 真实源固定为 1 个 class、4 个 subclass、75 个 canonical 源 feature；职业的自定义战斗风格选项“诱变武者”额外生成一个稳定 synthetic feat，因此当前输出为 76 个 feature 与 94 条 coverage ledger。
- Document、Advancement、Activity、Effect 和所有引用的终端 ID 都严格是 16 位 ASCII 字母数字；稳定哈希会将对象类型纳入输入，但不保留类型前缀或下划线。
- class 使用 d10、Dex/Int 主属性、Dex/Int 豁免、轻甲/中甲/盾、简易/军用武器、炼金工具、三项技能选择、起始装备/155 GP 备选与多职边界。`HitPoints`、`Trait`、`ScaleValue`、`ItemGrant`、`ItemChoice`、`Subclass` 和 `AbilityScoreImprovement` 均为可独立持久化的 dnd5e 5.3.3 对象。
- 武器精通是 `Trait` / `mode: "mastery"`，提供两项 `weapon:*` 选择。战斗风格的 pool 直接包含四个锁定官方 UUID：`phbfstArchery000`、`phbfstDefense000`、`phbfstGreatWeapo`、`phbfstTwoWeaponF`，以及带来源和辅助边界的“诱变武者”模块 feat。
- 血咒、猩红仪式、诱变剂配方分别为 14/7/21 个直接模块 UUID，源起始等级为 1/2/3，所有升级选择都带 `replacement: true`。同一 owner/level 的固定特性合并为一个非空 `ItemGrant`；四个子职的 3/7/11/15/18 级均有自己的真实授予，绝不跨子职引用。
- 19 级传奇恩惠采用完整 Ability Score Improvement schema，推荐 `Compendium.dnd5e.feats24.Item.phbBoonofTruesig`，且 `points: 2`、`cap: 2`、`max: null`；普通 ASI 同样包含六项固定属性 `0`、`recommendation: null` 与 `max: null`。
- 模块内引用直接写作 `Compendium.fvtt-blood-hunter-2024.<pack>.Item.<16-id>`；不会留下等待 module builder 注入的空 `configuration.items` 或 `pool`。

## 自动化与 GM 辅助边界

coverage ledger 的每一条都包含独立 `review.status` 和说明，避免用通用 automation 句子掩盖规则边界。

- “腐蚀血咒”移除了错误的 `sourceEnd` 到期；目标回合末成功体质豁免结束中毒，以及增幅的初始/失败 `4d6` 重复伤害标为辅助结算。
- “升腾”和“幻惑” Effect 明确 `seconds: 3600`，并保留短休/长休的源文本结束边界。
- “灵活移动”对 11 级麻痹免疫不伪称静态 Effect 可以可靠动态处理；升级时由 GM 确认。
- “混种变形”可见地记录 3 级 1 次、11 级 2 次；18 级无限使用不能由有限 uses 安全表示，明确为 GM 辅助。
- 20 级“胸有成竹”的跨 Item 短休恢复全部“惩戒烙印”uses 为辅助步骤，不能静默宣称原生完成。
- 渎魂的契约魔法不是虚假的标准 Pact Magic 空壳：渎魂子职中可见地列出完整血猎手等级的戏法、已知法术、法术位与环阶四张 ScaleValue 表，并说明 GM 依据该表配置和在休息时恢复。
- “破晓血仪”只保留一个 canonical feat、5 个 Activity、2 个 Effect；光耀附伤、20 尺光照、持握期间黯蚀抗性、对不死额外血法骰分别记录其自动或辅助边界。

Activity 计数随锁定 side data 计算。真实源历史上有 117 个 Activity；输出的 `activitySummary` 会明确记录 source、canonical、去重后的数值和差异原因，而不会仅为了复现旧计数复制同一 canonical document。

## 迁移与本地验证

迁移规划是纯函数：优先 canonical flag；否则仅接受 `source + class + subclass + level + normalized name` 的严格复合匹配。多个候选一律输出 `conflict`，不会猜测。计划保留 uses、levels 与 Advancement choice 值，包不执行 Foundry 写入。

```powershell
cd packages/blood-hunter-v14
bun run typecheck
bun test
```

这些检查覆盖编译器、验证器、迁移计划与 fixture 语义回归；它们**不是** Foundry 运行时 E2E 测试。实际导入前仍应在目标 Foundry 14.364 / dnd5e 5.3.3 环境中由 GM 审核辅助步骤。
