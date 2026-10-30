# Forge 原生豁免按钮的棋子控制前置

日期：2026-10-16。范围：现有 Mirror，Foundry 14.368 / dnd5e 5.3.3 / Midi-QOL 14.0.11。这是一次真实验收失败的接口核查，不是整项修复通过记录。

## 已验证的接口事实

- 官方 dnd5e 5.3.3 固定源码 `965ad2d0cf5d063dac675ba078b5bd3c3c0dd449` 的 [SaveActivity 聊天按钮](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/module/documents/activity/save.mjs#L110) 调用 `getSceneTargets()`。无结果且当前用户无指定角色时，才报告 `DND5E.ActionWarningNoToken`。
- 同提交的 [getSceneTargets](https://github.com/foundryvtt/dnd5e/blob/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/module/utils.mjs#L659) 读取 `canvas.tokens.controlled`，并可回退到指定 Actor 或用户指定角色的场上棋子。它不读取 `game.user.targets`。
- 当前安装的 Midi-QOL `midi-qol.js` 第 37012 行附近使用同样的入口；本地辅助函数直接委托给 `dnd5e.utils.getSceneTargets()`。版本 14.0.11，脚本 SHA-256 `ca530b51fc4883067c5571f1d985931087c09bb21887f9a24c3ab95d48f3a966`。
- 中文错误出自 `5e_chn/cn.json` 的同一键，英文是 one or more controlled Tokens，要求至少一个受控棋子，不要求同时控制两只。

## 当前实测与未决

Steam Breath 已通过普通使用操作消耗一次。实际 Item 有 DEX DC10、1d8 火焰、成功减半、15 尺锥形、消耗一次与充能 6。现有聊天卡 `QlQBdV16vbqR19Wm` 未产生豁免 Roll，不能把显示 DC 视为豁免可用。

测试工具原先只记录了尝试控制攻击者、给中性目标加 target 标记；没有读取控制动作返回值或当前 controlled 列表。该记录不能证明豁免按钮的前置成立。普通模板放置操作是否仍占用画布工具、以及目标棋子是否真正受控，也尚未证明。

下一次只做有判别力的 UI 检查：退出未完成的模板操作，切回棋子选择工具，实际选中中性受影响目标并确认名称、HP 和选中状态，再操作现有聊天卡。按钮会替受控 Actor 掷骰，所以不能只控制攻击者。不得再次使用能力、重复消耗、改骰或编辑 HP 模拟结果。范围模板要记录实际放置，点击放置按钮本身不算完成。

## 证据与保留边界

- `.local/forge-native-basics-20261016/browser-native-gameplay-v2/steam-gameplay-blocker-r8.json`：第一次失败、实际聊天卡、来源与目标身份。
- 同目录 `steam-gameplay-results-r8.json`：自然充能 2 未恢复；每日能力取消、消耗、短休不恢复、跨日长休恢复；充能原始 Roll、休息消息与资源 delta；世界时间未推进。
- 同目录 `parent-breath-pending-save.json`：父任务通过 Mirror 独立读回目标 HP96、吐息已消耗一次及原生字段。

已经成功的攻击、伤害与资源行为继续保留。报告裁剪或控制前置失败不要求重跑已通过的动作。目前不能把豁免失败归因于来源字段丢失，也不能宣布运行时验收完成。本地化待判断项：应先判断是否需要在操作说明解释“选中受影响棋子”，不修改或绕过第三方按钮、权限和世界配置。

复查步骤：核对实际安装版本及上述调用点；检查目标棋子的真实控制状态；只重验失败的豁免和伤害链；保持已保存的第一次失败。后续版本不得直接继承本次结论。

## 控制前置恢复后的伤害入口核查

`steam-breath-controlled-save-r9.json` 记录：通过正常 UI 切回 Token 选择工具并实际选中中性目标后，原始卡的 DC10 按钮生成了目标自己的敏捷豁免，实际 `1d20 + 0 + 0 = 5`，对 DC10 失败。该豁免不需重复；吐息伤害尚未完成。

官方同版本 `SaveActivity._usageChatButtons` 在第 41—69 行给**原始能力使用卡**加入豁免按钮，并在 `damage.parts.length > 0` 时加入 `data-action="rollDamage"` 的伤害按钮。新生成的纯豁免结果卡不应被用来判断原始能力是否缺少伤害入口。当前 r9 的 `damageButtonsOnSaveChat=0` 只覆盖了结果卡，下一步必须保存原始使用卡 `QlQBdV16vbqR19Wm` 的实际按钮列表和 HTML，再判断入口是否确实被移除。不得通过无关联的手动 d8 掩盖缺口。

另一个待核差异：固定官方 `packs/_source/monsters/elemental/steam-mephit.yml` 中原生 Steam Breath 的 `target.affects.type` 为 `creature`，本次生成结果为空。DC、伤害、成功半伤、锥形尺寸和资源字段相同。这个差异值得做来源绑定检查，但目前没有证明它导致按钮缺失；不据此预先修改运行中的卡或归因。
