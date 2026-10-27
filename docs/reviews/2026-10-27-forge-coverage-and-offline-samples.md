# Forge 现有覆盖盘点与非 Foundry 补测建议

日期：2026-10-27。工作树 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`，HEAD `a6591c0`，含本聊天已验证的空记录接收修复。产品当前状态以[唯一入口](../plans/2026-10-20-forge-ab-current-state.md)为准。

用户原话：“行，先盘点现有测试覆盖和证据，列出真正的缺口，再给出非 FVTT 环境下建议补测的样本和模型调用上限。已有通过结果直接复用，”

本轮完成只读盘点并写入本报告，没有执行测试、模型请求、浏览器或 Foundry 操作。下面的样本与调用额度是助手建议，尚未执行或获准消耗。产品源码、冻结原件、安装候选包不变；不提交、合并或推送。

## 结论与口径

1. 当前已有证据覆盖普通攻击、双伤害、近远互斥模式、范围豁免、充能、各自／共享施法次数、成分豁免、法术升环、传奇资源、条件易伤、中文复杂规则及候选／保存保真。不能把最近四只当成全部覆盖，也无须为这些已有结论再次请求模型。
2. 空记录修复已完成。真正适合新首答补测的是尚未见当前完整提取链实际材料的特殊规则组合，以及同一文本内多生物的真实发现／分区。缺证据不等于已发现程序错误。
3. 建议一批 **5只生物、4份输入、最多6次模型服务HTTP**：3份单只各1次提取；1份包含2只生物的文本最多1次发现＋2次提取。全在本地走正式 provider／分析／renderer／workflow，不启动 Foundry。
4. 本批只验识别、提取和 Actor 生成。配套自动化配置、完整召唤包、实际创建／施法／保存不混入这6次预算。安装候选的最终 Mirror 接受仍是独立运行时事项，不能用新模型样本替代。

### 如何复用

分开记录：真实模型首答、同回复程序修复后的结果、人工明确受控输入、Foundry 创建／活动／刷新证据。相同来源反复请求不当成独立怪物覆盖，修后成功不改写首答成绩。测试文件存在只证明有对应断言；没有执行收据时不称“已运行通过”。

最新接收修复只整理缺省／错层空记录，合法输入不变，并已验证完整产物及正式草稿保持。因此未受影响的已验收生成与运行时能力继续复用。较早的分段／原文裁判入口只提供其已验证组件的证据，不冒充当前完整IR模型首答验收。

## 可直接复用的覆盖

| 范围 | 已有样本与有效结果 | 证据与复用边界 |
| --- | --- | --- |
| 单只路由、英文／中文来源 | Mage 与中文高等星之子使者各真实提取一次；单只0发现／1提取。中文首答直接生成；Mage目录式12法术首答经确定性格式兼容后，原答生成与实际保存通过。 | [单只直接提取](../acceptance/2026-10-25-forge-single-creature-direct-extraction.md)。不是只有英文被测；不把Mage后续修复写成首答无问题。 |
| 普通攻击、范围、双伤害、近远互斥模式、低CR与空栏 | Ankheg、Roper、Magma Mephit、Warrior Infantry、Mordenheim's Monster；分别覆盖攻击／后续豁免、伤害分项、成功半伤、充能、长矛近远模式及附赠动作。首答与修后结果分别保留，实际创建／刷新有证据。 | [四份SRD资料](../acceptance/2026-10-26-forge-review-disabled-expansion.md)、[最新四份](../acceptance/2026-10-26-forge-vulnerability-new-extraction.md)、[中英文新样本](../plans/2026-10-26-forge-new-sample-acceptance.md)。不再补一只简单爪击／吐息怪凑数量。 |
| 施法次数、共享池、成分、动作类型与目标限定 | Mage12法术；Unicorn的各1/日＋共享3/日；Spirit Naga各2/日、升环、免S/M；Oni随意／各1日、附赠动作、仅自身、成分与升环；Mi-Go各1日、全成分豁免与仅自身。 | 同上及[空栏／易伤／单GM页修复](../acceptance/2026-10-26-forge-empty-fields-vulnerability-repair.md)。Mi-Go单页复验不推广到多页面并发已解决；不重复它的正常单页生成。 |
| 传奇抗性、传奇动作与巢穴资源 | Adult Brass Dragon有一次新真实提取及完整正式链／运行接受；Unicorn基础抗性3无巢穴；既有Adult Green Dragon迁移和保存验证。 | [退化修复](../acceptance/2026-10-25-forge-regression-recovery.md)、[Unicorn及Naga](../acceptance/2026-10-26-forge-review-disabled-expansion.md)。不能把黄铜龙一概说成没有真实模型证据。 |
| 普通／条件易伤、完整手动规则 | Magma Mephit原生寒冷易伤；Rakshasa条件备注；Shambling Mound吞没与持续伤害；Roper独立触须／拖拽；Mi-Go与Mordenheim's Monster中文复杂资格和动态后果。 | [修复及实机](../acceptance/2026-10-26-forge-empty-fields-vulnerability-repair.md)、[最新首答](../acceptance/2026-10-26-forge-vulnerability-new-extraction.md)。最新V49罗刹原答在本轮修复后正式生成；较早受控添加备注不当成模型原答正确。 |
| 条件、期限与GM边界 | Lurker固定两轮原生效果、受擒／束缚／挣脱交GM；Vampire2024的Bite、Charm、Beguile、3/4资源与复杂余项有后续正式链／实机证据。 | [条件验收](../acceptance/2026-10-25-forge-literal-condition-regression.md)、[Vampire后续接受](../acceptance/2026-10-20-forge-unified-boundaries-and-vampire-2024.md)。其中固定IR／fake transport证明程序和运行行为，不证明新模型提取。 |
| 问题可见、产物保留、恢复／导出 | 无产物明确失败；已有候选遇到检查或再次转换失败仍保留；真实v1/v2草稿、JSON导出与恢复清除已有接受。空记录新修复16pass、258断言；本轮4首答和2草稿实际执行，3个旧fixture跳过。 | [生成保留](../acceptance/2026-10-26-forge-generation-preservation.md)、[实际界面](../acceptance/2026-10-26-forge-mirror-generation-preservation.md)、[导出／清除](../acceptance/2026-10-26-forge-export-recovery-clear.md)、本聊天 `forge-empty-ledger-candidate/final-receipt.json`。不重跑这些共同流程。 |
| 批量、召唤、控制器的既有组件 | 队列刷新／重准备／采用，Spiritual Weapon正常摆放、移动、攻击、保存与刷新都有限定证据。 | [批量队列](../acceptance/2026-10-23-forge-batch-runtime.md)、[召唤运行时](../acceptance/2026-10-22-forge-spiritual-summon-runtime.md)。队列里的固定Mage不等于一份双生物文本经过真实发现；现成召唤物正常运行不等于模型能从新原文正确产出完整关联包。 |
| 安装包 | 0.5.1候选两次构建字节一致；16条目、CRC、manifest、SHA-256及构建目录逐字节一致。 | 本聊天 `forge-empty-ledger-candidate/tester-verification.json`。不重建包；当前包未在本轮安装到Mirror。 |

### 当前测试源码补充说明

- `tests/forge-structure-validation.test.ts`：闭合结构、来源／范围／引用、攻击／伤害／豁免／治疗、资源与非法字段，主要是人工固定IR。
- `tests/forge-single-creature-routing.test.ts`：single／discover、单只不追加发现、多只不自动取第一只、取消与边界；Mage及中文来源的冻结重放按环境变量加载。
- `tests/forge-spell-catalog-format.test.ts`：法术目录展开、归属、重复／失效引用、成分与幂等；含保存的Mage结果。
- `tests/forge-source-resource-pools.test.ts`：明确的非施法共享池、成员与消费；构造入口使用显式staged/fake，不能算默认完整IR的真实AI提取。
- `tests/forge-current-input-recovery.test.ts`、`forge-generation-preservation.test.ts`、`forge-empty-fields-vulnerability.test.ts`：正式草稿、失败保留、已支持表示及真实冻结结果。
- `tests/forge-encounter-intake.test.ts`、`forge-encounter-preparation.test.ts`、`forge-encounter-package.test.ts`：多生物成员、来源与宏绑定、ZIP／资产完整性；fixture和fake provider不代替真实发现。

本轮未执行这些测试，没有把历史日志数量相加成新的通过总数。

## 真正的缺口与非缺口

### 建议本批补的证据

**G1：同一份文本中多个生物的真实识别、边界与逐成员提取。** 当前找到的是离线路由、多成员fixture和单独文件的队列接受；尚未找到当前默认链同一完整文本经真实发现后，把所有成员分别正确提取的完整证据。需要核对名字、起止范围、段落归属、不重复发现、不把第一只当整份结果。

**G2：特殊动态规则在新原文首答中的保留与不过度自动化。** 普通伤害／次数已经覆盖；本轮所查真实首答未覆盖多头状态决定多攻／反应、分裂与装备腐蚀、储存任意法术并借用他人施法参数、形态限定和跨动作／长休条件。测试目标是基本按钮、明确数值及完整GM规则保真，不要求开发这些动态后果的全自动执行。

### 有限缺证，但不强凑本批付费样本

- 非施法的多个能力共用有限次数池：有结构与投影fixture，未找到合适的新2024官方NPC自然来源及对应当前真实首答。单能力2/日、法术共享池或断肢数量不是这个语义。本批不伪造官方样本，也不据此宣布功能已坏。
- 新本体＋独立关联召唤物的完整生成／控制链：已有组件及运行时证据，当前完整链新首答仍不充分。本批双生物文档只补G1，Shield Guardian的护符也不等于生成一个独立召唤Actor。完整包可能追加配套配置请求，需要具体来源和单独清楚的调用计算；不塞入当前6次。
- 最终ZIP的Mirror安装／运行接受：属于后续运行时关卡，离线样本不能证明；本次用户没有要求执行。

### 不列为新的阻塞或扩样理由

- 空记录原罗刹无Actor问题已修复；新报告不重开。
- CR `1/2`／`1/8`已正确生成保存；遗留格式提示与Oni引文提示保持，没有将它们写成生物生成失败。
- Priest／Gladiator有[后续正常创建与刷新证据](../acceptance/2026-10-24-forge-priest-gladiator-handoff.md)，Vampire亦有后续接受。旧分段、旧SourceAudit和旧步骤数失败不进入当前待办。
- Medusa没有在此次所查材料中找到完整当前运行接受，不等于确认当前仍失败；不按旧断字故障重放或重新付费。
- 原文没有明确结束时间时不补倒计时；明确的受支持持续时间仍保留原生数值。动态HP／生命上限、分裂及目标资格等复杂后果按既定范围保留完整规则供GM处理。普通装备不单独建库存、默认翻译维持原行为，也不列为新缺陷。
- 新提示词要求空claims／coverage；没有新的非空账本首答不是应额外付费制造的覆盖缺口。非空疑问及错误记录保留已由本轮确定性反例验证。
- 官方380份NPC是库存；本次没有全库来源—输出逐项账本，不能给出全官方成功率。

## 建议补测的具体输入

来源均为官方SRD5.2.1、2024规则。已核对的本地PDF为 `.local/forge-vampire-2024-retest-20261020/SRD_CC_v5.2.1.pdf`，SHA-256 `8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87`。来源身份亦见已有 `forge-review-disabled-next-batch/sources/manifest.json`。不是把带原生活动字段的官方Actor YAML直接交给模型；YAML只作独立参照。

| 输入 | SRD页码 | 本批要回答的问题 | 最大请求 |
| --- | --- | --- | --- |
| 九头蛇 Hydra，单只英文 | 300 | 当前头数与多攻、额外借机反应、掉头／长头／回血／火焰例外是否完整；保留基本咬击，不把动态头数写死成新增固定次数或虚构自动效果。 | 1次提取 |
| 黑布丁 Black Pudding，单只英文 | 265–266 | 腐蚀对非魔法装备的范围、分裂触发／体型／HP条件及均分取整是否完整；保留基础攻击，动态分裂交GM，不假造已自动创建的子体。 | 1次提取 |
| 盾卫 Shield Guardian，单只英文 | 323 | 护符关联、伤害转移的范围及取整、储法替换／施法者参数、保护反应和再生是否完整；“可储存某法术”不能凭空变成已授予的固定法术清单。 | 1次提取 |
| 拟态怪 Mimic ＋ 食腐怪 Otyugh，同一英文文本 | 308–309；313 | 首先准确找出两份完整statblock并保持归属；Mimic物体形态限定／抓取后的攻击条件，Otyugh两条触手／已抓目标／长休豁免及生命上限后果完整。两者参数、原文、候选身份不串用。 | 最多1次发现＋2次提取 |

这五种没有在本次所查当前验收／研究及真实首答索引中找到实际2024首答。已有同名synthetic／rewritten或2014规则fixture不作新首答覆盖，也不因此重跑它们。Purple Worm与Gelatinous Cube本批不选：吞没、约束和持续伤害已有Shambling／Roper证据，暂不为增加物种数继续扩展相近组合。已测中文三类来源直接复用，不追加翻译或中文来源请求。

双生物文件是测试用资料合集：拼接两个完整官方条目，规则文字不改，不声称二者原本存在召唤关系；不用会直接告诉程序分区的“Creature 1/2”特殊标头。准备时完整核对跨页／跨栏、只整理排版断词和页脚，冻结输入hash；合计保持在24,000 UTF-16字符内，保证发现只需要一个chunk。**本轮只定位原文和样本，尚未制作或冻结这四份待测输入。**

## 调用预算与执行出口

建议固定当前 `monster-intake-extract-v49-vulnerability-notes`、现有 DeepSeek/deepseek-flash 与已验证协议；开始前只读核对实际配置和本地来源。不得把下面的建议视作本轮模型授权。

| 阶段 | 上限 |
| --- | ---: |
| Hydra、Black Pudding、Shield Guardian单只提取 | 3 |
| 双生物文件发现 | 1 |
| Mimic、Otyugh各自提取 | 2 |
| AI内容复核／自动纠错／重试／翻译／配套自动化配置 | 0 |
| 模型列表／连接探针 | 0 |
| **模型服务HTTP总上限** | **6** |

计数依据：`packages/forge-browser-runtime/src/ai.ts:313` 的single跳过发现，`:335`进入一次extract；`encounterIntake.ts:260`至`:309`是发现／分区及逐成员提取。其`:381`还有独立的 `automationProvider.generate`，所以完整“生物与召唤物”流程不能笼统计成“发现＋提取”。本批使用现有公开发现／分区和单只分析／生成函数到Actor候选为止，明确不启动配套控制编译，不改产品入口或造假provider结果；不把该分段实验称为完整包或UI端到端接受。

最多6次是所有实际模型服务HTTP的硬上限，不只是成功结果数。使用已知模型直接请求，不先发探针或列表；若真实配置无法直接使用，先停在本地前置并说明所缺信息，不静默追加或挪用样本名额。传输层尝试上限1；取消、超时、HTTP错误、无产物都占已发请求，不补发。发现不是恰好两只、边界缺失／交叠或拿到额外成员时，不自行取前两只、不手改分区继续付费；冻结结果并停止双生物组。已生成的其他候选保留。

实施获准后的顺序：先完整冻结四份输入及逐来源预期核对点，核当前候选源码身份；3个单只依次提取并本地生成，最后双生物组发现／逐成员提取。每份原答先保存，来源核对后再开始下一份；若暴露同一接收／投影共用缺陷，就停余下请求并保留剩余额度，不边修边换样本继续花费。单例内容问题没有影响共同程序时可继续固定清单下一例，失败本身不扩大范围。

每份检查实际输出：基础数值、独立能力清单与全文、每项攻击／伤害／豁免／明确资源、实际法术授予及限定、复杂后果的完整GM边界、原始回复与IR／Markdown／Actor身份。结果分别写成“未生成”“已有候选但有内容差异”“来源内容与产物符合本例要求”；程序结构绿色不替代人工逐项对照。原本正确的规则不能因复杂后果退化成全说明卡。

本批完成即停止，不自动追加第二批，不重测既有导出／恢复／世界清理，也不把5只成绩换算成全库成功率。发现的新实际缺陷按类型和可复用失败原件报告，是否修复或需要新模型请求再按后续授权处理。

## 本轮证据与文件状态

本轮私有读回索引：`H:/CodexData/visualizations/2026/10/27/01a17adc-866c-7053-9668-326e795f4b96/forge-coverage-audit/evidence-index.json`。包含实际读回的报告／原收据／当前代码／源PDF路径与SHA-256，以及当前安装包和产品源码与上轮收据一致的核对。它记录来源身份，不将hash本身当成语义验收。

本轮只新增本报告并在唯一当前状态增加导航和授权范围；原报告、冻结原件、产品源码、测试、手册和安装包保持。文档没有改变用户操作、支持版本或产品行为，无需重新生成手册或执行产品测试。

资料归属：System Reference Document 5.2.1，Wizards of the Coast LLC，CC-BY-4.0。官方来源：[SRD5.2.1 PDF](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf)。本轮使用已有本地原件，没有新增网络检索。
