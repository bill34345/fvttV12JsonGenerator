# Forge 工作流设计与借鉴落实缺口复核

日期：2026-10-15。范围为用户质疑的设计、反复返修、外部借鉴和记忆是否落实。只读产品代码和历史证据，新增本地诊断及本报告；没有产品修复、模型生成、翻译、付费审核、Chrome操作、安装或Git发布。当前产品可靠性仍不达标，不把本次分析完成算成修复完成。

## 直接结论

原设计把语言理解和机械抄录放在同一个AI职责里：找出怪物正文、抄回整段、报告精确字符位置，再提取带逐段来源证明的数据。程序严格校验这些AI提供的材料，生成固定格式和Foundry Actor，之后处理自动化及中文。保存来源、阻止编造是必要目标，但让模型承担精确复制与计数增加了不必要的失败面。

这不是刚出现的想法。仓库最早现存package提交`7a098ee`（2026-07-31，迁移记录，不冒充整个功能的首次创建日期）的`provider.ts:92–100`已明确要求发现阶段返回原文quote和UTF-16 start/end；当前同一要求仍在`packages/intake-ai/src/provider.ts:200–204`。本次没有追溯迁移前全部历史，不能断言最初作者或原始动机。

当前分步提取和完整GM手动能力已经改了一部分，但它们在来源发现之后运行。入口的旧AI任务仍存在，因此后面的改进无法挽救在第一步被挡住的新来源。不能将当前所有失败只归为模型随机性、复杂能力或缺一个空格。

## 零模型调用复现的新入口缺陷

原输入：`.local/forge-v7-unseen-archivist-grim/Archivist-Grim-source.md`，SHA-256 `75d1c8a0c7b987683e094ac358c7a475cdd829c7ed41d7d2fe7b5adf33f7b378`。标题`## Archivist Grim cr 10`。

`packages/intake-ai/src/discovery.ts:20`的挑战等级检查缺少忽略大小写标记，只匹配`Challenge`、`challenge`和`CR`，不接受小写`cr`。`encounterIntake.ts:178–185`因此不使用本地单生物识别，转入模型发现。

用冻结V7的实际公开纯函数`singleCreatureSourceCandidate`直接核验：

| 输入 | 本地识别 |
|---|---|
| 未改动失败原件，小写cr | false |
| 仅在内存把标题cr改为CR，其余内容完全相同 | true，保留整篇原文 |

检查收据：`.local/forge-workflow-audit-20261015/local-discovery-case-probe.json`，SHA-256 `dcbf7f73c724dbcf980ee5d342e35b82f47b07381b8ffffaa71a09bff1b50f7d`。模型/网络调用0，原文件写入0，产品代码修改0。这是用于区分原因的内存对照，不是改写正式输入、重跑首次生成或修复产品。

随后那一次真实模型发现返回start=2130、实际2129，并在XP行少一个空格，精确锚定失败。请求HTTP200、49301总tokens，基础/能力/中文/导入均未执行。因此，这次付费发现调用由可复现的本地识别漏判触发，失败终点为模型返回表示与严格锚定不相容。修复大小写只能避免这个具体触发，不能证明其他新来源和后续阶段全部可靠。

## 为什么旧回归没有发现它

`.local/forge-staged-manual-20261013/replay-saved.ts:27–51`读保存的同源IR，分单元后组装，并注入直接返回整个来源的discover函数。它能验证已有资料进入后续处理是否完整，不能证明真实AI发现或所有本地识别分支可靠。这项回归有实际价值，但其成功范围不包括本次入口反例；将它提升为整体可靠性结论不成立。

历史结果保持：六例首次0/6和Archivist Grim首次0/1不改写。V6 Roper首轮收据确有prepared=true、completeChineseDraft=true、5请求、0修复/外层重试；该首轮收据同时注明native NOT_EXECUTED、human PENDING，后续原生证据另行绑定，不能把这些层级混写。因此不能伪造“所有新候选从未成功”，也不能用一份候选成功或九例正常导入证明新来源已经稳定可用。

## 外部方案确实查过，但关键结论未落实完整

2026-10-13的[同类导入器报告](2026-10-13-forge-comparable-importers-and-manual-fallback.md)第72行已建议去掉模型重复抄全文、填写字符位置。同期[分步方案](2026-10-13-forge-staged-api-feasibility.md)第23、42行要求原文范围、位置、编号由程序持有；实施计划第6行也写了同一职责。当前发现分支仍要求模型抄quote及填写位置，说明已有结论没有贯穿真实入口。不是用户交接遗漏，也不是没有外部资料。

本次重新读取原始源码和一手用户问题：

- [5e Statblock Importer固定sbiActor.js](https://github.com/Aioros/5e-statblock-importer/blob/98f5bd9bf3a18b3cb50429f1bef6b735de32271e/scripts/sbiActor.js)：`setActions`先保存完整描述，再配置识别出的攻击/豁免；没有activity时保留utility并加入Actor。可借鉴的是内容先保留、自动化随后附加。它不是对全部来源完整性的证明，未在本机运行，不能说换用即保证中文/版本/来源保真。
- [AI Monster Importer固定总流程](https://github.com/wickercar/foundry-ai-text-importer/blob/7381ed0c34a63020cb870be93d041435e7ab12d1/src/module/monster-parser/genFoundry5eMonsterFromTextBlock.ts)：默认小schema路径分基础信息和能力清单，再处理能力，由formatter组装。说明职责拆分有现成实现。旧版本、异常过滤和switch穿透等问题已在原报告记录，不整套无条件复制。
- [5e Importer用户问题65](https://github.com/Aioros/5e-statblock-importer/issues/65)：2026-09-27实际用户要求逐项预览、未识别文字提示及原文保存。本次正文已读取；用户建议不能当成最新实现全部未具备。
- [AI Importer用户问题5](https://github.com/wickercar/foundry-ai-text-importer/issues/5)：2024-03-24用户给出完整原文，报告错误豁免熟练与加值，并跟进多个来源均发生。这支持必须对照数值，不能只因工具已有拆分便认定可靠；不是本机修复证据。

搜索使用AnySearch：通用批次找到同类仓库，code子域本次返回不相关实现，不用于技术结论；issue65正文提取成功，issue5和raw源码提取明确失败，随后用网页工具读取原始GitHub页面及固定提交源码。没有改认证、安装第三方模块或增加模型请求。

## 本次责任与下一步边界

有外部调研记录，也有用户偏好和重复失败的记忆。问题在执行：只落地部分借鉴，保留了错误职责；保存输入回归和后续导入成功又被赋予过大的完成含义。不能再用缺交接、没记忆或外部没有现成方法解释。

后续实现应先让程序可靠保存和划分完整资料，精确位置与原文由程序生成；模型只处理需要理解的事实/翻译。新来源的完整内容、基础值和中文候选成立后，再进入正常导入及刷新；安全自动化作为附加能力。必须先用保存失败和常见排版变体离线证明入口，以及真实缺文/冲突仍拒绝；不能只改大写检查后宣布全修好，也不以追加付费尝试代替证明。

本轮产品状态：未修复，未付费重跑。新的入口原因已用实际冻结函数复现；外部借鉴落实缺口已定位。没有给出修复成功、工时或成本保证。
