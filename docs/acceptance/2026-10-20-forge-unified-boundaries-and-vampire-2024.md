# Forge统一旧CLI边界与2024 Vampire正式链、实机验收

日期：2026-10-20—21。**本轮实现、完整正式来源链、限定实机与恢复均VERIFIED。** 最终产品仍为Foundry中的Forge mod；此结果不证明任意新来源的真实模型质量、速度、费用或整体产品完成。历史失败、原首答与评分不覆盖。

## 授权、实现与边界

用户要求先更新当前MD，通用借鉴旧CLI边界，不限Misty：已有能力不能退化，不支持的完整留GM，真实遗漏和错误继续阻断；同一2024 Vampire通过正式链后继续实机，零新增真实模型。沿用唯一worktree `20261019-forge-ab-fixed-replies`，没有提交、合并、push、生产、系统升级、备份或直接LevelDB操作。

- 复用 `gm-manual` / `native-with-gm`。已支持的Attack/Save/Damage/固定Heal、目标、资源和Cast保留安全执行；可分离时只把其余规则完整交GM。没有catch任意错误后降级，也没有整体Utility掩盖可执行操作。
- Misty的延迟恢复完整手动；Bite实际黯蚀伤害关联保持同源事件/对象证明，独立Save与两类伤害保留，不生成伪Heal、自动HPmax或衍体效果。完整来源缺失、矛盾、编造、错引用及错误执行仍拒绝。
- Charm以附赠Cast消费同一父Recharge池一次；Beguile为传奇Cast、准确成本1，独立下次自身回合前的限制完整交GM。组件、时长和例外各自绑定；非N–6 Recharge完整手动，不映射错误阈值。
- 来源明确3/4巢穴预算通过Canonical/Markdown/parser/Actor/verifier；raw最大值3，巢穴内派生4。来源绑定控制宏须正常开战前Start，刷新后恢复注册，在自身回合开始恢复，抑制提前turnEnd恢复；不接管其他Actor。
- 多体型完整选项保持；同时修复前批对PDF折行Swarm成员尺寸的误拒，没有改来源fixture。
- 真实消费者修复局限resolver：完整GM限制追加到owned缓存的实际活动；现有缓存只通过正常显式维护补齐，隐式协调只读。专用维护不重建Cast/cache、不写父配置或无缺口ref、不重置任何已耗计数。官方法术正文、原chatFlavor和人工Keep内容保留。
- 时限按既有reviewed binding补精确PHB2024 Charm Person：UUID/identifier/Effect ID、Save引用、Charmed状态、non-transfer/base与来源时长均核对，仅该owned效果改为86400秒；不按同秒数泛化，官方原件和独立效果不动。

## 离线与正式链

使用task-local Bun1.3.14；重叠组不相加为独立案例总数。

| 检查 | 最终有效结果 |
| --- | --- |
| 新统一边界、portable contract、资源控制运行时 | 81 pass / 0 fail / 884断言 |
| 原生能力回归 | 1230 pass / 0 fail / 8064断言 |
| V2回归 | 78 pass / 0 fail / 899断言 |
| staged兼容 | 261 pass / 3 skip / 0 fail / 1253断言 |
| resolver最终整组 | 432 pass / 0 fail / 1912断言 |
| 最后身份/维护guard窄复验 | 11 pass / 0 fail / 93断言；与整组重叠，不相加 |
| packages、Forge、resolver及新测试types | 0诊断 |
| anti-overfit | 初始25生产源及resolver5源/guard增量通过 |
| 架构 | 1485 modules / 3966 dependencies，无违规及循环；消费者增量沿既有模块接缝，无新增跨包依赖 |
| 浏览器构建/标准ZIP往返 | Forge16文件、resolver9文件，1Actor+1来源资源控制宏 |
| 静态独立审查 | 已关闭资源重置P2及精确Effect绑定缺口，无剩余具体P1/P2 |

同一fixture SHA `6242db718f8df5efa98190ff93453787881151b8f1485ef15eae76fa20e7331d`、source SHA `fa4306f92887058775d167f201e7c96e19de45f4dd545482e1917bad9a40c2b5`保持；SRD5.2.1完整2024来源以指定MM2024 Actor作参照，不用2014替代。原2024 helper/test未改。

正式收据 `.local/forge-vampire-2024-retest-20261020/vampire-2024-current-chain-2026-10-20T15-40-43-842Z.receipt.json` SHA `ae76429bfc655ceaa21c32247b7fd1f37dd406af4b8eadb6afe8e003dd2cc692`：PASS / ready_for_gm_review / prepared，source/base/whole-feature共3fake、0真实模型。父控独立核对11能力完整可见来源、属性/HP195/23d8+92/速度40/先攻14、完整体型选择、Bite CON17/count1/5尺完整资格/两伤害/成功无伤、2法术ref、Recharge和3/4账本，全部Activity/Effect引用有效。

旧冻结回放仍9完整prepared、15完整候选阻断，能力切片单列；343冻结文件SHA保持，0真实模型/54fake。真实遗漏、未绑定译名、错误方向或引用没有被洗成通过，原评分不变。最终producer源hash保持，resolver后续消费者修复不要求重发模型或重跑已接受的生成链。

## 实际环境与候选

唯一Mirror：PID58524、127.0.0.1:30001、Core14.368/dnd5e5.3.3/cor-cotn。启动前原端口无监听，正常启动既有唯一Lab；全程不升级、不重启其他服务。最终同PID/路径/端口及HTTP200独立确认，常驻保留。80个已启用模块与前批版本清单相同。

Forge脚本SHA `f266b830b9a31fe085bb1c6f2d6856161292a7625c465e39122d958d7e22ed70`；resolver最终脚本SHA `a0b0b21f56715394b4afe230b18fe3a0c56a8001a4279cfe3aa4518838791f43`。最初精确安装25文件；实机增量仅resolver `scripts/index.js`改变，Forge不重写。未用会创建备份的旧安装入口。

实际Chrome执行器Sol/medium/never/danger-full-access，官方Chrome browser3、owned tab651347863；父控正常Mirror API仅作精确fixture与删除。源包正常编码/解码后通过Forge ZIP预览、GM批准、导入；没有手造或修补最终JSON。

## 实机接受

| 门 | 实际证据与边界 |
| --- | --- |
| 导入/来源 | 11完整能力+2真实PHB2024法术缓存；13嵌入Item，全部原文和GM余项可读。Grave Strike中立检定/独立Damage按产物读回，不宣称本轮逐11项都执行；既有Company中立执行证据及未改执行器回归复用。 |
| Bite | 唯一实际伤害1d4+4=5穿刺、3d8=11黯蚀；Guard首次CON1d20+1=14对DC17失败。Source预设100/195以免满血掩盖Heal，后仍100；没有HPmax变更。未自动应用目标HP，动态后果交GM；成功无伤为结构核对，未凑成功实掷。 |
| Charm/Recharge | 首次WIS2失败，父max1/spent1、cache spent0、slots0；耗尽使用不产生第二Cast，唯一手动Recharge4失败且池仍spent1。后续正常回合自动恢复如实记录，不为成功手动重掷。 |
| Charm修复后 | 新Cast实际显示GM/Bite资格/伤害不结束/不知情全部例外，首次新WIS5失败；正常Apply生成来源绑定Effect86400秒，原缓存ID/官方正文保持。另有运行栈Charmed伴随marker；移除最后来源Effect后两者均消失。没有等待24小时自然到期。 |
| 正常维护 | 旧cache只补齐提示与审核时限，IDs THOibRLNE86W9tF4/SiyOKv4917BNlXnD不变；新Cast耗用后再次no-gap维护，父spent1保持。stale+非零其他daily/cache计数由专门反例验证，不把实际0值保持夸成非零证明。 |
| Beguile | Guard回合结束、未推进source自身开始的GM声明窗口使用一次Command；传奇总池仅spent+1/value3，Charm仍spent1，cache/slots不扣。实际聊天含next own turn完整GM限制；首次WIS4失败，冷却/命令执行不冒称自动。 |
| 巢穴/控制 | 外3/3+XP10000，内4/4+XP11500；raw max3不变。内先Start及Stop/restart、外Stop/restart通过。 |
| 回合恢复 | 明确fixture在source自身回合设spent1，turnEnd仍1，下一ownStart才spent0/value4。仅推进自有两个Combatants；旧10Combat轮/回合/参战者未动。 |
| 刷新 | 两次整页reload分别激活新resolver及检验最终持久化。正常Start后legendary spent1、Charm spent1、两cache IDs、86400来源Effect、完整规则与双脚本SHA保持。 |
| 恢复 | 318Actor/180世界Item/94原Macro、原7Token完整JSON、原10Combat语义（除真实审计_stats）恢复；时间21085811/paused=true/原场景与old active恢复。任务Actor/Token/Combat/Macro/18消息均精确清理；仅关任务tab，服务保留。 |

父控从正式文件、各native阶段及正常MCP独立读回，不只接受执行器口头结论。关键汇总：`parent-source-artifact-review.json`、`parent-runtime-final-review.json`、`parent-recharge-message-classification.json`、`parent-native-restoration-review.json`、`parent-final-restoration.json`、`root-mcp-final.json`。

## 实机发现、纠正与保留证据

1. 首次parent Cast已含GM提示，但Core只读缓存活动；首次卡面24h而引用Effect3600。两者是真消费者缺口，均修复并用实际新卡、目标Effect和reload接受；首次失败不覆盖。
2. 新维护方案的审查P2会重建其他Cast/cache并重置已耗次数，已改为只补对应缓存；非零daily/缓存/父池、Keep、错Actor/logical ref及失败前后补偿反例通过。Charm binding追加Save和Charmed检查；没有只按相同秒数或任意Utility引用放行。
3. MCP move回报成功但坐标未持久化，改用正常TokenConfig精确5尺；NPC内联HP未提交，正常Actor API设置后native确认；Save按钮使用controlled Token而非仅标靶，按精确5.3.3源码完成首次真实Save。未重发Bite或改全局设置。
4. 早期根据两条含roll消息怀疑重复Recharge，判断过早，已纠正。MFz/ASLR及6RL/HiBB各为base+turn，完整Roll JSON完全相同；turn.delta只记录同父池恢复，Core复用已求值roll创建摘要，不是再次求值。调用栈观察最终一次为失败1、一个rollRechargeV2、一个base消息，无delta所以无turn摘要。没有重复执行缺陷的证据，也不说整批只掷一次。观察输出的div/state工具失败及零回合修复保留；未重跑主业务，仅补未捕获的栈。
5. 结束自有Combat后原5Token出现新增monks-tokenbar movement:null空namespace。精确baseline/current守卫后，仅撤回这些本批新增标记，原7Token完整JSON最终相同；未覆盖其他数据。18秒测试推进用正常game.time.advance精确恢复，未编辑数据库或伪造_stats。

## 证据、保护与剩余范围

证据目录 `.local/forge-unified-boundaries-20261020/`。最初worker收据SHA `70d5397ffd2554218bb40c03633b21abb1fef1c36cd906cd7ae2ee000ec57406`；消费者增量收据 `worker/usage-chat-result.json` SHA `07d1e03cf96847378ac3b91d1429eaaf3562adf64d9f78a646bb2e7ebd608704`。最终37实现/测试路径按基线+增量组合hash核对；旧收据不改写。最终统一收据为 `unified-final-receipt.json`。

343冻结、4历史fixture及2024 fixture/helper/test等7保护输入保持；最初103项dirty/untracked只记录路径/hash，不制作副本，最终差异仅在本轮授权实现及文档范围。手册按实际入口/边界人工核对后build/check，根HTML独立读回；具体日志与最终hash在统一收据。

GM仍处理Bite动态回血/HPmax/衍体、Misty/变形等复杂触发、目标资格、Beguile独立冷却及其他未支持规则。来源/错误输出继续严格拒绝；完整手动不等于任意错误可放行。本轮未测真实新模型准确率、速度、费用和干预收益，不推广任意新来源、6.x、生产或24小时自然到期。

本次最后手册门理由：支持矩阵的最终2024状态及resolver实际维护/时限行为改变，现有watch要求重核markdown-convert、monster-intake、verification-development、human-encounter-intake、fvtt-json-forge、monster-spell-resolver六项；独立Item/Species前次核对仍有效。人工逐入口/来源复核后才更新review并build/check及HTML文义读回，不为文档重放已过业务。

生成HTML的首次文义读回发现：resolver条目本体还缺Save/Charmed/86400与显式维护的说明，这些仅在Forge条目及resolver README中。已补到正确resolver条目，再只对该条目人工review并重生成/check；失败读回记录保留，业务证据不重放。
