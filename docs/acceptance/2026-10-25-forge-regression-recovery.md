# Forge已确认退化：第一阶段验收

> 接续状态：此文件记录当时版本。旧流程测试失败清单已从交接材料清理，不是当前待修项。最新开发、测试和AI复核停用决定以[唯一当前状态](../plans/2026-10-20-forge-ab-current-state.md)为准；原始收据仍保留。

状态：本轮绿龙旧V2字段迁移、旧完整候选具体处置、同源黄铜当前正式链及限定实机验证通过。不是整个Forge完成，也不是所有旧裸IR已兼容。唯一下一步在[当前状态](../plans/2026-10-20-forge-ab-current-state.md)维护。

## 授权、对象与保留要求

用户原话：“对，就是这个目标。按这个顺序开始，先处理已确认的退化。沿用当前 worktree，保留已有成果和原始证据，不降低既有验收要求，先不合并或推送。AI 复核的具体样本和调用上限先列出来再决定。”

沿用`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`，HEAD `080fb7c4080a77dd5c8da526d081cb01ace6b10e`。旧回复、来源、旧Actor原件均未改成新格式；原两龙的3／4、法术/DC/等级/消耗与完整正文要求继续验证。未提交、合并或推送。

证据根：`H:/CodexData/visualizations/2026/10/25/01a1720b-4563-7511-82df-e8cb00ed7e53/forge-regression-recovery/`。

## 改动与结果

| 输入／行为 | 本轮处理与已验证结果 | 不应扩大的结论 |
| --- | --- | --- |
| 绿龙旧V2回复 | 从AI已填写的普通次数与恢复字段迁移独立抗性3／4；同unit及引文身份核对，不从原文或传奇动作次数推值，不产生第二份Item次数池。 | 不代表恢复默认原文语义解析。 |
| 旧表格缺失、歧义、冲突 | 缺值／重复条目保留可用候选与具体重新提取提示；身份不符、既有显式值冲突不被覆盖。有限恢复语法保持原有括号／分号／逗号支持。 | 不能把needs_review称为完整接受。 |
| 有旧完整artifact的保存候选 | 已保存Actor有正数抗性、旧IR未独立保存且新重建丢失时，恢复明确报告无法无损重建；先验完整性、来源、目标和审批，原记录不变。 | 这是完整候选恢复检查；不能通用识别无契约信息的裸旧IR。恢复分支用明确标出的合成控制验证，不冒充真实旧用户草稿。 |
| 黄铜龙当前正式输入 | 同一2024来源一次新真实提取，原始AI答复已明确普通3／巢穴4；正式workflow保持数值、完整规则及法术，实机保存刷新后仍保持。 | 旧黄铜IR本身没有被“修好”；新回复不冒充旧格式迁移。 |

新增完成器是旧V2入口的兼容实现，旧函数名继续委托。默认完整IR路径不经过这套旧迁移。正式草稿契约识别、复核后修正与失败重试属于后续阶段，本报告不提前接受。

## 真实黄铜来源与生成

- 原来源2519字符，SHA-256 `1fcb66a559662653b4815564761955d549fd7a423bb424f5ff395ffa93757ffe`，与旧验收来源相同。
- 实际DeepSeek／deepseek-flash／OpenAI Responses：生成探针1、单只提取1；生物discover、review、repair、自动重试均0。请求计数已更正：共享连接测试默认还调用一次`GET /models`，因此2是生成POST数，不是全部HTTP；按已核源码的正常成功路径为3次Provider fetch。最初探针没有完整传输捕获，不能冒称缓存／重定向层的实际wire计数已经实测。此前“总HTTP2次”的衍生收据保留并由`stage1-request-accounting-correction.json`纠正；没有额外内容复核或纠错。用户明确允许使用本地保存的凭据，未在报告、仓库或世界中保存Key。
- `browser/brass-extraction-capture.json` SHA-256 `ffad5aa0969e7df6c2270c6542ab823b9e2013f850f39345ca635d10f3653c80`；原回复hash `89cf8b4743bb4ac3fe056ca7f5934ead2afcff290078a33d1ccb5f23dd28fd72`。完整、未截断、未被本地改写。
- 当前localhost已有未知single候选。正常界面仅执行分析，没有点击会覆盖single的生成操作；既有私有responseEvidence接口保存原答，随后同一analysis经正式browser workflow零AI续接。规范Markdown再通过正常“标准资料”生成、GM确认创建；没有手修最终Actor JSON。
- `brass-current/receipt.json`记录formal accepted、投影findings为空；普通候选与导入文件正式预备产物的artifact hash均为`64f9db3b1f98a83a2b8b79836084b588befb6c6623f23614d1c51b09cc03367e`。

独立逐项核对完整原文、原答IR、规范Markdown和Actor：AC18、HP172／15d12+75、六属性、先攻+10、PB5、CR13、技能／感官／语言、Rend、60×5尺火息、60尺睡眠锥、灼沙、两种传奇资源、七个法术及Blazing Light复用均符合来源。九项能力全文保留。睡眠后续状态、Multiattack/Pounce编排及变形限制仍由GM执行，没有伪造自动状态。

## 实机与清理

既有Mirror PID35448，Core14.368／dnd5e5.3.3／cor-cotn，80项已启用模块。仅本地Forge脚本更新，最终SHA-256 `f5146c71c5b3205fe83a83ad93f9b075fc3fff11e9569edec491f1acebe69425`；其他安装文件保持，没有重启服务、升级或触碰其他实例。

正常创建的唯一Actor为`2cf60a18fb361f1f`。原生NPC卡实际抗性／动作3／3，正常切换巢穴内为4／4，再切回3／3；未手填计数。一次正常刷新后完整`Document.toObject()`与刷新前完全相等。

Resolver实际自动水合8个Cast和8个owned spell cache，逐条核对官方2024 PHB来源、归属、参数、生成内容hash与缓存绑定；两处Scorching Ray对应实际2环法术。独立核查这些新增内容后，原九个feature按生产readback比较器检查，无差异；完整规则正文9项、原生投影检查均通过。未施放法术、掷骰或扩大完整战斗自动化验收。

最终正常UI仅删除本批Actor；精确核对归属后删除两份本批宏，再由同一执行脚本采集删除后的完整数据。`final-runtime-preservation.json`为PASS：原318 Actor、180 Item、67 Scene、94 Macro、10 Combat的ID及内容hash保持，1240 Message ID、80模块版本、场景及世界时间保持；本批Actor／两宏均不存在。旧single候选checksum保持。服务继续常驻。

## 检查结果与未解决项

以下结果互有覆盖，不相加伪造总通过数。

浏览器文件导入与大文本传输曾失败，只修工具／传输层，保留有效行为证据，未因此重跑模型。原生对比辅助脚本首次把实际XP对象又套一层，已改为读取实际派生值后重比同一冻结文件，未修改Actor或用期望值填实际数据。

模型原答、失败日志、浏览器截图、两次完整native读回、最终清理及基线对照全部保留。登录前置的有范围调查见[独立记录](../reviews/2026-10-25-forge-regression-browser-preflight.md)。AI内容复核的六输入与总HTTP上限建议另见[待决定方案](../plans/2026-10-25-forge-ai-review-evaluation-proposal.md)，尚未执行。
