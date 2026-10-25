# Trigger Engine：事件与触发定义归属

总计划：[PLAN](../PLAN.md)；共同约定：[MODULE_CONTRACT](../MODULE_CONTRACT.md)；进度：[总账](../EXECUTION_LEDGER.md)。T1/T2与T3退订修复已构建并安装；606正常首次保存、单GM事件、退订、普通重载及精确恢复已限定接受，另已接受CC状态/伤势消费者代表链，WMP真实攻击仍待。

## 目标与当前事实

把事件交付、触发定义持久化、匹配判定和明确的 GM 执行各自收敛到小 Interface，保持 CC/WMP 消费者契约。

- owner：[foundry-modules/fvtt-trigger-engine/](../../../../foundry-modules/fvtt-trigger-engine/)。
- 稳定 runtime ID：`fvtt-trigger-engine`；默认阶段：P3，CC/WMP 之前。
- 当前 0.2.0；无外部模块硬依赖。Next 14.368/6.0.5 只有已记录的事件/活动 GM 限定链接受；manifest 范围不是全部事件组合通过。
- 关键归属：`src/runtime.ts`、`src/api.ts`、`src/storage.ts`、`src/evaluator.ts`。
- 版本与接受须继续对照[支持矩阵](../../../acceptance/current-support-matrix.md)，上述记录不保证未来执行时仍是最新目标。

## 切片

### T1 事件入口契约

列清普通事件与 external-event API 的输入、身份、重入和失败出口；从 runtime 中抽出真正可测试的派发决策，不把消费者规则搬入引擎。

2026-10-12实际入口核对：普通Actor/Combat事件由runtime同步捕获before/after、HP准备值和native修改时间，按文档/Combat队列交付；CC只经公开`subscribe`消费状态/回合事实。WMP经`publishExternal`发布prepared/committed/cancelled的data-only信封并经`subscribeExternal`接收，调用者继续负责GM端重新解析、权限和攻击真实性。外部事件以namespace+eventId去重，发布Promise只等待持久化/去重，订阅者在独立有序队列异步执行，不等待订阅副作用。API1、externalEvents能力1、setting/schema/身份均保持。

本切片将纯信封/ledger判定从1400行runtime分离，运行时继续拥有活动GM、串行队列、持久化/失败回退与Hook。普通触发匹配复用现有evaluator收敛为可测试选择，不移动CC/WMP规则、不改变递归抑制的matched报告语义。先运行现有模块局部测试与类型；新增反例仅覆盖新边界的非法输入零存储/零交付、去重身份及失败回退。当前606升级批使用既有冻结dist/ZIP，T1构建与安装在该批读回后另行绑定，不能用源码改动推广旧候选证据。

### T2 定义存储与界面

触发定义读/验证/保存与管理窗口分开；保留旧 schema 读取和未知数据，刷新/打开不执行宏。

源码核对发现两个具体存储风险，故选择局部反例而非再拆一层窗口：Foundry adapter的load先丢弃无效条目/未知schema，再交runtime重新校验，初始原数据的问题可能被掩盖；之后save可用规范化缓存覆盖原存储。已存schema1的未知扩展字段也会被parser移除。其次CRUD从同一缓存构造整份store后异步保存，两个并发创建可能互相覆盖。T2先保留反例，再让存储写入边界保护不可无损理解的旧值、同客户端定义变更串行且失败不污染缓存；管理窗口显示明确失败并保留编辑内容，不增加自动迁移/清理或绕过入口。有效的既有定义读/执行、schema/API/身份保持；若实际实现需要改变公共契约，由父先评估具体差异。

### T3 消费者接续

在明确 API 版本与能力范围内核对 CC、WMP 的实际订阅/外部事件链；不凭发布版本号放行缺失能力。

已核CC通过公开`subscribe`消费普通Actor/Combat事件，WMP依能力1使用`subscribeExternal/publishExternal`；两者stop均退订。核对发现runtime提前复制listener集合后，前一个异步listener等待期间退订后续listener仍会收到在途事件。普通/external两条反例已先复现，最小修复在每次调用前确认listener仍在集合，59项/335断言与类型通过；已经开始的回调不承诺取消。真实消费者状态/武器链仍待各模块自有fixture接受，不能把TE纯事件工具冒充WMP真实攻击。原T1/T2 ZIP不含此修复，最终安装必须绑定后续新包。

## 必须保护

世界 trigger ID、定义 schema、external-event 身份/ledger、用户编写的 Macro 与当前活动 GM 执行语义。

## 本模块最小真实接受

- 保存→重载→重开定义一致；刷新、禁用和不匹配事件均不执行宏。
- 一个匹配事件只由正确 GM 执行一次；无关 Actor、缺少权限和错误能力不产生副作用。
- CC/WMP 的原公开调用保持兼容；移除订阅后不再接收迟到事件。

## 已有检查入口与下一步

- `bun run test:trigger-engine`
- `bun run build:trigger-engine`

按本轮变化选择上述入口，不默认全部重跑；类型、手册与整合门禁按共同约定补齐。命令存在不表示本轮已执行或功能通过。

当前新构建：59项/335断言及模块类型通过，独立复审已关闭等价operand键序误拒问题；含T3修复的新ZIP SHA256 `5c6aaac265af82a2a968ef7bef9bd12d46afd36b32093d2893776042e825cdb9`，8文件CRC和逐字节身份已核。只更新Next的两README/JS，manifest与另5文件保持；完整安装树及4个HTTP资源已核，新JS SHA `28cd1e4066e8eef7e3f803e7711ad8dd30ed817da67db837d8df6001948fca0b`。原世界由同owner Node正常关闭/启动，父已查看Setup/世界截图；启动不是保存/事件接受。

606 r2已完成单Actor/单Macro/单临时定义的限定接受：`triggers`初始0持久行是Core正常未使用默认值，第一次产品API保存创建唯一1行；管理器显示、禁用/不匹配零动作、匹配恰好一次、在途退订不调用迟到listener、普通客户端重载一致。删除自有定义后只删除本轮创建且再次核为唯一严格空值的Setting，恢复0行/默认空store；自有Actor/Macro均移除，原世界/设置/module flags/User原件哈希一致。原r1在0行前置停止并清理的记录保留。父审阅原件为本任务`.local/suite-direction/next606/parent-trigger-t1-t3-r2-assessment.json`，状态`TE_T1_T2_T3_FIRST_SAVE_AND_SINGLE_GM_EVENT_ACCEPTED`。

CC C1/C2/C3代表链随后已接受真实HP事件经TE订阅交付、伤势/IFS当前episode联动、普通重载与恢复，仍是单GM自有Character范围。下一步接WMP自有消费者链；当前没有external-event真实攻击、第二GM、未来schema实机和跨客户端CAS证据，不能扩大成整个T3关闭。正向保存继续核原始持久行数量和ID，不从其他key重复推断本key；任何数据迁移或功能扩展另写具体范围，未达到本模块真实出口前不进入发行清单。
