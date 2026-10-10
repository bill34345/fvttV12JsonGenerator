# Forge 状态同义句：语义规范化与来源核对

状态：PASS_BOUNDED_LOCAL / PARENT_ACCEPTED_FOUR_LANGUAGES_GM_BOUNDARY_AND_RESTORATION。用户明确要求AI先把不同中英文说法解析成统一规则，再核来源与参数；不明确或未实现机制交GM，并要求多种中英文实际验收。实现、四语言实机、GM反例、父审和精确恢复均已闭合；未commit/合并/push或生产发布。以下准备与失败记录保留为历史，不重放已完成案例。

沿用用户已授权继续的唯一候选工作树`20261006-111625-bettermonsters-eye-deep-sample`、分支`codex/20261006-111625-bettermonsters-eye-deep-sample`与已有未提交实现，不另从旧master制造缺失依赖的候选。主区保持只读且clean。不commit/合并/push，不操作生产或备份。根是耦合实现唯一writer；astra-orchestrator安排只读独立设计/实现审查。Chrome仍复用原IAB执行聊天，回传只到本聊天。

现状及修改边界：AI已经输出固定能力参数，阻塞在整句正则。新增selection级六项逐字来源证据(application/duration/repeatSave/timing/optionality/removal)，保留完整feature引用、跨能力/跨来源隔离及正式Attack绑定。编译器检查证据实际存在、状态注册/IR一致、各自片段内数值/单位/属性精确对应；独立审核从完整原文重建触发、受影响目标、目标回合末、许可/义务、成功解除及所有额外限制。机械证据不冒称完整语义证明。运行参数/执行器不扩大；未知、含糊、额外分支归gm-manual或needs_review。旧无证据selection保持旧校验，不在新证据失败时降级。

新增检查的理由：改变AI选择契约和来源接受边界，需真实中英文改写、数字写法、逐字段参数漂移、跨feature/漏引文/无效证据拒绝、独立审核否决不产生包，以及历史selection兼容。选局部Intake/配置/生命周期测试、package类型与architecture门禁，再构建/归档安装候选以补真实UI新来源生成/导入/命中/回合/解除和GM分支。运行参数未变，已接受旧状态全部玩法不重放。没有parser/generation实现变化；正式source→workflow/Actor语义仍在新样例核对。

计划实测：同一完整双怪物来源包含两种英文与两种中文能力说法，正常AI生成和独立审查；核统一参数/逐字证据、导入后的原生数值，四种能力各自然命中、回合末结算及实际治疗解除。另含明确不支持的条件分支，核仅GM配置与说明，没有对应自动规则。复用已接受隔离/collector，只补新身份和多能力观察，完成后精确清理与恢复。派发前固化候选SHA、源SHA、工具最小往返与权限，收到完成/真实阻塞回传后父审。

检查/审查进度：初始新+旧生命周期、配置、transport与整包审核42项/388断言通过。独立审查发现句末DC14.被当作小数边界拒绝、负数丢符号两个机械数值问题，已修复并补句末标点/中文相邻/全角数码/负号/分数回归，新文件6项68断言通过。package类型与architecture通过。额外carrier/staged/build/archive检查20通过1失败：旧双语名字夹具期待needs_review，但此前本地化已正确接受全角括号英文别名；独立追踪确认不经过新语义路径，现修旧测试期望为accepted且无伪名称警告，保留原件断言，并补跑已有本地化回归，不改业务规则。

本批工具复用bleeding已接受setup/collector。首次prepare在collector上误套只属于setup的隔离前缀比较，已修为只比较setup；setup先前已生成，恢复时逐字核同后复用，未覆盖旧工具。AsyncFunction解析与原共享initializer逐字匹配完成；来源SHA`f4f67d326c49be6490e737b0f4ad36a3479cb74d7c64cb28d5313a5f44d97690`，包ID`intake-f4f67d326c49be6490e7`。无浏览器/世界对象尚未创建。

最终本地化别名、carrier、新语义及构建/归档37项/306断言PASS；旧staged4项先前通过复用。最终package类型、Forge类型通过，architecture无依赖违规或cycle。已人工核对5项stale手册，build/check33工具通过；diff无空白错误。只有Forge脚本有安装差异，按原受限installer的plan/apply完成，SHA`81f28e4e6d6600893ab321288d80982b0d706d37a61f7a11b71aaed47c2dc796`；CC及保护模块未变，48项HTTP候选hash一致。服务操作0、无备份/世界数据编辑。安装收据保留在原复用工具目录`install-receipt-language.json`，本批HTTP核对在`.local/forge-lifecycle-language-20261010/http-identity.json`。实机派发前置已就绪，实际UI/玩法尚未接受。

R1/revision1已成功派发至原IAB执行聊天01a10b1b-3a61-7843-a584-8391d8bca8a3，唯一回传本主控01a123a1-57a4-78c3-a02a-7fb90d7627c9。当前说明与全部前置在`.local/forge-lifecycle-language-20261010/CURRENT.md`；等待完成或真实阻塞回传后父审，不轮询、不将派发成功算实机PASS。

## 实机与父审接受

同一新完整MD通过正常UI配置目录、真实AI提取、独立自动化审核、GM预览确认并导入2Actor/1固定宏，无IR/Actor/包/骰/flag手改。报告`ready_for_gm_review`、findings空，独立审核`accepted/findings[]`。第一次单Actor伴随结果保留`needs_review`、第二只`accepted`，不把固定战斗包接受提升成单Actor接受。包ID`intake-f4f67d326c49be6490e7`，包hash`848b8f04a8a5a339f3e1175dd77bf9c1b434ec5794dac19e0a77864aad903dec`。父从实际下载ZIP走官方decode/prepare与正式workflow，再用新编译器从原IR/全文重编译selection并核固定命令等同；两角色HP90/AC15/walk30/CR5、六属性18/14/16/10/12/10、五爪与Training Claw的+7力量原生攻击/基础1d6挥砍/触及5尺均符合原文与导入baseline。

四种不同说法均归一`attack-hit / configured.deep-wound / 1minute / CON10 / target-turn-end / optional:true`，附相同受审bleeding1d6快照与指纹。24项逐字引文分别来自对应完整能力，英文ten、中文十及数字10均核成DC10；语序、主动/被动和中英文不同表述不再依赖旧整句正则。正常UI发起本批完整生成一次，未以改写原文或复用旧包替代新来源。

| 案例 | 来源表达特点 | 原生实际命中 | 一次流血与HP | 原生API治疗1HP后 |
| --- | --- | --- | --- | --- |
| Echo Claw，英文一 | creature struck / finishing each own turn / difficulty of ten | 自然20，总27 | 1d6=4，90→86 | 87，效果/CC/claim空 |
| Refrain Claw，英文二 | 先写期限 / has the option / turn comes to a close | 先12miss，再自然20总27 | 1d6=6，87→81 | 82，效果/CC/claim空 |
| Paraphrase Claw，中文一 | 被击中的生物 / 自己回合收尾 / 难度为十 / 通过后摆脱 | 总16 | 1d6=1，82→81 | 82，效果/CC/claim空 |
| Echoing Claw，中文二 | 此爪若打中 / 每次结束自己的回合 / DC10 / 成功消除 | 总26 | 1d6=6，82→76 | 77，效果/CC/claim空 |

各例前无残留状态，命中后root/child/claim归属同instance且claim引用实际root；正常跳过可选CON10，再由既有CC回合机制实际结算。基础伤害窗正常关闭，未计基础攻击HP伤害。治疗是owned UI辅助宏调用公开dnd5e `Actor.applyDamage`，未验收治疗Activity；每例实际正治疗后清除所有本来源记录。流血消息本来不保存Roll对象，父核plain message实际结果及HP差，不虚构原生骰卡。

**GM反例通过。** Twilight Claw的“仅昏暗光照时允许再次豁免”与“受到任何伤害立即结束”完整保留在唯一gm-manual规则和绑定原生Item。控制器enabled=true/runtimeOwner正确期间查看该规则无结算；随后原生总17命中AC15，HP仍77、effects/CC/组合/claim空，未自动施加。原生攻击继续可用，源文额外分支保持GM裁定，而非换成近似的自动状态。

最后正常停用enabled=false/runtimeOwners空；10消息为6次攻击与4次流血。一次精确cleanup删本批2Actor/包宏/Scene/Combat/owned消息，正常UI删Deep Wound定义恢复目录空基线；final audit的4类remaining数组为空，原场景/Combat/worldTime21085811、外来效果与海鬼婆保护全部通过。最后正常删除helper/collector并核0。父收尾只读核PID43560与loopback30001仍同一Mirror14.368/cor-cotn/noBackups，主区仍clean。

父核40组本地/实际下载原件SHA，查看GM规则和恢复截图，逐项断言实际HP/消息/归属/clear/GM enabled边界与恢复，结果在`.local/forge-lifecycle-language-20261010/parent-acceptance.json`；检查源为`verify-acceptance.ts`。主收据`chrome/language-r1-receipt.json`，SHA`83504154fed057cd37cab03f2a2e47854c607c4f96a1edb66decd18cf97432fb`；review report SHA`32766db6775027106a5b3f3e193990a78cb582600d0da5d34f1c93bd8f28cae1`；ZIP SHA`4ea2a58449c9e860add9423e74b7599fa3ff946a7da7ba1e5ad5deb659dccf37`；final audit SHA`87b9729344f0e2a40ca279272cd7f036b7d23d97df06b7ef083fe59e669c5837`。凭据只在浏览器页内存；原件和含个人世界界面的截图仅本地保存。

结论限定新证据规范化路径、四种实际中英文说法及该GM反例。完整语义一致性依赖独立AI审核与GM预览，匹配引文/数字本身不是语义证明；不承诺任意模型/文本自动通过。运行机制、版本、分钟自然到期、玩家/多客户端和生产支持范围未扩大。此前有效玩法证据保留，无关旧矩阵不重跑。

收尾已同步支持矩阵、模块README、人类战斗包说明及两产品手册条目。人工核对5项受影响条目后，最终`handbook:build`/`handbook:check`33工具PASS，`git diff --check`无空白错误；安装/候选Forge脚本SHA仍同81f28e4e6d6600893ab321288d80982b0d706d37a61f7a11b71aaed47c2dc796。未改变测试后的产品代码，不重跑已接受玩法。
