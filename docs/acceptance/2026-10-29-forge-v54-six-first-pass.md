# V54 六只生物真实首答对照

2026-10-29。用户对六只、每只一次、共六次真实模型请求与本地提取生成对照的具体提案回答：“允许”。沿用现有worktree，不提交、合并或推送。

## 本批范围与检查选择

本批是V54新提示词真实提取检查，不重复已通过的静态或旧回答重放矩阵。所选来源与上轮逐字一致，保留原换行、旧原答、旧失败和最新程序下的旧Actor；不以旧IR代替本批模型输入。名单为Medusa、Roper、Unicorn、Priest、Behir、Adult Brass Dragon。

每只最多一次提取，共六次。复核、纠错、重试、发现、探针、模型列表、翻译和配套配置请求均为0；失败消耗该只唯一额度。先本地通过Forge公共入口提取与正式workflow生成，再逐项对照来源、原答和产物。发现问题先记录，不修代码/提示词/Actor，不补救调用，不自动启动Foundry验收。

重点分别为重复豁免与逃脱DC、真实逃脱与无伤害攻击、治疗及共享施法次数、完整法术清单、初始/持续/退出阶段、完整回答及传奇动作资源。明确多目标治疗不在这六只范围内。

## 本批结果

六次请求全部HTTP200、服务completed，六只均通过Forge公共分析/正式workflow取得Actor；5完全成功、1部分成功、0失败。成功范围只限来源、新首答、IR与本地Actor的内容和配置，不包括Foundry导入、法术水合、能力使用、保存刷新或战斗。

| 生物 | 成功程度 | 问题点 |
|---|---|---|
| 美杜莎 Medusa | 完全成功 | — |
| 石绳怪 Roper | 完全成功 | — |
| 独角兽 Unicorn | 部分成功 | 原生传奇抗性3次仍在，但旧有特性按钮扣减该计数的配置缺失，需GM手动处理；原生失败豁免入口仍可用。 |
| 祭司 Priest | 完全成功 | — |
| 贝希尔 Behir | 完全成功 | — |
| 成年黄铜龙 Adult Brass Dragon | 完全成功 | — |

**本批没有达到“原来正确的行为全部保持”的接受前提。** 已完成的是这六次首答验收和问题交付，不是把V54宣布为无回归版本，也不是把新暴露的问题修复完成。

## 独角兽：已确认的配置回退

- 来源要求：传奇抗性3/日，失败豁免可以选择成功。
- 新AI回答：`legendary.resistanceMax:3`正确，特性声明为`gm-manual`，没有特性自己的`uses`。不能说AI丢掉了3次，也没有生成额外独立池。
- 新程序输出：`system.resources.legres.max:3`保持，但Legendary Resistance特性Utility没有`consumption`；同源旧正确Actor的该活动为`attribute → resources.legres.value → 1`。
- 使用后果：原生计数和系统原生失败豁免入口仍在；使用旧的特性按钮路径时，生成配置已不再扣减同一个计数，需要GM手动处理。此为配置对照所得，本轮没有实际点击能力。
- 已核源码：`native-resources.ts`的特性绑定要求`feature.uses`，只有ledger次数时不建立绑定；renderer不输出该特性的`actorResource`，generation不会给活动绑定原生计数消费。完整旧正确Actor和新原答均保留。

这次新回答使用不同表示，暴露当前连接条件的缺口。本轮产品代码没有变化，不能仅凭新旧回答不同就认定“精简字数导致错误”或“V54新增了程序缺陷”。实际输出退步仍须记录，不能用此归因边界掩盖它。本轮不修改代码、提示词、原答或最终Actor。

## 已核对的关键内容

- Medusa：新raw、IR和Actor均不含`escapeDc`；DC13 CON、30尺Cone、bonus、Recharge5–6及首次Restrained/二次Petrified阶段完整，石化带失能。三种攻击、伤害和多重攻击正确。上次错误首答原样保留；本次答对不代表以后任何回答都会答对。
- Roper：真正escape DC14保留；Tentacle为一个`1d20+7`、60尺GM攻击检定，无伤害活动；Grappled与Poisoned正确关联，后者到擒抱结束。Reel不新增状态；Bite、触手可损伤/再生、Spider Climb和全文保持。
- Unicorn其余：九法术、CHA/DC14、七法术的全成分豁免、Blessing附赠动作两法术共享3/日、接触另一生物及不错误继承成分豁免保持。Shimmering Shield为3d6临时生命、60尺、一个自身或可见生物，AC+2及冷却全文保持。
- Priest：七法术、wis、随意两道、Spirit Guardians独立1/日、Divine Aid附赠动作四选一共享3/日保留；Mace的1d6+3钝击+2d4光耀及Radiant Flame的2d10/60尺正确。体型选择、固定AC、技能和语言限制保留。
- Behir：初始吞咽DEX18、持续6d6酸伤、受至少30伤害后的CON14及退出Prone各在正确阶段；酸伤活动无初始状态链接，Prone只关联独立退出活动，无重复消费。Constrict STR18/5d8+6/escape16、Breath DEX16/12d10/90×5尺Line/半伤/充能5–6与Bite保持。
- Brass：Rend、Fire Breath DEX18/10d8/60×5尺Line/半伤/充能、Sleep Breath CON18/60尺Cone及二阶段600秒和唤醒规则保持。七道主组法术加一条Blazing Light复用共八引用，CHA/DC16、材料成分豁免、Shapechange全部限制、三项传奇能力及普通3/巢穴4资源记录完整。

六只的AC、HP/骰式、先攻、六属性、来源技能/豁免、移动、感官、被动察觉和CR均独立对照来源通过；基础HP/AC/属性/CR与旧正确Actor相同。38段新回答的能力/施法描述均保存在Actor正文中；该文字检查与逐项机制审查分别记录。

## 诊断与字段差异的判定

1. Unicorn有18条法术/限制逐条引文缺省诊断，但九引用与限制均保留。其部分成功的依据是计数按钮回退，不是这些附带诊断。
2. Priest有`医药`/`medicine`字段名导致的技能诊断，原生医药实际为+7，与来源一致；不把这个诊断写成医药数值丢失。原报告保持，不为获得绿色改写它。
3. Brass严格来源验证报告`INVALID_SPELL_REUSE`，父子引用引文均空。针对这条具体诊断，补做已保存Actor manifest的纯结构读回：Unicorn9、Priest7、Brass8引用均通过真实`validateActorSpellManifestStructure()`。该入口在Actor candidate分支不执行相同引文拒绝，不把严格证据诊断误写成已确认Resolver无法配置；本轮没有实际匹配或水合。
4. Brass的传奇抗性特性在同源旧正确Actor中也没有消费配置，因此不列成本次新增回退。它与Unicorn有旧消费按钮的证据不同，不能混为一谈。
5. Brass的Metallic从旧`type.custom`移至完整biography；本地锁定dnd5e5.3.3的`formatCreatureType`只在`value:custom`时读取custom，原生dragon的子类型使用独立subtype。因此旧写法也没有提供Metallic原生子类型显示，本轮记录布局差异，不判新增显示退化。
6. Behir酸伤的AI字段`damage.relationship:base`不符合提示词要求的conditional，但独立follow-up及完整condition和最终GM伤害活动正确；没有并入初始豁免或新增自动伤害，不据此判使用失败。

## 请求、证据和保留

实际使用模型`deepseek-flash`、Responses流式、每只`maxAttempts=1`，单只模式跳过发现。V54完整system为16,955字符，SHA-256 `87b8574f164e43d95c433e7c92ded263762dcce1cf2c13d2690f9126ab63bc01`；六次发送前均严格匹配。每个样本发送前独占保留请求记录，失败也不会重发。隐式网络被禁止；账本实际6/6、每只1、所有额外阶段0。实际usage：input26,193、output136,882、total163,075；不据这些不同样本和回答用量推断精简带来的成本或质量变化。

独立只读审查覆盖Medusa、Roper、Unicorn、Behir、Brass；父代理核对全部六只及字段消费者，Priest由父代理对照中文来源。审查不触发模型、生成或Foundry。`semantic-final.json`绑定新raw/IR/Actor与旧Actor hash；`header-audit.json`记录来源数字独立对照，`manifest-structure-readback.json`记录针对Brass具体诊断补采的结构证据。

2,749份仓库基线文件及2,972份该历史证据父目录文件核hash保持：仓库只更新唯一当前状态并新增本报告，产品/测试源码变化0、无旧文件删除。HEAD仍为`5dc5702767bbcb0818a05a02e45c925289e66758`，暂存区为空。原始首答、失败、旧产物保留，不覆盖旧成绩。

本批没有浏览器、Foundry、Resolver匹配/水合、创建/保存刷新、Use/Cast/Apply或投骰，也没有安装部署、提交、合并或推送。源资料与输出留在私有目录，不进入正式output登记。

私有证据根：`H:/CodexData/visualizations/2026/10/29/01a18790-ad68-79e3-8895-49616acd060d/forge-v54-six-first-answers/`。完整原始来源与回复只保留在私有目录，不复制进仓库。
