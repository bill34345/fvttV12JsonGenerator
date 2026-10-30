# Forge 保存失败输入契约修复

2026-10-13。本轮代码修复、离线整合和保存输入的 Gazer 原生回放均已完成，父控核对实际收据及完整数据通过。**完成范围是本轮契约修复与保存输入原生回放，不宣称任意 PDF 或新模型首次生成已通过；旧冻结批次保持 0/6。** 付费审核关闭，本轮真实模型请求为 0；没有提交、合并或推送。

计划：[原始失败输入修复计划](../plans/2026-10-13-forge-raw-failure-contract-repair.md)。继续既有 sibling 工作树；HEAD `f79c25fbac747a7e08f98c48779f052c3db68599`。主工作区 HEAD `3734eb2de0b19b0f3d4cfb38bd1e0c8478635281`、仅 `.omo/` untracked 保持。

## 已实施的修复

- 同一能力的短 parent claim 与完整 mechanical coverage 可以共同证明完整规则单元；原始引文、UTF-16 位置、完整正文和相邻边界仍须一致。Sea 保存的新证据形态能识别目标自选 INT/WIS，长属性别名仅用于来源已证明的选择疑问；原生单属性 Save 仍严格校验。
- 来源标题检查区别 Title Case 能力标题与换行普通正文，支持编号子能力；能力名称、英文名称、来源限定或正文已保留的明确法术等级均有落点核验。独立等级能力不虚构全局施法属性或法术位。条件／延迟规则仅在完整原文及明确 Utility/GM 边界成立时保留，未知疑问不清除。
- 充能区间、正常／远射程和等级区间区别于算式，按用途及有序数字签名检查，整个区间受保护；完整真实公式仍检查操作数、运算符和顺序。
- 来源已证明的父能力范围与可见目标条件只传给连续编号、完整保留的子能力。IR 字段、父子引文、ActionData、Actor range/target 和固定中文共同贯通；不猜目标数量或类型，不覆盖子能力冲突。
- 内部 `responseEvidence` 默认关闭。实际 Forge 提取／翻译入口可显式选择私有 sink，在 JSON、IR 或 token 校验拒绝前记录脱敏回复及来源／请求／响应指纹；普通日志、公开 Forge wire 和战斗包不增加原始响应。记录器失败不追加模型重试。新增坏响应为测试构造，绝非找回 Mezzoloth 缺失原件。

## 独立反证与闭合

审查提出四项可复现问题，修复后逐项独立复核：

| 反证 | 当前结果 |
|---|---|
| 以合法但不相关引文及同值 claim，给 Familiar 伪造 range=999 和任意目标 | 两项 `UNBOUND_FEATURE_TARGET`，仍阻断 |
| 条件规则 resolution ID 与未知阻断疑问碰撞 | 未知 code 和 `blocking=true` 保留 |
| 删除第 4 条 Force Ray 并将 coverage 标为有理由忽略 | `SOURCE_FEATURE_OMITTED`，仍阻断 |
| `Range 30/60 feet` 译成 `射程60/30尺` | 拒绝；正确顺序通过。无标签减法／除法仍按真实算式核验 |

编号遗漏问题此前是否已存在不能仅凭哈希基线证明；本轮已保存反例并闭合，不伪称精确历史归因。

## 离线证据

证据根：`.local/forge-raw-contract-repair-20261013/`。新增检查均对应实际代码变化或上述反证；中间红色日志保留。既有模型首次坏 IR、旧失败输出和 53 份旧批证据哈希再次核对一致。

| 检查 | 实际结果 |
|---|---|
| `test:forge-raw-contracts` | 76 pass / 0 fail |
| `test:forge-facts` | 41 pass / 0 fail；测试自造译文补充真实的充能／射程标签，不修改历史回复 |
| `test:reviewed-localization` | 44 pass / 0 fail |
| `test:generation` | 287 pass / 0 fail |
| `test:forge-encounter` | 541 pass / 0 fail |
| `test:fvtt-json-forge` | 574 pass / 0 fail |
| packages、Foundry modules 类型检查 | 通过 |
| 依赖检查、局部 anti-overfit | 通过；55 个生产源码文件，无按怪名分支 |
| 构建／本地发布 ZIP、来源 smoke、锁定参考 | 通过；smoke 0 网络、0 verifier warnings |
| 手册人工核对／生成／一致性 | 33 项通过，原 watch 覆盖保留 |

各入口存在测试重叠，不将上表相加声称独立案例数。没有运行全仓 CI、覆盖率或新的六 PDF 批次。

`raw-case-audit.json` 使用六例未经本轮手改的保存首次／末次 IR：六例末次保存 IR 的来源入口现在均 `ready_to_generate`；Sea、Mezzoloth、Charon、Baernaloth 的首次真实错误仍阻断。此结果只证明来源入口，不能代表中文、原生导入或新模型成功。

Gazer 用原始保存提取 IR、保存的固定能力 selection 及按 kind/source 完全相同字段匹配的保存译文，经过正式入口重新生成。没有手改候选或赋新哈希给旧批准。新未批准来源包 hash：`f00c7661db691c77a9d347adb8950b46f907cc8d86ba94fcda61d50a0a77cfa8`。47 条完整中英文展示行及 3 条包级展示已核对；7 Items / 8 Activities，15 处目录内非默认图，11 处 fallback、4 处 high，理由保留。父能力及四射线的 60 尺、可见目标限制进入原生数据与固定中文；WIS/WIS/DEX/STR DC12、3d6 寒冷及 GM 推离公式保持。

正式 `verify:intake` 返回 exit 2，唯一 finding 为 `ACTOR_FORCED_MOVEMENT_REQUIRES_GM`：普通 Actor 的自动推离阻断仍保留；战斗包以唯一来源绑定的 GM 配套入口承接，后续必须由当前 GM 明确批准。不能把 exit 2 写成普通 Actor 全通过。

## 冻结与原生边界

329 份源码／构建／目录／回放工具与输入的原始字节已冻结，`candidate-freeze.json` SHA-256：`902f6494260bde0fd9264c38c9c7b718045f4ca3789786e9c5e934e1f7bf0381`。

- 主 JS：`22f9eb1391eecd2cea06ca37b0f9290288e864f583a690c0a3a79797db86cd13`。
- 新本地 ZIP：`c8d463f769d5b50f74f95cad9f8ca55e6d789da98e75ab0084c9fc2ea41b4ac6`。
- 旧批 ZIP 原件仅移动到 `.local/forge-facts-20261013/frozen-build-artifact/`，原 SHA `06520a2188a9286de0600b272bc694bf6a05d518e793e7a80299e588f6898512` 保持；没有创建备份或重写旧报告。
- Mirror PID56132 / 127.0.0.1:30001 / cor-cotn / 14.368 / dnd5e5.3.3 重新核对。只安装16个正式模块文件加1个自有验收 helper，实际变更2个文件；17个 HTTP 原始字节哈希均匹配，无重启、无数据库编辑。

原生回放通过现有应用的 recovery-store 入口装入未批准 fixture，仅在内存保存，不写既有 IndexedDB。实际 GM 在完整中文预览里重新批准并导出；随后用**已安装模块的正常 UI**重新预览／导入该包，刷新、全量回读图标和规则，精确清理本次 Actor、控制宏和启动工具宏。辅助窗口本身不作正式导入，避免将工具中重复编译的应用冒充已安装入口。

原生结果：**PASS_SAVED_INPUT_NATIVE_REPLAY**，页面收尾补证及服务器临时工具清理亦完成。未知 Dazed 定义、魔宠变换和感官等未执行文字仍交 GM；本轮不宣称新增自动生命周期。保存的测试资料名“frozen fresh acceptance”仍有生硬译名，原件不手改，不影响怪物规则判断。Mezzoloth 缺失的完整失败译文保持 **UNKNOWN**。新 PDF 首次成功率、真实模型稳定性和任意 PDF 支持仍未证明。

## 实际原生结果与父控复核

实际目标 Mirror **14.368 / dnd5e5.3.3 / cor-cotn / PID56132**。执行器实际配置 gpt-6.1-sol / medium / never / danger-full-access 已留证。

| 阶段 | 实际结果 |
|---|---|
| 未批准内存 fixture、完整中英文与固定事实预览 | 50 行（47 Actor + 3 包），通过 |
| 当前 GM UI 新批准 | 1 次，绑定当前 actor requestHash `e95b1596057737a73eba3cd9ebe325070128e061a348a4abb227c07c89201bb6`；为自动化测试 GM 确认，不冒称人类逐行确认 |
| 正常导出、已安装模块上传与独立重预览 | 通过；未从辅助应用导入，未手改候选 |
| 正常 UI 导入 | 1 次；Actor `3e1949d270792baa`、控制 Macro `d697484ad59e5e74` |
| 导入后实际刷新 | 1 次；两份完整文档、ID、规则与15处图标路径逐值一致 |
| 规则字段 | AC13、HP13/3d4+6、fly30/hover、六能力、免疫/感官/语言；父能力及四射线60尺/可见目标；WIS/WIS/DEX/STR DC12；Frost3d6 cold且成功无伤；GM推离25(1d10×5)均保留 |
| Item/Activity 图标 | 15处与安装预览逐处相等；7份素材均实际加载256×256；无空图、占位或目录类型默认图。11 fallback/4 high，如实保留近似程度 |
| 精确世界清理 | Actor、控制宏、工具宏各创建／删除1次；完整Actor/Macro ID+名称集合回到原287/94，非仅比较数量 |
| 浏览器任务／草稿 | 来源语言source、空原始资料、无本次保存任务恢复。默认Guard窗口重开产生新的临时source UUID；排除该临时身份后全部用户字段和正文逐值一致，无蓝图保存 |
| 页面收尾 | 原收据过早声称已关页，补证后两次官方库存均无4个本任务页面；原9个他人页均在。见下列更正 |
| 服务器临时工具 | 父控按精确路径、原SHA和安装前不存在证明移除唯一helper.js；HTTP404，16份正式模块磁盘与HTTP字节保持。私有证据工具留存，服务不重启 |

批准包为 `intake-a9c9cfc009ee19152ab6-zh-cn-a54fefe85df936d5`，正式 packageHash `3a642ce5788c5c39ec4e6c745f90638d4919770ebde02c813960eb9960158fa7`。父控用批准包再次走正式 `prepareForgeEncounter`，按已登记 NPC 原生创建规范化与实际持久化 Actor 做语义比对通过；控制宏与正式中文投影的固定命令、Actor绑定和命令hash一致。0网络、0模型，不重放浏览器业务。

执行器原生流程1362秒（约22.7分钟），页面补证92秒。工具宏执行4次仅用于初始化／读回／清理；控制器、Activity、骰子、Token移动及世界时钟执行均0。正常下载捕获超时后保留已批准产物，用产品已有只读JSON出口原样保存；没有重批准或重生成。证据检查先后纠正了旧感官路径、导入时去除嵌入Item ID、中文控制宏使用正式名称投影等检查层假设；原始红色日志保留，没有重跑原生操作。

### 收据与收尾更正

- [业务原收据](../../.local/forge-raw-contract-repair-20261013/native/receipt.json)，SHA-256 `b4378df425499b6e6ddd304f7c6116ee34f462ced25061986fa9143be8b4c887`，57份证据哈希全部由父控核验。
- [页面收尾补证](../../.local/forge-raw-contract-repair-20261013/native/tabs-closeout-receipt.json)，SHA-256 `5cf33103483a4228b22aae2e42dcfbb9b4b4c1ba784b61bdf49fcc989e7c1caa`，3份补证哈希及两次实际库存由父控核验。
- [父控正式再生成与原生语义核对](../../.local/forge-raw-contract-repair-20261013/parent-native-audit.json)及[唯一服务器helper清理](../../.local/forge-raw-contract-repair-20261013/native-helper-cleanup.json)。

原 `final-tabs.json` 保留，不覆盖：当时确实仍列出工作页和三个helper导出blob页，“已关完”结论过早，原close只能记为关闭请求。补证时4页均已不存在，符合未保留任务页在回合结束清理的生命周期；具体消失时刻／触发者未独立记录，不声称又手动关闭4页。651344519归属及消失原因UNKNOWN，不计为本任务或由执行器删除。保留原9个他人页的结论有两次库存证明。

本次记录只完成本轮里程碑。下一阶段仍需另做冻结版本的全新来源／真实模型验收；本次不开展新批次、不改旧六例0/6。
