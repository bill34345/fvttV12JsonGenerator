# Forge：旧CLI对照后的通用边界实施与2024三来源续批

状态：正式链、独立来源核对及受影响本地有界操作/重载通过；模板完整结算、聊天最终数值显示和GM手动扣次UI未验收，精确恢复25项父控断言通过。

当前入口：[当前状态与原目标](../plans/2026-10-20-forge-ab-current-state.md)。产品仍是Foundry中的Forge mod。修复后重放成功不改变原始首轮1/3成绩，也不是任意来源准确率、费用优势、6.x或生产接受。

## 实施和边界

- 装备、技能和语言选择分别核对；法师奥秘+6/历史+6/察觉+4、Wand、通用语加三种其他语言保留，真实技能/选择数量错误拒绝。
- 巢穴计数复用dnd5e5.3.3的已有开关：基础legact/legres各3，lair.value=true/inside=false，勾选才各派生4。不会将基础写4或新增独立Item池。传奇动作自身回合开始恢复，传奇抗性每日次数，与完整GM裁定分别处理。
- 可见点的距离/观察者与受影响生物分开核对；完整照录和分栏填写都可，错误20尺落点、外来观察者、只限可见生物、错半径仍拒绝。
- 施法介绍、DC换行和未完清单保留准确来源范围；中文明确环阶/已计入AC与每日/随意按源核对。不能安全生成Cast的限定整行仍完整GM。每天3次的迷踪步及防护魔法按准确法术/同名能力属性继承/次数核验，保留父池和原文，不额外生成法术池。
- 中立近战/远程二选一要求完整互斥操作、同一原文、同一目标和伤害；不猜武器/法术类型，不同时执行两次。旧归档typed双模式继续保留。
- 完整IR前可纠错一次，按准确提取请求独立计数且与后续纠错共用；只重做失败base/whole阶段。明确模型格式、字段或已证明冲突才触发；本地不支持、未知绑定、网络和取消不买纠错。

## 原件与真实请求

证据根`.local/forge-common-boundary-20261021/`。前批343冻结文件和本次最初9HTTP的27原件SHA已核不变；旧CLI实际错误Actor作为拒绝对照，原JSON未改。

法师原先在基础阶段停止，没有能力整表。续跑复用原发现/base，新增1HTTP/4786tokens/6473.8954ms；唯一纠错另1HTTP/7317tokens/10874.3535ms。总新增2HTTP，prompt7620/completion4483/total12103tokens，响应等待合计17.348秒。没有额外review/翻译/整批首次生成/JSON手改。 用户额外补资料/逐字段修补为0；代理进行了源码级工程干预，包括每日施法GM边界、明确限制的空白等价、中立双模式绑定及审查发现的反例修复。这些修复后的冻结重放不能当作无人干预首答成功或受控耗时成绩。两份新原始回复和传输回执冻结在`model-continuation-evidence-freeze.json`。

续跑首答把近战/远程距离放进一个中立近战操作；纠错后已拆两互斥模式，但原绑定器尚不支持中立双模式，修程序后重放同一纠错回复通过，未第三次调用。原首答、纠错后程序失败及后来的正式报告全部保留。首次真实结果文件的安全serializer过滤analysis键，因此完整分析另由零HTTP正式重放报告保留，原错误stdout/stage events及原模型content不受影响。

## 正式与来源结果

最终三份均`ready_for_gm_review / accepted / prepared`；P1、P3来自原首答，P2来自一次续跑和一次纠错后的冻结重放。`parent-source-acceptance.json`包含62项独立来源核对和两份实际旧CLI错误Actor的拒绝诊断。旧CLI棕熊察觉等错误与绿龙体型、毒素/中毒免疫、语言、豁免、传奇次数等缺失继续阻断。三份来源均为SRD5.2.1/2024原文件，没有更换为2014或修改来源。

程序测试：BW95、staged261（3既有skip）、unified81、Encounter635及原生受影响425+30项通过；包类型、架构和局部anti-overfit通过。较早3个整合断言按当前实际正文权威/伤害载体/已支持传奇关联修正并增强反例，产品校验未改来消除它们，说明与原失败日志保留。旧typed双模式回归曾有2失败，已恢复旧分支，最终425+30通过。父控来源辅助报告曾错误预期棕熊Medium及不存在的sizeOptions字段，已对原文Large和sourceSize属性纠正，失败报告保留；没有为报告错误重跑业务。

## 实机范围与恢复

目标限定Mirror Core14.368/dnd5e5.3.3、world cor-cotn、80模块、PID8712/30001。同一Sol/medium执行器，正常UI导入绿龙和法师，独立官方2024Guard仅作目标fixture。原318Actor/180世界Item/94Macro/7Token/10Combat及checkpoint SHA/paused/time已冻结作精确恢复基线。已正常UI导入法师和绿龙并取得操作/重载证据；父控24项有界断言通过，不能将未执行的模板结算或未持久化的手动扣次记为通过。

当前最终候选Forge0.5.1脚本SHA92a2ef738957e9e4c121ca73e31cf52eefbf8291c9bcd58097524e1968da62d4，resolver0.1.7保持a0b0b21f56715394b4afe230b18fe3a0c56a8001a4279cfe3aa4518838791f43。只安装本地已有模块，未升级系统、提交、合并、push或部署生产。

正常UI已实测：巢穴开关使两套max3→4→3且spent1保留；法师奥秘6/历史6/察觉4，中立远程攻击24及3d8+3力场伤害21；绿龙Geas为官方2024 PHB、CHA/DC17/免材料/每日一次实际消耗。旧毒雾卡UI无伤害按钮及原API2d6=6证据保留；限定导入适配设置`removeChatButtons:none`后，重导同一原包，新卡实际警卫CON3和UI2d6毒素8，传奇spent仅+1、传奇抗性不变，同一Token HP/effects不变。导入只修改来源已证明的Save+damage运行副本并严格读回，不修改最终JSON、全局Midi设置、骰式或次数。局部95项、bundle3及模块类型通过，最终脚本已实际载入。

限制必须保留：本轮主动未放模板，Midi停在AwaitTemplate；8保存在卡flags.damageRolls，结果区未显示数字，不能宣布模板/完整结算通过。法师迷踪步与防护魔法为完整GM规则，手动计数修改尝试未持久化；不加自动消费刷过，也不宣称该UI接受。Geas后续5d10条件伤害弹窗已取消，未掷骰/扣血，不证明条件伤害自动正确。未推进新Combat回合；控制器未变，复用前批自身回合恢复证据。

完整重载后3Actor、全部嵌入Item ID/activities/uses/resources不变；原客户端checkpoint仅精确恢复当前world:GM，revision224与原snapshotSHA匹配，未触碰世界LevelDB。最终原文档与自有fixture清理已独立读回通过。证据`parent-native-acceptance.json`、`chrome/native-after-final-reload.json`及对应UI DOM/原生快照。

最终恢复：3Actor/3Token/10消息/控制宏/取证宏按准确ID移除，最后helper删除后实际live callback取证；原318Actor/180世界Item/94原Macro索引、完整原场景（含7Token）、10Combat全文、80模块、时间/暂停/控制目标及原checkpoint SHA一致，父控25项断言通过。原318Actor完整body未快照，不声称逐体全文hash；所有写入只指任务ID。原baseline宏索引含已创建的任务helper，比较仅排除其准确ID。共享PID8712未停，未生产操作。清理后一次diagnostics因缺失活动的undefined匹配抛错，单独修helper guard补读回，没有重跑已成功清理或业务。最终截图仅场景状态，按钮依据具体DOM+原生快照，不冒充视觉卡证。详见`parent-restoration-review.json`与`chrome/final-live-after-helper-delete.json`。

保护读回：343旧冻结、27原试点HTTP文件及12份本批续跑/纠错证据保持；原120dirty文件中100不变，其余20仅本批授权路径；凭据字面扫描无命中。手册人工核对五项、33项build/check及生成HTML限制文义读回通过。当前批次完成不改变最初1/3或产品整体Partial，不是任意来源可靠性、完整mod性能/费用、自动模板结算、6.x或生产发布接受。
