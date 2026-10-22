# Forge：完整 Vampire 与本地 Foundry 验收

日期：2026-10-20。沿用 `20261019-forge-ab-fixed-replies` / `codex/20261019-forge-ab-fixed-replies`，基线 `f637f77f28c086e34297513e5293f98b3835f2e9`。前批为[中立攻击与身份引用](2026-10-20-forge-neutral-attack-and-identity.md)，当前入口仍为[当前 MD](../plans/2026-10-20-forge-ab-current-state.md)。

## 授权与顺序

用户授权先补齐完整 Vampire 离线正式链，验证通过后直接做本地 Foundry 验收；不新增真实模型调用。本批允许精确本地候选构建/安装、正常服务启动、GM 创建及清理本任务测试文档。没有生产、提交、合并、push、Core/系统升级、备份或直接编辑 LevelDB。

第1步必须通过后才能进入第2步写入。整只 Vampire 的新契约输入独立编写，原始完整来源、14 个来源单元和冻结回复/评分均保持；最终 Actor 来自 V2 → IR → renderer/parser/workflow → generation/verifier → encounter preparation，未手写最终 JSON。

## 第1步：VERIFIED

编号和唯一完整原文名两种引用均通过实际 mod 的 human-MD encounter 入口，达到 `ready_for_gm_review`，正式来源接受、整包 `prepared`。完整源 SHA-256 为 `df2887243768f2b0949098e86289f67cdae94fd945450f6e21f4674177677611`；每个正例 3 次 fake transport、0 真实 HTTP。

- 6 Traits、5 Actions、3 Legendary Actions 全部完整；最终 15 Items 包含另一个完整限定抗性 GM Item。每个 Item 的可见原文、来源身份和 coverage 实际逐项核对。
- 原生抗性仅 necrotic；非魔法攻击的钝击/穿刺/挥砍限定完整保留，不能变成无条件抗性。
- Unarmed Strike 为 +9、1d8+4；Bite 为 +9、1d6+4 piercing 与 3d6 necrotic，完整恢复量关系、生命上限、长休、死亡和衍体规则保留，无虚假 Heal。
- Charm 保留 DC17/WIS、30尺及可见条件；Weaknesses 保留两份来源限定的20点伤害，GM按条件使用，不自动施加效果。
- 传奇总额3、Move/Unarmed Strike/Bite 成本1/1/2，独立3/day与1/day次数完整。手动能力的费用标签和计数不赋予自动消费/移动。
- Bite 原填写目标数量1保持；完整 one-willing-creature 等复合资格在 `target.special`，原生 `count` 为空，由GM选择一个合格目标。不得宣称原生强制数量1。

每种正例的14项 IR/最终产物篡改反例均拒绝；另7项完整输入反例拒绝错误动作、过期编号、未绑定译名、目标遗漏、错误数量、错误预算和缺来源单元。父控重算源/文件 SHA，逐项核对完整来源、coverage、可见 Item 规则和传奇资源后接受第1步。

首份编号版证据位于任务私有目录 `.local/forge-v2-bw-integration-20261020/whole-vampire-new-contract-id-2026-10-20T07-20-06-759Z.*`，原名版为 `whole-vampire-new-contract-name-2026-10-20T07-20-07-434Z.*`。各有原文、填写表、IR、渲染MD、正式Actor、标准整包、请求、报告及含哈希收据。它们不改变原冻结 R4 整体阻断结果。

## 本批发现与修复

完整 R4 需要既有显式来源行分区，后续检查却重做整源自动切分并失败，使合法 qualified header 被当作缺文。现复用既有独立 `sourceStatHeader` 验证物理头部；基础阶段仍禁止模型填写能力，只在独立验证投影加入程序编译的完整 header 和精确 claims/coverage，最终组装与完整 validator 仍严格执行，不跳过错误码。

反例还暴露三处验证缺口，均已修复并保存原失败日志：

1. 可见 Item 描述被修改时，旧投影借用未改的 Activity chatFlavor。现在单独验证 Item 可见原文。
2. IR 传奇总额与 claim 同改/同时删除时，自动切分失败使来源预算未核对。现在从物理 Legendary Actions 标题到首个已识别能力边界独立绑定完整前言，复用原预算解析器；不借模型 coverage。
3. 默认成本1的手动/SourceOP传奇能力提前返回，未比较最终费用。现在在共同边界按既有生成默认值1或明确费用读回，不能因IR省略字段而失去检查。

独立只读审查无新增 P1/P2；未替代执行证据。来源 fallback 仍受已识别物理标题范围约束，不宣称任意排版已支持，也未扩展旧 ledger 语法。

## 第2步业务：VERIFIED

精确本地目标：`F:\FoundryLab\foundry-v14\data\server-mirror`、`cor-cotn`、`http://127.0.0.1:30001`、Core14.368 / dnd5e5.3.3。父控在确认无其他 Foundry 进程或端口占用后，用正常 build 安装16个候选文件，再由既有 `foundry:ops lab launch server-mirror` 启动 PID30932；未升级 Core/系统、未创建备份。初始候选SHA `d995b8723626887700994b6be4e9402991b6534885d92c5d3e79ce404f1533a3`；实机修复后的最终SHA为下文506候选，初次安装收据保留。

官方 Chrome 同任务执行器实际 `turn_context` 核对为 gpt-6.1-sol / medium / danger-full-access / approval never。一次空密码登录 Gamemaster；原生设置显示 Core14.368、系统5.3.3及80启用模块，Forge工作台打开。Mirror MCP独立核对同源/同世界/同系统，只有测试GM活跃。初始化时DOM helper超时，官方同连接AX接口成功；未更换浏览器或绕过安全策略。

以下保留准备与中间发现；最终业务证据已完成，见后文实际使用与刷新。使用正常 Macro 编辑器创建唯一只读原生读回宏，再从正常 Forge 战斗包预览/GM确认/导入；不会调用模型。输出工具初版因 DialogV2 序列化丢失 textarea.value 而空白，已在同一宏保存完整 defaultValue/textContent 后补读；未因此重建服务或先导入角色。最终以 baseline、导入后、实际操作后、刷新后原生文档与截图，以及精确清理后的读回为准。

两个测试 Actor 预期 ID 为 Company `5a5e88889d7300dc`、Vampire `3b611eacc578fccc`；baseline已证明不存在，再正常导入。读回工具 Macro 为 `41xn78xUkwPzFdrm`，所有任务对象待父审证据后精确清理，常驻服务按既有约定保留到关机。后续结果在本节更新。

## 实机发现、修复与有效证据保留

Company首次预览通过，但导入预检报 `Unbound source-operation Activity cannot enter the independent-activity import adapter`。旧runtime适配器要求OP和Activity类型/关系一对一，无法接收中立Attack对应的Utility主检定和Damage follow-up。修复要求同一唯一OP id、完整来源、明确role/kind/未分类标记及半伤元数据一致，并严格要求一个主检定及应有的一份伤害；非中立旧检查、未知Midi版本拒绝和独立操作防自动串联字段保持。错误role、类型关系、半伤元数据、重复和缺损仍拒绝。针对性与既有Midi组78pass/0fail/899断言、模块types通过；独立增量审查无P1/P2。

失败前的来源/预览证据保留。原生读回确认该预检失败未留下Actor/Token/聊天，318 Actor和180世界Item索引未变，没有覆盖既有文档。修复只静态更新精确模块文件，进程30932未重启；新候选SHA `506845d93f353679b3612f2fa7c84a725907b116730189046db3bbc94bf2ddc9`。同一个Chrome tab刷新载入新候选，重读实际服务字节、目标和基线后复验受影响入口。

修复后的两个标准包都经正常Forge UI导入成功。`native-after-import.json`显示Company8 Items、Vampire15 Items；父控重新从源包走prepare/generation，核对原生Actor语义及各自包hash/身份均通过，非任务Actor、世界Item和Macro索引保持。实际Macro索引95包含唯一临时读回宏；原基线为94。

Company首个点击名称未执行活动，原生读回确认零消息/零数据变化；核对精确5.3.3模板后使用真正的 `data-action="activity-use"` 图标入口。原生Utility掷出 `1d20+10=25`，只有一条对应消息，没有自动伤害。后续独立Damage初次使用被当前AC5E/Midi的场景Token/目标前置阻断，保留错误与零伤害/零数据变化证据；未更改模块设置或猜测产品故障。

为补齐这项实际前置，父控通过正常Mirror Token API仅创建两个隐藏的owned Token，在同一landing-page场景 `EBJYd289N5uyTmlC`：Company `THKDdxfZ1XUkjAYO`，Vampire `EXIYO4HN6ESsvfR8`。它们来自正式导入的Actor原型，Vampire处于Company占格内；原7个Token及位置、场景尺寸和当前场景不变。全量场景前清单与创建收据保留。只对这两个Token选择/指定目标，继续实际伤害/攻击和刷新读回；不使用现有玩家Token。读回宏仅增补owned Token的合成HP/资源/次数，避免用世界Actor未变冒充非链接Token未变。

## 整合与冻结结果

本轮检查使用隔离的 Bun1.3.14，符合当前 CI 锁定值；下载来自[官方固定发布](https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14)，资产 SHA 与 release digest 一致，未改全局 Bun/PATH。原默认1.3.8下的中间失败日志保留，不作为最终验证。

| 检查 | 本轮实际结果 |
| --- | --- |
| `test:forge-v2-bw` | 71 pass / 0 fail / 1509断言 |
| `test:forge-staged-manual` | 261 pass / 3 skip / 0 fail / 1253断言 |
| `test:forge-native-basics` | 1230 pass / 0 fail / 8047断言 |
| packages types；新测试/helper专用 types | PASS / 0诊断 |
| 4个改动生产源码 anti-overfit | PASS |
| Forge browser build及内置manifest/禁止依赖检查 | PASS |

上批5项area失败是当时结果，本轮实际native不再失败；运行时与产品代码均改变，不未经有效对照归因于其中一项。旧HEAD预加载器缺当前中立公共出口，本轮对照在初始化报错，未执行业务；该工具失败单独保留，不作新的HEAD业务结论。上批全量types21诊断与独立v12夹具失败记录仍保留，不以本轮局部通过冒称全仓CI绿色。

最终24冻结回放仍9份完整候选接受并prepared，Company/Vampire原完整候选全部阻断；另15能力切片prepared，完整伤害/DC篡改均拒绝，343文件SHA保持。真实HTTP0、fake transport54。最终报告 `formal-replay-2026-10-20T07-26-16-863Z.json`；历史首答BC9/12、BW6/12，窄规范化9/12、8/12均不改。没有新的真实模型准确率、速度、费用或用户干预测量。

## 实际使用与刷新：VERIFIED

只将确切owned目标Token设为可见后，Company独立Damage一次成功：`10d8+4=53`，消息 `dLERq1B3HmOOEvve`；之前Utility消息 `f2XzSI1j9CjNNTY2` 为 `1d20+10=25`，未自动触发伤害。Vampire正常Bite提示并实际掷出 `1d20+9=20`（自然11）、`1d6+4=6` piercing与 `3d6=16` necrotic，共22，消息 `JBDeB7HCTtgTXk6R`。这里验证原生操作，不把GM条件半伤、命中裁定或动态治疗宣称全自动化。

World Actor HP225/144及非链接Token合成HP211/142均保持各自基线，未生成Heal、自动改HP或HP-max。传奇总预算3/spent0、Move/Unarmed/Bite费用1/1/2及独立Resistance3/Children1保持。独立与共享消费的自动化反例由正式链回归证明；本次GM手动传奇按钮没有消耗，不能宣称已测自然传奇资源消耗。

完成操作后有意刷新一次。`native-after-use.json`与`native-after-reload.json`中两个完整Actor、两Token及3消息相同，当前源包/包hash/候选SHA一致；父控分别重新走正式prepare/generation及`assertActorSemantics`，全部Item、资源、可见来源和非任务索引核对通过。Company完整0尺/Bloodied/Grappled/附赠动作逃脱与Vampire完整HP-max、量值关系、长休、死亡及衍体仍可见；截图 `company-after-reload-card.jpg`、`vampire-after-reload-card.jpg`、`vampire-legendary-costs-persisted.jpg`保存原生UI。业务成功不撤销前置失败证据。

清理对象严格限2 Token、2 Actor、3条自有掷骰消息和1读回Macro；已按先Token后Actor执行正常API删除并读回原7Token与318 Actor/180世界Item。最终消息/宏通过正常UI执行一次严格allowlist的清理Macro后删除，并在同一次执行中生成自删除后的原生快照。父控核对 `native-after-final-cleanup.json`：318 Actor、180世界Item、94 Macro索引回到基线，两个owned Actor为空、tokens/messages为空、helper ID不存在。最终Mirror场景与创建前完整JSON相等，原7Token/位置/可见性/场景尺寸与元素保持。官方Chrome最终确认原场景、暂停和5日9月836年01:10保持，仅关闭任务tab；独立进程/端口复核PID30932及30001仍在。全部本批恢复完成，保留当前本地Forge候选安装，不停共享服务。

## 最终记录与范围

受影响runtime适配器局部anti-overfit通过；手册7个watch条目按实际入口和权威来源分别人工核对，33项build/check通过，生成HTML嵌入数据也已解析核对。未改变CLI/Item/Species入口或扩大版本范围。36项原始受保护基线中35项SHA未改，package脚本改动为本批授权检查入口；343冻结文件、4份历史语料JSON全部SHA保持，冻结回放的23个生成源码hash仍匹配当前实现。旧报告/收据没有覆盖。

最终汇总收据为 `.local/forge-v2-bw-integration-20261020/whole-runtime-final-receipt.json`；Chrome独立返回 `chrome-final-receipt.json`，父审分别为 `native-after-import.json.parent-review.json`、`native-after-use.json.parent-review.json`、`native-after-reload.json.parent-review.json`，清理原始证据为 `native-after-final-cleanup.json` 与 `native-scene-cleanup-parent-20261020.json`。保留中间失败，不以报告或清理代替业务结果。本批1→2完成，没有新增真实模型调用、生产写入、提交、合并或push；原始Company/Vampire回复的真实遗漏仍阻断。真实新请求质量、性能、费用和干预改善未测，任意来源/其他版本/生产与全仓CI均不因本次获得通过。
