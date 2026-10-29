# Custom Conditions：状态、伤势与效果生命周期

总计划：[PLAN](../PLAN.md)；共同约定：[MODULE_CONTRACT](../MODULE_CONTRACT.md)；进度：[总账](../EXECUTION_LEDGER.md)。C1/C2已实现，178项/1493断言及类型通过；31文件新包已安装，606单GM状态/伤势/IFS当前episode代表链、普通重载及精确清理已接受。其他状态组合、武器和复活结算继续保留范围。

## 目标与当前事实

明确通用状态、Injury 和 weaponEffects 的所有权及生命周期，保持它们通过同一模块公开 Interface 协作，不为每个状态新建 mod。

- owner：[foundry-modules/fvtt-custom-conditions/](../../../../foundry-modules/fvtt-custom-conditions/)。
- 稳定 runtime ID：`fvtt-custom-conditions`；默认阶段：P3，TE 之后、WMP 之前。
- 当前 0.2.0；硬依赖 TE 0.2.0 系列。精确支持门为 Core14.364/dnd5e5.3.3、Mirror14.368/5.3.3 与 Next14.368/6.0.5、6.0.6；每个目标仅接受各自已选状态/动作及联动范围。IFS/AC5e 协作是可选公开调用。
- 关键归属：`src/runtime.ts`、`src/api.ts`、`src/injury.ts`、`src/weapon-effects.ts`、`src/runtime-compatibility.ts`。
- 版本与接受须继续对照[支持矩阵](../../../acceptance/current-support-matrix.md)，上述记录不保证未来执行时仍是最新目标。

## 切片

### C1 所有权与 API

将 Injury、通用条件和武器效果的输入/写入/能力声明列清；收敛 runtime 路由到现有 owner，保持公开 API 的版本与正向能力校验。

已核三writer：ConditionRuntime拥有19项实例/turnState，InjuryRuntime拥有injury及显示投影，WeaponEffectRuntime拥有sap/slow/vex及reservation；不按状态拆mod。CC经TE公开subscribe接事件，WMP只调用weaponEffects及条件apply，IFS通过injury公开接口交接且保持复活/历史归属。CC原入口只查subscribe函数，现增加模块active/API1正向门，未知接口零订阅；已有init→ready重试与stop退订保留。

### C2 状态生命周期

按 apply/update/remove、回合/休息、投影与外部效果保护拆一个行为家族；版本差异留在本功能 Adapter。

本次先修实际生命周期缺口：Injury.start原inline socket监听在stop未解除，重启可保留旧回调。现保存原socket/handler，stop只off自身，原socket被替换也从原件解除，foreign监听保留；不更改伤势规则、权限和transaction去重。精确Core14.368使用同一off(event,handler)语义。该出口已有on/off-aware反例与局部测试；已经运行的请求不承诺撤销，真实状态/参数/重载另作Next自有fixture接受。

### C3 伤势与复活接续

CC 继续拥有伤势及死亡豁免相关投影；IFS 只拥有复活/历史。核对可选双向入口，避免写回旧 IFS injury 或重复结算。

## 必须保护

19 种条件 ID，`flags.fvtt-custom-conditions.condition`、`.weaponEffect`、`.injury`，公开 weaponEffects API/capability 和外来效果字段。

## 本模块最小真实接受

- 一种代表普通状态与一种带参数状态的施加/移除/重载符合原规则；不是重新手工跑完所有组合。
- Injury 的 HP/休息/死亡 episode 在相关目标只由正确 owner 结算；外来效果与旧数据保留。
- WMP native6Effects 能力缺失时阻断；IFS 缺失时状态模块正常工作。

## 已有检查入口与下一步

- `bun run test:custom-conditions`
- `bun run build:custom-conditions`

按本轮变化选择上述入口，不默认全部重跑；类型、手册与整合门禁按共同约定补齐。命令存在不表示本轮已执行或功能通过。

TE首次正常保存实机链现已限定接受。CC新ZIP SHA256 `0863495603bc28d2acc8358f67664ae0ac8089a133146e9c88d2c3405d4e7052`、JS SHA256 `4b83069693c8b1e3501316a1f84ebe84fbed52beacbeb118ac4689d6e642f588`，31文件CRC/逐字节清单已核。更新仅写README两份和JS；新READY绑定独立的TE cleanup/finished原件及父审阅、精确PID/创建时间/目标和原始preview。42项CC/25项共享READY纯检查通过，独立只读审阅无must-fix；正常关闭后唯一apply完成，31文件树与4HTTP资源读回一致，不能据此称玩法PASS。

单GM代表链已完成：Addled/Frozen的施加/启停/移除、外来sentinel保护、实际Manager、普通reload同ID/参数；原生HP20→0→1计一层及原生shortRest清层，IFS仅经公开接口同步当前死亡episode而历史/旧injury不变。原世界/Settings/module/User读回同，自有Actor/Macro全清。父核21份证据引用并看三张viewport图，原件`parent-cc-c1-c3-r1-assessment.json` SHA `c015f2fabe1fa6c969b44dc49bc3fd10c41f5582bcc7a5ac11e5a71703b791d8`，实际安装JS仍上述4b830...；README/中央手册随后补结论不覆盖原构建快照。socket stop/restart由局部测试覆盖，全部状态、多GM、真实武器/复活不作已验承诺。

下一步：WMP自有攻击/武器效果消费者链，随后IFS独立复活切片。需要改变CC规则/公共契约或迁移时另列具体范围；不因报告更新重放有效代表链。
