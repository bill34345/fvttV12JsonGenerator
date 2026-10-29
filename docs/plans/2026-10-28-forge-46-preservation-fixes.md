# Forge 46 项复审缺陷修复与验证

日期：2026-10-28，Asia/Shanghai。状态：已完成12类修复、限定验证与独立复审；未提交、合并或推送。

用户原话：

> 行，按报告的顺序修复这10类问题和2项边界缺口，沿用当前 worktree。按机制修，不要只针对这几个样本打补丁。用现有冻结材料验证，保留原答和失败产物，不新增模型调用，先不提交、合并或推送。修完再做一次独立代码审查。

范围依据：[逐项复审报告](../reviews/2026-10-28-forge-46-preservation-code-review.md)。本计划记录实施与验收，不覆盖该报告的原始失败事实。

## 基线与约束

- 工作树 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`；分支 `codex/20261019-forge-ab-fixed-replies`；起点 HEAD `5dc5702767bbcb0818a05a02e45c925289e66758`。
- 已有未提交内容：当前状态文档、四怪首答验收、保留缺陷 handoff、46 项复审报告。保持原内容，新增修复记录另存。
- 零新增生成／发现／复核／纠错／翻译模型请求；仅本地冻结回复、现有实现和必要的 local Mirror 配置验收。不投骰／Use／Cast／Apply，不操作 Next 或生产。
- 原答、原失败产物、前轮审查证据原位保留；不手改最终 Actor JSON。新结果写本轮独立证据目录。
- 不提交、合并、推送或清理工作树。相互耦合的代码同一阶段单一写入者。
- Bun 使用锁定 1.3.14；测试走 package.json 安全包装。局部通过证据复用，新增检查须对应本次变化或实际缺口。

本轮私有证据目录：`H:/CodexData/visualizations/2026/10/28/01a18034-1e26-7870-8d8b-041ab59fa313/forge-46-preservation-fixes`。

## 实施顺序与完成条件

| 阶段 | 问题 | 必须证明的结果 | 当前状态 |
|---|---|---|---|
| 1 | F01–F04 | 法术与资源不因附带记录／技术ID删除；明确OP不受mode否决；坏waiver只报告该项；flat主攻击消费共享次数、辅助Save不重复消费；独立Item/Species契约保持 | 完成；原样Priest与资源控制等共同实机配置／刷新已核 |
| 2 | F05–F08 | 既有状态前置不新增效果；并列官方状态正确生成；分支专属状态和子活动归属保持；校验从原操作建立预期 | 本地实现／验证完成，独立审查两发现及相邻去重缺口已修并复核 |
| 3 | F09–F10 | 坏单成员不吞其他完整成员；坏宏配置独立结算，完整Actor继续导入；宏启动检查仍有效 | 本地实现／验证完成，独立审查展示缺口已修并复核 |
| 4 | D01–D02 | 读回报告覆盖资源、免疫、移动、法术及效果生命周期；坏来源身份仅阻止对应世界写入，候选可获取 | 本地实现／验证与独立代码审查完成 |
| 5 | 独立审查、集成与文档 | 修完后独立代码审查；处理发现并复验实际缺口；受影响本地Mirror配置读回、手册及所有冻结材料保护核对 | 完成；独立复审、限定Mirror配置／刷新／清理和说明已整合 |

## 验证选择

1. `test:forge-preservation-content`：F01–F04的新具体反例和机制正控；同时选择受影响的manifest strict消费者、资源、入口既有回归。先证明局部，再看共同链，不反复全量运行。
2. `test:forge-preservation-generation`：F05–F08 的真实生成结构、状态谓词正反例、分支链接与子活动保留。受影响parser/generation执行局部anti-overfit。
3. `test:forge-preservation-delivery`：F09–F10、D01–D02 的真实包解码／App方法／世界写入端口和语义读回。内存端口不冒充世界验收。
4. `diagnose:forge-preservation-frozen`：复用审查已冻结原答与明确派生输入，经当前入口→renderer→parser→workflow→verifier；保存原结果与修复结果的语义对照。禁止fetch及额外provider方法，原件hash前后核对。
5. 共同集成检查只在相关代码稳定后执行：受影响类型、架构、局部anti-overfit、Forge/Resolver构建与必要直接消费者。没有依据不运行全仓CI／覆盖率／长时测试。
6. 本地Mirror只补变化影响的正常导入和配置读取：法术manifest/缓存/Cast/资源，状态及Activity归属，配套错误独立结算。使用专用GM页和正式产品入口，先核对实例身份与占用；无模型调用、无投骰。
7. 用户可见结果及限制变化同步手册；保持watch范围，人工核对后review/build/check。修复后独立审查不以测试全绿代替来源语义核对。

## 进度与证据

- 已核对工作树和HEAD，确认没有产品源码既有dirty改动；报告中的原答／派生反例／未知边界保持区分。
- 阶段1实现由内容链单一writer处理，根代理负责验证入口、冻结材料保护、后续整合与完成裁决。
- 阶段1 `test:forge-preservation-content` 17 pass / 122 assertions；独立Item/Species消费者13 pass / 93 assertions，packages和Resolver类型通过，Resolver旧组528 pass / 2349 assertions。随后只对具体新增附带引文形状缺口补检查，不重复全部Resolver组。
- 父代理首次9例冻结链为8通过、Ghoul mode变体状态错挂失败：模式诊断被拼入规则description，改变操作分句。修复为仅保留candidateReview，规则原文逐字不变后，只补该失败例通过（`content-frozen-r1`、`content-frozen-r2`均保留）。
- 原样共享资源控制还核对了Soul Mark真正消费主攻击，不只核对池存在；两个成员均消费同一3/day池，辅助Save不扣次。Priest七法术名称、两分组、独立1/day与共享3/day均按来源核对。
- 旧 `test:forge-46-core` 的两条官方状态旧预期失败记录保持，交阶段2按当前契约核对；不将该组写成全通过。
- Chrome执行器已完成只读准备：实际Sol/medium/Full Access、官方Chrome往返正常；Mirror PID34600/data/server-mirror，当前无Mirror页。Next与其他任务页面未认领，待最终候选后创建本任务专用页。
- F01附带引文数组坏成员补修后，内容组22 pass / 156 assertions；provider在外部入口按同一机制处理group/usage/ref/restriction/waiver/manual grant引文，坏值留记录，不放宽运行结构及Item/Species契约。`content-evidence-null-red/final.log`保留红绿证据。
- 状态组父冻结7场景完成：5例直接通过；Rakshasa只是测试定位忽略名称中的Recharge后缀，直接补读已有产物，不重生成；替代状态构造的英文名缺省问题只修测试装配，再补未执行案例。见`generation-frozen-r1`、`generation-retained-rakshasa`、`generation-replacement-r2`。
- 独立审查确认并关闭三处残留：父Save状态串到子Save；关系从句过滤同时吞掉主句新状态；缺system/坏items的保留候选使整个预览抛错。新回归明确验证实际canonical OP入口，不再把未进入该分支的绿例当覆盖。相邻同义伤害重复仅统一比较表示，真实不同段保持。
- 审查后最终局部组：内容22/156，生成10/310，交付17/144；官方状态22/579（2既有private fixture skip）、状态legacy32/287、核心39/294（2既有skip）、modes288/2858、交付旧回归163/1338。类型与6文件anti-overfit已过。数字为各组原日志，存在交叠，不相加为总样本数。
- 旧modes源语义负例现在明确调用既有离线SourceAudit，原断言保持；Swarm测试区分普通IR缺字段和旧staged有明确字段，两路原规则不改。旧encounter组109通过、1个假译文失败，经仅测试title/body术语修正后只补该例1 pass / 8 assertions；不重复109例，不改生产翻译校验。
- 最终独立代码审查收据`independent-review-final.json`，两个审查者均确认已报问题关闭、无新的可操作发现；不将其扩大为任意自然语言／所有组合或世界接受。
- 已构建新的25文件候选，保留旧release/候选；仅安装3个变化文件到精确`server-mirror/Data/modules`，Forge脚本`036fd56e7d540adc1026d7d84e2071b7e67feeb4a10f6d8364159857c3e745c0`，Resolver脚本`14b33eca56267a83b9f70f58eb81e8d15dcb00b6d04c54b4cf7f9245ff8b0db7`，未重启PID34600。
- 安装准备先后纠正了辅助命令的Data目录层级与把Core版本误当Node路径的身份断言；失败均在写入前，两个已装脚本hash保持。修正为实际Node24.17.0/app14.368/精确dataPath后才安装，见`mirror-install-plan.json`和`mirror-install.json`；不是产品或服务失败，也未绕过拒绝。
- 本任务Mirror页651352479已由原执行器建立，恢复既有GM登录；加载期一次DOM超时后正常就绪，无重载。正式readiness和原生MCP均确认14.368/5.3.3/cor-cotn、唯一活动GM；已读回既有Amalgam。Next页始终未操作。
- 实机将通过正常UI验证两个只预览负例、Priest/Ettercap坏宏包，以及Rakshasa、资源控制、Ghoul的标准资料入口。观察宏只读、记录和后续精确清理；恢复持久store只读核hash，本轮上传使用已有内存端口，不冒称IndexedDB验收。父最终读回前不清理。

- 最后实机D01只复用资源Actor，不新增文档。HTMLField实体规范化和override=false的Activity范围冗余值不再误报；父Item5尺、3/day共享池及两活动消费分工不变，原source findings仍在。父直接比较五Actor完整对象按ID一致，原恢复记录与世界时间不变。
- Forge最终候选`67b49847a380741f6687e2384297c1a49ee2d183f0530972a1f46dc41f55af02`，Resolver沿用`14b33eca56267a83b9f70f58eb81e8d15dcb00b6d04c54b4cf7f9245ff8b0db7`。parse57.3.0及entities6.0.1许可证随Forge交付；Bun反斜杠panic失败日志保留，只修已用构建插件解析路径，17文件fresh构建及安装hash通过，独立窄审确认。
- 五测试Actor、观察宏及自有GM页已精确清理，原六集合每个ID/hash及场景、选择、世界时间保持；原persistent recovery store未改。父完整读回比较在`chrome/parent-cleanup-verification.json`。不再重建页面补采无关证据，Mirror进程与候选继续保留。
- 根类型检查用于新增测试／诊断整合，发现本轮测试元数据类型缺口，修正后定点复验并独立窄审。最终根类型仍107条，内存HEAD源码基线同107条，文件／错误码／消息多重集合完全相同，新增0；不是全仓类型PASS，也没有扩修既有错误。产品类型、架构、15文件anti-overfit分组通过。更新测试的局部日志与旧有效证据均保留。
- 234份保护原件hash均不变。原样／派生／机制构造及运行边界在[最终验收](../acceptance/2026-10-28-forge-preservation-fixes.md)分列，附完整局部检查与失败解释；手册相关8项逐项人工核对，6项正文更新，Item／Species正文保持、review记录具体理由。
