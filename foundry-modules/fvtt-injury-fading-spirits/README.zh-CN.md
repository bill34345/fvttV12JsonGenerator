# 消逝的灵魂（兼容模块 ID：fvtt-injury-fading-spirits）

运行时仅接受 Foundry VTT `14.364` / dnd5e `5.3.3`、Mirror `14.368` / `5.3.3`、历史候选 `14.368` / `6.0.2`，或新增候选 `14.368` / `6.0.5` 四组精确配对；交叉和未列版本会失败关闭。6.0.5 已有独立复活基础链、快速复活与 CC 伤势联动的限定本地接受；其他仪式、玩家贡献分支和多 GM 仍须单独语义验收，见[四模块当前进度](../../docs/reviews/2026-10-05-next-four-modules-progress.md)。本模块保留独立复活仪式、历史、锁与 blind 结果保密；伤势规则、状态、死亡豁免 19/20 扩展和管理入口现由 `fvtt-custom-conditions` 负责。未安装 Custom Conditions 时，复活仪式仍可独立使用。

## 语言

模块跟随 Foundry 世界的核心语言设置，不根据操作系统或模块安装路径猜测语言：

- Foundry 核心语言为 `zh-CN`，或使用 Foundry 中文翻译包的 `cn` 时加载 `lang/zh-CN.json`，消逝的灵魂、复活模式与 GM 裁定界面显示中文。
- Foundry 核心语言为 `en` 时加载 `lang/en.json`。
- 修改 Foundry 核心语言后请重新加载世界；当前已经打开的 Dialog 不会被动态重绘。
- 模块的 manifest 标题使用中英双语，避免在管理模块页面中出现不可识别的纯英文标题。

## 使用

GM 可以在 Actor 目录右键选择“消逝的灵魂”，或选择一个 Token 后在聊天输入 `/ifs`，打开复活面板。`enabled` 和 `manageNpcs` 旧世界设置只留给 Custom Conditions 迁移，不再在本模块启用伤势 Hook。已有 `flags.fvtt-injury-fading-spirits.injury` 和 `fadingSpirits` 保留；本模块后续只写 `fadingSpirits` 子路径。Custom Conditions 开始新死亡 episode 时，可调用本模块公开的 `beginDeathEpisode`；复活成功则通过 Custom Conditions 公开接口设置下一次恢复抑制。

不安装 Custom Conditions 时，本模块仍观察 Actor 从正 HP 降到 0 的事件，开启新的复活死亡阶段并重置仅限本次死亡的锁；它不计算伤势、不改死亡豁免。若事件未被观察到，GM 可在 0 HP Actor 的复活面板明确选择“开启新的死亡阶段”，不会自动清除正在结算的旧仪式。

## 复活仪式

普通/最终仪式可以填写最多三名不同参与者的 Actor UUID、技能、可选属性覆盖、DC 10–20 与优势状态。模块创建 dnd5e 原生 `request` ChatMessage，玩家投骰结果由原生 `flags.dnd5e.requestResult` 关联；最后仍由 GM 确认每项贡献。

最终检定和快速复活检定使用原生 `blindroll`。Actor flags 与 GM 摘要只记录 DC、贡献计数、模式、结果、时间和 GM，不保存最终骰原始值。

快速复活失败会增加永久 DC 惩罚并锁定本次死亡的快速复活；普通失败会锁定常规复活。常规锁存在时，“奇迹”入口只允许开启一次最终仪式。

复活成功记录回归历史；若 Custom Conditions 在运行，调用其公开接口使下一次 0→正 HP 不叠伤势。实际 HP 恢复仍由对应法术/Activity 处理。

## 公开 API v1

```js
const api = game.modules.get("fvtt-injury-fading-spirits").api;
api.getState(actor);
await api.setInjury(actor, 2, "GM correction");
await api.openResurrectionWizard(actor);
api.getResurrectionState(actor);
await api.withInjurySuppressed(actor, "resurrection activity", async () => {
  await actor.update({"system.attributes.hp.value": 1});
});
```

旧 `setInjury` / `withInjurySuppressed` 调用会转发到 Custom Conditions 公开 API；未启用 Custom Conditions 时返回明确错误。外部复活 Activity 或宏若会直接恢复 HP，可由活动 GM通过 `withInjurySuppressed` 包裹恢复事务。模块不会从物品名称猜测复活能力。

## 安全与限制

- 长期状态仅由 Foundry 的确定性活动 GM 写入；无活动 GM 时不会偷偷改 Actor。
- 模块只在精确目标版本启用自动化；版本不符会失败关闭。
- ChatMessage 不是历史事实来源，聊天被清理不会丢失复活历史。
- 本地 Lab 验收不代表生产部署或真实跑团长期验收。
