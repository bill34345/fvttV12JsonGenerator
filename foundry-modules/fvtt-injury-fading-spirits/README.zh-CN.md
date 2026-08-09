# 伤势与消逝的灵魂

适用版本仅为 Foundry VTT `14.364` 与 dnd5e `5.3.3`。模块不依赖 MIDI-QOL、DAE 或其他村规模块。

## 语言

模块跟随 Foundry 世界的核心语言设置，不根据操作系统或模块安装路径猜测语言：

- Foundry 核心语言为 `zh-CN`，或使用 Foundry 中文翻译包的 `cn` 时加载 `lang/zh-CN.json`，伤势、消逝的灵魂、复活模式、设置向导和 GM 裁定界面显示中文。
- Foundry 核心语言为 `en` 时加载 `lang/en.json`。
- 修改 Foundry 核心语言后请重新加载世界；当前已经打开的 Dialog 不会被动态重绘。
- 模块的 manifest 标题使用中英双语，避免在管理模块页面中出现不可识别的纯英文标题。

## 使用

模块首次启用时，活动 GM 会看到设置提示；所有自动修改默认关闭。启用后：

- character Actor 从正 HP 第一次进入 0 HP 时开启倒地 episode；同一 episode 首次恢复正 HP 叠一层伤势。
- 伤势层数固定为 `0–3`；任何自动、手动、API 或玩家请求入口都不能写入第 4 层，旧的 4+ 层数据会由活动 GM 归一并写回 3 层。
- 伤势层数由 Actor flag 保存；角色上的“伤势（X/3）”效果只是显示投影。Token 左上显示带层数的图标，Token 状态列表也会显示并框选“伤势”。
- Token 状态列表中的“伤势”采用与力竭相同的分层操作：左键增加一层、右键减少一层；到达 3 层后继续左键仍保持 3 层。
- 0–2 层再次倒地会写入对应死亡失败；3 层时先让 GM 选择，选择前不会预写死亡。
- 死亡豁免最终保留的裸 d20 为 19 或 20 时按大成功处理。
- 真实治疗增加到满血、成功短休或成功长休会清除伤势。

GM 可以在 Actor 目录右键选择 `Injury & Fading Spirits`，或选择一个 Token 后在聊天输入 `/ifs`，打开伤势/复活面板。

## 复活仪式

普通/最终仪式可以填写最多三名不同参与者的 Actor UUID、技能、可选属性覆盖、DC 10–20 与优势状态。模块创建 dnd5e 原生 `request` ChatMessage，玩家投骰结果由原生 `flags.dnd5e.requestResult` 关联；最后仍由 GM 确认每项贡献。

最终检定和快速复活检定使用原生 `blindroll`。Actor flags 与 GM 摘要只记录 DC、贡献计数、模式、结果、时间和 GM，不保存最终骰原始值。

快速复活失败会增加永久 DC 惩罚并锁定本次死亡的快速复活；普通失败会锁定常规复活。常规锁存在时，“奇迹”入口只允许开启一次最终仪式。

复活成功只记录回归历史并设置“下一次 0→正 HP 不叠伤势”；实际 HP 恢复仍由对应法术/Activity 处理。

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

外部复活 Activity 或宏若会直接恢复 HP，应由活动 GM 通过 `withInjurySuppressed` 包裹恢复事务。模块不会从物品名称猜测复活能力。

## 安全与限制

- 长期状态仅由 Foundry 的确定性活动 GM 写入；无活动 GM 时不会偷偷改 Actor。
- 模块只在精确目标版本启用自动化；版本不符会失败关闭。
- ChatMessage 不是历史事实来源，聊天被清理不会丢失伤势或复活历史。
- 本地 Lab 验收不代表生产部署或真实跑团长期验收。
