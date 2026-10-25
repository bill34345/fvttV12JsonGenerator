# ServerNext 6.0.6 盘点与验证成果整合

## 目标与范围

用户原话：“OK 没问题，那就按你说的，我们先理清这个改动和依赖，然后再进行提交合并。”本次按前一轮已说明的范围准备提交并合并本地master；未授权push、部署或清理工作树。

主区起点为`fac66750636725c08ef4e90acc3bcb3852f74ec8`，包含此前六个已提交的Babele、Lab和规则文档更新。原工作树仍在`codex/20261011-144833-suite-direction-console-handbook`、基点`3734eb2de0b19b0f3d4cfb38bd1e0c8478635281`；整合在新建的`codex/20261025-203056-next606-master-integration`完成，不在原dirty树提交。

依赖审计确认：仅取本轮40个变化路径不足以构建已验候选。整合选择共313个来源路径，包含非Forge模块适配、既有TE/CC/WMP依赖、共享suite-handbook及Suite Console、手册交付与检查工具、相关版本源码清单和验收记录。来源中的reviewed.json和根HTML不直接覆盖master，而由合并后的内容人工核对并生成。原始`.local`证据、环境配置与工具下载不入库。

12个路径排除：独立Forge界面/文案及测试、Web工作台改名涉及的实现/部署说明/HTML入口，以及`.worktreeinclude`。README保留Web工作台现有名称，Forge手册条目保持master语义。既有master的中文Babele独立维护入口保留；完整手册37项，Foundry投影28项，离线专用9项。没有扩大正式生成目标或Forge的6.x支持。

## 证据复用与本次检查理由

本轮不连接Foundry、不重放已通过的6.0.6业务。原始接受身份和失败记录以[总账](../plans/2026-10-11-fvtt-suite-refactor/EXECUTION_LEDGER.md)、[运行接续核对](2026-10-25-next606-rules-runtime-followthrough.md)为准；测试绿色不扩大其限定范围。

本次修正文档中的过时汇总：WMP606的Sap取消、Club伤害/Slow、重复提交、重载和清理已接受；Deck英文说明跟随同一限定范围。Species/Blood Hunter的Next构建兼容上限606与602内容/verified身份分开，根manifest仍保留历史目标。旧User原像、Calendar A坐标及额外IFS完整归档运输缺口保持原记录。

整合涉及workspace依赖、共享浏览器包、模块构建、架构规则和手册宿主，形成明确的master整合边界，因此执行一次安全`ci:verify`的非浏览器整合门禁，复用其类型、架构、覆盖率、Web构建和离线smoke结果。局部构建与包检查只验证新组合缺文件/依赖和交付身份，不冒充再次实机接受。手册的新增Babele分区和WMP说明需更新确定性生成物；不因文档组合重复旧视觉验收。

整合检查还发现普通coverage库存会直接执行一条旧的Session Monitor真实Chrome重启场景。runner按精确完整测试名将其独立登记为deferred，不排除整个文件、不降低阈值，并补反例确认同文件内存/会话/报告测试仍执行。该真实浏览器场景本轮NOT_EXECUTED，不能把本次CI称为包含所有外部浏览器场景的全面验收。CLI与Monitor构建门仍按原公共步骤运行。

覆盖率首轮在443个文件的最后一个文件触发旧450秒watchdog；进程被计时器终止，原失败日志保留；完整复查确认首轮也含同一手册搜索断言失败，先前未查全日志而称无断言失败的口头结论已更正。只将该门的时限调整为600秒，保留单进程/阈值/完整非浏览器库存。重新生成这份报告，并从coverage校验继续尚未执行的后续门，复用先前类型/架构/CLI结果，不重跑整条CI或Foundry业务。

## 验证记录

- frozen install：Bun1.3.14，lockfile不变。首次ffmpeg-static安装停留在二进制下载，停止本次下载后通过其公开FFMPEG_BIN配置复用已存在的同包版本工具；没有复制环境文件或改变全局运行时。
- `agents:generate`/`agents:check`：34个必需文件通过；根Ruler生成物未产生额外修改。
- `handbook:build`/`handbook:check`：37项通过，delivery为28/9；master Babele条目与Forge原条目逐字段保留。
- `test:coverage-runner`：4项、19断言通过。初次只因预期输出写成skip而Bun实际输出filtered out失败；回调隔离本身已成立，修正断言后通过。
- 首段CI已通过环境隔离、指令链、手册、全部类型、架构、Monitor构建门与独立CLI门；覆盖率首轮450秒失败保留，补跑结果见下。
- `audit:anti-overfit:all`：439来源通过；`hygiene:repository`：2358 tracked路径通过；`references verify dnd5e-5.3.3`输出5.3.3和current-6均ok。
- `web:build`通过；`smoke:actor:offline`对White Tusk Shaman的6个来源Item通过，0 verifier警告、0网络调用。
- Guard、TokenSync、Resolver、Monitor四个共享帮助消费者实际build通过；`release:suite-console`通过，本地ZIP SHA256为`512e1f9354388581c7825c82618c86e440d840d76b448ae23e0075e6a56071e3`，HTML与独立交付副本SHA相同。全部产物留本地，未安装/部署。
- 来源325个文件、HEAD、索引与status，以及主区39个既有未跟踪文件在提交前核对保持。拟合并模块/共享包186个代码/结构输入与来源候选一致，仅规范换行/末尾空行。
- 覆盖率补跑在413.61秒完整结束：4246 pass、1 skip、1 fail，28803断言、443文件；唯一失败仍是手册测试期待已排除的“Web操作台”改名。实际保留master“Web工作台”，查询“操作台”会先命中Deck，测试预期错误。仅修改该测试为当前名称优先、两个明确工具检索及原有XSS拒绝断言，产品代码/目录内容不变。
- 受影响手册在Node与Bun两种既有公共入口分别26 PASS、0 FAIL。其余4246项复用；Blood Hunter受保护来源的真实effect-only用例仍skip，未补做旧角色更新。
- 完整单进程LCOV已在失败进程正常结束时产出，逐字节保留到coverage输入；后续只改测试预期，没有改任何被采样产品源，未合并多个进程覆盖数据或改写原failed manifest。coverage:verify通过：517产品文件，line86.43%、function87.19%，原阈值84%/85%保持。原失败与父层补测对账分开记录，不称最初ci:verify命令退出0。
- 一条旧Monitor真实Chrome重启场景按准确名称deferred，本轮NOT_EXECUTED；本地真实业务接受仍仅复用此前冻结证据。

## 保留边界

未修改运行中的Next、Mirror或生产，也不把新生成本地包宣称成已部署字节。合并后完整HTML会因主区Babele条目和当前文档内容变化；该文档组合须以本次构建身份识别，不能沿用旧ZIP哈希。来源工作树325个改动文件及空索引、主区既有39个未跟踪文件需逐文件核对保持。

本次提交门禁已按上述分段结果补齐。主区与原工作树的保护基线再次逐文件保持；提交仅包含316个白名单路径，没有环境文件或已排除的Forge/Web实现。
