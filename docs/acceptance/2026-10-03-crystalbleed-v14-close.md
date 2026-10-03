# 晶血龙兽 V14 当前战斗包收尾

2026-10-03。整体 **INCOMPLETE**：本轮完成候选生成、来源核对和两处恍惚桥接修复；正式 Chrome 连接已在会话刷新后恢复，独立执行器已建立。Mirror 启动被工具策略拒绝，实际 Foundry 导入、绑定、隔离与恢复门仍 **NOT_EXECUTED**。没有把历史战斗接受或模拟回归推广为本轮实机 PASS。

## 候选与权限

- 干净 master 基线 `a6cbd37dcaaf367ce11bd8e999a4d1445d8ce4ce`；候选分支 `codex/20261003-031024-crystalbleed-v14-close`，sibling worktree `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261003-031024-crystalbleed-v14-close`。
- 旧树 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20260912-130943-crystalbleed-v14` 只读；19 个未提交文件已记录路径与 SHA-256，没有覆盖、提交或清理。
- 用户已有授权涵盖本项开发、本地 Server Mirror 验收及本地提交；本轮不 push、不操作生产、不停止或重启常驻 Mirror。
- 首次接手的真实 `turn_context`：`gpt-6.1-sol / xhigh / never / danger-full-access`；会话刷新后最新记录为 `gpt-6-astra / high / never / danger-full-access`，分别保存原件，没有覆盖宿主当前配置。独立 Chrome 执行角色仍遵当前项目 `gpt-6.1-sol / medium`。

## 已选择的路径

明确使用 `tools/forge-encounter/build-example.ts` 的**已整理来源与受审核样本专用宏**路径。没有调用 Provider，没有把它当成人类 MD → DS → 固定能力配置全链。

打包器携带来源；`prepareForgeEncounter` 调用正式 browser workflow → parser/generation → verifier，目标明确 `14.364 / dnd5e 5.3.3 / core / icon-mode off`。Actor artifact 未手写或修补，审核 artifact 仅保存于外部 evidence，未作为 accepted 单 Actor 发布。

最终候选：

| 对象 | 身份 |
| --- | --- |
| 包 JSON SHA-256 | `3d6f5473aff7f9164c60f9b3f6b11362875e2f96698ad45c3362186fa4290c9d` |
| ZIP SHA-256 | `05b1767322b439ea01edaa1c0041e76e8b42afecfb12aa3d15f41d26d4a68312` |
| 未绑定样本宏 commandHash | `f44cb05a4c510e91e5fdab41ba678aefe151400fe188c0b4c4bb450bd215820d` |
| 龙兽确定性 UUID | `Actor.4ffe914190ff8157` |
| 晶体确定性 UUID | `Actor.a8139b242e679eef` |
| 控制宏确定性 ID | `9dcb48629e517e2a` |
| 样本运行时版本 | `2.1.1` |
| 龙兽 canonical artifactHash | `b740b84cdb92ea73556eac9b3b4e1be3334a8bde080c551ecb49e2bc2188452c` |
| 晶体 canonical artifactHash | `e33d16d7f98b513c1c3c63f1dd5eb17c009e0723a2c738613a9d5cf4cb83d848` |

上述 UUID/ID 是当前导入器推导的预期值，**不是 Foundry 创建读回证据**。原交接包 `ebf1a8bb…e14dd` 被新宏候选替代；同一 packageId 的旧文档不能用改 flags/hash 的方式覆盖。

两 Actor 仍为 `needs_review`，五条明确配套要求继续由唯一绑定宏承担；包级 GM 确认和单独启动边界保留。

## 旧树与 master 后继比较

| 旧增量 | 当前归属与结论 |
| --- | --- |
| parser 的 tokenImg mapping/YAML 两文件 | 当前 parser 已包含；来源与 token-image 正负回归已存在，不回迁旧实现。 |
| generation 的 recharge、源效果期限、恍惚与范围两文件 | 当前 generation 已含后继实现。范围改为区分 AoE 与投放距离；现有跨版本 fixture 验证，不覆盖为旧 hunk。 |
| package.json、structuredActionItems 测试 | 由 Forge 安全测试入口及当前更严格回归承接；不新增旧独立构建路线。 |
| 两正式来源 | 晶体逐字节相同；龙兽仅末尾空白不同，trimEnd 后相同。使用当前样本来源。 |
| 源语义测试与 structured-save-outcomes fixture | 当前 `tests/forge-encounter-source-semantics.test.ts` 已承接；fixture 字节相同，状态断言随当前独立状态 ID 更新。 |
| 独立宏与图像 | 宏后继在 `tools/forge-encounter/examples/crystalbleed/`，显式使用本包 UUID；图像字节相同。保留旧宏历史身份，不回迁整棵目录。 |
| 旧 README、构建、两 dummy、局部规则、历史接受与单元测试 | 保留在未退役的旧树；旧生成/导入说明不能作为当前包的推荐入口。退休须待实机门和独有材料保存闭合。 |

## 本次确认并修复的恍惚桥接

1. 当前正式齐射效果的 status 是 `fvtt-custom-conditions.dazed`。原宏只匹配 `dazed`，在当前 artifact 上返回缺失。使用共享 condition contract 的独立 status 投影查找，继续接受旧 `dazed`、原生效果和 behaviorState；不接受其他模块同后缀状态。
2. 正式 Item 效果是 `template=true`。原样复制到 Actor 后，Custom Conditions 的 `ConditionRuntime.list()` 明确跳过模板。宏现在通过共享契约建立实际 enabled 实例，保留来源与期限，生成独立 instanceId；刷新已有同来源效果时保留其 instanceId。正式 Item 模板和 Actor JSON 不改写。

`candidate-receipt.json` 保留原查找失败、修复后命中，以及原复制仍为模板、修复后不是模板的机械证据。这是非浏览器复现；齐射实际失败分支及状态到期仍待实机。

新增回归使用当前正式 workflow artifact，检查独立恍惚、模板实例化、错误状态拒绝、相同名称和相同机制标记的旧 Actor 不被接管、伤害 Hook 仅减免绑定龙兽、移动 Hook 仅限制绑定晶体、缺绑定前置拒绝及 stop 清理。模拟环境结果不代表真实 Token/Document 保存。

## 来源语义与已有证据复用

当前重新生成的两 artifact 已人工对照来源：龙兽巨型龙、AC19/HP176/14d12+42、六维23/14/20/16/19/18、先攻敏捷2加bonus10为12、四种速度、指定熟练与三语言、五状态免疫、15能力；晶体中型构装体、AC17/HP15、六维10/10/10/1/10/1、全速度0、3能力。

三原生攻击仍以武器 base 与 `includeBase=true` 表达来源主伤害，附加心灵伤害分别2d8/1d8/1d6；力量6加熟练5为+11。吐息WIS18/6d10力场/60尺锥形/成功半伤/恐慌60秒/充能5–6；齐射CON18/2d8心灵/2传奇动作/失败恍惚，恍惚按目标下回合结束移除；晶体DEX18失败2d6穿刺，独立CHA18腐化，成功不触发后续。来源的首次腐化与重复失败分支、守护严格超过20的阈值、碎裂至自身下一回合及耗尽削弱均保留。

两份 `verify:actor` 均退出0，warnings/sourceIntegrityErrors 空。最后一次修改只影响宏，Actor artifactHash 与已通过 verifier 的版本相同，复用其证据。Source raw bytes/hash 与 workflow 注入 sourceId 后的 request hash 分开解释，后者不作为原文件字节 hash。

2026-09-12 独立宏2.0.2与2026-09-15固定配置路径的历史战斗证据只保留各自身份。当前改变了 UUID 绑定及恍惚桥接，不能沿用历史完整 PASS；不重跑未受影响的完整战斗矩阵。

## 本地 runtime 与工具层

只读核对：Node PID40952、127.0.0.1:30001、app `F:/FoundryLab/foundry-v14/app/14.364/main.js`、dataPath `F:/FoundryLab/foundry-v14/data/server-mirror`、当前世界 `fvtt-v14-module-matrix`、Core14.364/dnd5e5.3.3，HTTP status users=0。

磁盘安装为 Forge0.4.0、Custom Conditions0.2.0、Trigger Engine0.2.0、Injury1.1.0；候选 master 内 Forge 仍0.3.0。当前 importer/runtime/preparation/browser入口四文件与保留的Creator源码相同，但源码相同不能证明安装或当前客户端源码归属。实机前仍需核客户端 API/版本/载入字节及已启用模块。没有降级、替换安装或触碰其他任务的Creator功能。

首次会话的可调用工具清单451项中没有 `node_repl` js、`create_thread`、`send_message_to_thread`、`wait_threads` 或工具发现入口。配置 enabled、组件存在、独立 MCP 探测均不能替代可调用能力。没有手动 MCP、raw CDP、Computer Use 或其他通道代替 Chrome。

同版本官方 Chrome/Browser 缓存缺少技能文件，已先核 source/cache manifest 相同，再仅补回三个缺失文件并核 SHA-256。Chrome 正在运行、扩展已启用、官方 native-host检查 correct=true。没有修改策略、可信服务或权限配置。

会话刷新后，官方组件为26.930.31428，浏览器与原生任务接口实际可调用。父任务已在拥有的tab651338541完成Example Domain打开/正文读取→真实点击→IANA正文读取，并关闭该tab；收据 `chrome-capability-recovered.json` 取代旧的工具缺失结论，不代表Foundry业务接受。

此时旧PID40952与30001监听均已消失，未发现其他Foundry进程。只读核对cor-cotn world manifest与安装system均为14.364/5.3.3。恢复这一本地实例的 `Start-Process` 请求在执行前被自动审批审查拒绝，返回只有 `blocked by policy`，未提供更具体理由。`mirror-start-policy-rejection.json`记录该命令没有启动服务；没有改通道重试。

用户明确选择新建独立验收聊天；执行器 `01a0ff82-8040-73f3-9d43-8f5bea6dc556` 已创建。回调 `READY_FOR_SERVICE`：自身turn_context为gpt-6.1-sol/medium、never、danger-full-access，JSON/ZIP哈希匹配，官方Chrome打开/读取/关闭拥有tab651338548通过，remainingOwnedTabs为空；原生回调已发到正确父UUID并由父任务读取收据。服务端实际模型未独立观察。首次合同仅核前置，未启动服务或修改世界；服务由用户/owner恢复且父任务发送新执行指令后才进行E2E。不轮询执行器。

完整CI首次被会话中断在Bun1.3.8的Knip循环检查，不能当作CI通过。相同Knip安装包的Node官方入口独立退出0；仅将`architecture:cycles`调用器改为Node，保留全部参数与检查范围。恢复CI通过环境、手册、类型、架构和Session Monitor构建，随后Species CLI的一个子进程15秒无输出超时：23通过/1失败。没有扩大Species支持范围或放宽超时；同输入安全入口 `test:cli` 聚焦复查24通过/0失败，原失败保留在 `ci-verify-recovered.log`。

最终 `bun run ci:verify` 实际退出0（`ci-verify-final.log`）：全部类型与架构检查、测试与coverage门、432来源anti-overfit、仓库hygiene、5.3.3/current-6参考、Web build及White Tusk Shaman离线smoke均通过；smoke为6来源物品、0 verifier警告、0网络调用。此CI PASS不关闭Foundry业务门。

## 分层门与接续

| 门 | 结果 |
| --- | --- |
| 当前来源→workflow→artifact 与人工语义 | PASS，仍 needs_review |
| 两份 source verifier | PASS |
| Forge 聚焦回归 | PASS：513 tests / 2176 assertions / 0 failures |
| typecheck:tools / typecheck:packages / architecture:verify | PASS |
| 最终完整 ci:verify | PASS，退出0；原中断和一次CLI超时单独保留 |
| 手册、指令、diff与本地提交 | 手册30项、指令34项及diff检查PASS；提交见最终收据 |
| 官方 Chrome 最小往返与独立执行器 | PASS：父连接与执行器配置/连接/包身份；执行器READY_FOR_SERVICE |
| 实际包预览/导入、确定性 ID、宏 UUID绑定读回 | NOT_EXECUTED |
| 新 UUID 的代表守护链、同名旧 Actor/Token 数据不变 | NOT_EXECUTED |
| 修复后的实际齐射恍惚/到期和 Custom Conditions 识别 | NOT_EXECUTED |
| 本轮 owned对象清理、原view/active/paused与设置重载恢复 | NOT_EXECUTED；没有创建世界对象或改原状态 |
| 生产、其他版本、长时及全部战斗矩阵 | NOT_EXECUTED |

接续只从工具最小往返和本包真实导入门开始。普通玩法使用 `cor-cotn`；只读确认服务占用后按 Foundry Ops 世界规则协调切换并恢复原matrix，不停止常驻进程。先保存现有 Actor/Token/Scene/Combat/Macro、view/active/paused与设置的业务基线；同名旧样本若需要新建，由测试拥有且单独记录，既有文档不改写。通过正式 Forge UI 导入本候选、读回表中 ID与绑定、启动宏，证明新龙兽40伤害→20而同名旧龙兽不减免，旧晶体移动不被拦截。仅增加受修复影响的一次齐射失败、状态实例识别与到期检查；不重跑整个矩阵。

按精确 owned清单停止本客户端宏、清理新文档和消息、恢复世界与本轮设置/模块开关并重新登录读回，保持用户/owner恢复后新核实的服务进程。PID40952仅为历史身份。完成后再更新本记录、执行合并门；未实机验收前本 topic 不合入master。

外部证据根：`H:/CodexData/visualizations/2026/10/02/01a0fdf7-35f6-79c3-b1c5-4812d1a8f54d/crystalbleed-v14-close-20261003`。关键文件为 `candidate-receipt.json`、`semantic-source-readback.json`、两个verifier log、`forge-encounter-tests.log`、`runtime-identity-readonly.json`、`official-skill-file-restoration.json`、`self-turn-context-receipt.json` 与 `installed-forge-source-comparison.json`。机器证据没有进入仓库。

## 用户要求重启前暂停

用户于2026-10-03要求在合适检查点停止，重启电脑后再继续。当前源码与证据已冻结，最终CI已完成；独立Chrome执行器完成前置后已结束回合，没有监听或轮询。本轮没有启动Foundry或写世界对象。保存本地topic提交后暂停，不合入master、不push、不清理候选或旧树。重启后从服务身份与实机导入门接续，复用已有执行器和本包，不重做已充分的静态检查。
