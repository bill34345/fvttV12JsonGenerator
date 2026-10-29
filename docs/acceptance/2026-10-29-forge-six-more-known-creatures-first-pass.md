# 第二批六只既有生物的新任务首答验收

2026-10-29。本批六次真实首答、来源/旧证据对照、正常Forge导入和统一刷新读回完成；精确清理与原世界恢复完成。只验证和报告，没有修产品/测试代码、提示词、原答、IR或最终Actor，没有提交、合并或推送。

助手提案：Balor、Medusa、Spirit Naga、Otyugh、Hydra、Gladiator，每只1次共6次模型请求，不复核、纠错、重试或投骰，保留原答和失败，发现问题先报告。用户原话：“行，开始处理吧”。本次只使用这6次新额度，与上一批六次分别记账。

## 用户结果

完全成功限本次生成、配置、导入及保存范围；没有使用能力或投骰。

| 生物 | 成功程度 | 问题点 |
|---|---|---|
| Balor | 部分成功 | Actor及攻击、伤害、原生传奇抗性正常，但正式验证报告因非法输出路径报失败。确认来自上一轮新增资源验证分支。 |
| Medusa | 部分成功 | 新原答把重复CON豁免误填为escapeDc13；GM可选束缚模板实际显示“逃脱DC13”，来源没有逃脱检定。 |
| Spirit Naga | 完全成功 | — |
| Otyugh | 部分成功 | JSON把非系统登记语言Otyugh放入原生value，实际卡片语言栏不显示它，只显示心灵感应。旧冻结Actor也是同一写法。 |
| Hydra | 完全成功 | — |
| Gladiator | 完全成功 | — |

没有整只生成失败：六次HTTP200/completed，六只均有Actor并实际导入。不能按程序formalStatus或有Actor单独判成功；本批formalStatus为1 failed、1 needs_review、4 accepted，以上分级依据实际影响。

## 已确认问题与归因

1. **Balor：上一轮修复引入的报告契约回归。** `packages/generation/src/verification.ts:481`在原生legres验证成功后把`actor/system/resources/legres`加入mechanicsCoverage.outputPaths；协议`wireSafety.ts`只接受闭合的documents字段路径，于是在正式报告投影阶段抛错。Actor仍保留，正常导入成功，实际卡片原生传奇抗性3次。原答中的uses3/day正确，不能归咎模型。后续应统一原生资源验证与报告路径契约，保留严格路径边界，并补真正经过正式报告投影的受影响入口检查，不能只测生成器内部验证。

2. **Medusa：新模型回答的机制误读。** 来源要求第一次失败Restrained、下一回合末重复CON13、成功结束、第二次失败Petrified；原答/IR同时给了escapeDc13，生成器照投影为模板“逃脱DC13”。作用是GM可选模板的错误提示，没有默认自动执行逃脱检定。其余攻击、伤害、范围、充能及完整阶段文字保留。后续应在提取契约中区分重复豁免和逃脱检定，不能为此新增整只Actor拦截。本批不修改原答或字段，不做纠错请求。

3. **Otyugh：既有的未知语言投影缺口。** 新旧原答都给values=[Otyugh]，旧冻结Actor同样把它写进原生value。锁定dnd5e5.3.3的prepareLanguages只显示已登记目录项和custom文字，实际卡片确实没有Otyugh。不是本批修改造成；本批代码没有变化，也不能把旧离线产物存在当作过去界面正确。后续应按语言目录通用处理未登记名称，完整保留到自定义显示，不按怪物名打补丁、不取消Actor。

**更正上一轮Unicorn分级。** 回查原件`forge-four-compatibility-fixes-20261029/six-replay-final/unicorn/generation.json`，其formalStatus已是failed，并有同样的unsafe output path错误。我此前只确认机械、导入和刷新正确，漏评了报告错误，因而“完全成功”结论过满，应更正为部分成功。原生legres3、同一资源消费、9Cast和保存正确的证据仍有效；撤回的是没有问题的分级，不能抹去已证明可用的配置。原报告及原件保留，本更正与当前状态优先。

## 不计为本批功能失败的记录

- Spirit Naga八个spellRefs没有逐条evidence，程序保留8条MISSING_EVIDENCE及needs_review；实际正常导入后自动解析出8Cast，INT/DC14、4随意、4各自2/day、Hold Person3环、Lightning Bolt4环及无姿势/材料组件规则都正确。该告警没有阻止施法配置，不据此降级。
- Medusa的部分Effect/Activity描述发生CRLF→LF规范化，原始换行差异及创建读回警告保留；LF规范化后全文相同，没有数值、限定或正文丢失。
- Multiattack的Activity缺省name有原生/Midi显示回退，不是不可见或不可操作，本批不列新功能缺陷。
- Hydra多头/再生/额外反应，Gladiator替换攻击/Parry，以及Otyugh长休后降低HP上限等复杂规则按完整来源交GM处理；不要求自动流程图。基础攻击、伤害、明确豁免和状态归属另核。Gear不进入Actor符合既有政策。

## 来源、请求及实际链

工作树`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`，分支`codex/20261019-forge-ab-fixed-replies`，HEAD`5dc5702767bbcb0818a05a02e45c925289e66758`。私有证据根R：`H:/CodexData/visualizations/2026/10/28/01a18034-1e26-7870-8d8b-041ab59fa313/forge-six-more-first-answers-20261029`。

R/sources.json逐份锁定旧来源容器、精确文本SHA-256、旧Actor及已定位旧原答。Medusa/Gladiator保留原CRLF，Otyugh/Hydra完整quote与旧rawSourceHash一致，Naga沿旧fixture完整source，Balor匹配旧IR source hash。Balor独立旧raw尚未定位，只保留确有的来源/IR/Actor，不冒充原答。最初准备时发现换行hash不匹配，仅修正私有读取方式，未发送模型或修改来源。

复用上一批单次runner，只有名单、证据根和新来源/请求身份变化。每样本ID发前wx保留，maxAttempts1，全部服务仅一次提取。模型deepseek-flash，Responses流式，提示词`monster-intake-extract-v52-official-status-effects`不变。原答与transport completed证据分别保留；发现、内容复核、纠错、重试、探针、模型列表、翻译、配套自动化请求全0。实际usage为input27668、output82811、total110479；包含服务返回的reasoning用量，不作不同样本成本优化结论。

六份首答均通过真实Forge公共AI分析/正式生成链取得候选，再由现有serializer保留完整artifact形成新身份导入文件，经正常Forge界面创建与Resolver配置。没有手写最终Actor或用旧IR代替新提取。Balor报告失败及所有原警告保持，未通过修数据或重跑改善首答成绩。

## 配置、保存及保留

Mirror此前停服，核对空端口及无Foundry进程后，按现有本地prepare启动原server-mirror：PID33972/30001，cor-cotn，Core14.368/dnd5e5.3.3，Forge0.5.1脚本hash`04f008a7538713f61b80613f66d1233d441d971a4454fb7b21922ffac9590345`。没有重建、重新安装或修改产品。官方Chrome内部执行器沿用sol/medium/fullaccess并核实际配置；用户生产8080页面未操作。

六只完整Actor在统一刷新前后逐ID严格相同，包含_stats、排除字段为空；原Item目录及description.value完整保留。父代理独立核对R/mirror/parent-refresh-validation.json，并查看Otyugh实际卡片截图；Medusa错误escapeDC和Balor原生3次均有实际界面证据。独立只读审核Medusa/Hydra/Gladiator见R/independent/final-three-review.json，父代理核Balor/Naga/Otyugh见R/parent-source-audit.json及运行读回。没有重跑已通过的旧测试矩阵。

最终六个测试Actor、观察器和任务页精确清理，七集合、世界时间、暂停和场景与当前批次基线严格相同，完整hash为`5904dc02ea8ab9f2807d6a856ae87b6eac5c9a0041c87b38517b544ab8e9a535`；用户页面及新启动的原Mirror服务PID33972保留。父代理独立复核见R/mirror/parent-restoration-validation.json。5761份受保护材料hash不变，产品和测试源码变化0，HEAD/分支不变、索引为空；详见R/preservation-final.json。所有新旧原答、失败、旧快照保留，不修代码，不发布。
