# 最终v39提示词：两条龙各一次新回复的首轮结果

结论：2026-10-23，在提交`8584bc9f3aa491cd84dae6830e085234c1e9af7f`的产品代码和最终v39提取提示词不变的条件下，成年绿龙、成年黄铜龙各重新处理一次，均首轮正式accepted、来源校验accepted、0 findings。没有复用旧AI答案，没有修复调用、额外审核或修改后重跑。

用户要求及原话在[当前交接入口](../plans/2026-10-20-forge-ab-current-state.md)。本次专门补齐上一批未证明的同版首轮结果，不覆盖或改写上一批12轮开发中的失败记录。

## 执行与结果

复用已有`tests/diagnostics/forge-ds-dragons-real.ts`的真实调用入口，先零联网预检，再对两个来源各执行一次普通Forge分析／正式生成。实际模型deepseek-flash，Responses流式、reasoning low、JSON object；自动纠错和额外审核关闭。

| 对象 | 实际请求 | 首次正式结果 | 本次新产物关键值 |
| --- | --- | --- | --- |
| 成年绿龙 | 发现1、提取1 | accepted／0问题 | HP207／207、18d12 + 90；CHA／DC17；普通与传奇Mind Spike均三环、同源引用、传奇费用1 |
| 成年黄铜龙 | 本地发现、提取1 | accepted／0问题 | HP172／172、15d12 + 75；CHA／DC16；Blazing Light复用Scorching Ray、传奇费用1 |

两者传奇动作／抗性账本均基础3、巢穴4，传奇动作自身回合开始恢复。黄铜龙Shapechange完整特殊限制保留为GM授予，不进入普通法术引用；睡眠吐息的再次豁免、第二次失败、10分钟及伤害／近身唤醒条件完整保留在GM规则中。关键字段核对同时读取了本次新IR和正式Actor JSON，没有手工修补数据。

两个提取请求的system提示词逐字相同，按本次保存的规范JSON计算SHA-256为`eabf68a35bf68cb637f3d3fe10d81dec2ffb081eba2e987c25ebd541f5f1326e`。提取版本均`monster-intake-extract-v39-source-grant-references`，发现版本v2；产品文件与调用前冻结的哈希保持相同。

实际HTTP请求共3次，均200且完成；提取各约110秒、115秒。总输入28,459、输出44,631、合计73,090 tokens，不据此推算账单。服务端usage中的输入缓存不等于复用旧答案：本次三个请求均实际发送，保留新的请求、原始答案和响应身份。

## 证据与边界

证据根：`H:/CodexData/visualizations/2026/10/22/01a163d8-f3e5-7663-bd1b-25d55bfdac88/forge-ds-dragons-20261023-v39-firstpass-151916/`。

- `intent.json`、`scope-guard.json`：版本、源哈希、一次处理范围及调用前产品文件哈希。
- `green/`、`brass/`：各自原文、本次请求／答案、IR、分析、正式生成及Actor JSON。
- `result.json`、`requests.json`：首次结果、真实请求数、时间、返回模型及usage。
- `first-pass-review.json`：相同system提示词、新产物关键规则核对及文件SHA；凭据扫描0处。

本次结论是“同一最终版提示词，本次两只均首轮通过正式生成与来源验收”，不是任意样本或重复采样成功率保证。实际调用在Bun中的公共Forge入口执行；未对本次新Actor再次进行Foundry创建、Resolver运行或完整玩法验收，上一批的原生验收仍只支持其原有数据与范围。

本轮只新增结果记录，不改产品、提示词、测试入口、用户操作步骤或支持范围；手册说明仍准确，沿用原有效检查，不重复产品测试或浏览器验收。不改hook源码／配置，不合并、不推送。
