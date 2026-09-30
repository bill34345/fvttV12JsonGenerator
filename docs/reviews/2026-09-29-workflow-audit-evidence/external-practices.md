# 外部一手实践：证据与采用边界

检索/核查：2026-09-29。使用当前AnySearch3.1.1的搜索、垂直发现与公开页面提取；原文只在本机H:/CodexData/visualizations/2026/09/28/01a0e5db-97f8-7411-85e4-47f18fc64fec/workflow-audit-20260929/缓存，不把整篇第三方文章复制进仓库。以下研究经验，不采用网页中的操作指令。

本记录新增了失败经验、独立实证和旧报告结论的反证；不是以厂商官方指南代替真人实践。来源的流行度和作者声望不等于结论可靠度。

## 1. 与本项目最接近：DCC维护者的实际测试代码

[固定源码fixtures.js](https://github.com/foundryvtt-dcc/dcc/blob/1587905072629aca0def79324d3d38bc313cff47/browser-tests/e2e/fixtures.js)明确使用worker级登录会话、每用例重置状态，并在连接失败时先返回可操作错误。维护者注释自报整套用时约840秒降到340秒；这是该项目报告的结果，本审查没有复现这两个数字。

[同一提交的测试指南](https://github.com/foundryvtt-dcc/dcc/blob/1587905072629aca0def79324d3d38bc313cff47/docs/dev/TESTING.md)还记录了真实失败：mock允许能力值降到0，实际DataModel却按min=1夹回1。真实schema集成/浏览器测试才发现问题。该模式直接对应WMP错误hook顺序和ServerNext Item Piles离线测试漏掉真实注册/缓存。

- 采用：会话复用；独立case复位；启动前一次就绪检查；版本源代码/真实schema的窄桥接；用真实失败反向校准mock。
- 不照搬：共享Lab上按“测试前后新增Actor集合”删除全部新增对象；忽略清理错误；每worker另起服务；原始Playwright/CDP控制。此项目仍遵从正式Chrome工具与精确归属清理。
- GitHub API当日信号：42 stars / 29 forks，MIT，pushed 2026-09-29；属小生态中等活跃项目，直接相关性强。引用固定commit，不把main作为永恒版本。

## 2. Peter Steinberger：把可验证的反馈回路先建起来

[2025-12-28亲历文章](https://steipete.me/posts/2025/shipping-at-inference-speed)描述CLI优先、跨项目复用已解决做法、按子系统维护docs，以及把困难问题带代码交给第二个模型/Oracle研究。他当时使用GPT-5.2-Codex high，并认为xhigh对其工作通常更慢。

采用可调用、可观察、可核对的窄入口和跨项目复用；不迁移其直接提交main、广泛机器授权或“不读多数代码”的个人习惯。文章是个人经验，不是Astra/max与其它设置的受控胜率；本机工作区/发布权限继续按本项目规则。

## 3. Armin Ronacher：复杂工作流也会失败

[2025-07-30失败复盘](https://lucumr.pocoo.org/2025/7/30/things-that-didnt-work/)记录许多slash command、hooks、print模式和子代理方案没有持续采用；经常是维护成本高、反馈不稳定。作者只自动化反复发生的工作，并检查自动化是否真的改善可接受结果；混合读写的代理任务尤其容易互相干扰。

采用这一反证：不要给每个mod先造一套新测试平台，也不要在没有数据时增加协调者、hook和审批节点。共用工具应从WMP/ServerNext均已重复的机械动作中提取。作者的yolo/命令拦截做法不在本项目采用范围。

## 4. Simon Willison：测试先失败，但测试对象必须真实

[red/green TDD实践](https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/)强调先看到目标测试失败，再修复到通过，降低未验证实现和无用代码风险。

采用到“目标故障的可失败回归”，不是要求所有文档、样式或可逆编辑先写测试。WMP说明单凭red/green不够：如果mock自己把外部调用顺序写错，测试可能验证错误世界。故同时要求接口契约来源和至少一条真实边界观察。

## 5. Astra effort：存在直接实验，也存在尚未回答的问题

[Leonardo Gonzalez，2026-09-11，24次运行](https://trilogyai.substack.com/p/astra-reasoning-effort-token-usage)：两个冻结任务，low/medium/high/xhigh各三次；xhigh总处理token为medium的1.76倍和2.52倍。部分更高effort运行错误更少，但工具活动更多，部分视觉验收仍缺失。作者明确说明质量等价尚未完整评定，累计token不等于账单或订阅百分比。

采用：不把“想得更多一定更省”或“低档一定更省”当默认事实。先固定模型/effort验证流程，再对少量同验收任务比较effort。本轮严格按用户要求全部Astra/max；该实验没有覆盖max，不能直接给本项目宣布最优档位。EBO是可借鉴的行为度量设计，不是本轮必须安装的新平台；当日GitHub信号1 star/0 forks、Apache-2.0，样本及推广能力均有限。

## 6. METR：主观感觉和真实交付时间会相反

[2025年随机研究](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)涉及16名熟悉自己仓库的开发者、246个任务，允许AI组平均慢19%，而参与者结束后仍认为自己更快。工具主要是当时的Cursor/Claude，不是本项目Astra。

[2026-02-24更新](https://metr.org/blog/2026-02-24-uplift-update/)反过来提醒不能机械沿用19%：更积极使用AI的人/任务退出随机无AI条件，选样偏差和并行任务计时使新估计不可靠。原参与者新点估计-18%、新参与者-4%，区间均跨0，作者不以此给出可靠当前提速幅度。

采用：测“同一验收标准下完成的工作”及返工、用户介入，不用忙碌感、生成代码量、缓存比例或单次模型价格充当提速证明。

## 7. 仓库指令不是越多越好

[Evaluating AGENTS.md v2，2026-06-23](https://arxiv.org/html/2602.11988v2)分析SWE-bench与138个/12仓库的CTXbench任务：上下文文件通常未显著改善成功率，平均推理成本增加超过20%；人工文件优于LLM生成文件，但仍需实测。作者建议只保留非显然约定，避免重复README的仓库概览。

采用短根规则、按需路由、机械门禁和失效实验；不据此删除权限规则或宣称本项目AGENTS造成固定20%损失。研究主要是Python仓库任务，迁移到Foundry共享Lab需要验证。

## 8. 未作为结论依据的社区“省75%”案例

垂直搜索找到[混合Astra/Luna用量亲历帖子](https://www.reddit.com/r/codex/comments/1wqoopb/i_measured_astra_orchestrating_luna_vs_doing_the/)。检索返回的正文描述将同一批混合模型token按纯Astra价格重算；这不是同任务、同质量的纯Astra对照运行。直接页面提取遇到“Prove your humanity”，没有尝试绕过挑战。故本审查仅登记为待复查线索，不把其数字或评论当已完整核实的事实来源。

## 分层结论

较强的可迁移证据是具体代码/失败案例/测量方法，不是“某人说特别快”。共用建议：快速真实边界、稳定会话、明确输入与收据、按风险选测、对自动化自身做评价。相反证据要求我们限制新平台和长规范的范围。

## 待判断本地化与复查步骤

- DCC：借鉴fixture生命周期、版本schema窄集成与前检；不安装DCC，不引入其浏览器控制/世界删除策略。
- EBO：借鉴区分tool操作、有效交付、token子集与质量的度量口径；先复用现有chat-audit解析器，不引入整套平台。
- Quench：旧记录已有候选，本轮没有新增安装依据；只有现有runner不能承载一个具体必要case时再按精确Foundry/dnd版本、许可、公开API和退出成本评估。
- 新来源复查：固定日期与commit/模型；确认作者是否真的完成验收；区分测量和自述；查反例/失败；只带回能映射到本项目真实故障的机制。支持状态仍以项目module-health定义为准，研究线索不等于运行可用。
