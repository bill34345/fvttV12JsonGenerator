# DND5E不全包的dnd5e6适配可行性

日期：2026-10-02（Asia/Shanghai）。用户问现有dnd5e_classpack是否已支持dnd5e6，或能否优化为支持；本轮只读评估，不解除原安装／启用排除，不改包／合集／世界／服务，不声称完整功能接受。

## 分层结论

可以做面向现有Next目标的版本适配和内容迁移，但没有证据把当前包标为现成dnd5e6支持。与通用墙工具不同，它包含职业／子职／种族／法术／Actor／Macro和自动化数据，依赖dnd5e文档、授予和Activity结构。

| 对象 | 本轮确认 | dnd5e6／Next结论 |
|---|---|---|
| 线上当前4.3.4-v14.1 | 上一轮真实模块管理器启用；线上Core14.364／dnd5e5.3.3 | 仅证明该旧组合启用，本轮未读取线上源包或验证6.x |
| 本机Mirror4.3.4-v14.2 | manifest Core minimum／verified／maximum均14.364；dnd5e均5.3.3；迁移代码另硬锁DAE14.0.12 | Next14.368／6.0.5／DAE14.0.14+servernext.1超出清单和迁移代码门；不是当前6支持版本 |
| 上游最新稳定v4.4.0 | 官方REST发布元数据2026-08-15，固定tag源码manifest Core minimum／verified／maximum均13 | dnd5e关系未列版本边界不等于已验证6；6.0.5系统minimumCore14.367，当前v4.4.0不是可直接安装的Next适配版 |

本机flags.classpackV14.dataMigrationComplete=true明确标记的targetFoundry14.364／targetDnd5e5.3.3／targetDae14.0.12不能推广为6.x已迁移。ready Hook仅暴露inventory／migrate API，migrate开头实际assert精确版本；不能因API ready日志或合集可见就判定内容和玩法通过。

## 可维护结构与实际适配范围

当前本机包有21声明合集：Actor3、Item13、JournalEntry3、RollTable1、Macro1；仅包清单和辅助脚本已读取，没有扫描全部文档或实际宏命令。因此“主要是数据包”有结构依据，但不能承诺所有数据只需自动迁移或估算固定工时。

现有6.0.5精确源码module/migration.mjs仍导出migrateCompendium，覆盖Actor／Item／Scene，不直接覆盖JournalEntry／RollTable／Macro。本包16个Actor／Item合集有官方迁移接口可借鉴；另5个类型需单独检查链接、表结果和宏。现有14.0.14 DAE仍导出migrateActor／migrateItem，但返回／语义及当前自有修补需要独立核对，旧版本锁和旧PASS不自动继承。

最小后续步骤：先确定现有v14.2或上游4.4的内容基线；以Next当前精确Core／系统／DAE／Midi身份准备候选；保持模块ID、已有pack名／文档ID／内部UUID；检查Actor／Item／Activity／Effects、职业／子职／种族Advancement及已有来源；审Macro与Midi／DAE自动化；少量真实导入／车卡升级／代表性活动和重载／归属清理。仅改manifest maximum无法证明这些行为。

## 上游4.4.0不是普通覆盖升级

[发布说明](https://github.com/HJSmile/classpack/releases/tag/v4.4.0)将源码整理为JSON可维护文件，并以Foundry13及新版Midi数据为适配目标；本地旧改版和上游新内容不是同一个成果。

固定tag的[manifest](https://raw.githubusercontent.com/HJSmile/classpack/v4.4.0/dnd5e_classpack/module.json)将法术pack从new-icon改为spell，加载[migrate-new-icon-to-spell.mjs](https://raw.githubusercontent.com/HJSmile/classpack/v4.4.0/dnd5e_classpack/scripts/migrate-new-icon-to-spell.mjs)。该脚本ready时在GM客户端遍历Actors、Items、Journals、Macros、RollTables、Scenes、Playlists、Folders并正常API更新包含旧UUID的文档，最后写world设置迁移标记。它会引起世界写入，不能把升级包当成本次只读查看或无害兼容声明调整；本轮未执行。

建议先以现有v14.2及已用UUID为兼容基线评估6目标，单独比较4.4的源数据修复；若选4.4需明确包名／UUID迁移边界，并受控改造自动世界写入入口，不直接套原启动Hook。新实现不创建备份／额外Foundry实例，不改Mirror／生产；运行测试和安装需新的准确目标授权。

## 来源、收据与未执行层级

本机当前清单SHA1f81f75a3fa89b9d1d0dd63e71e65fc4f7157b7ebe82a545d047ba52777c6f64，迁移脚本SHA16d7f00cc2f93764466ebc7a2c76f25d3b1d3ee9181e0a0af4c90309df19a8f1。此前旧本机路径和历史规划只用于理解身份／验收分层，当前事实均重新读取F盘实际包。

AnySearch从官方[仓库](https://github.com/HJSmile/classpack)、[发布REST元数据](https://api.github.com/repos/HJSmile/classpack/releases/latest)、固定tag manifest／迁移脚本成功读取。release asset module.json提取失败（request_id cc7c1f59-3623-4669-8d06-6b3785a3d9f9），未取得发行asset字节；使用同工具成功读固定tag源码。后续直接REST元数据重取被GitHub限流；没有把该失败改写成成功，日期/tag来自此前成功AnySearch原件，固定tag字段另独立解析。私有机器收据在F盘server-next-migration/classpack-dnd6-feasibility-20261002/static-assessment-amended.json，原null字段收据保留。

当前：声明／迁移版本门不兼容PASS（静态判断）；适配可行性有结构与接口依据；全量数据、宏语义、导入、车卡／升级、活动／效果、客户端6运行均NOT_EXECUTED／Untested。没有安装、启用、优化实现、LevelDB读取迁移、浏览器E2E、世界／模块／服务写入、备份或发布。

待判断适配项：dnd5e_classpack面向现有Next6.0.5的候选，尚待用户明确基线／功能接受范围及安装测试授权。此结论登记为待适配，不修改健康状态为可用；后续最小反证优先检测实际内容严格schema、保持UUID和代表性车卡授予链，再进入必要自动化切片。

后续用户明确“DND5E不全包要处理”，此包原关闭基线的排除已由新阶段决定取代；上述只读评估保留为历史。新工作以4.3.4原包＋既有V14修补为兼容基线，保留规则/名称/ID/UUID，不混入4.4改名与内容升级。当前进度和真实接受仍只见[唯一总表第5.15节](../plan/server-next-migration-handoff-20260927.md#515-原迁移收尾之后的新适配范围与执行顺序)，不能将该授权或候选取得写成6运行通过。
