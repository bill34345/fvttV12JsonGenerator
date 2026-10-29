# Next 6.0.6 药水事务的原生模型规范化

本轮目标仅为现有Next14.368/dnd5e6.0.6的药水Apply/手改保护/Restore接受。授权、保留现场与当前状态归[执行总账](../plans/2026-10-11-fvtt-suite-refactor/EXECUTION_LEDGER.md)；本记录不替代实际运行接受。

## 已复现的原因与影响

首次真实Apply生成了三个Heal Activity，却停在schema1快照，后续公开Restore会按保护规则拒绝。原调用返回未捕获，保留UNKNOWN，不追认成功。只读诊断确认每条Activity含21处正常原生/已启用Midi模型差异，例如空模板单位规范化为ft、description.value、healing.modifiers/scaling，以及Midi默认字段。

原matcher直接比较精简计划与完整实际数据，仅特判空scaling，故正常规范化也会被拒绝。05原件的真实行、单独units空→ft反例以及精简计划控制明确区分该产品缺口；map标签与行内稳定_id不同不是本次Apply失败原因。保留Actor和旧schema1 Item，不清flag或手动改schema2。

## 接口事实与采用方式

精确6.0.6源码提交 `87e94dbd9f930135e0694cd7e7d49f210603cd2c`、5.3.3提交 `965ad2d0cf5d063dac675ba078b5bd3c3c0dd449` 的 `Item5e.createActivity` 都先从 `CONFIG.DND5E.activityTypes[type].documentClass` 构造Activity，再另行执行更新。PseudoDocument接受真实Item作为parent；Core14.368的构造和toObject(true)只清洗/验证/初始化/序列化该模型，不写数据库或socket。

本次仅对expected使用该已注册类及真实Item parent、strict:true做纯构造。Midi会替换注册类并增加schema默认字段，所以不硬编码系统原始Heal类。没有调用createActivity、_preCreate或可能追踪引用的prepareData。Context7仅返回未锁Wiki导航，实际结论回到上述精确本机源码。

不对actual重新清洗、不删默认字段白名单，继续完整比较原活动、实际写后数据、稳定_id/type、schema2完整快照与Restore原像。正常模型不可用/异常发生在首个snapshot写入前，零写拒绝。非中性的治疗值、名称或Midi条件手改继续拒绝。

本机来源位置：reference-cache的dnd5e/6.0.6与5.3.3 `module/documents/item.mjs`、`mixins/pseudo-document.mjs`；实际Core14.368 `common/abstract/data.mjs`；实际Next Midi bundle的Heal注册类/schema。未修改这些外部源码。

## 验证与保留边界

新5用例先红后绿，含真实原生活动、正常units规范化、缺模型/构造失败零写、等待期间治疗值手改拒绝、后续Midi字段手改Restore拒绝。模块类型与受影响药水组已通过，实际过滤范围保留日志。源码独立审查未见阻断；新stage/ZIP12文件核对及正常Setup后单脚本安装通过，修后实际Apply/Restore/重载仍待随后原件。

旧schema1不因此获得自动恢复资格。本轮在同一自有Actor另建空药水Item补失败链，旧Item取证保留，末尾随本批Actor精确清理；不处理真实用户旧异常药水或扩大自动迁移。

没有新增待判断本地化候选。以后切换Core、系统或注册Activity类时，先复核该纯构造接口与完整模型输出，再做一个正常Apply和一个非中性手改拒绝反证；不以manifest或旧目标PASS推广。
