# 原生传奇抗性计数与特性按钮连接修复

日期：2026-10-29。用户针对上一轮已确认的连接缺口明确授权：“修复”。沿用当前worktree，保留原来正确行为；不新增模型请求，不提交、合并或推送。

## 问题与目标

本次独角兽原答正确提供`legendary.resistanceMax:3`，特性为GM手动且没有独立uses。程序正确生成原生3次，却仅在特性重复提供uses时连接按钮消费，导致旧正确Actor已有的计数按钮配置缺失。

本轮以现有明确资源字段完成连接，不从名称或正文猜次数，不要求AI重复写同一个次数；旧uses形式继续可用，冲突、缺省和不支持的组合不得改成猜测。IR、原答和最终JSON不手改。

## 本批检查选择

- 先在真实workflow局部测试复现ledger-only按钮缺消费，再验证修复；复用旧uses、资源报告和边界测试，补数量/巢穴/冲突与不相关项。
- 独立以本批保存的六只原答各本地生成一次，与V54原Actor完整对照：只允许本次原生绑定的明确变化，其余能力、法术、数值、资源、效果和正文必须保持。报告序列化/结构读回继续检查，不能仅看Actor存在。
- 类型、架构及局部anti-overfit按实际改动运行；手册核对受影响说明并按已有watch更新review/生成页面。
- 资源报告组的旧真实Balor/Unicorn两项最初因未设置原答目录跳过；父代理补齐这两个实际目录后运行该组，专门补旧uses真实回答的兼容证据。此缺口不由V54不同回答的重放代替。
- 不重复真实AI或无关全仓测试，不运行浏览器、Foundry或能力消费。实际点击消费属于未执行层级，配置证据与运行证据分别报告。

## 修复结果

代码修复、本地正式workflow、完整Actor对照与独立审查完成。原答不变，不新增模型请求。独角兽特性现在使用`attribute → resources.legres.value → 1`，与系统原生传奇抗性共用原生3次；Item没有独立次数池。

| 生物 | 成功程度 | 问题点 |
|---|---|---|
| 美杜莎 Medusa | 完全成功 | — |
| 石绳怪 Roper | 完全成功 | — |
| 独角兽 Unicorn | 完全成功 | — |
| 祭司 Priest | 完全成功 | — |
| 贝希尔 Behir | 完全成功 | — |
| 成年黄铜龙 Adult Brass Dragon | 完全成功 | — |

表格仅指本次原答冻结复验的内容和配置。原六次真实首答的5完全/1部分成绩保持，不改写为六次首答全成功；本轮没有真实点击、Foundry导入或战斗验收。

## 实现

- `intake-ai/src/native-resources.ts`保留旧每日uses候选的完整筛选、唯一、冲突和共享池边界；只有不存在旧式合格候选时，才允许唯一、结构合格、未声明uses的标准传奇抗性特性使用明确的`legendary.resistanceMax`。缺省、0、无效或冲突次数不猜；短休周期、复合机制和多个合格候选不被fallback绕过。
- `intake-ai/src/renderer.ts`只为这种绑定添加现有`actorResource:legres`标记；保留只有ledger时的手动字段，不修改IR，也不合成另一份Item uses，避免v12新增资源池。
- `generation/src/adapters.ts`为这种已有标记补充正式机制检查，路径指向真实的`actorResource`而不是不存在的`feature.uses`；内部`nativeResistanceLedgerOnly`只用于区分报告来源。
- `generation/src/verification.ts`在v14同时检查原生容量、spent、无独立Item池、唯一Utility、唯一正确的属性消费及其值。v12保留原报告口径；既有uses路径并未因此被免检。输出仍使用原先精确允许的资源/文档路径，没有放宽协议。

没有更改提示词、parser、原有Actor生成函数、报告协议、原答或最终JSON；没有新增“从原文找3次”之类推断。

## 检查与实际边界

1. 回归先红后绿：原生字段独立提供1/3/5次时，旧实现三项都缺资源绑定报告；旧uses对应正例原本通过。修复后两种表示均通过真实workflow及正式报告/序列化/schema往返。
2. `test:forge-native-resource-language`最终43通过、0失败、181断言；包含中文标准名称/sourceQualifier、普通/巢穴3/4、旧uses、计数和周期冲突、0/缺省、多个候选、无关特性、复合施法记录与共享池。v12带新标记与去掉该标记的完整Actor和verification严格相同，仅对齐生成时间。
3. `test:forge-native-resource-report`最终14通过、0失败、197断言，包含设置真实目录后补齐的旧Balor/Unicorn原答。容量、消费删除/改错及重复池的变异会失败；未登记路径仍拒绝。最初12通过/2跳过的日志保留，最终不将跳过计通过。
4. 独立六只重放经过同一Forge公共入口和正式workflow。完整IR六份原样保持；Medusa/Roper/Priest/Behir整张Actor严格相同，无时间字段排除。Unicorn/Brass只变更同一特性的identifier、空Item uses和Activity消费三个字段；没有其他差异，原生容量及巢穴记录未改。
5. 保存的六份正式响应经过真实wire schema读回，artifact与保存Actor相等；读回阶段生成/网络/输出写入均为0。两只受影响Actor的`verify:actor`通过，无warning或sourceIntegrityError。
6. 独立审查发现本次初稿改变了旧混合候选筛选：一个合格每日uses特性与另一个同名但短休/复合特性并存时，原合格项会失去绑定。该P2已修正，两个完整Actor/verification反例先红后绿，增量复核无新实质发现。初次YAML测试解析错误日志保留，不将它算作产品红灯。
7. 最后只修改helper筛选顺序；对六份已保存IR的当前渲染/解析资源、actorResource、uses、executionMode只读核对与原重放相同，其他三个产品文件hash未变。因此复用第4/5项有效生成和来源证据，没有为报告重新生成六只。
8. `typecheck:packages`通过；最终helper修订后补验Intake包类型通过。架构无违规，局部anti-overfit四个实现文件通过，最终helper再查通过。Forge候选构建通过，未安装到任何运行实例。
9. 手册六个受影响条目人工核对，原有三处计数说明补字段来源与边界，watch和目录覆盖保持；生成页面及`handbook:check`通过，33项一致。

本轮真实模型请求0，AI内容复核保持关闭。没有浏览器、Foundry、Use/Cast/Apply、投骰或世界写入。旧实现已验证的原生属性消费表示被复用；本轮证据确认生成配置正确，不扩大为实际点击扣减已验收。

## 保留和交付

原六次首答、旧产物和旧失败保留；本次修好产物在私有证据根`replay-final/`，不覆盖旧JSON。最终范围与hash检查收尾记录在`preservation-final.json`。HEAD不变、暂存区为空，不提交、合并或推送。

关键收据：`worker-red.log`、`worker-legacy-candidates-red2.log`、`worker-legacy-candidates-green.log`、`legacy-real-report-final.log`、`six-comparison.json`、`wire-readback.log`、`verify-unicorn.log`、`verify-brass.log`、`legacy-candidate-six-source-impact.json`、`worker-legacy-final-hashes.json`、类型/架构/anti-overfit/构建/手册日志。独立审查结论绑定最终helper SHA-256 `904e646e632fddb1c75b4064048245122e3df2ecdac886469ff3089e71baeb95`。

私有证据根：`H:/CodexData/visualizations/2026/10/29/01a18790-ad68-79e3-8895-49616acd060d/forge-native-resistance-binding-fix/`。开工基线包含2,750份仓库文件及95份本批V54证据文件hash。
