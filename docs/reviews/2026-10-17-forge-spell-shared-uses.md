# Forge 施法次数与复杂授予接口复核

本记录只覆盖2026-10-17候选修复，原始目标和历史失败见同日original-goal-status记录。PDF由独立thread处理。本记录不宣布整体修复或运行时验收完成。

## 精确版本事实

目标是Mirror Core14.368 / dnd5e5.3.3。对照官方[release-5.3.3消费字段](https://raw.githubusercontent.com/foundryvtt/dnd5e/release-5.3.3/module/data/activity/fields/consumption-targets-field.mjs)、锁定reference cache及实际安装bundle/source map：

- `activityUses`消费当前Activity自己的次数；不靠target改指向别的Activity。因此每项N/日可落独立Cast次数。
- `itemUses`消费父Item次数；同一施法能力中同池的Cast可共用父feat次数。不能给每个Cast各复制一池。
- 次数上限、spent与day/recoverAll恢复设置分别编码。水合读取现有资源，不重置spent。
- 安装的dnd5e.mjs是发布bundle，reference的同名文件是未打包入口，直接比较两者hash不能判断漂移。已逐项核对安装source map中的consumption-targets、cast-data、cast Activity源码及安装bundle的两种消费方法。

可复核证据：`.local/forge-spell-and-rule-repair-20261017/runtime-identity-r2.json`、`references-final.log`。Context7检索命中6.x，仅作导航，没有用它推定5.3.3字段。既有导入器与完整GM承接调研继续沿用已有记录；本轮没有安装第三方模块。

## 候选适配与反例

来源适配明确N、each/shared及原文证据；portable manifest继续使用既有uses契约。同一能力的一组共享授予链接到同一个feat池；独立授予消耗各自Cast池。额外独立共享池暂保留完整GM行，不能混入第一池。无明确共享含义的多法术每日行不能猜成每项次数。

复杂注释、条件或否定的成分豁免、未知施法限制逐行保留完整GM。其他有准确来源、能匹配的法术继续生成真实Cast；全手动能力不创建伪manifest。缺施法属性等基础事实仍阻断，不以GM标记放行。

独立Luna/medium静态审查发现旧builder允许射线/光束数量限制成为无限制Cast。本轮移除宽松例外，源适配保留该行GM。原十法术历史证据不改写；新builder回归明确九项受支持、一项拒绝无限制Cast。这是功能边界变化，不能只改测试期待而宣称十项仍自动可用。

源明确action/bonus/reaction时，Cast覆盖法术条目的默认时机；未明确时不凭名称推断。后续AI修复也必须保留精确来源、属于完整能力的手动施法行，已增加正式orchestrator丢失回归。

## 待验收和待判断项

- 候选本轮页面匹配、水合、真实Cast、共享与独立次数消费、刷新后读回：未执行，不以字段测试代替。
- 多个独立共享池在单一能力中的全自动表示、射线数量限制等特殊授予：完整GM承接，自动执行未承诺。
- 新第三方候选：本轮无新增采用/本地化对象。后续若引入，先锁版本并核实际消费归属、失败补偿和来源限制，不能只看manifest兼容声明。

每个新候选需反查：授予是否完整、共享是否合并错误、耗尽后是否还能施放、水合是否重置次数、特殊注释是否被漏掉。完整行为证明以本轮acceptance记录为准。
