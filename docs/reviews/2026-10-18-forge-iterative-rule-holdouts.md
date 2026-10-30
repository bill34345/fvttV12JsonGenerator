# Forge 迭代扩样：先修复，再用未参与修复的原文首测

日期：2026-10-18。范围：原开发副本本地处理链、来源语义与错误提案检查；不含模型服务、安装、生产或世界写入。

## 1. 问题的原因是什么

旧例修好后全通过，只证明这些旧例现在能用。为了检查修法是否泛化，本轮将外部选材与实现分开：研究执行器只看旧案例清单、公开原文和规则判据，不运行当前代码；根任务在读新 catalog 前保存生产源码与通过记录的哈希。

第一批独立新原文确实反驳了“改完旧例就够了”：把施法动词当作一个孤立关键词，会同时产生两类错误——把被动或引用当授予，以及修复引用时把带副词的真实授予漏掉。资源的对象归属也必须约束到同一谓词，不能跨过“让目标……”借用后面的次数。

## 2. 证据是什么

### 来源与取样

第一批 **44 个完整规则父段**，含 20 项职业能力、14 项装备、10 项法术定义。规则依据为 [Wizards 官方 SRD 5.1](https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf)，属于 2014 规则；同时读取 Foundry 官方 dnd5e 5.3.3 固定提交 `965ad2d0cf5d063dac675ba078b5bd3c3c0dd449` 的原始数据。没有拿系统版本号当规则版本，也不据 manifest 宣称运行可用。

例如 [Spell Mastery](https://raw.githubusercontent.com/foundryvtt/dnd5e/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/packs/_source/classfeatures/wizard/wizard-features/spell-mastery.yml) 的代词指向此前选出的法术，不是法术名；[Globe of Invulnerability](https://raw.githubusercontent.com/foundryvtt/dnd5e/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/packs/_source/spells/6th-level/globe-of-invulnerability.yml) 描述来自屏障外的法术，不是授予当前生物一个名为“from outside…”的法术；[Horn of Blasting](https://raw.githubusercontent.com/foundryvtt/dnd5e/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/packs/_source/items/trinket/horn-of-blasting.yml) 同时有锥形范围、声音传播距离、材质分支和吹奏者反噬，不能把所有数字塞进同一个伤害或范围。

第一批 catalog 哈希 `b181c1f611d75e7a7398d879ec9668f8ca78bc648450efac6c0a7827a62e3407`，取材与检索返回保存在 `.local/forge-broad-rule-repair-20261018/research-holdouts/`：44 份联网原文提取、`primary-captures.json`、46 页 92 栏的 `srd-holdout-columns.json` 及 catalog 收据。官方 pack 是交叉核对材料；例如 Necklace of Fireballs 只说明珠子产生 Fireball 效果，不能替原文补写穿戴者获得施法授予。

同类工具的一手故障 [Fantasy Statblocks #476](https://github.com/Obsidian-TTRPG-Community/fantasy-statblocks/issues/476) 已在[前批报告](2026-10-18-forge-broad-rule-expansion.md)逐项标明版本与局限，本轮复用冻结记录，没有为凑检索次数再读一遍。它支持核对转换后的字段与完整原文，不能证明本项目根因相同。没有引入该插件或其他安装／本地化候选。

### 结果和反证

第一批 44 首测的 88 条正确链有 81 条通过、7 条拒绝：三种施法误判各影响两入口，另一次是 Horn 测试提案缺失已经确立的锥形范围。最后这一项修的是测试回复，不记作产品缺陷。补齐提案和负例协议后，**88 条正确结果通过、147 条错误／漏文被业务或证据检查拒绝**；不是因为 JSON 形状无效才拒绝。

独立复核还证明：延迟豁免不能借前面的选项标题成为 alternative；嵌套的目标每日次数不属于来源生物；主动情态词中间有副词的施法必须继续走具名清单。这些反例有正确对照，并留下持久回归。原 63 批最终为 **126 条正确、224 条拒绝、10 条来源主导结果仍正确**；最后 10 项不宣称错误回复被请求或修复。

后续七批各32个完整怪物规则父段，均先保存代码与已有通过记录，再由根任务读取。它们依次发现条件伤害首项、条件伤害后仍有别的Save、选择引导同句、伤害OR与Save归属、落点与半径、目标否定及英文能力前缀等共性问题。修复后这些批次属于回归；第七批又发现原始PDF换行导致的章节误判，修复后第八批新原文64/64正确链首次通过，产品代码不再修改，达到本轮停止条件。

| 批次 | 完整父段 | catalog | SHA-256 |
|---|---:|---|---|
| 第2批 | 32 | `round2-rule-catalog.json` | `ccc0d1cf4e5f95b6119cf78ef957897a89b8c85f4b057662a46d3a2734a4aac3` |
| 第3批 | 32 | `round3-rule-catalog.json` | `57e53694f28e1c566b73db7993bcae1d4c300462ffa8ff401992e8abca2ad05d` |
| 第4批 | 32 | `round4-rule-catalog.json` | `19900d59df472eb6f51525d36ccc92f68f8e7424490104e30e499c47ee7f915b` |
| 第5批 | 32 | `round5-rule-catalog.json` | `184d41c5af5c14a01ed0aabf4eb4a95790084290556df3e40ed6891bd5a85166` |
| 第6批 | 32 | `round6-rule-catalog.json` | `cdd877be90c4df0df5cf0444cf4fca976adb56cc54ccd1faa831e7e5bc5097e9` |
| 第7批 | 32 | `round7-rule-catalog.json` | `4bd88d77cc2cda39bc34977c74672c686b0d99ed8a524f48a8e7968bad13635e` |
| 第8批 | 32 | `round8-rule-catalog.json` | `d883f8e1043091f99f1cfe43a58fe88d0a32ef73a2db29a121765597dcdf65ec` |

上述catalog及原始提取分别在证据根的 `research-holdouts-round2` 至 `research-holdouts-round8`。每批保留官方原文URL、固定系统提交、PDF页/栏、原始capture hash，以及唯一漏文和意义反转。完整来源不等同于完整原怪物：测试使用明确合成的基础头，传奇案例也明确给合成3点预算，不能从成本行推预算。

例如[Djinni原始系统资料](https://raw.githubusercontent.com/foundryvtt/dnd5e/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/packs/_source/monsters/elemental/djinni.yml)与SRD第310页共同确立远处落点和区域半径；最终Actor返读发现生成器曾把120尺改成self，现已补生成和最终检查。[Giant Wasp](https://raw.githubusercontent.com/foundryvtt/dnd5e/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/packs/_source/monsters/beast/giant-wasp.yml)的命中穿刺伤害与Con Save毒伤分别结算，成功减半不能把两者变成伤害二选一。[Priest](https://raw.githubusercontent.com/foundryvtt/dnd5e/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/packs/_source/monsters/humanoid/priest.yml)消耗法术位换取后续武器命中附伤，不能变即时伤害或名为Divine Eminence的法术。[Diseased Giant Rat](https://raw.githubusercontent.com/foundryvtt/dnd5e/965ad2d0cf5d063dac675ba078b5bd3c3c0dd449/packs/_source/monsters/beast/giant-rat-diseased.yml)的contract是感染动词，不是第二个Con属性。这些原文实质改变了实现判据，未用换名字/数字凑新机制。

第七批含27份官方文档、41页82栏和64个唯一变体。Lich的原PDF传奇上下文把spent legendary与actions at the start分到两行；检查器的章节前缀正则把后者当Actions。修复复用已有完整标题识别，不需要另一套标题规则。该批修后64正确链与136错误/漏文检查通过；另16个最终产物定点读回核对Erinyes两种直接命中伤害、Magmin目标回合END、条件盲视、默认传奇成本、Minotaur独立后续等，仍不据此声称自动结算或实机通过。

官方pack仅作交叉核对：Unicorn Healing Touch的骰式、Ettercap Web的物件免疫、Treant的1/日等与PDF有差异时，以本批明确规则版次的PDF为准并记录差异。未盲从系统字段猜原文。Lamia的所有属性检定、Dust Mephit未指定回合起止、Vrock的holy water解除条件、传奇成本与每日次数等也保留完整边界，不擅自补自动执行。

公开检索按既有AnySearch入口执行并保存返回；个别提取器体量/解析限制由官方raw抓取与本地固定源码/PDF原栏互证，不把提取器失败算产品失败。全量父段、不同来源格式的抽样和固定错误提案都可复查，但仍不能推断任意自然语言或真实AI首次整理全覆盖。最终数字与测试构造修正见验收记录。


第八批保留23份官方文档、41页82栏与六处完整相关上下文；32父段和64个变体同批及历史去重通过。原文包与本地固定源码的行尾/末空行不同，逐份YAML结构及忽略行尾的文本一致；来源capture本身的hash与PDF页栏证据独立保留，不称两份文件逐字节相同。

该批首测共199项：64正确链、134错误/漏文被拒、1来源直接主导且结果正确。最终代码/既有测试14文件与读取catalog之前冻结完全一致；本批没有修改产品代码、harness或正确提案再重跑。四组来源→IR→MD→正式Actor文件还通过两个现有CLI；20个产物定点读回核对伤害归属、动作/后续、负载体型与默认传奇成本。Chuul的detect magic仅效果引用、Drow的日光条款不复制玩家种族版本、Frog的Small/2d4不复制Toad，均以当前原文为准。此结论限本地处理链，不推广为真实AI首轮或完整Foundry运行通过。

## 3. 解决方案是怎样的

把共同判据修在已有来源处理函数中：主体、直接作用对象、选择范围、正反语气、实际施法关系。检索来的规则先作为完整父段保留，再按现有支持生成确切的原生检定或伤害。复杂条件可以完整交由 GM；把规则留给 GM 与假装已经自动实现是不同验收结果。

合成 Actor 的基础头部只提供已知承载体。职业、装备和法术规则放入该承载体检查完整性与归属，不宣称扩展到职业成长、完整装备导入或任意法术自动执行。固定假 provider 用于稳定注入正确和错误提案，不能代表真实 AI 第一次就会写对。

复验入口是现有诊断脚本的可选 corpus 参数，选择新的输出目录以保留失败。它没有变成强制 hook、常驻任务或每次生成的第二轮 AI。未来新候选先查本报告已测的关系，再找新的完整父段、保存取材来源、独立确定正确与错误判据，以同一入口首测；不要靠换名字或只改数值扩充数量。

归档位置与最终结果见[验收记录](../acceptance/2026-10-18-forge-broad-rule-repair.md)。待判断安装／本地化项：无。真实模型、Foundry 原生点击与重载持久性沿用既有待验边界，没有被本轮离线结果关闭。

This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.
