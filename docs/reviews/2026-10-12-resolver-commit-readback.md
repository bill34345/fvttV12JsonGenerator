# 法术解析器 R1/R2：提交结果核对与精确恢复

## 结论与边界

R1现有便携契约、生成器与候选解析边界可复用，无需为重构搬目录。R2确有最终保存未确认却报告成功的缺口，已在本地复现并修复；独立审阅发现的递归合并恢复残留也已修正。当前完整模块349项/1656断言通过。修改仍是未安装候选；6.0.6实际水合、正常/异常恢复、权限与原生施法未因这些检查获得接受。

Forge仍使用5.3.3网页。用户明确要求继续避开，当前不重登共享Chrome、不操作Mirror，不以另一个服务/浏览器通道绕过占用。

## R1的实际归属

- `packages/generation/src/actor-spell-manifest.ts`负责来源feature键与便携manifest的精确关联，只输出pending及manifest hash，不写目的世界UUID；旧generator路径是兼容出口。
- `packages/spell-manifest-contracts`负责schema、未知字段拒绝、源证据/来源hash和目标世界标识符禁入。结构检查不冒充源文本核对。
- `src/core/spell-resolution`的validator/schema等契约出口已转发到公共包；resolver/planner/normalize仍承载实际纯解析实现。本轮不在这些旧路径增加实现，也不因目录名强行搬迁。
- 模块source-index只索引当前启用且可读的Item包中的真实Spell行；候选依据精确identifier、英文名或显式alias，显示名不作猜测。歧义、规则缺失、旧映射身份/hash矛盾进入人工检查。
- 写入前绑定Actor当前manifest、完整唯一group/ref集合、生成feature及本模块owned Spell/Activity；持久ID与目标运行时门未变。目录/手册ID是`monster-spell-resolver`，runtime ID是`fvtt-json-generator-spell-resolver`。

既有契约与真实生成器fixture21项/45断言、候选/索引/所有权54项/176断言通过。这些是源码边界检查，没有生成新的正式交付Actor，也不替代来源→workflow→verifier或Foundry水合/施法。

## 失败机制与精确来源

旧事务在最终`Actor.update(spellResolution)`返回后直接返回committed。Core14.368的`Document.update`明确可返回undefined；client-backend会过滤preUpdate拒绝项，全部过滤时返回空数组而不抛错。因此单凭Promise完成不足以证明最终记录保存。

本机精确源码指纹：

| 文件 | SHA-256 |
| --- | --- |
| common/abstract/document.mjs | 303e6bc84fbaa7d564dab144b1f59fd0a1f6584a14e872b293e74358ed9b49dc |
| client/data/client-backend.mjs | 8ffe114bca601980bf2f4582ce1f6e27c555d76586470f1a16ac23f6f021b9c5 |
| common/data/operators.mjs | 0ee26ded57750615b6cb4033c8aa90c444224b41df940caba508dd036d5f3121 |

来源为本机Core14.368安装源码，只读检查；14.364也提供相同的公开ForcedReplacement入口。没有修改Core或系统。

旧代码在“最终写被静默拒绝”和“提交参数被改写而缺report”两个反例均错误返回committed。增加读回后，独立审阅指出已落地的部分flags进入补偿时，普通对象更新会递归合并，留下此次新增字段。原fixture直接整体替换namespace，掩盖了这个问题；改为递归语义后，缺report和提交期间owned内容漂移两例确实显示恢复残留。

## 当前实现

最终更新参数独立克隆，避免调用方改写参数污染期望值。正常更新返回后，从公开`toObject()`的源flags逐个核对本次拥有的提交字段，再核owned Spell/Activity和结构hash；不把更新返回值本身当作通过。记录根上的无关扩展键不作为删除目标。

第一次文档写入前验证并预构造公开ForcedReplacement，只替换本模块flags子树。旧普通值先克隆，构造后的operator Proxy直接交给正常Actor.update；不克隆Proxy或覆盖整个flags根。缺少API或构造失败时零文档写入。离线测试通过与既有lifecycleHooks同类的host port注入字段操作，避免伪造整个Foundry运行环境。

提交核对失败沿既有补偿流程恢复；残留差异或恢复API错误仍保留失败状态，不能宣告完整恢复。这里证明的是当前客户端收到更新后的源文档读回，持久化重载、真实Hooks与其他客户端仍需实机接受。

## 检查与复用

- 递归合并fixture下事务37项/232断言与模块类型通过，覆盖缺恢复接口零写、提交静默拒绝、report缺失、提交期间内容漂移、正常第二次提交、Keep/Overwrite、重复调用与失败残留。
- 独立只读审阅的P2已关闭，无新增阻断发现；审阅没有替代实机证据。
- 因提交与Undo/Hook服务/生命周期相连，在本模块整合边界执行一次现有完整Resolver入口：349项/1656断言通过。不是全仓CI或生产验收。
- 构建只清理已核本任务的输出目录/ZIP；移除force选项，仅忽略不存在路径，其他清理错误保留。既有构建/路径边界检查随完整模块组通过。

## R3独立帮助源码

GM设置窗口新增显式type=button的“使用帮助”，调用active Suite/ABI1时使用手册entryId `monster-spell-resolver`，不误传真实runtime ID。合集缺失、关闭、不兼容或打开失败时，显示owner docs/manual.json的同源只读窗口；中央目录仅保留source指针。入口、异步回退及窗口重开继续核GM，点击帮助不触发设置保存、索引或水合。

帮助与原模块接线/双语/版本/构建合同46项407断言及类型检查通过；包括真实settings模板按钮在DOM中点击时宿主submit=0、设置写入=0，以及玩家/中途权限变化、错误Suite零调用、重复/最小化/关闭后重开。构建实际生成两次相同ZIP。R2完整349项与R1边界证据继续复用，不重复无关玩法。

本地帮助源码已完成；实际窗口、施法和模块停用后的缓存可用性另行验收。没有新增外部候选或待本地化条目；未来Core、事务或字段操作变化时，先重核上述公共接口，再复验相应反例与真实读回。
