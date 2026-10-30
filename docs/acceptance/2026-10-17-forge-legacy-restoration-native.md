# 死亡天使：旧功能恢复的最终本地验收

本轮用户指出的三项回退已完成修复和本地功能验收：同 Item 独立 Save 及失败死亡效果、真实法术匹配与 Cast、双语名称不自动加括号。保留此前错误结论的撤回记录、原始模型回复、IR、正式输出和所有失败角色卡。此结论限定本轮恢复范围与下面的样例和版本，不将历史其他怪物的未通过问题改为通过。

## 来源、正式链路与目标

- 原来源为用户本地 2026-08-06 CHM 内的死亡天使。提交的原文 LF SHA-256：`7bfe18d39dc5ae17057fa3e4465cd65205d6127d5da4b21e5108deff02f7f224`。
- 正常 DeepSeek 流程实际 1 次 HTTP、0 次 repair；已保存原回复、IR、Markdown、source package 和 Actor。正式 verifier 与父控逐项来源复核通过。后续改的是导入／原生法术适配层，复用这份真实结果，没有新增模型请求或手改最终 Actor JSON。
- 最终时长候选只换外层包身份；正式 Actor 与已验收的基础操作候选一致，证明见 `native-duration-r1/build-receipt.json` 的 `formalActorIdentical=true`。
- 唯一复用工作树：`20261006-111625-bettermonsters-eye-deep-sample`，分支 `codex/20261006-111625-bettermonsters-eye-deep-sample`。没有 commit、merge 或 push。
- 本地目标：`server-mirror/cor-cotn`，`127.0.0.1:30001`，Core 14.368 / dnd5e 5.3.3，Gamemaster。2026-10-17 重启恢复后的进程 PID 61824，运行者 Administrator，dataPath 为 F 盘原镜像。启动工具第一次回落到默认 14.364，在登录前发现；停止该次自建进程并显式启动 14.368，没有在错误版本上做验收。

## 实际操作结果

| 能力 | 实际证据与结论 |
| --- | --- |
| 同 Item 攻击与 Save | 魂镰保留近战、远程、独立 CON18 Save；最终纯业务模块重载后原生活动选择器仍能看到三项。Save 不由攻击自动触发；GM 判断本次攻击降到 0 HP 的前提后单独使用。 |
| 普通攻击与伤害 | 实际近／远程攻击可以投掷。原始消息 `dhQ4HFM5WxPx4QhU` 包含普通 `2d8+6` 挥砍与一份 `3d8` 光耀，二选一伤害类型没有变成两份额外伤害。没有测试或接管 Foundry 的命中、减血算法。 |
| 目标豁免与失败死亡 | 原始消息 `x3CjIMORad2SD1R2` 的 speaker 是独立靶 Actor `2tTWRDv9h2VHLzx6`。普通掷骰后通过原生效果入口施加了生成的 `dead`，效果 `nfRwWuMH52k5Jgi2` 的 origin 指向生成的魂镰效果。没有直接写入死亡结果或强制骰值。 |
| 六项真实法术 | 施法组五项加附赠迷踪步均匹配真实 Compendium Spell，拥有独立原生 cache 和 Cast。已实际施放死亡法阵、位面转移、易容术；并核对迷踪步附赠动作与免成分。 |
| 每日次数 | 实际在基础操作卡 `cae9e900a0e26de8` 使用死亡法阵、位面转移后，两项各 spent=1/max=1，律令死亡仍 spent=0/max=1；三者独立，恢复 period=day。位面转移实际消息 `f5snERt9xr9S06Ie`。没有直接修改计数器。 |
| 效应范围 | 死亡法阵实际创建 Region `crIDZB6vVITB0lYY`，原生维度 size=60，球形来源；保留几何与来源 UUID 读回。 |
| 24 小时变体 | 旧卡实际效果 1 小时的失败原件保留。新卡 `cbd29d4ce116bdc4` 正常选择易容术的原生 Midi Utility，点击聊天卡“应用动态效果”；消息 `42Y7uiWINV09TNP1`，实际效果 `JAhYeNO3DbSinh38` 为 86400 秒，origin 指向本卡真实 cache 的 `SrIb7dbaZs5F4zi9`。 |
| 持久性 | 正常重载后，Actor 上实际乔装效果、cache 的 86400 秒、6/6 水合与 verified 导入状态均保留。移除验收入口再重载后，在原生效果编辑器只读查看，仍为 86400 秒；未点“提交变更”。本轮没有等待 24 小时检验自然到期。 |
| 名称 | 最终卡面为 `死亡天使 Angel of Death`，无自动附加括号。来源名本来带括号的保留，由已有聚焦回归覆盖。 |

## 防回退与保护边界

源规则仍决定生成内容；灵魂囚禁、复活例外、0 HP 触发前提和其他复杂选择完整保留给 GM。能够生成的普通操作独立存在，不能再以“GM 手动”为由抹掉 Save 或把施法替换成假的次数 Utility。

持续时间适配只覆盖已经复核的精确法术来源／identifier／effect ID 组合，还必须满足原生 Activity 明确引用等约束。未知来源或独立期限效果保留原时限并提示 GM，不能根据“秒数相同”猜测继承。仅通过公开嵌入 ActiveEffect 更新定点修改 owned cache 的 duration.value；不改 Compendium、系统原型或整组效果数组。

最新局部检查为 390 pass / 0 fail，覆盖原生缓存投影、归属、事务、并发保留、未复核期限反例；typecheck、串行 build、architecture 与手册 33 项检查通过。来源／parser／generation 的既有局部防过拟合与基础回归结果继续有效；本次重启和证据保存没有改变业务源码，没有重复整仓测试。检查日志都在下述证据根。测试绿色与实际操作分别记录。

重载读回证明受保护的 302 张既有 Actor 与 94 个 Macro 指纹无变化，worldTime 保持 21085811，全局 activeScene 保持 `EBJYd289N5uyTmlC`。其中包含旧失败卡、基础操作卡和独立靶，均保留。新卡自己的乔装效果变化符合本次操作；session baseline 的 `oldActorsChanged=[cbd29d4ce116bdc4]` 只表示新卡施法发生了预期变化，不是把它算进受保护的 302 张卡。

## 最终安装与证据

只移除本轮拥有的 `fvtt-json-forge/scripts/forge-legacy-tool.js`、`forge-legacy-input.json`，恢复纯业务 index。删除前核对绝对路径、所有权与 SHA；未删除世界对象、旧卡、宏或失败材料，也没有创建备份。Forge 最终精确 16 文件，Resolver 9 文件；没有停止或重启常驻服务来收尾。

- Forge index SHA-256：`1f39bdfc7e30ef8bc192314437b53bfc13db94f05c38b4bc1f26855171cdbcc7`。
- Resolver index SHA-256：`a3066d327417052290a52fba865f7f94c3feef5633a2663b9930185d41cb1357`。
- 磁盘与本地 HTTP 实际提供的文件一致。纯业务重载后验收按钮为 0，原生武器选择器、真实施法选择器与实际效果字段仍在。

证据根：`.local/forge-legacy-restoration-20261016/`。

- `native/browser/parent-operations-original.json`：此前父控亲自完成的目标 Save、来源死亡效果、普通伤害、独立每日使用和实际范围。
- `native/browser/native-duration-applied.json`、`native-duration-post-reload.json`：本次实际施法和重载读回的必要字段原样摘录；各有官方工具输出定位与 SHA 收据，不冒充完整 Actor 原件导出。
- `native/browser/native-pure-business-ui.json`：移除验收入口后的原生界面字段，86400 秒，未提交修改。
- `native-duration-pure-business-restoration.json`：精确文件移除、前后清单、PID、HTTP SHA 及权限边界。
- `native/browser/pure-business-images-receipt.json`：三张原生截图的原始字节、工具调用和 SHA，未编辑图片。

![同武器的近战、远程与独立 Save](../../.local/forge-legacy-restoration-20261016/native/browser/pure-business-independent-save.jpg)

![真实法术入口](../../.local/forge-legacy-restoration-20261016/native/browser/pure-business-real-casts.jpg)

![实际效果重载后仍为 86400 秒](../../.local/forge-legacy-restoration-20261016/native/browser/pure-business-applied-24h.jpg)
