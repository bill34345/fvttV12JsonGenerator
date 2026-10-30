# Forge 来源由程序保管：修复及离线验证

本轮只在现有工作树修来源入口，不调用DeepSeek、Codex模型服务、翻译或付费审核，不操作Chrome/Foundry，不安装、提交、合并、推送。历史失败、V7冻结清单和发行包保留；当前源码将成为新的未发布候选，不能再声称与V7的源码SHA相同。

## 借鉴与适配

- 5e Statblock Importer固定提交`98f5bd9bf3a18b3cb50429f1bef6b735de32271e`的`sbiParser.parseInput`按原文行处理，程序持有lineNumber；`sbiActor.setActions`先保存能力描述，再加已识别自动化。来源代码及MIT许可已保存在`.local/forge-comparable-importers-20261013/statblock/`，不重新安装第三方模块。
- Google LangExtract的`resolver.align`由程序根据来源设置字符范围，明确区分精确、部分、模糊匹配。这支持把精确坐标留给程序；本任务只借鉴职责，不引入Python依赖，也不采用允许丢词或改数值的模糊/部分匹配。源码：https://github.com/google/langextract/blob/main/langextract/resolver.py ，本轮保存实际提交及源码SHA。
- 本轮适配：不规则多怪物资料仍可请模型判断分段，但只选择程序已编号的首末文字行。原始范围和quote由程序从输入截取；公开DiscoveryResult保持原结构，内部提示版本升级。这一行选择适配尚无真实模型成功率/费用证据，离线测试不冒充在线成功。

## 实施范围

1. 用保存的Archivist Grim来源/原回复创建带hash的固定回归输入，保留原始文件。先复现原入口漏认、旧发现回复锚定失败。
2. 本地完整单生物识别统一大小写，保持完整原文及多生物歧义保护。
3. provider发现步骤改为选择既有行ID，程序生成精确范围和原文。未知/逆序ID、错误形状直接拒绝，不为此新增模型重试；保存回复仍可按旧公开结构离线核验。
4. 旧发现回复只允许唯一、全词内容相同的空白表示映射，输出恢复为精确原文。错误数字、否定词或正文变化、重复歧义继续拒绝；不使用近似字符串相似度放行。

离线首次进入完整来源切分后暴露`UNKNOWN_HEADING /source/18`：原文AC之前的Lore/Tactics和重复的明确CR标题被当成未知能力标题。本轮在同一来源入口范围内保留这些已知前言标题和全文到base/biography，不放宽属性表之后未知机械标题的拒绝。初次失败记录保留在green.log，不删失败测试或改原输入。

## 验证及判定

- 原失败输入走真实`generateEncounterFromHumanMarkdown`发现入口，断言发现provider调用0，提取阶段收到完整来源和七能力；测试在没有历史基础提取回复处停止，不能声称已生成Actor。
- 保存的原始模型发现回复可重新关联原文，并按正式partition保留全篇。正例覆盖CR大小写、CRLF、空白表示、Unicode和多生物；反例覆盖实际内容错误、重复来源和非法行选择。
- 经真实provider端口注入本地HTTP回复，检查实际发出的请求不要求quote/字符计数，回复由程序恢复原文，网络和模型调用为0。
- 受影响provider/orchestrator/Forge入口执行已有安全集成入口及相关类型检查。记录原因后做局部anti-overfit。已有保存输入到Actor链只在新发现行为的相关边界复用或离线补测，不重复已通过的浏览器验收。
- 输入/输出/用户操作不变；若必需手册检查报告watch stale，人工复核相关入口后更新review并生成页面，不修改watch来绕过。

最终分开报告：新入口离线结果、旧保存输入正式Actor结果、完整中文、真实首次模型结果、Foundry导入刷新。后两者本轮不执行。只将本轮入口离线修复记录为对应层级，不把整个mod写成修好了。

本轮检查选择：新增26项入口/保存失败/行选择正反例已从原失败转为通过。发现provider内部协议变化影响已有provider/orchestrator消费者，来源切分变化影响既有分步提取，因此下一次只运行`test:forge-encounter`、`test:forge-staged-manual`及`typecheck:packages`；不跑全仓CI。之后仅按结果补实际缺口，并做局部anti-overfit及受影响手册核对。

上述547项消费端回归、182项分步回归和packages类型检查已通过。为补齐“新来源切分实现仍能处理保存失败数据”的实际出口，复用原有12例`replay-fullchain.ts`到新`offline-r8`目录，再执行原有24条正式verify；历史r5原件不改。只检查本次3个生产文件的anti-overfit，按package规则运行architecture门禁，并核对手册stale项。新怪物没有历史基础/中文回复，不能编造它的完整Actor或中文通过。

12例/123能力和24条verify通过；与旧r5比较10份package hash相同、2份不同。结束前只补这两份差异的字段及原文核对，不能直接复用它们的旧原生批准。已复核6条受影响手册，build/check33项通过；不因这次记录或比较重复已通过测试。
