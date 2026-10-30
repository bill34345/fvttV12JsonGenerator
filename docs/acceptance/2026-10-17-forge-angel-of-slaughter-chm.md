# 屠戮天使：新来源施法与资源验收

本轮指定样例的正常 DeepSeek、正式生成、导入、法术匹配、实际施法、独立每日次数、耗尽拦截和刷新读回均已接受。验收限定本来源及下述共用规则，不把这一轮接受扩大为整个 Forge 的所有复杂能力均已完成。

## 来源与版本

- 用户指定同一份 `DND五版不全书26.08.06之颤栗吧，血族降临！.chm`，条目 `其他/beyond drops/26.6/屠戮天使.htm`。CHM SHA256 `6df351581640de743c64a1c557d577930257bf7c7a89980363cc5ce2e7fa529e`。
- 首次调用前没有发现此怪参与修复、预检或生成；只曾出现在 CHM 文件目录列表。保留 GBK 原始 HTML 和只转换排版、全部文本节点各一次的 1825 字符 Markdown，SHA256 `7e2ec0f66d9a6c602e36b85d2c4c1a396b524474a162ea6b62c0ef10ad26e5e8`。
- 用户已纠正验收用词：原文是随意易容术（24小时），操控天气、位面转移每项1/日。按原文验收，不制造传统分环法术位。
- 复用现有 dirty worktree；未提交、合并或推送。本地 Mirror 原进程 PID12252、loopback30001、`server-mirror/cor-cotn`，Core14.368/dnd5e5.3.3，未重启 Foundry。

## 第一份真实失败与共用修复

未提前为此怪改代码或预检，`normal-run-1` 实际1次 HTTP200 后，在正式生成遭遇 `InvalidMixedFeatureBoundary`，没有生成可导入 Actor。原始来源、可见模型回答、IR、失败 Markdown、请求记录和结果均保留，没有改写成通过。

1. 施法段尾部纯空白被误算为额外 GM 规则，随后正确的“手动规则不可为空”检查阻断整卡。修复只忽略纯排版空白作为授予规则；完整说明保留，非空未承接规则仍阻断。
2. 一次攻击已有完整的无条件追加伤害，但下一句的受擒／位移条件让追加伤害被一起拒绝。现在只在句子完整结束、后句明确属于非伤害结果时保留前句追加伤害。条件伤害、残句、引用此次伤害等反例继续拒绝。
3. 单次明确豁免前有完整移动介绍句时，整项曾退回纯文字。现在保留明确单属性/DC豁免，并把完整介绍与特殊目标、结果保留给 GM；介绍中的移动距离不会被推成豁免射程或模板。

生产修改仅在 `packages/intake-ai/src/staged-spellcasting.ts` 与 `staged-feature-mechanics.ts`，没有怪物名、固定DC或骰式分支。真实失败进入 `tests/fixtures/forge-slaughter-first-provider-failure.json`，并增加不同名字、数值和相近条件反例。

## 正式链路与实机

修复后的 `normal-run-2` 是修复复测，实际4次 DeepSeek 请求，正式生成与来源 verifier 通过；没有手改 IR、Markdown 或最终 Actor。候选与模型调用冻结的311个业务源文件相同。

原来源已经是中文。本次把实际生成的未修改 `source-package.json` 上传正常 Forge 页面，正式预览、勾选核对确认并导入 `Actor.b721f4f36bd7052f`。模型另外生成的中文草稿作为未批准原件保留，未伪造本地化批准。此次生成在正常生产 CLI 入口执行，导入和所有实际操作在原官方 Chrome 页面执行，不声称浏览器文本框重新生成过同一来源。

| 操作 | 实际结果 |
|---|---|
| 易容术 | 匹配PHB真实UUID并成为Cast；实际法术消息显示24小时、动作、V/S；不消费分环法位与有限次数 |
| 操控天气 | 实际选择“施展并控制”及正常消耗，从1/1到0/1，位面转移仍1/1；完成法术自身天气延迟骰；再次正常消耗明确被拒绝 |
| 位面转移 | 选择自有Token作为自愿目标后正常Cast，从1/1到0/1，操控天气仍0/1；显示动作、V/S、触及、至多9名自愿生物 |
| 攻击与伤害 | 实际攻击骰 `1d20+9+8`，伤害 `2d10+9`挥砍和`2d12`光耀均实际掷出；不重复验Foundry命中／伤害算术 |
| 普通抛掷 | `5d6`钝击实际掷出；独立DC25敏捷按钮在控制受影响靶后，实际使用靶自身 `1d20+0+0`。完整保留抛掷30尺、目标资格及倒地原文；未制造范围模板或自动移动 |
| 刷新 | 两个独立每日次数仍为0/1；随意施法没有有限次数消费；名称没有生成器附加的双语括号 |

三个真实法术UUID分别为 `Compendium.dnd-players-handbook.spells.Item.phbsplDisguiseSe`、`phbsplControlWea`、`phbsplPlaneShift`。实际缓存均保持感知、DC22、动作、保留V/S并免材料；来源变体没有被官方法术默认施法时间替换。

验收期间一次位面转移前提失败源于左上角其他模组的浮动栏遮挡目标工具，误开了XP／请求掷骰窗口（没有提交它们）。改用正常Token HUD目标控件后成功。未选目标的尝试没有消费次数。该问题单列为操作前提，不当作Forge共因；无新证据没有重复同一尝试。

## 保存、检查与边界

- 旧309张Actor与94个宏完整哈希未变，模块配置、世界时间21085811、全局活动场景 `EBJYd289N5uyTmlC` 未变。保留新卡和全部失败原件；只正常清理本轮新建空白靶 `5lBpyhdIALUO0qGd` 与临时场景 `uOHJlNkjPimWgO5S`，临时场景仅GM查看、未激活。
- 移除助手前完成最终刷新读回015；随后按安装收据仅删除本轮helper、恢复纯业务入口并再次刷新新卡。正常只读MCP再次读到3个Cast及每日spent1/1；纯业务服务SHA256 `6d52a21006b41790c9600b92bfb4d9d13035917d2af6fc558ae2ea4cae96a1cd`，原Chrome卡面截图保留，验收桥PID59388已关闭。未重启Foundry。
- 回归：native112通过、staged241通过、正式encounter620通过；production/all/intake包类型检查、防过拟合2源码、架构、手册构建和检查通过。没有执行或声称全仓CI。
- 一次MCP断连和浏览器导出下载事件未捕获是辅助证据层失败，原件保留；没有因此重跑已通过的模型／施法。纯业务刷新后的正常只读MCP补齐实际读回，不把导出尝试当成功。
- 仍由GM处理：擒抱、位移、倒地特殊结果；传奇抗性及共享前言、下回合限制下的复杂传奇动作。这里未形成原生传奇资源计数，也没有把飓灭变成原生Save。它们不能列入本轮自动化已完成范围。

本轮完整证据位于 `.local/forge-angel-of-slaughter-20261017/`：`normal-run-1/`、`normal-run-2/`、`browser-native-r1/001..015`、`native-acceptance-before-helper-removal.json`、`pure-business-native-spellcasting.json`、`pure-business-native-assertions.json`、`pure-business-served.json`、`pure-business-final-card.jpg`及截图收据。旧样例和旧收据均保留。
