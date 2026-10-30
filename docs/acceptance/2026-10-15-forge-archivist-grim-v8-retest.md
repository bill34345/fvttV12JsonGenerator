# Archivist Grim 修复后单次复验：未通过

本轮为用户明确授权的修复后复验，不是新的首次生成成绩。原先V7的首次失败0/1及其输入、回复和收据不改写。

## 冻结与执行

V8冻结清单：`.local/forge-archivist-grim-retest-20261015/candidate-freeze-v8.json`，SHA-256 `f115453ef65b15b1154b8bbb3224b04b4a7168d79cf8e3afb760c0701a0bb15e`，356文件。使用正常browser bundle构建入口在本轮独立产物目录构建16个模块文件；未覆盖V7 dist/发行原件，未安装V8模块。

同一Archivist Grim输入SHA-256 `75d1c8a0c7b987683e094ac358c7a475cdd829c7ed41d7d2fe7b5adf33f7b378`；作者完整原文SHA-256 `3b6e3c0e5e0938a58341b99c7a11c6844301f9a8ebace0bc4cbbf0042b66efb1`。未使用旧IR或译文。DeepSeek deepseek-flash/openai-chat/low/json_object；基础事实与完整能力分步，付费审核关闭。

运行器目录只建立一次，阶段重试、重复请求、AI修正和翻译修复均有发请求前的拦截。实际只发出1次请求，没有重试或修正，也没有触发付费审核。

## 真实结果

| 阶段 | 结果 |
|---|---|
| 本地来源发现 | 通过，single-statblock，模型发现调用0。旧的发现定位故障未在本次触发；新行ID提示因本地已识别而没有线上执行。 |
| 程序来源分单元 | validated，完整source图已进入基础提取；未以手写IR替代。 |
| 基础数据模型请求 | 未完成。2026-10-15 09:33:17（上海）发出；HTTP headers为200，约300012ms在本次300秒上限处结束。未取得可用完整模型回复、finish reason或token用量。 |
| 业务判定 | actor analysis=failed，`ANALYSIS_NETWORK: AI provider network request failed.`；顶层needs_review，prepared=false。程序退出0不能当作业务成功。 |
| 完整中文及人工中文核对 | NOT_EXECUTED，无完整Actor或译文可核对。 |
| 导入及刷新 | NOT_EXECUTED，无有效候选，未进入浏览器验收。 |

现有证据只证明请求未能交付完整结果；不能确定是服务端生成过慢、网络中断还是响应读取问题，更不能把HTTP200当成生成通过。没有为查原因追加模型请求，没有调整超时或更换模型后重跑。未取得token/费用字段，不报告为零用量或零费用。

## 现场与权限

原件在`.local/forge-archivist-grim-retest-20261015/run-1/`：started、requests、extraction-stages、progress、latest-report、result及generation-receipt。没有完整provider reply文件，不能补造。原先首次失败目录保持原样。

本地Mirror原服务已不存在，本轮核对无Foundry peer及30001监听后，复用既有14.368/Node24.17.0/server-mirror/cor-cotn/dnd5e5.3.3启动，PID54732，仅127.0.0.1:30001。没有改配置、备份、停止其他进程或新建Lab。16个已安装旧业务文件与之前的恢复收据一致。本轮未安装V8、未创建Actor/Macro/helper、未打开浏览器测试页；服务按既有常驻约定保留。

结果为修复后复验0/1，整体生成仍未跑通。356冻结文件、旧1358份证据、9份历史发行原件及原首次失败关联原件在最终收据核对；HEAD/index不变。不提交、不合并、不推送。失败后停止，没有继续用模型额度修正或筛选成功结果。
