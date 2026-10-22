# Forge V2/BW mod 接线与冻结回复正式链

日期：2026-10-20。当前续接入口是[当前状态](../plans/2026-10-20-forge-ab-current-state.md)。本报告只接受源码候选及已执行的离线层；最终目标仍是可靠、更快、更省、减少用户干预的 Foundry Forge mod。

## 授权与候选

用户明确要求按当前MD实施，把V2/BW接进mod，用已有冻结回复验证正式链。唯一实验树 `20261019-forge-ab-fixed-replies`，起点 `f637f77f28c086e34297513e5293f98b3835f2e9`。未改受保护原树，未调用真实模型，未安装/操作Foundry，未提交、合并、push或部署。

实际产品调用为战斗包 `createEncounterIntakeProviders` → provider `extract` → `runStagedMonsterExtraction(featureMode:'whole-v2')`。基础属性仍单独请求，特性全量一次请求，不使用A快路径缩小模型任务。普通单怪、Item、Species入口保持原策略。

新V2 owner在 `packages/intake-ai/src/category-form-v2.ts` / `category-form-v2-adapter.ts`：保留冻结字段与提示含义；JSON/YAML严格身份与完整性检查；合法单属性格式规范化；同父原文的操作/目标/条件/资源绑定；法术沿现有来源组及manifest消费者。原始回复在解析前进入原有可选私有sink，不静默回退A，不增加模型逐字段重抄proof的步骤。阶段记录区分实际HTTP、程序组装、格式改写与派生基础事实。

接线时修复的必要消费者差异：

- BW仅在基础来源验证后为缺失PB补既有CR公式，生成derived claim；显式错值仍拒绝。红龙曾在正式源核对被豁免/技能漂移挡住，未改来源或期望值刷过。
- BW的单操作Self区域需由既有来源证明，避免旧粗粒度范围比较把半径当成可移动落点；旧A省略选项时保留原行为。红龙Wing Attack最终为Self、半径15，传奇代价2；没有伪造ft15落点。
- 来源主体后的aware/unaware并列修饰不再被并入距离原点；Actor身份仍核对，target/flash/statue反例拒绝。
- 单值Recharge6、普通失败状态Save、准备法术/法术位、已有受限人工授予及法术攻击加值通过来源契约接到原消费者。非原生固定恢复仅在同父数值、类型、目标明确时保留GM完整原文，不造Heal按钮。

## 冻结首答回放与结果

回放经过真实浏览器运行库的实际provider工厂、基础验证、V2适配、IR validator、战斗包renderer、正式workflow/generation、Intake/Actor来源verifier及整包准备。不是旧CLI helper的替代成功。

| 来源 | BW三份冻结首答 | BC三份首答的离线合并对照 | 实际边界 |
| --- | --- | --- | --- |
| R1 Giant Boar | 3/3正式来源通过、整包prepared | 3/3同链通过 | Charge条件伤害与follow-up Save、目标条件、Tusk和完整原文保留 |
| R2 Mezzoloth Company | 3/3拒绝 | 3/3拒绝 | 来源只说Melee Attack Roll，现行契约要求武器/法术分类，报V2_ATTACK_CLASSIFICATION_UNSUPPORTED；不能猜成武器攻击。半血倍率仍是后续兼容缺口 |
| R3 Ancient Red Dragon | 3/3正式来源通过、整包prepared | 3/3拒绝 | BC两份将Tail引用展开为本项攻击，无法用同父原文绑定；另一份转述增加未被本项证明的数字。BW保留原引用、恐惧Save、充能、传奇共享前言与代价 |
| R4 Vampire | 3/3拒绝 | 3/3拒绝 | BW第1/3轮实报V2_TARGET_OMITTED；第2轮先遇V2_HEALING_TARGET_UNSUPPORTED。BC第2轮目标遗漏，第1/3轮动态治疗未支持。原语义审查已指出BW三轮徒手攻击漏生物，当前较早阻断不等于其他漏项不存在 |

这是**当前适配后的正式链状态**：BW6/12、BC合并3/12。不是新模型质量实验，也不重算旧表格9/12、6/12或格式副分析9/12、8/12；失败包括真实内容问题与当前兼容限制，两者不能混为模型准确率。

回放前置与证据变换均明确记录：

- R1/R2沿用保存的基础事实。R3/R4原实验没有基础调用，新增来源头部fixture并通过实际基础来源校验；它们不是旧模型回复，也不证明基础提取准确率。
- R3/R4冻结特性编号与现程序编号不同，只按唯一同名、同源完整正文做编号映射，保留原始reply.txt哈希、映射表与改写说明；不修改规则字段。BW无需编号变换时逐字注入原始JSON首答。
- R4来源切分用冻结的完整特性/共享前言及真实分区标题推导行归属响应，经过现有line-partition gate；不重新生成、截短或改写来源。
- BC只将原分类首答合并为一次离线输入来检查兼容，不代表真实BW请求或速度/费用。
- 全24候选使用54次fake transport往返（含基础及R4分区），**实际模型HTTP为0**，无repair/retry。9份实际通过候选均在篡改最终Actor伤害后被独立verifier拒绝。
- `first-evidence-freeze.json`的343个文件逐个SHA-256一致，原始失败与计分未覆盖。

完整回放原件：`.local/forge-v2-bw-integration-20261020/formal-replay-2026-10-20T04-39-01-433Z.json`。包含每候选IR/MD/Actor或诊断、原首答哈希、身份映射、实际请求/阶段、基础fixture来源与篡改拒绝。收尾另保存final-receipt，绑定原件与当前候选文件哈希；这些私有测试原件不进入手册内嵌sources。

## 检查与限制

- `bun run test:forge-v2-bw`：28通过，0失败，148断言。
- `bun run test:forge-v2-bw:affected`：308通过，3跳过，0失败；跳过的是依赖未配置外部保存样例的既有3项，不冒充运行。
- `bun run test:forge-v2-bw:bundle`：3通过，0失败；实际构建、禁止Node/Bun依赖扫描、prepared provenance和确定性安装包/manifest检查通过。只构建，不发布或安装。
- `bun run typecheck:packages`、模块自身`typecheck`、`bun run architecture:verify`通过。局部anti-overfit通过；新增源码显式覆盖另记录在收尾收据。
- 较大`test:forge-encounter`结果632通过/1失败：既有v12篡改测试在 `renderer-verifier.test.ts:823`访问不存在的 `claw.system.damage.base`。定点复现同一失败；对应测试、parser/generation/renderer/verifier源码与HEAD无差异。本轮不顺带修该旧夹具，也不称整个大组通过。
- `typecheck:all`仍退出2，原有21条诊断只在既有 `forge-broad-rule-regression` / `forge-common-source-operations` 回归文件；新适配、接线和新测试0诊断，保持A原有边界。
- 手册已核对受影响七条、更新BW候选和兼容限制，review/build/check通过（33项工具）；未缩小watch。局部anti-overfit的9个改动源码及显式指定的3个新增源码均通过。

最终读回：24候选、9份通过候选的整包准备及篡改拒绝、343份冻结文件、26个文档相对引用均核对通过。此前36个既有dirty/untracked文件中，仅已授权增加测试脚本的根package.json发生变化，其余35个路径及内容哈希保持原样；本轮新建源码、测试、说明及生成手册另列，不把旧dirty变成可清理内容。

独立只读复审发现的单Recharge及施法能力退化已修复，复审未发现新的P1/P2阻断。机械通过不证明任意模型或来源可用；复杂条件、动态治疗、未分类攻击、跨特性展开等仍按上述边界阻断或保留GM规则。

**NOT_EXECUTED**：新真实模型请求、真实端到端耗时/账单、Foundry安装/导入/投掷/重载。历史31.879%提速和28.857%估算节省仍只属于旧填表实验，不推广成整个mod收益。本轮没有引入新的付费请求或要求用户增加逐字段人工抄录。
