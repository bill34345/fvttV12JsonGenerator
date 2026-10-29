# DND5E不全包 ServerNext 6.0.5 候选

2026-10-12新增6.0.6加载清单投影候选：`projectClasspack606LoadManifest()`只接受已核v4.3.4-next.1/Core14.368、21 packs、原upstream/迁移/来源投影身份的6.0.5 manifest，复制后仅提高系统maximum。实际准备还绑定Next原manifest/runtime/baseline SHA；不重建或覆盖已有packs、脚本，不修改迁移修订或verified。既有`preflight/migrate/confirmRecovery`仍在6.0.6数据访问前拒绝，readonly inventory保持原语义。这只准备普通加载前置，6.0.6实际加载/代表内容仍未接受，不能触发旧迁移来“修复兼容”。纯函数反证入口为包内`test:classpack-load-compatibility`；实际状态见[606预检](../../../docs/reviews/2026-10-12-next-606-preflight.md)。

本候选使用官方v4.3.4固定输入，目标Core14.368、dnd5e6.0.5和当前Next的DAE14.0.14+servernext.1／Midi-QOL local.10。输入压缩包SHA-256为`8dceac980d5521c3119141ee166589a0f5ab78c13d9987f61c33f96c72fe22c1`，来源为[固定官方发布](https://api.github.com/repos/HJSmile/classpack/releases/tags/v4.3.4)。保留模块ID、21合集名（包括new-icon）、5655顶层文档和所有既有身份。upstream与dist被Git忽略。

本轮按用户选择完成6.0.5兼容和来源明确的坏链修复。已有V14纯函数修12个独立Macro，按全文原SHA修13个Item的15个嵌入命令。确定内容修复包含传送头盔Cast活动指向现存Teleport，以及神莓、附盖提灯、灯油、工具锤、高档服装、祭袍六组原来源别名的17处引用；MPMM歌利亚的两处链接复用同规则的现存石之坚韧（d12+CON、熟练加值次数、长休恢复）。另将此MPMM特征与原文不符的固定1次上限修为@prof；除该明确次数修复外，其余数值、规则版本、ID和历史溯源保持。Dust Devil缺失召唤Actor、Open Hand／Sun Soul缺失辅助法术和不确定特殊物件单列后续，不创建替代内容。

从仓库根使用`bun run --cwd foundry-modules/server-next-external-candidates build:classpack`，仅接受固定压缩包和不存在的候选目录及新报告，拒绝覆盖现有构建。新构建的报告写在忽略的`dist/candidate-report.json`，与`dist/dnd5e_classpack`同级；仓库内`candidate-report.json`是已接受候选的历史证据，构建不会改写。检查程序优先读取新报告，若新报告不存在则读取历史报告，并核对候选manifest、运行脚本和来源基线的SHA。原包逐行读取、变更读回、源正文／身份／引用与图片审计在相应报告及reference-source-index.json、reference-contexts.json。构建合成浏览器入口和来源保护辅助为一个完整SHA绑定的模块，不单独注入代码。

运行入口在ready注册`game.modules.get('dnd5e_classpack').api`的inventory、preflight、migrate及限定confirmRecovery；不自动写合集。preflight对全部文档严格验证，逐条比较原名、正文、规则版本、进阶ID和有效授予／施法UUID，同时预投影所有16个Actor／Item合集的5530顶层文档。Core表结果字段迁移、HTML空元素序列化、模型新增空默认值和已记录18条孤立物理效果仅按精确原源及代码投影比较；原孤立效果继续不挂载。启用的Tasha初始化投影按精确版本、设置、vendor脚本SHA和每条原始记录比较，不泛放新ID。

migrate只在已授权的精确Next环境显式调用，使用dnd5e官方getMigrationData／migrateActorData／migrateItemData生成更新，写前保留每个明确原规则版本，正常完整文档API写入，逐文档强制后端回读进阶／效果身份、正文及授予／施法UUID，恢复合集锁。迁移前发现1987个旧stats的2024内嵌物品会被官方旧版本分支改成2014，因此该保护必需。重复效果只按精确核准ID正常deleteEmbeddedDocuments并回读。未审查新效果ID在任何包写入前拒绝。本包游侠在精确Tasha4.0.0条件下通过公开source hook，在其读取期间提供等价数组，之后恢复原生ID对象并核对39个进阶ID；不再依赖保存数组绕过Core清洗。Tasha代码和设置保持。DAE独立候选在调度及执行状态重整时跳过合集Actor，保护模板原效果，世界Actor的状态处理保持原行为。

目标收据绑定Core／系统／依赖／源基线及运行代码SHA，按包保存完成进度；完成前再全量复核来源。任何FAILED或既有未匹配收据禁止重放。跨客户端依赖单执行器合同，不声称原子互斥。单次执行和正常客户端重载通过已有V1文件工具及正常Macro界面，实际运行、代表性车卡／活动／宏行为和批末精确清理分别接受。

从仓库根使用聚焦验证入口`bun run test:classpack-next`；它委托同一包内`test:classpack`，不启动Foundry或浏览器。当前42项通过，另有4项DAE合集守卫检查；覆盖真实Core mergeObject与ForcedReplacement／ForcedDeletion、候选及后端丢进阶／效果拒绝、规则保护、源文／grant目标改变拒绝、公开source hook与独立恢复收据。这是文件及方法证据。实机已经完成单次迁移及随后唯一原效果恢复，全量来源、普通重载、公开hook平衡及95启用集合通过；原FAILED不改写，另有COMPLETE恢复收据。最新实际结果和未完成门只见[唯一迁移总表](../../../docs/plan/server-next-migration-handoff-20260927.md#515-原迁移收尾之后的新适配范围与执行顺序)，历史失败原件保留。歌利亚正常三特征授予、游侠一级PHB宿敌及自然探索者、头盔真实施法配置入口与取消均通过，正常客户端重载保持；本批角色、两条测试消息、临时Macro和owned页已精确清理，原世界与聊天ID保持；手册条目已人工核对并通过生成一致性检查。27个宏不因语法通过而全部算可用，完整Teleport和伤害反应链未执行。MPMM石之坚韧按原文将最大次数从固定1修为@prof，保留d12+CON、长休恢复、现有消耗和所有其他字段；原始与迁移后状态分别保护。离线精确单字段差异及负前像检查通过；实际正常API修复、长休回满2次、正常使用消耗1次及真实1d12+2骰子、客户端重载均通过。原partial检查把系统派生来源显示字段清洗误判为丢数据，已凭精确源码与全字段差异核清并保留原失败原件。源码在迁移分支保留本地提交，尚未合并／推送，Mirror、生产、其他服务和暂停／付费功能边界保持。

文档边界：手册已生成且机械一致性检查通过，但正式Chrome拒绝本地file://协议，因此页面目视检查未执行。拒绝与空白页清理回执已保存；这不改变本包实际Foundry限定接受，也不把文件检查当视觉验收。
