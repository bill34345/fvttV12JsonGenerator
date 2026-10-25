# Weapon Mastery：能力预检与攻击结算

总计划：[PLAN](../PLAN.md)；共同约定：[MODULE_CONTRACT](../MODULE_CONTRACT.md)；进度：[总账](../EXECUTION_LEDGER.md)。W1/W2边界300项通过且已安装；Next已按用户新授权恢复。原Combat仅active变化已证，User旧恢复UNKNOWN；同夹具r2在W2前被User写veto，业务未执行，目标字段trace r3待回传。

## 目标与当前事实

把能力预检、攻击/伤害适配、预约/取消/结算和各条规则分开，使一条规则的修改能通过本模块入口验证。

- owner：[foundry-modules/fvtt-weapon-mastery-properties/](../../../../foundry-modules/fvtt-weapon-mastery-properties/)。
- 稳定 runtime ID：`fvtt-weapon-mastery-properties`；默认阶段：P3，TE/CC 契约稳定之后。
- 当前 0.1.0；硬依赖 TE 与 CC。Next 还核对 CC native6Effects 正向能力，Midi 适配当前指向 local.10。Next 现有 native Slow/Fatal、攻击/取消及 Cleave 切片不代表八种精通全通过。
- 关键归属：`src/runtime.ts`、`src/adapters/dependencies.ts`、`src/core/settlement.ts`、`src/adapters/dnd5e-message.ts`。
- 版本与接受须继续对照[支持矩阵](../../../acceptance/current-support-matrix.md)，上述记录不保证未来执行时仍是最新目标。

## 切片

### W1 预检与能力矩阵

收敛精确 Core/system/module/API/capability 检查，给出明确不可用原因；不通过扩大 manifest 上限假装支持新补丁。

本次源码核出具体缺口：模块查找包含inactive安装项，但CC/TE兼容报告与公开getter不检查active，TE启动可因此订阅保留的错误API；可选Midi也把inactive旧版本当作原生路径阻断。先选已安装但inactive/unknown-active保留API、错误TE版本/能力零订阅及inactive可选Midi反例，再只在本owner收敛正向事实。保持所有精确版本、API1、schema与规则；局部安全测试及模块类型覆盖实际变化，CC实机证据不替代WMP真实攻击。

### W2 一次攻击事务

分离预约、掷骰前取消、提交和结果结算；保持 attack/source/target 身份，公共入口不能生成重复攻击或重复效果。

本次先收敛已核故障边界：首个CC start前先用现有started字段持久claim，后续失败保留已有部分执行并要求GM对账；每次await解析后重新验activeGM/完整依赖，不缓存旧API跨等待。准备路径另有“CC reserve已成功而WMP ledger尚未保存”的空隙，正在补首个预约前的可追踪身份和逐ticket保存、未完成准备不能开始/干净取消/重用ID；中间记录不提前发不完整attack.prepared。ledger与TE发布仍是两个非原子操作，不增加跨客户端CAS承诺。

### W3 单条规则接续

按实际变化挑选一个精通/特性，使用现有 harness 与真实攻击链；原生与 Midi 是不同 Adapter，不复制整体规则实现。

## 必须保护

`flags.fvtt-weapon-mastery-properties.weapon`、稳定 rule/source/attack/target 身份、CC 所有的效果 flags 与 Cleave 次目标/伤害 origin 绑定。

## 本模块最小真实接受

- 缺少 API、错误版本、缺少 native6 writer 或不支持的 Midi 在攻击前零写入阻断。
- 取消不留下预约/攻击消息；一次提交只消费一次并结算一次。
- 受影响规则通过真实目标/伤害读回；保留 primary 选择、secondary 身份和外来效果。

## 已有检查入口与下一步

- `bun run test:weapon-contracts`
- `bun run test:weapon-harness`
- `bun run test:weapon-mastery-properties`
- `bun run build:weapon-mastery-properties`

按本轮变化选择上述入口，不默认全部重跑；类型、手册与整合门禁按共同约定补齐。命令存在不表示本轮已执行或功能通过。

当前W1/W2的300项/1506断言、模块类型及独立定向审阅通过。正式新ZIP SHA `8823c810b73948390a5da3f6c60289637a330dbf5c3afd1ca8ea22f3a376b81b`、JS `67e7bee1b822010e647f7f5922f74f6d93fd60b0621a0ee6c4d177a0a2468fe1`、buildId `b10e469053e2144c1cfe71a7497d6760bf7582711dd2141f56dadc497b60f6fa`，8文件/CRC/source读回通过，正常关闭后3文件更新和4HTTP/全树一致。包版本、精确系统门、API1和schema1不变；后续606一条实际Slow命中、duplicate零变化和普通重载已接受，剩余恢复待验，进度以总账为准。

本轮限定出口已闭合：W2/一条真实Slow命中/duplicate零变化/普通重载及R6自有对象/两Macro删除后的全集合读回通过，父独立复算原业务归一化hash相等；原Combat仅normal modifiedTime例外，旧R1 User70b2原像UNKNOWN保留。Calendar未变化，条件还原只单测。其他精通、玩家/Multi-GM和完整发行尚未接受，不把单条代表链推广全模块；实际证据与下一模块见总账。
