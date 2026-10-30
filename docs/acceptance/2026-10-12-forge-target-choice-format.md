# 目标自选 INT/WIS：第三种 IR 与来源排版等价

**最终结论：本轮限定实现和回归通过；唯一一次全新提交生成了待审英文候选与中文草稿，但核源发现海渴症译义错误，整体语义验收FAIL，按约定停止。** 耗时391.523秒，8次模型HTTP（提取1、原有自动修复1、配置1、翻译5），付费审核0。没有修改译文、第二次提交、中文批准、安装、导入或刷新。

本轮沿用用户授权：修复最新第三种失败 IR，保留旧、新两种回归和缺文/冲突拦截；补自动修复失败的安全诊断；通过离线检查后同源全新提交一次，成功才导入刷新，失败停止。付费审核关闭，不 commit/merge/push。

工作树沿用已授权实现分支，原拥有者当前 idle。开工 77 个既有 dirty/untracked 文件的身份记录在 `.local/forge-target-choice-format-20261012/baseline.json`。第三份 fixture 来自上一轮原始提取结果，SHA256 2addc07b6b383e23038de002b648347b8aac4df97849c31bf59a4aa9ad45c0b7，未修改 IR。

本轮检查选择：先让第三份原件在公开分析/正式入口复现；分别隔离末尾空白、数字单位连字符断行和复合属性三个因素，再验证缺文、选择者/DC/字段冲突、跨能力证据和普通单属性不被误放行。provider 错误仅补当前修复出口的解析/结构诊断，fake provider 验证无敏感值外泄。变更影响共享来源整理与 provider，完成后运行现有 Forge/Intake 相关组、package 类型、架构、局部 anti-overfit、构建和受影响手册检查。全新模型请求前固定代码身份；不复用 fixture 配置或译文进入真实提交。

定点复现获得5个预期RED：原件、边界空白、数字单位断行、复合属性、第三份正式入口。修复后29项目标选择/诊断读回及1项provider诊断组共30项通过、1298断言。原始新IR仍未修改；测试预期明确包含既有引用定义恢复产生的传记/证据附加，不把它误当本修复改写其他规则。provider的新增诊断先RED后GREEN，保留固定字段路径、类型和数组长度；浏览器安全出口显示此诊断，原始模型值和不可信路径不进入回报。下一整合检查因本轮确实改动source-facts/provider/browser错误出口而执行；前置Save枚举校验没有放宽。

冻结前检查完成：30项定点/安全诊断，525项Forge整合，50项来源完整性/GM手动表示定向检查，541项Intake回归均通过（各组存在交集，不合并成独立样本数）。package/全仓类型先指出一处诊断读取的TypeScript非空收窄，补类型断言后均通过；不改变运行语义。架构1313模块/3111依赖、3文件anti-overfit、模块构建和手册6条人工核对/33项check通过。首次整合参数曾填错两个不存在的额外测试文件名，主体525项仍有效；已按实际文件名补足50项，没有把漏跑项计为通过。

候选JS冻结为f0bff6ac178165cd01921643926ee23163ee7b86518c4314572da458a3a94da3。开工已有77个dirty/untracked文件中，69个范围外文件逐字节不变；本轮另修改原本clean的provider.ts/provider.test.ts并新增第三份fixture。所有旧失败原件保持，HEAD未变，Lab本轮未安装。下一步只进行用户授权的一次同源全新提交；计量脚本复用前次机制并增加安全provider诊断记录，不复用任何旧IR/配置/译文。

## 唯一全新提交：首次结果

北京时间2026-10-12 15:59:45.945至16:06:17.469。原文仍为4314字符、SHA0960bd91a4d3704371324d4cfa1e24c010a80f2a2afcc6b41032818cedc326c1。只有一次generateEncounterFromHumanMarkdown调用；没有drafts、旧配置、priorDrafts、译文、反馈或人工改稿。199个纳入快照的产品源码前后不变。

| 阶段 | 请求数 | 请求耗时 | 首次结果 |
| --- | ---: | --- | --- |
| 提取 | 1 | 74.226秒 | 又返回缩写形式save.ability="int or wis"；前置校验及来源转换冲突拦截。该缩写不在本轮已固定的完整属性名转换范围 |
| 原有一次自动修复 | 1 | 24.346秒 | 修复成功；Seed Terror正文未改，save移除、activityType为utility，分析无阻断；这是模型修复，不能称零修复首次通过 |
| 配套配置 | 1 | 43.898秒 | 正式workflow得到12能力英文候选和GM手动配置 |
| 中文翻译 | 5 | 27.783 / 82.123 / 76.287 / 20.848 / 41.567秒 | 角色81字段及包级3字段完整返回；程序状态ready_for_gm_review |
| 付费审核 | 0 | — | 禁止入口未被调用 |

翻译五次为现有分批机制：角色标题/正文3批、包级标题/正文2批。该映射由本次保留的request与固定9000字符、标题先行的分批代码核对；不是五次重新提交整个原文。总流程391.523秒与各HTTP耗时分别保留，不将人工开发/核源耗时混入。

原始summary的semanticFirstCorrectness仍为PENDING_SOURCE_REVIEW，保持第一次程序结果原件不改；后续核源结论单独记录semantic-review.json。ready_for_gm_review不是语义接受或人类批准。

## 目标问题的实际进展

旧、新缺属性、完整复合属性三份保存IR全部通过，缺文/冲突反例仍拦截。原生单属性validator未放宽；source-facts只允许原始引文位置精确且全文完整时，接受边界空白与原文数字-foot/feet断行的限定排版等价。复合属性仍只用于手动表示。

本次全新结果的Seed Terror有3个Utility活动、0个Save、0个自动Effect，正文保持完整。中文正文保留目标选择、INT/WIS、DC15、15尺、恐慌1分钟及结束回合豁免；GM步骤明确“GM让目标选择智力或感知”。其他普通CHA/CON/DEX/WIS豁免仍为原生Save，没有一并降级。

不过原始新提取使用了另一种缩写"int or wis"，仍需本来就允许的一次自动修复后才通过；不能把三份保存IR的通过扩大成任意IR写法均可确定性归一化。没有在看到该形式后追加实现或重跑。

## 停止原因：海渴症中文含义错误

原文字符[4249,4313)：

> It can keep solid food down only if washed down with sea water.

对应中文草稿字段 `text-d49b94fd9fe2443ee13c969f` 在传记中写成“它只有用海水送服才能咽下固体食物”（展示时移除HTML并折叠空白；原字段未改）。

keep food down指吃下后能留住、不吐出；咽下指吞咽能力，规则后果不同。既有程序检查没有拦住，代理核源将其判为阻止导入的语义失败。准确含义应表达“只有用海水送服，吃下的固体食物才不会吐出”；这只是诊断说明，没有写回候选。

核对了角色81字段与包级3字段，另确认Sargassum的必须拖动、Death Glare普通失败与失败差值分支仍保留。发现这一确定缺陷已经足以拒绝本次中文接受，不由其他正确字段抵销，也不声称其余任意潜在错误已穷尽。付费审核保持关闭；未调用修复译文、未人工改稿、未继续生成。

自动修复诊断能力已由离线错误样本和真实浏览器runtime错误出口的非浏览器测试验证。本次repair成功，没有产生新的invalid_response，无法用这次结果倒推上一轮未保存响应的具体schema缺陷；上一轮精确原因仍UNKNOWN。

## 保存证据与边界

- [首次summary](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-target-choice-format-20261012/fresh-attempt-1/summary.json)：SHA256 `5cc58617bfb1bff07e49c541aa09c6919e474d0fb0c49c40986df171506c80dd`。
- [完整result](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-target-choice-format-20261012/fresh-attempt-1/result.json)：SHA256 `a81f642db1079b46a9630e792af123e764e38f62faea948a2f5aae2ecfd8b022`。
- [独立核源结论](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-target-choice-format-20261012/fresh-attempt-1/semantic-review.json)：原文位置、译文ID、限定通过项、阻断理由和所有原件SHA。
- [收尾边界](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-target-choice-format-20261012/closure.json)：源码与基线核对、0新增请求、未安装/派发/导入。
- 同目录保留fresh-extracted-ir、first-analysis、requests、progress、stages、source-manifest和正式英文encounter-package。后者不是已批准中文包。

Lab仍为旧JS ee6dd617aceb9aeb2d3aa1a20c56c3f9fa3bd71f7a23fc62b6c4da1b50ef0dd3；新构建f0bff6…未安装，没有浏览器派发、世界写入或服务操作。旧原生PASS保持其候选范围，不能移用于本轮。所有代码在第一次结果后不变，后续仅补本记录与总报告；没有commit、merge或push。
