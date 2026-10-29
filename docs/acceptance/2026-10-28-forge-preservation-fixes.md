# Forge 能力保留复审后的修复验收

日期：2026-10-28，Asia/Shanghai。状态：12类修复、冻结重放、独立复审与限定Mirror验收完成；未提交、合并或推送。

范围是[46项重新审查报告](../reviews/2026-10-28-forge-46-preservation-code-review.md)确认的F01–F10与D01–D02。按原报告顺序实施，沿用 `20261019-forge-ab-fixed-replies` 工作树，HEAD保持 `5dc5702767bbcb0818a05a02e45c925289e66758`。本轮没有提交、合并或推送；历史报告保留其当时失败结论。用户授权原话、顺序及各阶段过程见[修复计划](../plans/2026-10-28-forge-46-preservation-fixes.md)。

所有新生成结果由现有接收／renderer／parser／workflow／verifier产生，没有手修最终Actor JSON。新增生成、复核、纠错、翻译模型请求均为0。冻结重放使用已有回复，禁止网络fetch和额外provider方法；真实首答质量没有重新测量。

## 按问题核对结果

| 编号 | 机制修复 | 证据与结论 |
|---|---|---|
| F01 | 怪物portable manifest与独立Item／Species契约分开；附带引文缺省不删除ref，技术group/ref身份在入口整理，缺ability保留其他字段且不猜属性 | 原样Priest保留两组七法术，正常Mirror导入有七缓存／七Cast。Dust缺引文、缺ability及坏引文成员派生反例保留Sleep和资源；独立Item／Species反例仍通过原严格契约。缺ability未承诺世界中可完整施法 |
| F02 | 明确OP传递优先于冲突的执行模式标签；诊断单列，不追加到规则description | 冻结Ghoul的正常、缺省、gm-manual冲突及未知模式均保留明确攻击／伤害／后续Save；实际Ghoul的麻痹／失能只关联CON10 Save。纯手动规则正控不凭空生成攻击 |
| F03 | 外部IR／YAML入口统一资源ID及引用；flat主攻击与辅助Save有明确角色 | 既有控制生物原样及技术ID派生反例均只有一个3/day池；Force Pulse和Soul Mark主活动消费同一池，Soul Mark辅助Save不重复消费。Mirror配置读回一致；未真实扣次 |
| F04 | waiver与附带引文逐项整理，坏值保留为局部诊断，内部传递已确定形状 | 冻结Dust加入null等坏成员仍得到Actor、Sleep manifest及原活动，合法waiver继续保留；不靠整只说明卡兜底 |
| F05 | 状态谓词识别区分已有状态前置与本次施加结果 | 原样Ettercap Reel无新增Restrained；Bite Poisoned与Web Strand Restrained分别保留。关系从句前置不会吞掉主句新状态，中文和英文正反例均覆盖 |
| F06 | 施加结果中的并列官方状态、复数conditions及换行统一识别 | 原样Rakshasa的Baleful Command保留WIS18、8d6 psychic、Recharge5–6，并有Frightened和Incapacitated链接同一Save；相对结束时机完整保留给GM |
| F07 | 带独立状态或伤害调整语义的OP不作纯伤害吸收；核对器从原OP声明取状态预期 | Mimic派生替代状态反例只在替代分支有Prone，普通分支没有；原样Mimic两伤害分支保持。派生状态不是官方Mimic规则 |
| F08 | 父OP构建保留独立子活动；父效果先绑定，再追加子活动及其效果 | 派生CON15子Save不再被清空；父Save的Prone不串到子Save，子Frightened不串到父。测试显式证明进入canonical OP入口。相同伤害的空格／大小写／既有类型别名只用于去重比较，不合并真实不同段 |
| F09 | 包内成员逐项解码，空技术key稳定重建；单一展示投影隔离缺system／坏items的预览错误 | 冻结包空key保留两完整Actor；单坏artifact不吞另一成员；正常UI完成两类负例预览，坏成员具体列出，原始JSON保留。坏显示对象未写入世界 |
| F10 | 宏配置在展示、前置、创建计划及启动各处逐宏隔离 | 实际App回归及Mirror正常导入均保留Priest／Ettercap两个Actor，固定宏version2报错独立列出，Macro创建0、启动0 |
| D01 | 扩大语义读回到resources、di/dr/ci、movement、manifest、Item说明和Effect期限／启停／生命周期；保留Resolver合法新增 | 删除或修改这些字段的内存反例有对应警告。实机发现HTML实体和override=false的冗余范围表示误报，补齐等价比较；实际Item范围及规则变化仍能检测 |
| D02 | sourceId／sourceHash只在共用Actor世界写入边界校验 | 无效身份候选仍可解码和获取，实际创建入口拒绝写入；合法同源身份仍可复用。边界反例为内存真实入口验证，未向世界尝试错误覆盖 |

这张表说明已确认缺陷的修复与相应反例闭环，不把46项中所有组合、任意自然语言或未测版本标成全部可用。

## 冻结材料与独立复审

证据根E：`H:/CodexData/visualizations/2026/10/28/01a18034-1e26-7870-8d8b-041ab59fa313/forge-46-preservation-fixes`。公开文档只记录路径和结论，不嵌入私有原答。

- **原样冻结回复**：Priest、Ettercap、Rakshasa、Ghoul及既有资源控制材料沿正式链核对。Priest与Ettercap的原失败报告仍在旧审查目录，未改写为当时已通过。
- **单变量派生反例**：缺引文、坏列表成员、缺施法属性、执行模式冲突、技术ID、包成员key与宏version分别改变；原件保持。
- **机制构造反例**：Mimic替代状态、混合子活动和父子不同状态／期限专门验证组合保真，不充当新模型首答或官方规则。
- `baseline.json`登记234份原答、失败产物及审查证据；`frozen-protection-final.json`核对234/234不变。原有未提交报告与handoff保留，新结果另存。

修复后由两名独立只读审查者分别覆盖内容／生成与交付／边界。首次复审新增三项实质发现：父效果串入子Save、关系从句过滤主句状态、保留坏成员使整包预览崩溃；均修复、补回归并再次审查关闭。相邻的同义伤害重复比较缺口也已处理。见 `independent-review-final.json`。

实机D01等价表示补修与parse5依赖／许可证／Windows解析修正另作增量复审。审查者确认无新增可操作问题，并以锁定Bun实际解析验证parse57.3.0与entities6.0.1的ESM路径；没有重复运行已通过矩阵。独立审查不是任意组合无缺陷保证。

## 本地检查

全部使用锁定Bun1.3.14和仓库安全包装入口。各组有重叠，不相加为独立测试总数。

| 检查 | 最终结果 | E中的日志 |
|---|---|---|
| 内容／引文／资源新回归 | 22 pass，156断言 | `content-evidence-null-final.log` |
| 生成／状态／父子与替代分支新回归 | 10 pass，310断言 | `review-f05-f08-green-r5.log` |
| 交付／身份／读回最终回归 | 20 pass，170断言 | `review-d01-representation-final.log` |
| 独立Item／Species消费者 | 13 pass，93断言 | `content-independent-consumers-1.log` |
| Resolver既有回归 | 528 pass，2349断言 | `content-resolver-regression-1.log` |
| 官方状态与旧状态检查 | 22 pass／579断言／2既有private skip；32 pass／287断言 | `review-f05-official-status-effects-final.log`、`review-f05-official-status-legacy-final.log` |
| 核心与攻击模式 | 39 pass／294断言／2既有skip；288 pass／2858断言 | `generation-core-regression-r2.log`、`generation-modes-final-r2.log` |
| 既有Actor交付回归 | 163 pass，1338断言 | `delivery-runtime-regression-1.log` |
| 既有遭遇回归及定点补验 | 初次109 pass、1失败；只修测试假译文后该例1 pass／8断言 | `delivery-encounter-regression-1.log`、`localization-fixture-final.log` |
| 类型、架构、anti-overfit | 受影响packages、Resolver、Forge类型通过；依赖／循环通过；生成6文件与其余内容9文件分别通过 | `review-f05-f08-types-final.log`、`content-resolver-typecheck-1.log`、`forge-types-final.log`、`architecture-final.log`、`review-f05-f08-anti-overfit-final.log`、`content-anti-overfit-final.log` |

冻结链日志分别为 `content-frozen-r1/r2`、`generation-frozen-r1`、`generation-retained-rakshasa`和`generation-replacement-r2`。首次Ghoul失败定位到诊断污染规则正文，修复后只补失败例。Rakshasa检查器漏匹配Recharge名称只补读已有产物；替代状态装配缺英文名只补未执行案例。所有初次失败保留，未重跑已有效行为。

既有模式测试106个来源语义负例改为显式调用现有离线SourceAudit，原断言保留，不重新把该检查接回产品阻断链。Swarm测试区分普通IR缺字段与历史分步已给tiny字段；产品与来源fixture不变。上述测试维护不伪称修复新的生成能力。

## 本地Mirror配置验收

目标：Core14.368／dnd5e5.3.3，Mirror `cor-cotn`，端口30001，原PID34600。复用独立执行器创建的专用GM页，使用官方Chrome连接和正常产品UI；父代理另用Mirror原生MCP读回实际Actor与Item。没有操作Next或生产，没有投骰、Use、Cast、Apply、休息或世界时间推进。

| 样本 | 实际结果 |
|---|---|
| Priest | 七法术缓存、七Cast，WIS；Spirit Guardians独立1/day，Divine Aid四法术共享3/day且为bonus。UI DC13是系统派生，不归为来源显式值 |
| Ettercap | Reel无效果；Bite中毒只在对应伤害，Web Strand束缚只在对应Save |
| Rakshasa | Baleful Command两官方状态只关联WIS18 Save；Recharge5–6，完整结束规则仍可见 |
| 既有Contract Sentinel控制材料 | Force Pulse／Soul Mark共用3/day，Soul Mark主攻击消费1，辅助Save消费为空；父Item范围5尺保持。不是官方怪物来源 |
| Ghoul模式派生反例 | Claw的攻击、伤害与CON10后续Save均存在；麻痹及失能只在Save |

五个Actor刷新后按ID比较完整toObject保持，不能用集合枚举顺序变化判数据变化。资源样本的既有 `healing-blocked` 等来源问题继续显示，不冒称所有规则accepted。两个读回误报原样保留：未启用的Activity range冗余值被系统清理、`&#39;`被HTMLField保存为撇号。最终修复只处理这些等价表示，重新采用同一来源复用既有Actor，不重建其他通过样本。

观察宏只记录和后续精确清理本批对象；它的正常UI脚本导入不提供替代产品生成入口。当前遭遇工作区使用已有memory store端口，原persistent recovery store只读核hash，因此不把本轮当作IndexedDB恢复验收。原恢复记录hash为 `06e3880038253699c789e7db96ce051317aafda360c379909b56f2da55387edf`。

安装候选按文件hash核对：首次25文件候选只替换两个模块脚本和遭遇模板；D01补修最终Forge17文件逐一核对，只再次替换Forge脚本并增加第三方许可证。无服务重启、无备份、旧release与失败候选保留。最终脚本：

- Forge：`67b49847a380741f6687e2384297c1a49ee2d183f0530972a1f46dc41f55af02`。
- Resolver：`14b33eca56267a83b9f70f58eb81e8d15dcb00b6d04c54b4cf7f9245ff8b0db7`。

第二次构建遭遇Bun1.3.14的Windows路径分隔符panic，未产出可安装文件；保留 `candidate-reviewed-r2.log`。仅在已有构建插件中将parse5／entities解析结果规范为正斜线，r3成功；运行规则与依赖版本未借此改变。parse5与entities许可证随Forge交付。进程和目录前置断言的早期辅助错误均在写入前中止，未操作其他实例。

最终清理完成：五个本批Actor及唯一观察宏已删除，本任务GM页已关闭。原世界Actors318、Items180、Scenes67、Macros94、Combats10、Messages1245的每个ID／hash保持，世界时间21085811及场景／选择状态恢复；原持久恢复记录不变。父代理直接比较完整清理收据，见`chrome/parent-cleanup-verification.json`；观察宏删除和页面关闭另有正常UI证据。Mirror原进程继续运行，本轮候选模块留在本地Mirror，Next与生产未改。

## 最终整合与限制

为核对本轮新增测试和重放源码，另运行一次根`typecheck:all`，发现漏填displayName、provider配置及fetch.preconnect类型。只修本轮新增测试／diagnostic，未改产品或削弱断言。变更后内容22/156、生成10/310、交付分两次覆盖全部20项（18项包含runtime、19项包含冻结包，存在交叠）通过；两条重放执行分支Priest与child-save定点通过，零网络／真实模型调用。证据为`content-test-types-private.log`、`generation-test-types-fix.log`、`delivery-test-types-fix.log`、`delivery-test-types-private.log`及`diagnostic-types-r1/`。附加参数未被当前安全包装转发为筛选，局部组实际范围按日志计数，不把它们写成只运行2项／5项。

**全仓类型检查仍未通过：最终107条错误。** 为确认归属，使用TypeScript CompilerHost在内存中将已有改动源码替换为Git HEAD内容、排除本轮新增TS，保持同一tsconfig和依赖；没有切换文件或建立备份。虚拟HEAD同样107条，按文件／错误码／消息多重集合与最终结果完全一致，本轮新增0条。见`baseline-type-errors.json`、`test-source-types-r2.log`与`type-errors-comparison.json`。本轮受影响产品类型检查通过，不能据此把全仓类型或CI写成通过；旧基线错误未在本任务扩大修复。

最新测试类型修正再次由交付审查者窄复审：禁网络guard、冻结httpClient、拒绝复核／纠错／发现及显示元数据未扩大调用范围，原断言保持。总复审收据补充在`independent-review-supplement.json`。

说明同步范围：Forge／Resolver README、来源验证文档、6个手册条目；共享实现触及的Item／Species条目经对照仍保持原严格输入／接受规则，未改正文或缩小watch。手册review／生成／一致性检查结果保存在`handbook-final.log`，根`工具手册.html`由现有构建器生成。

本轮证明上述缺陷及对应反例闭环。没有重新测模型首答质量，不保证未支持自然语言、未知状态、任意宏或任意版本；没有执行战斗动作、效果应用、实际资源扣减、休息或IndexedDB持久恢复测试。缺施法属性和资源样本的既有来源疑点仍需GM核对，不能用候选存在或绿色局部测试掩盖。
