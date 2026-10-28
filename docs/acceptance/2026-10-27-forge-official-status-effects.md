# Forge 官方状态的 Activity Effect 投影

状态：2026-10-28 已完成官方状态模板、Activity 关联、手动应用入口及本轮限定验收。沿用当前worktree、`0da71b2`及上一轮全部未提交修复；不提交合并推送，不新增生成模型请求，不实际投骰，不重跑未受影响的旧测试。

用户原话：“像这类攻击会附加，或者说是豁免失败会附加的这些状态，都要做进对应的 activity 里面的 effects 里面。这样的话我才作为 DM 才可以快速点击”“如果这个状态是官方状态的话，那他是一定要处理的”“不然的话我还得进去，专门的去对应的 activity 里面，去自己手动在 effect 里面加这个状态的话，我觉得会很麻烦”。

本轮据此实现：来源明确附加的官方状态须形成真正的Item ActiveEffect并链接到对应Activity，DM可选择应用。额外条件、阶段或期限不再成为删除模板的理由；“DM判断何时应用”与“必须自行创建Effect”区分开。普通命中、失败豁免和独立命中后伤害按实际操作归属，不把同Item的所有状态挂给所有活动。复杂条件保留完整说明与可确定期限，不误报自动HP/状态生命周期已经完成。

## 复用与边界

复用旧CLI的状态模板、图标、稳定ID、duration和Activity.effects链接，以及锁定dnd5e5.3.3的原生Apply Effects入口。Aioros有attack/save状态关联可适配；另一个AI Importer的effects getter返回空列表，不把它当成状态功能证据。精确版本、旧CLI位置和上游核对见[来源复核](../reviews/2026-10-27-forge-official-status-effects.md)。

相位蜘蛛来源是本次伤害使目标降至0→稳定→中毒1小时→中毒期间麻痹；本例没有Save，不新增Save、不连接到GM攻击检定来自动施加。普通Attack/Save与基础伤害、次数保持。耗竭属于官方状态，但有级数，不能只生成一个status字符串就声称其等级已经生效。

Mirror的Midi14.0.11会覆盖原生聊天卡，`autoCEEffects:none`只控制Convenient Effects，不能拿它冒充关闭Activity自动效果；不改世界全局autoItemEffects。条件模板必须保留方便点击的应用入口，同时避免被全局自动流程提前套用。原生/Midi/DAE实际消费者事实记录在本轮私有证据，不凭无消费者flag宣称可用。

## 本轮最小验证

- 生成链新增针对官方命中状态、失败豁免/期限、HP0/依赖或阶段条件的真实生成检查；反例覆盖免疫、仅提及、解除及阶段归属；至少核对一个不相关Item/Actor未变。测试不复制业务逻辑。
- 修正旧“复杂状态必须不存在Effect”的受影响断言，只跑相关筛选。上一轮接收、法术恢复/环阶及旧46项无关通过结果复用。
- 用已有Phase Spider及受影响旧样本的冻结回复复验，保留原件；新提示与旧回复兼容分别记录，生成API新增0。
- Mirror通过正常生成创建，使用配置页和原生MCP核对Effect、Activity链接、触发/期限。可在任务对象上无投骰地验证DM手动Apply入口；不通过真实攻击、豁免或伤害掷骰证明字段正确，不改世界全局设置。
- 按实际修改范围完成类型、依赖、局部anti-overfit、构建和手册核对；最终读回后仅清理本任务对象，原世界与历史证据保持。

证据根：`H:/CodexData/visualizations/2026/10/27/01a17bee-ceb9-7eb3-8fce-a8320e15295f/forge-official-status-effects-20261027/`。`baseline.json`记录开工时156份已有文件/证据和49份冻结原件的hash，不制作源码或世界备份。

## 实际实现

1. 沿用 `CanonicalAppliedCondition` 和现有状态、图标、duration、稳定ID构造，接通 `SourceOperation.appliedConditions`。旧攻击中的 `failureStatuses` 不再被清空。支持全部15种官方状况及既有dead兼容标记；不是免疫、解除或前置条件的随意状态提及才生成新模板。
2. `Item.effects` 保留真实模板，`Activity.effects` 保存同Item内的真实链接。Attack命中状态、Save失败状态、中性GM攻击的伤害活动及明确的手动Utility分别归属。Save使用 `onSave:false`；中性攻击检定不携带效果，也不被改成武器攻击。
3. 明确的适用、逃脱DC、阶段、再次豁免和提前结束进入效果说明；能确定的数字期限仍进duration。复杂规则不再触发“删Effect才能通过”或整只Actor终止。麻痹、石化、震慑、昏迷显式附带失能；昏迷导致的倒地不绑成同一期限。力竭独立成GM模板，来源增加量单独保存，不在生成时修改Actor等级。
4. 正常Forge导入复用Midi14.0.11实际消费者。对GM模板设置DAE局部dontApply；只有活动全部链接均为GM模板时才设置该活动的自动效果条件为false。混合活动的普通效果以及外来效果保留原行为，不改全局设置。不是以自动化未完成为理由删除模板。
5. 聊天卡扩展原生 `effect-application`。从能力菜单“聊天中显示”即可选中Token并应用，普通活动消息另显示需要GM判断的模板。只接管带本项目归属标记的效果，不移除其他来源的原生操作。力竭调用官方 `Actor.update(system.attributes.exhaustion)`，按来源增加量累加；未给量时才在应用时填写，取消不改变角色。这不是生成审核，也不增加模型调用。

用户要求与实现对应：原话“做进对应的 activity 里面的 effects 里面”落实为真实模板加真实链接；“方便……快速点击”落实为原生Apply目标列表；“如果这个状态是官方状态……一定要处理”落实为上述15种官方状况的统一投影，不仅特判本次相位蜘蛛。复杂条件由GM选择何时应用是实现边界，不增添产物获取前置。

## 冻结来源与产物

| 样本 | 本轮结果 | 最新产物位置，相对证据根 |
|---|---|---|
| 相位蜘蛛 Phase Spider | Bite保留 `1d10+3` 穿刺和 `2d8` 毒素；一个中毒／麻痹／失能组合，3600秒，仅链接命中后伤害；完整HP0条件保留，无新增Save | `replay/phase-spider/actor.json`、`import-adapted.json` |
| Otyugh | Bite中毒与完整长休CON15／HPmax减少／成功解除说明；Tentacle受擒及尺寸、逃脱DC；Slam CON14震慑与失能；所有原攻击、伤害和后续Save保留 | `otyugh-source-correction/replay/otyugh/actor.json` |
| Mimic | Adhesive手动Utility与Pseudopod伤害均有受擒；Bite的受擒是条件，不误生成额外受擒。普通和替代分支仍分别是 `1d8+3`、`2d8+3` 穿刺加共同 `1d8` 酸 | `replay/mimic/actor.json` |
| 美杜莎 Medusa | 首次失败束缚、二次失败石化／失能保留分阶段GM模板及完整条件，仍使用原有Save，不在首次失败自动套石化 | `medusa-stage-correction/replay/medusa/actor.json` |
| 状态练习员 Condition Tester | 明确人工控制fixture，经同一正式链生成；WIS12失败恐慌60秒、近战命中力竭增加2级，用于原生Apply集成，不计为AI样本 | `replay/condition-tester/actor.json` |

原始四怪的狂战士、鬼婆及法术修复结果复用，不重新请求或重跑。上述旧回复分别保留原提示版本；当前提示版本为 `monster-intake-extract-v52-official-status-effects`，没有新增真实模型首答质量证据。全部回放外部HTTP为0。

CLI另以同一相位蜘蛛规范来源、v14/core/icon-off生成 `phase-spider-cli.json`。CLI退出2表示needs_review但文件实际交付；独立 `verify:actor` 退出0、warnings与sourceIntegrityErrors为空。CLI与Browser状态、期限、链接语义、伤害一致；技术Effect ID及配套链接不同，CLI关闭图标省略两活动图标，不声称字节相同。

与46项最终产物比较：Mimic、Medusa的Actor.system及除效果链接外的Activity一致；Otyugh的数字、活动、资源保留，正文／激活条件／来源标记去掉已无必要的“failureStatuses未映射”提示，完整原规则仍在。具体前后差异保存于 `final-evidence-readback.json`，不把预期说明变化说成字节一致。

## 实际 Mirror 验收，不投骰

目标固定为 Core14.368 / dnd5e5.3.3 / Midi14.0.11 / DAE14.0.12；使用本任务独立GM页、正常Forge标准资料生成和创建两只Actor，原世界及Next不用于测试。

- Activity配置、Effect模板及真实原生MCP均确认状态、时长、来源条件、伤害与关联。Bite伤害具有两段，GM检定无状态链接；普通失败Save保留 `onSave:false`。
- 从角色能力菜单“聊天中显示”打开资料卡，选中接收Token，直接点击Apply。中毒／麻痹组合实际产生3600秒效果，角色prepared statuses含中毒、麻痹、失能，HP22不变。
- DAE为组合额外生成三个autoCreated状态文档。后续只在正常效果页删除组合主效果，三个派生项自动一起消失，目标statuses与effects均为空；没有逐项手删派生项。
- 失败Save的恐慌模板实际应用60秒。测试预置蜘蛛力竭1级后点击力竭模板，官方等级变为3；官方 `dnd5eexhaustion0` 效果记录3级，原生MCP与界面“力竭3”一致，HP45不变。
- 刷新后结果仍在；三张资料卡 `rolls=[]`，Use／Cast／攻击／豁免／伤害投骰均0，未消费能力次数。预先存在的prepared `thinking` 无Actor Effect文档，未归因于本实现、未擅自清除。

主要证据为 `chrome/source-effect-configuration.json`、各配置截图、`poison-applied.json`、`dread-applied.json`、`exhaustion-applied.json`、`post-refresh.json`、`removal-readback.json`及原生MCP三份模板与力竭读回。`mcp-applied-combination.json`在已授权删除操作完成后才读取该ID，返回entity-not-found；这是读回时序证据，不改写成应用失败，也未为补这份重复取证再Apply。

## 本轮发现并修正的问题

| 实际发现 | 改法及必要复验 |
|---|---|
| 初次冻结Medusa的First/Second Failure标题未识别，最终石化变成普通native模板 | 复用阶段识别，完整阶段条件保留；只跑2项阶段检查并单独回放Medusa，原失败产物保留 |
| 同活动既有普通又有GM效果时，整体关自动效果会影响普通效果 | 只对GM Effect应用局部DAE排除；只有全GM活动才关闭活动自动施加，定向混合反例通过 |
| 手动聊天入口可能连带接管外来效果 | 按项目归属Effect逐项处理，未处理原生tray保留，定向聊天范围反例通过 |
| 同一句“命中倒地，随后豁免失败恐慌”把倒地也挂Save | 按对应状态之前最近的Hit／Save／Failure引导归属；原反例、交换状态、两个状态均命中及相邻独立operation回归通过 |
| Otyugh旧proof定位失败时，已有中毒模板的显示原文为空 | 只为已声明模板显示回用同能力完整来源，状态推导范围不扩大；只回放Otyugh并核对伤害链接、长休CON15及完整后果 |

最后两项只读复核均已关闭。以上是具体失败驱动的窄修，不新增多轮审核框架，也不重复无关通过矩阵。

## 检查与交付边界

首轮官方状态正式链21项／454断言；旧受影响断言32项／287断言；复合metadata旧断言1项／50断言。后续仅跑受影响阶段2项／74断言、关联与来源3项／105断言。导入／Apply初轮5项／17断言，新增聊天分组与范围用例分批验证，最后范围检查4项／18断言，未将筛掉的测试计为通过。完整日志及每次失败保留，检查理由与结果见 `core-receipt.json`、`association-correction-receipt.json`。

browser-runtime和Forge目标类型检查、生成侧及运行时局部anti-overfit、架构检查、最终Forge构建通过。架构结果复用；最后只涉及同一已检查模块的局部逻辑，不为文档或构建再跑整仓CI。独立Item不变的真实生成比较在定向检查中，Species入口未扩契约。

浏览器验收使用Forge脚本 `ee36553fe0f20936917b717d020c1bf69e845bc84f45648601d8ba0d528bf7b4`；最终两处生成侧窄修构建并安装为 `7c519c19fd86afd1df33bd6962ac3fa48f225a613bc80ead24d24cb230f8316f`。聊天组件、导入适配、CSS及已验收的相位蜘蛛／练习员条件未改变，复用其运行时证据，不冒称再次运行整套UI。Resolver保持 `898023ba281259b8d2cec3d5b8ecea655728bbd9e0d35f902156a8cc6da35444`。安装只更新本任务Mirror模块候选，无世界写入、不重启服务、不碰生产。

测试两Actor、一Scene及两Token、三张资料卡、helper宏和自有GM页均已清理。原六集合ID/hash精确匹配：318 Actor、180 Item、67 Scene、94 Macro、10 Combat、1244 Message；原活动／查看场景、控制与目标Token、worldTime21085811、paused=true恢复。Mirror PID27128继续运行。清理记录明确保护Next现存页；另一旧Next页在最终inventory已不在，执行器未操作它，不猜外部关闭原因。

本次交付的是模板、关联和方便DM应用的功能。未声称自动识别HP0、所有提前结束／再次豁免、自然一小时到期、任意第三方解除及所有自动战斗组合都已实现。未把旧世界Actor自动迁移、未把旧AI失败改记成功、未请求新模型、未提交合并推送。

源码说明和手册已同步，7项受影响条目逐项人工核对，生成页面与33项工具一致性检查通过。正式Chrome连接器打开本地`工具手册.html`时明确拒绝`file:`协议，仅允许HTTP(S)，且禁止改通道绕过；未取得新手册DOM／截图，未将这一层算通过。完整拒绝保存在`chrome/handbook-access-refusal.json`；原Foundry功能UI验收不受此手册文件访问限制影响。

最终保留核对：126份既有私有证据、原四怪49份冻结文件和本轮复用8份原始来源／回答均匹配开工hash。核对曾发现一份早期原生接口研究收据被本任务误移入新目录并扩充；已从原会话Add File补丁精确取回21948字节原件，SHA-256仍为`fad1c25f8b919c866af6ce03398b887e4ad0e4e06e251b7396b32e7f53d3d316`，新扩充收据另存且保持。没有修改baseline或用猜测内容填补，过程记录在`native-effect-linkage-recovery-receipt.json`；只修复取证层，不重跑产品测试。
