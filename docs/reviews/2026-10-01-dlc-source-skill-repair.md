# DLC 两个合集：49条来源技能加值修复验收

日期：2026-10-01。用户明确回复“可以开始处理”，仅授权恢复两个已迁移合集11 Actor的49条来源技能检查加值、验证行为／重载及精确清理。本任务保留共用工具第一版的已完成结论，不恢复其他迁移。候选 `20261001-110849-dlc-skill-repair / 0c72981`，业务run `557ddb6e-bc9d-48e6-9b2e-d80245e88ec8`。

**最终父审：ACCEPTED_SOURCE_SKILL_REPAIR_LIMITED_SCOPE。** 49字段来源对照、重载、三个技能UI／真实API及精确清理已完成；系统迁移调用0，其他独立兼容问题继续保留。

## 当前接受范围

| 层级 | 实际证据 | 结论 |
| --- | --- | --- |
| 来源与范围 | 原始source-records逐值映射49条；首包10 Actor／48字段，次包1 Actor／1字段，均只写直接 `system.skills.<id>.roll.bonus`。 | PASS，来源负数／小数原样保持。 |
| 实际写入 | 现场49字段最初全部为空；V2分别一次正常pack document API，写11 Actor／49字段；UTC04:20:23.195／04:20:23.461完成两个组，原锁true恢复，restoreErrors为空。 | PASS，本任务系统迁移调用0。 |
| 来源及内容 | 独立父审全部49值匹配；11 Actor的其他内容投影摘要与上轮完整after逐个复算一致，仅排除正常自动_stats元数据和声明49字段。 | PASS，没有用模拟期望数据代替实机。 |
| 重载 | 一次正常GM重载后49值保持，整个after／reload快照含raw哈希与metadata一致，pack／模块／scene／pause／art／设置保持。 | PASS限定持久化。 |
| 实际技能API | 三次公共 `actor.rollSkill({skill},{configure:false},{create:false,...})` 返回真实已评价结果，来源加值、准备值和实际算术一致；未新增chat。 | PASS代表性行为；未接受全部NPC玩法。 |
| 界面 | 原图被tooltip遮挡；通过正常搜索框中性点击关闭浮层，补拍三个技能区域，父实际看图核身份和Perception+10／Acrobatics+3.5／Stealth+5。未重掷骰。 | PASS代表性UI；只读配置控制未观察到。 |
| 清理 | owned Macro `tgLbNiqRDybEXHwd` 删除一次，91→90且其他90集合一致；1418聊天ID前后相同，无测试消息可删；owned页正常关闭后一次tab列表为空。49字段、11raw哈希及context仍保持。 | PASS精确自有资源；服务保留。 |

## 代表性真实结果

| 样本技能 | 来源额外加值 | 能力修正／熟练固定值 | 准备总修正 | 实际公式、骰子与总值 |
| --- | ---: | --- | ---: | --- |
| 青年太阳龙，Perception | 2 | WIS14 →2；熟练6 | 10 | `1d20 + 2 + 6 + 2`，骰2，总12。 |
| 太空孔雀鱼，Acrobatics | -0.5 | DEX16 →3；熟练1 | 3.5 | `1d20 + 3 + 1 - 0.5`，骰17，总20.5。 |
| 法特怪莱兹爱渥邪术师，Stealth | 3 | DEX14 →2；熟练0 | 5 | `1d20 + 2 + 3`，骰4，总9。 |

父审独立解析结果，核 `total - sum(dice.total)` 与准备总修正，以及能力修正＋熟练＋来源加值的算术；真实ruleBonus分别2／-0.5／3。源码准确使用dnd5e6.0.2配置对象签名与禁用消息选项；API行为与sheet只读显示分别记录，没有声称三次手动UI掷骰。锁定sheet未观察到只读技能配置控制，不为查看它解锁／保存Actor。

## 一次工具故障及有证据的恢复

原V1临时宏把context基线作为嵌套对象放进自身flags，其中355个Compendium配置键含字面点号。第一次Apply在持久started／解锁／文档调用前被drift guard阻止，Actor写入0。只读派发再次取得现场证据：Actor摘要与原检查相同 `1bd52811d332ff6fc105cfa6fb347ac51647d7255a31ea6fdf28a92b1b3417b2`；当前context仍为原始 `d463cd7b4067c4557bb8eddf6ed868a0b17d6829c850358de007943db33e20f9`，而存储context为 `73abf1391e9ffddb896c2eaa686f90152277c07da65e9098d75e61d40ae04b46`。

精确Core14.368的expandObject／setProperty离线复现与实际存储摘要完全吻合，表示差异已证明；setFlag链的展开机制由源码支持，未另加运行时埋点。未据假差异修改Actor或环境。

V2改在独立 `world.dlcSkillRepairV2` 存JSON字符串快照，保留原flags／失败原件；初始化必须确认实际原始Actor／context摘要仍匹配且49仍空，再验证字符串真实保存读回相同。11个最新模拟场景以真实Core展开规则校准，覆盖旧对象失败、新codec、拒绝漂移、一次执行、部分失败和锁恢复；与旧10项有重叠，不累计为新增测试总数。共用本地收据 `97be6053-1837-4d11-946c-1b7abcf3459f` 只接受准备，真实写入／重载另由父审接受。

重载结果253,979字节的单次DOM运输曾触及200000字符限制；保留截断原件，读同一个结果textarea四个有界片段重组并核长度，没有重放修复或重载。大输出与业务执行分开恢复。

最终清理只接受准确nonce／ID及已完成修复／行为标记；删除后的130,438字节读回SHA-256为 `0fbdf77e7799caf3ad1c8a3d624aa2d2323cdc540af8a2f00260614559456dec`，父独立解析、复算摘要、核源值／完整raw摘要／context／Macro／chat集合及当前tab缺席。当前flags随owned Macro删除，原／V2／行为标记摘要和完整原件在证据目录保留。父收据 `runtime-final-cleanup-1/parent-final-acceptance.json` 接受该限定修复，不以执行器PASS标签代替原件或画面。

描述性过程记录：一组Macro／page复用；V1一次写前误判拒绝、一次只读诊断、V2首次实际数据操作共两组API、一次正常重载、三次真实skill API和一次精确清理；视觉遮挡只补截图，数据运输只重读同输出，业务修复／系统迁移／roll重放均0。开工准备有过宽输出、猜文档路径及Core utility沙箱遗漏依赖等工具纠错，主动／等待和本任务token尚未细分，不把整个会话跨度当工时或与旧快照凑三件可比任务。

## 私有证据与边界

证据根：`F:\FoundryLab\foundry-v14\evidence\server-next-migration\dlc-skill-repair-20261001-557ddb6e`。关键原件为最初native-inspection、readonly-drift-diagnostic-1、parent-flag-transport-calibration、runtime-repair-v2三份native原件／parent-source-and-reload-review、runtime-skill-behavior-1的native-behavior／parent-behavior-review及最终清理批次。paid完整数据／会话／日志不进入仓库。

V2重载原件SHA-256 `1988ee7b70f5bfd032f2cf2d8153fb88c139b72b85fdd24a1b5f24960d405858`；真实skill原件38,220字节SHA-256 `2fe1915c0732878019a1c0f04db4a9c16f4935e257572f7fce43c9a34052db5f`。现场复用Node24.17.0／PID39528／127.0.0.1:30002／server-next／cor-cotn／14.368／dnd5e6.0.2，未重启服务、改系统源码、读写运行中LevelDB或触碰Mirror／生产。Chrome保持用户指定sol/medium，并有各批次最新实际权限收据。

49条来源技能缺口被修复不代表全部1247 Actor／全部效果玩法接受。原Other AC Bonus的Change Inactive与遗留图标缺失仍为独立问题，未改规则或替换图片。共用工具V1的[既有结论](2026-10-01-development-feedback-v1-verification-status.md)保持限定范围；本业务不构成同复杂度三任务实验，不宣称受控提速或token节省。
