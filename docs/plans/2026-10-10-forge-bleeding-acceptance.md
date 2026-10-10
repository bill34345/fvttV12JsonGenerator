# 流血：限定本地验收

**当前状态：PASS，限定本地A/B/C与恢复已闭合，父审核对完成。** 本批没有产品代码修改、重新安装或发布。以下派发准备记录保留为历史；不据此重放已完成案例。

用户要求“测试看看流血”。沿用现有唯一工作树、已安装R4候选、ServerMirror14.368/dnd5e5.3.3/cor-cotn与原IAB执行聊天；只回当前主控01a123a1-57a4-78c3-a02a-7fb90d7627c9。无需再次授权本批临时对象与既有凭据用途；不停止服务、生产、备份、commit/合并/push或清理工作树。

当前gap是新版可配置状态真实流血行为，不重放已接受Frostbite/旧原生状态矩阵。源码预期：默认回合结束按骰式失去HP（非普通伤害/抗性结算），真正HP增加后结束；多个流血来源仅最高期望值骰式结算，配置来源文档可共存。模块只保存包含formula/结果的结算消息，不保存Roll对象，需结合实际消息、HP前后与checkpoint核对，不能声称有不存在的原生骰卡字段。

本批正常UI配置“深创 Deep Wound”，机制为已有bleeding/formula1d6及默认hpLoss/turnEnd/highest/endOnHealing；用新的完整双怪物MD走正常Forge真实AI/审核/Preview/import，名字/机制参数由世界目录连接。保留R4源码、构建和实际目标身份，未变的机械证据可复用。若真实前置/生成失败，保留数据并修实际缺口。

三个连续案例共用本批两角色/场景/战斗：A先用管理器施加自定义流血1d6，正常目标回合末核消息结果与实际HP等量下降；在无回合推进的刷新前后核实例/HP/checkpoint不重复扣血，原生API实际恢复1HP后核流血清除。B启用Forge控制器，正常Blood Claw真实命中施加配置Deep Wound；C同时用管理器加较弱1d4流血，下一目标回合末在可选CON10提示选择跳过，核两个来源文档保留而仅1d6结算一次、没有1d4额外扣血；原生恢复1HP后核两流血/组合root/Forge claim全部清除，再推进一个目标回合末核HP与消息不再变化。没有强制骰值或直接写期望效果；基础攻击伤害窗正常关闭，以便区分流血HP损失。

工具复用已证明的隔离initializer/setup/read/collector/cleanup，只替换本批身份、目录基线、CC实例/HP导出。新增受限“本批目标原生治疗1点”操作仅调用精确dnd5e5.3.3 Actor.applyDamage([{type:'healing',value:1}])，核实际HP+1，不直接写HP/效果。依据已安装dnd5e.mjs36700-36762及healing反转逻辑；若目标HP已满则拒绝。流血消息没有模块flag，collector/cleanup收集仅本批新增且speaker.actor属于owned2Actor的全部消息，不波及其他聊天。

每次刷新先helper Readback重新arm本批时间/外部效果隔离，再推进Combat。原时间/场景/Combat由本次setup实际记录，不能拿旧任务旧值覆盖当前。最后停用控制器、精确cleanup、正常UI删本批定义、独立audit后删helper/collector；服务与既有海鬼婆/其他对象保持。原件和CURRENT放.local/forge-bleeding-20261010，实机收据chrome/bleeding-r1-receipt.json。派发时状态：DISPATCHED / LIVE_EVIDENCE_PENDING；现已收到完成回传并接受。

派发前已核两R4脚本HTTP SHA、PID43560/loopback30001及既有凭据引用存在；新source/definition经生产契约规范化并绑定SHA/指纹，setup/collector AsyncFunction解析通过，共享隔离initializer逐字复用。没有产品代码修改或重放R4检查。R1/revision1成功派发到原执行聊天，主控结束本回合，等待完成/实际阻塞回传后父审核对原件，不轮询。

## 已核对结果

- **新来源与正常UI链：PASS。** 正常创建“深创 Deep Wound”世界定义，新双怪物MD经真实AI生成、独立审核、GM预览和导入，得到2Actor/1固定宏。报告`ready_for_gm_review`、findings空，自动化审核`accepted`且findings空。单Actor伴随结果仍保留`actor-1: needs_review / actor-2: accepted`，不把战斗包的受审配置接受改称单Actor全通过。源文SHA`2b3971116fcc025f29e91afd271895ade324787f616c429457204294775bc0df`；包ID`intake-2b3971116fcc025f29e9`；正式prepare包hash`aa651641da6ad43f204a85da0cbe56f377e0eaca4da6e86a56d762d9f05e2a09`。父审从下载ZIP走官方decode/prepare/formal projection，再对照实际导入baseline：两角色HP90/AC15/速度30/CR5、六属性18/14/16/10/12/10与来源一致；Blood Claw为原生力量近战武器攻击，基础1d6挥砍、触及5尺。唯一配置规则的命中触发、受审定义指纹、1分钟与可选目标回合末CON10均与源文/定义一致。
- **A，直接流血及刷新：PASS。** Forge控制器停用，管理器施加1d6自定义流血。实际目标回合末消息`bleeding (1d6) = 1`，HP90→89；不推进回合重载后同实例、效果、完整Actor flags及HP89保持，没有补扣。原生API实际治疗1HP，89→90，流血效果及CC实例清空。
- **B，Forge命中与最强来源：PASS。** 原生Blood Claw攻击`1d20 + 4 + 3 = 21`命中AC15，施加configured.deep-wound及1d6子实例；正常关闭基础伤害窗，HP保持90。再由管理器加独立1d4流血。下个目标回合末正常跳过可选CON10，两个来源文档仍在，但只新增一条`bleeding (1d6) = 4`，HP90→86，没有1d4额外结算。
- **C，治疗结束与后续回合：PASS。** 原生API实际治疗1HP，86→87；独立1d4、组合root/子效果、CC实例及Forge claim全部清空。再完整推进一个目标回合末，HP仍87，无新结算或状态提示。全批仅3条相关消息：A结算、B原生攻击、B结算。历史中的`configured-status-manually-cleared`是删除Hook的内部标签；实际操作及治疗前后读回证明本次没有手动删除效果。
- **停止、清理和恢复：PASS。** 正常停用控制器，enabled=false/runtimeOwners空。精确删除本批Actor/包宏/场景/战斗/3条消息，正常UI删除Deep Wound定义，目录恢复空基线。独立final audit的4类remaining数组全空；原场景、Combat、worldTime21085811、外来效果和既有海鬼婆保护项均通过。最后正常删除helper/collector，数量0；PID43560的loopback30001服务继续运行。

父审逐一核对25组证据的本地文件和实际下载原件SHA，核实际消息/HP/实例/claims及恢复字段，并查看两来源管理器和HP87原生角色卡截图。`verify-package.ts`另填补新来源、正式投影与导入语义缺口，结果`PASS_SOURCE_FORMAL_REPROJECTION_AND_NATIVE_BASELINE`。运行时此前R4检查有效，本批只有新验收证据与文档，不重复全仓CI或旧案例。

已同步支持矩阵及Custom Conditions/Forge手册的限定实测说明。人工核对5个受影响条目后，Bun1.3.14的`handbook:build`、`handbook:check`均PASS（33项工具），`git diff --check`无空白错误。收尾只读复查PID43560的命令行及127.0.0.1:30001监听仍对应同一Mirror14.368/cor-cotn/noBackups进程。

主收据：`.local/forge-bleeding-20261010/chrome/bleeding-r1-receipt.json`，SHA`55b319c07b02616c5213e727118e997aec4e8a692761c10ec5e2f349540daf9f`；父审：`parent-acceptance.json`、`formal-package-verification.json`。报告SHA`4e271bee24dd451a94fb59455507b393ea9cd4c48872f11bcf2161ef5a27ce2a`，ZIP SHA`7cf88164d3efaacbfd951864cbd9c75e0ed45b9897d13a17f55f28cf94eac5f6`，final audit SHA`380ad497c2196d90a8cbdc60b2ff0f41c325e650fedafec1076d56d359e750cc`。原件和包含个人世界界面的截图仅保存在本地，未嵌入发布产物。

边界：本批验证的是`hpLoss / turnEnd / highest / endOnHealing`、正常GM命中应用、无回合推进重载及实际正治疗。治疗通过UI辅助宏调用公开dnd5e5.3.3 `Actor.applyDamage`，没有验收原生治疗Activity。未推广到其他骰式/伤害模式/时机、免疫、全部状态、多客户端、分钟自然到期、ServerNext或生产；仍未commit/合并/push。
