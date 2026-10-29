# Forge 五类机制修复验收

开工2026-10-28，收尾2026-10-29。用户原话：“行，按报告顺序修这5类问题”。依据为[46项对照报告](../reviews/2026-10-28-forge-46-comparison-regression.md)，实施顺序与边界见[计划](../plans/2026-10-28-forge-five-mechanism-fixes.md)。

沿用 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`，不覆盖既有未提交成果。真实发现、生成、内容复核、纠错、翻译服务调用均为0；未提交、合并、推送。旧报告保留发现时含义，不改写成修复后通过。

私有证据根 `E`：`H:/CodexData/visualizations/2026/10/28/01a18034-1e26-7870-8d8b-041ab59fa313/forge-five-mechanism-fixes`。所有RED、初次GREEN不足和工具失败日志保留，不覆盖旧原答及失败产物。

## 按报告顺序的修改

| 项目 | 实际结果与机制 | 边界 |
|---|---|---|
| N01 明确自身临时生命退化 | 在来源识别拥有者的旧消费者补齐来源明确的自身受者，三个旧temphp失败恢复self；目标／盟友代词近反例保持未知 | 不恢复全局self默认，不覆盖显式已有受者，不猜未知目标 |
| E01 否定／前置错误新增效果 | 识别直接结果、局部否定及最近参与者；Pack Tactics不再把“盟友未失能”生成失能模板，真实并列结果保留 | 联合受者与both正控保留，不按生物名称放行 |
| E02 无伤害攻击失联 | 无Damage时，将本操作GM命中模板关联自身攻击检定；两个verifier采用同一归属边界 | 不补造Damage；已有Damage时继续防止攻击检定重复挂效果；相邻Save独立 |
| E03 退出阶段遗漏 | 来源真实退出事件产生独立GM Utility及状态模板，保留完整触发；初始吞入状态保持 | 无自动事件执行、掷骰或资源消费；逃脱DC、检定、否定退出、Until／除非不成为退出事件 |
| R01 引文误报 | 全部引文成功定位且仅坐标／引文整理时作为正常历史，原答及旧坐标继续保存 | 未定位、坏记录及真实不支持内容仍提示；不删除真实机械字段或原始记录 |

生成层的阶段标记是内部投影信息，没有扩展外部IR契约。阶段控制器必须与来源、owner、原始状态稳定键及完整系统状态集合一对一匹配；缺控制器、缺模板或同时缺失均会被核验发现。共享资源、首次活动和候选次数的消费方排除已验证GM阶段，主能力仍按原规则消费。

## 离线验证与完整产物对照

最终窄组 `review-coordinate-unless-green.log`：**73 pass / 0 fail / 456断言**。根 `test-forge-five-mechanisms.log` 是早期61项版本，不用于最终计数。测试调用真实实现及公开workflow，冻结回复由本地httpClient供给，所有真实provider方法均禁止；不把本地回放算作新模型质量验收。

`current-fix-artifact-differences.json` 共58份Actor对照记录：**52份完整JSON不变，6份只出现预期修复差异**。这58份包含同源的不同表示及正控，不代表58种独立生物。

| 变化对象 | 完整差异核对 |
|---|---|
| 三个自身temphp正控 | self恢复；移除错误的缺目标提示；源正文、公式、激活和消费保持。Activity身份随接收者变化，CLI时间戳单列 |
| Warrior Infantry | 只有Pack Tactics的错误失能Effect及其Activity链接移除，共2个路径；其他内容不变 |
| Roper原样冻结回复 | 只有Tentacle攻击检定的effects链接变化，共1个路径；原有Grappled／Poisoned模板ID不变，无新增伤害，生成核验无finding |
| Behir原样冻结IR | Swallow仅追加退出Prone模板与独立Utility，共2个路径；原Save的Restrained／Blinded效果及链接完整保持，生成核验无finding |

Unicorn／Spirit Naga原答与合法草稿生成的完整Actor相等；成功引文整理不再产生旧误报，旧-1坐标留在原始候选历史。Brass及四份既有治疗／传奇边界对照完整相同；14份保留修复回放产物完整相同。Warrior仍保留原有分数CR结构诊断，Actor实际CR为1/8，不能因本轮移除错误Effect而声称该诊断已修。

最终代码的补验 `final-check-results.json`：

- `typecheck:all`、7个生产文件局部`audit:anti-overfit`、`build:fvtt-json-forge`均退出0。
- 官方状态24项／606断言；保留生成10项／310断言；状态导入适配7项／23断言；模式288项／2858断言，均0失败。
- 架构核验复用本批已通过的`architecture-r1.log`，后续无依赖图变更。

此前整合批执行27个安全入口，21组退出0，6组仍失败；按失败名称去重剩24项，相比前轮27项只消除原3个temphp失败，没有新增失败名。保留的旧协议、旧状态／快照和IR历史比较等问题不在本轮顺带修改。该较宽批发生在最后几项边界补修之前；最终代码由上述窄组及受影响检查补验，不能将其写成最终全仓CI通过。

## 独立代码审查

独立只读审查发现的指代受者、联合受者、同句初始／后续状态、否定退出、逃脱DC／检定、同源多状态阶段身份、中文“除非”和both结果边界均已补修，并分别保留RED／GREEN。审查代理读回最终代码与73项日志后逐项复核关闭，限定范围内没有新的实质问题；收据为`review-independent.json`。主控另完成上述原样冻结产物对照，未以共享推导规则的两个verifier代替语义核对。

## 本地Foundry配置验收

最终Forge构建成功。Mirror进程核对为PID57908、端口30001、Core14.368、数据目录 `F:/FoundryLab/foundry-v14/data/server-mirror`；Next端口30002／PID62924保持。正式链用新来源身份准备三份测试候选及观察器，位于`mirror-fixtures/`，没有手改最终Actor JSON。只安装本地Forge候选，17个模块文件哈希读回一致，仅`scripts/index.js`变化，SHA-256为`0f6deb2e78b8118fd8a747c3c3127c75b88471b68c3ff4d985c17d10d8defbc2`。

首次准备时Chrome未运行，Mirror返回`gm_bridge_missing`，失败收据保留。用户随后明确回复“允许启动 Chrome，继续验收”；同一Chrome执行器按官方扩展通道启动并复用任务页，实际配置保持`gpt-6.1-sol / medium / danger-full-access`。没有改用其他浏览器或执行通道。readiness检查及父代理原生MCP均读回`cor-cotn / 14.368 / dnd5e5.3.3`。

通过正常Macro UI导入观察器、捕获基线，再通过Forge正常上传、预览及GM确认创建3个Actor／0个包宏。Warrior既有分数CR诊断及Roper的GM规则提示继续显示，没有通过删除诊断或能力凑通过。

| 样本 | 实际保存配置 |
|---|---|
| Warrior Infantry | Pack Tactics没有额外失能Effect及链接，完整优势前提原文保持 |
| Roper | Tentacle只有一个`1d20+7`的GM攻击检定Utility，关联Grappled／Poisoned模板；没有新增Damage，GM条件及可选应用保留 |
| Behir | Swallow原Save只关联Blinded／Restrained；独立Exit Utility只关联Prone。30伤害、DC14体质、吐出位置及尸体逃出15尺的完整条件保持，没有掷骰公式、次数池或消费目标 |

`configuration`与`after-refresh`两次读回中，三只Actor的完整保存产物哈希逐ID相同。父代理另外使用原生MCP读取三个实际Item，检查效果归属、阶段标记、完整条件及零额外消费；这属于配置与保存验证，没有实际应用效果或触发退出事件。原件与断言收据在`mirror/runtime-before-cleanup.json`、`mirror/native-*.json`、`mirror/parent-configuration-validation.json`。

清理前保留第三次`before-cleanup`记录，再只删除本包3个测试Actor。原两条记录、cfg及基线与清理前文件严格相同；七类集合、时间、暂停与活动场景的整体哈希恢复`5904dc02ea8ab9f2807d6a856ae87b6eac5c9a0041c87b38517b544ab8e9a535`，自有Actor／包宏无残留。最终原件与父复核为`mirror/runtime-final.json`及`mirror/parent-restoration-validation.json`。观察器及任务页的最后清理记录见`mirror/observer-cleanup.json`。

本轮不包含Use/Cast/Apply、投骰、真实治疗／传奇扣费、战斗时间变化、生产写入、长时接受或新模型能力验收。手册review／build／check通过；最终`final-validation.json`核对2718份原工作树文件无删除、4139份保护证据无变化，本轮差异在声明范围内，HEAD／分支不变、索引为空。本轮五类代码修复、冻结对照、独立审查和限定Mirror配置／刷新验收已完成；不宣称战斗结算或任意未来输入均已通过。
