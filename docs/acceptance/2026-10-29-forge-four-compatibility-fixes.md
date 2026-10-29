# 六只首答四类兼容性修复验收

2026-10-29。用户原话：“行，按报告修这4类问题”。沿用现有worktree、冻结原答与失败产物。依据[原因报告](../reviews/2026-10-29-forge-six-first-answer-causality-review.md)及[实施计划](../plans/2026-10-29-forge-four-compatibility-fixes.md)。新增模型请求0，不提交、合并或推送。

当前状态：代码、离线整合、最终独立审查及本地Mirror配置/刷新保存验收完成。四个测试Actor、观察器和任务页已精确清理，用户世界基线恢复。

## 实际机制修复

- Brass：唯一Monster接收入口只恢复完整生物对象之后、无重复键的完整附带字段尾部，保留原答、字段值及恢复坐标/hash。合法旧答原路径不变。正式重放进一步暴露根级legendaryActions错位：已在同一入口把已知能力集合接到唯一生物上，仅限生物内部没有同名栏；冲突不覆盖，原外壳进入整理历史。未知机械尾部、第二对象、重复键不猜合并。三种集合正例及冲突反例覆盖。
- Behir：仅当另一operation明确拥有同一持续阶段状态时，不再从后续伤害的持续状态说明中重复推断。显式状态、独立攻击重复施加、新发生的状态和退出Prone均保持。GM可选模板机制不变。
- Magma：明确的已知语言列表及括号内已知语言附注在接收入口补齐原生身份，完整custom文字保留。限定、否定、仅理解、不完整列表和原型链特殊键保持文字，不误登记。已有Primordial及Ignan/Terran备注不变。
- Unicorn：标准传奇抗性的明确每日次数接到原生legres；独立特性按钮消费同一原生计数，取消独立Item池。未知名称、缺少数字、不同恢复、冲突显式值及复合施法记录保持原处理。空可选数组与省略字段等价。Intake及generation的两层保真检查都验证原生容量、未用状态和唯一属性消费，错误值不能假通过。

## 离线证据

私有根R：`H:/CodexData/visualizations/2026/10/28/01a18034-1e26-7870-8d8b-041ab59fa313/forge-four-compatibility-fixes-20261029`。

三类新增测试安全组合54通过、0失败、318断言。受影响generation整合81通过、0失败、1182断言。包和根类型、架构、11源码anti-overfit及Forge构建通过。其他有效局部检查及日志见R/independent-regression.json；不将重复入口数累加为独立生物数。

最终六份真实原答沿正式Forge公共链重放，全部有Actor，模型请求0。Priest、Roper整卡没有非时间戳差异；Magma仅增加原生primordial；Unicorn仅原生计数、独立池、identifier及消费变化；Behir仅删除错误模板/关联及由模板数量变化带来的退出效果ID更新，退出Prone继续正确。Brass原首答没有Actor可作相等比较，现逐项核对来源基础数据、攻击与伤害、吐息范围/豁免/充能、七法术及传奇动作；恢复原答与所有附带记录未改。最终源链在R/six-replay-final。

旧冻结对照：14份preservation Actor、12份46检查输出完整JSON与前轮相同；旧Brass原答的既有回归继续通过。旧Balor也具有明确3/日传奇抗性，同一机制因此产生预期资源变化：测试先逐字段断言该变化，仅在比较视图还原这些字段后核对其余整卡，原快照未改。此处26份记录不是26种生物，也不声称所有46项组合本轮实机通过。

原provider/response-evidence测试63通过、10失败。已用仅在内存还原、执行时hash与开工基线完全相同的旧provider运行相同入口，完整10个失败名一致；没有修旧断言或把失败算通过。收据R/brass/existing-baseline-comparison.json。新测试类型遗漏和资源第二层旧检查误报的红日志均保留，最终修正通过。

独立审查确认并关闭三项：语言字典原型链误识别、空可选数组阻断资源等价映射、复合手动施法记录被简单资源映射遗漏。最终源码与证据复审未发现新的可操作实质问题。实际Unicorn的错误原生次数、消费目标和独立池三种变异均被识别，另有generation层五种变异；不把schema附带问题导致的旧verifier提前返回推广为所有答复已受同等检查。

## 本地运行和保留核对

已实际读回：Mirror14.368/dnd5e5.3.3，复用PID41304/30001；候选Forge0.5.1脚本SHA-256为`04f008a7538713f61b80613f66d1233d441d971a4454fb7b21922ffac9590345`。本次只安装精确本地模块变化文件，17文件核对；不重启服务，不操作Next/生产。不Use/Cast/EffectApply或投骰。

四只Actor完整JSON在刷新前后相同，排除字段为空；源Item名称目录及description.value完整保留。Brass实际8Cast、三传奇条目均在；Unicorn实际9Cast，卡片原生传奇抗性3/3与同一资源消费正确；Behir酸伤无状态链接、初始及退出状态保持；Magma原生primordial与完整备注并存。父代理独立读回及Unicorn截图核对完成。七集合、世界时间、暂停及场景与原基线严格相同，hash 5904dc02ea8ab9f2807d6a856ae87b6eac5c9a0041c87b38517b544ab8e9a535；观察器另经正常UI删除，用户页和常驻服务保留。原答、失败产物和旧快照保持；最终hash清单见R/preservation-final.json，运行收据见R/mirror/parent-refresh-validation.json及parent-restoration-validation.json。结果按“生物｜成功程度｜问题点”汇报，完全成功行只写“—”，成功范围限实际完成的验收层级。
