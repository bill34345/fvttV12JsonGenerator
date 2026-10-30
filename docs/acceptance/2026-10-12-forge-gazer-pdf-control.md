# 眼魔PDF对照：Gazer CR 1/2

**首次结果：FAIL/needs_review，90.715秒、2次模型HTTP，付费审核0。** 已形成7个Item的英文Actor结构草稿；Force Ray的推离结果被标为literal-only，正式准入拦截在GM配置生成之前。没有中文草稿、prepared战斗包、安装、导入或刷新。未修改产品或候选，不换另一个怪物继续试到通过。

用户要求从此前眼魔PDF任选一只测试。本轮选第4页左侧Gazer完整数据块，作为较低复杂度的单样本对照；不是随机统计样本，也不把低CR等同于全部机制可原生自动执行。延续一次全新生成、成功核源后导入刷新、失败停止、付费审核关闭及不合并master的约束。

PDF为已验证原文件Beholders.pdf，SHA256 cc7f114b0dcf7e96386665488ee57ec27139440fb46be94aaadca763d0ed2034。完整第4页已用Poppler渲染目视核对。pdfplumber按左侧statblock坐标原生提取，小型大写标题字体的基线不同，故单独提取标题与正文，保留全部文字。未改写规则；本页数据块外Gazer/Spectator Lore未作为能力导入。pdftotext在此runtime未提供，不安装或换PDF；使用已可用的pdfplumber完成文本提取。

来源gazer-source.md共1732字符，SHA a9c9cfc009ee19152ab64755bbda600628eabc3add772f32ecbad05a174b9a9b；保留PDF页码、bbox、原生提取说明和独立渲染原件。基线包括AC13、HP13(3d4+6)、飞行30/悬浮、倒地免疫、微型异怪、两特性、两条不重复随机射线/60尺/全部DC12；魅惑+恍惚、恐慌、3d6寒冷及25(1d10×5)尺推离完整保留，不删除难表达的机制。

产品代码不变，使用已通过本地检查的b4b6dd4e2ecb4abd79114ba5371cc23d8fd4e505fe90b1ae4370c1c50dfcc692构建；不因换来源重跑无影响的全仓检查。84个既有dirty/untracked文件身份记录于.local/forge-beholders-control-20261012/baseline.json。真实提交只改来源与标签，模型、审核、计量和停止规则复用前次固定机制，不复用旧IR/配置/译文。

## 输入准备与一次正式提交

初次脚本在读取API凭据/调用模型之前被来源指纹检查挡住：Python在Windows写文本时把LF转换成CRLF，而收据记录的是LF字符串。该前置尝试模型HTTP和生成提交均为0，记录在preflight-failure.json与原fresh-run.log；没有删除或覆盖失败记录。将新提取源文件统一为原记录的LF后，用Bun独立核对1732字符及SHA一致。正式输出使用独占fresh-submission-1，只有这一次真实generateEncounterFromHumanMarkdown调用。

北京时间2026-10-12 17:26:59.603至17:28:30.317：

| 阶段 | 请求数 | 耗时/结果 |
| --- | ---: | --- |
| 新提取 | 1 | 67.230秒；将MOD SAVE表头标为mechanical，但claimPaths为空，触发UNCLAIMED_MECHANICAL_COVERAGE |
| 原有一次IR修复 | 1 | 23.319秒；补上/creature/abilities与/creature/saves关联，分析ready_to_generate |
| 确定性正式生成 | 0 | Actor结构草稿形成；Intake来源比较accepted，正式语义门禁needs_review |
| 配套配置、翻译、付费审核 | 0 | 均未进入 |
| 总流程 | **2** | **90.715秒，首次失败后停止** |

两次HTTP均200/finish_reason=stop。耗时不含PDF准备和事后分析；由于停止层位与海鬼婆不同，不将时间差解释为整个流程提速。

## 精确阻断与证据

结果内的candidateResponse.result.diagnostics为GEN_LITERAL_REVIEW_REQUIRED：机制仅保留文字，需要人工处理。外层只显示“GAZER尚未通过正式生成与来源校验”，没有带出该详细原因；不能把空generation.findings误判为没有阻断。

只读解析保存的finalSource并通过canonical adapter定位原mechanic ID，没有重新生成候选、调用模型或改变文件：

- mechanicId：b631f5222bc321ab。
- path：actor/structuredActions/动作/4/save，对应Force Ray。
- dc=12，ability=str，outcome=literal，projection=literal-only。
- 原规则：力量DC12豁免；失败时被推离25（1d10×5）尺。
- 已生成的Force Ray Item具有STR/DC12 Save活动，完整推离文字仍在描述中；没有把文字保留当作自动推离实现。

当前[战斗包入口](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/packages/forge-browser-runtime/src/encounterIntake.ts:230)在这一状态下返回pending；例外入口要求有特定的GM/分阶段阻断finding，本次没有该类finding，尚未进入固定配置生成。现有manualPreparationRules主要从状态条件识别准备声明；本次Force Ray没有appliedConditions。报告这条已观察到的衔接边界，不放宽GEN_LITERAL_REVIEW_REQUIRED，也不虚构新GM声明继续。

结构草稿中有2特性、Eye Rays总说明和4个射线条目，共7个Item；4种射线已有WIS/WIS/DEX/STR的DC12 Save。状态/伤害文字和随机两条、不重复重掷规则保留在本次来源与草稿中。没有运行战斗，也没有验证其全部实际结算。

因此，这个单样本说明低CR也能触发“文字保留后果到GM准备”的流程边界；它不证明Foundry无法表示Gazer，不提供一般成功率，更不能把未获准的Actor结构草稿算成导入成功。

## 原件与收尾

- [首次summary](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-beholders-control-20261012/fresh-submission-1/summary.json)：SHA256 10805d2b69ae14bfdef4c4830f01f9197b14ce895cd05593d30410c0b6c5dd00。
- [完整result](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-beholders-control-20261012/fresh-submission-1/result.json)：SHA256 e82120b2b013fc21116696f43d40e0131ab7b5f554d274290f41caff80acde9d。
- [独立失败分析](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-beholders-control-20261012/fresh-submission-1/failure-analysis.json)：PDF与源绑定、初始coverage、修复后关联、实际Force Ray活动、正式门禁和原件SHA。
- [收尾记录](I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample/.local/forge-beholders-control-20261012/closure.json)：199个产品源码与运行时快照一致，84个既有dirty/untracked文件均不变，HEAD未动。

输入原页图、两种文本提取观察、最终原生文本、源绑定、前置错误、请求与阶段记录均保留在.local/forge-beholders-control-20261012。只新增本轮来源、工具和报告，没有产品修改、模型追加、IR/译文修正、其他怪物试跑或浏览器派发。Lab仍是旧ee6dd6…构建，没有服务或世界操作；未commit/merge/push。
