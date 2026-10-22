# Forge 候选交付与检查结论解耦

日期：2026-10-22。状态：代码、冻结正式链与非浏览器检查通过；黄铜龙战斗包的新候选预览／具体诊断／GM确认导入／读回／精确恢复有界PASS，整体支持仍为Partial。后续补验普通Actor真实界面创建和未resize初开窗口通过；下载文件落盘证据被当前官方浏览器的Blob能力阻塞，未标为通过。

用户后续补证：“哦，反正有弹框是真的，如果只是为了测试下载是否会触发的话，那是会的，可以记录下来了”。据此记录**下载交互已触发并弹框：用户亲自确认**。这项观察没有逐一指认三个入口，也没有完成保存；不扩大为三份JSON／ZIP都已落盘或文件内容已核对。原自动工具超时及Blob能力限制保留，用户观察与自动取证分别记载；原件见`.local/forge-candidate-followup-20261022/user-download-trigger-confirmation.json`。

## 目标与实现

用户授权在现有`20261019-forge-ab-fixed-replies`工作树实施：自动纠错默认关闭，用户自行开启；语义检查或纠错失败不再销毁已有可用JSON／Actor候选。完整来源、模型字段、原诊断及已有攻击／伤害／次数保留，不把交付候选伪称规则已验证通过。

- 共享连接页`autoCorrect`默认false；旧设置缺项或非布尔值不启用。普通Actor及战斗包衔接该选项，最多一次纠错预算与运输重试分别记录。
- `preserveCandidates`为真实Forge显式启用；未启用的底层严格API及旧CLI推广策略保持原口径。V2可读但语义未确认时，保留类型可投影的基础机制和原始行；原回复不可读但唯一纠错回复可用时也保留。确实无可解析候选的错误不制造空壳Actor。
- 候选经renderer、parser、canonical adapter、generator及verifier生成。`intake-candidate-review`保存完整来源及原疑点，包重新准备后仍能读回；额外来源反馈与生成后核对问题同样持久保留。
- 已确认的共享资源池及跨能力伤害升级在无关能力出现疑点时继续保留；未知恢复周期保留次数并由GM手动恢复，不推断成每日刷新。
- 严格响应的`needs_review`／`failed`结论保留；可用artifact与交付状态分开。普通Actor新增明确GM候选创建入口，保留来源／目标／hash／GM身份及读回门禁；原accepted入口继续拒绝非accepted响应。战斗包预览列出问题，用户明确勾选后才能导入，导入不启动宏。
- 普通Actor及战斗包均可下载Actor JSON；GM采用待审候选使用`reviewed_candidate`记录，与严格`accepted`分开。采用前后审核文件均可导出、读回，原问题和GM选择保留。Item契约未改变。

## 本次检查

| 检查 | 实际结果 |
|---|---|
| `bun run test:forge-candidate-output` | 68 pass / 0 fail，含候选保留、纠错回退、来源反馈、包重预览、采用前后审核JSON往返、协议及创建边界、原生条件字段空白清洗 |
| `bun run test:forge-candidate-ui` | 225 pass / 0 fail，覆盖受影响browser逻辑、普通Actor界面、战斗包、设置、上传诊断和导入；不是实际Chrome结果 |
| `bun run test:forge-v2-bw` | 95 pass / 0 fail，严格V2错值拒绝及既有基础能力／Midi边界保持 |
| packages与Forge模块TypeScript | 通过；最后的模块检查也覆盖新候选审核状态与共享browser依赖 |
| `architecture:verify` | 通过，无依赖方向或循环问题 |
| `audit:anti-overfit` | 通过，56个来源检查；本次规则未按怪物名称分支 |
| Forge browser bundle | 构建通过；本地候选安装只改变脚本和三份相关模板，无备份／服务重启／生产操作 |
| 手册 | 33条覆盖保留，受影响项人工review后build/check通过；最终支持矩阵变更导致的markdown-convert／monster-intake／verification-development三项stale逐项复核通过，CLI推广契约未改变 |
| 历史冻结保护 | 496份逐SHA核对相同：382原始证据、4旧包、110新批调用及来源文件 |

上述测试集合有重叠，不将用例数相加冒充独立覆盖或收益测量。没有运行全仓CI或重做既有战斗矩阵。

## 精确冻结回复重放

`bun run forge:candidate:replay`将真实已保存回复送入实际Forge provider与正式workflow，所有fetch均替换为保存回复；没有真实模型调用。原始输入逐hash保持，未修改历史批次成绩。

| 来源 | 本次离线读取回复 | 纠错策略 | 候选结果 |
|---|---:|---|---|
| 成年黄铜龙N3 | 2 | 默认关闭，0纠错 | 9 Item，严格needs_review；完整来源与原问题、Rend和Sands基础活动、资源和施法保留 |
| 法师Mage | 3（包含发现） | 默认关闭，0纠错 | 5 Item，严格needs_review；保留原首答及既有基础操作，不把两攻击表示疑点改写为通过 |
| 狂热邪教徒N2 | 3 | 显式开启，复用原唯一纠错 | 3 Item，4主表manifest法术；Spiritual Weapon仍完整GM规则、附赠动作、2/day，无新增Cast支持 |

这些是本次可获取的候选，不代表N3／Mage语义已经修正确，也不是新模型准确率或费用／速度测量。N2原首答JSON不可读；不把这一例说成默认关闭时也已有可用候选。

## 实机与保护

目标为既有Mirror：Core14.368／dnd5e5.3.3，`F:/FoundryLab/foundry-v14/data/server-mirror`，`cor-cotn`，PID36196／127.0.0.1:30001。候选声明目标仍14.364／5.3.3。最后安装与实际加载Forge脚本SHA为`d40658fab40fe94f2094348ef3aa9121d6d8cf329fe7951fc2657a0f0eebaf85`；进程未停止或重启。

开始时保护基线：318Actor／180Item／94Macro／67Scene／1239消息／10Combat／80模块；原Guard8Item／24Token；恢复记录revision256、snapshot SHA`29d5d975377ed9b59d64fdd1186f500bdfd557823cbd458c16b10fc53b31895a`。新对象使用独立随机ID；清理只触及本批创建对象，恢复记录按正常CAS递增，不倒写审计号。

连接页纠错默认关闭的实际截图已采；未保存的勾选／取消未发模型请求。发现安装前已存在的任务窗口200×52显示问题，验收通过现有唯一helper的公开`App.setPosition()`恢复正常尺寸；这不是本次产品修复，不据此宣称正常初开布局已通过。

上传包实际正常预览9项能力，确认前0Actor写入且导入按钮禁用。实机发现具体诊断未在无AI报告的上传路径显示，已修为从候选metadata提取原code／path／message直接显示，并用无报告模板回归及实机窄补验确认。Actor与包的完整JSON经正常界面读取留存；下载按钮各点击一次，但工具等待下载事件超时，不能据此宣称文件下载已完成。

首次明确确认导入因`Rend.activation.condition`读回差异失败，模块自动清理本次新Actor；318Actor及Guard保持。固定5.3.3的`module/data/shared/activation-field.mjs`用默认StringField，Core14.368的`common/data/fields.mjs`默认trim=true；内存Document构造证实实际值恰为原文trim，未写世界Actor。比较器仅对该字段首尾空白归一，内文变化仍拒绝；原来源和候选全文不改，局部正反例通过。首次失败及诊断原件保留，不写作首次成功。

修复后同一包`candidate-n3-f70fc506`正常GM确认导入并成功读回：Actor `f2e1dd2bc367a5a1`，318→319；9项原能力全保留，Resolver另水合7法术缓存，总16Item。原严格`needs_review`、41条问题和GM确认记录保留。父控独立读回逐项比对原名称、活动ID及资源，确认Rend攻击`1d20+11`、伤害`2d10+6`挥砍＋`1d8`火焰，Sands为DEX DC16／`6d8`火焰；这次未施法或战斗，不能推广为这些规则全面正确。

最终正常删除本批Actor及helper后，11个集合完整ID集与基线相同：318Actor／180Item／67Scene／94Macro／67Journal／12Table／0Playlist／0Card／133Folder／10Combat／1239消息。原Guard全文、24Token、view2600/1700/.5、世界时间21085811、paused=true、控制和目标均保持；原恢复snapshot SHA相同，正常CAS递增至revision265。owned页651348971已关闭，owned列表为空，服务持续运行。

## 同日后续补验

用户明确要求“那就继续完成未验证事项”。新证据根为`.local/forge-candidate-followup-20261022/`，首批原件不改。本批产品脚本仍为`d40658fab40fe94f2094348ef3aa9121d6d8cf329fe7951fc2657a0f0eebaf85`，未改产品代码。

- 普通Actor：专用测试入口只将Provider的discover／extract替换为同源已保存Mage提案；其余Analyze、renderer／正式workflow、verifier、GM确认、创建、读回与下载使用真实实现。正常界面创建`Actor.731f7cef2ccee210`，确认前318Actor／created=null，之后319；5原能力载体、活动ID及两个3/day池保留，Resolver另水合12法术共17Item。UI仍为reviewed_candidate，严格needs_review、verification及deliveryReview问题未升级。父审`parent-ordinary-actor-review.json`通过；该Actor随后正常删除。这证明冻结提案的普通真实交互链，不是新模型抽取质量或新一批实时生成成功率。
- 初开显示：新页面未调用任何resize／setPosition，Workspace及Intake1440×900、Connection660×760、Encounter850×850，构造options、实际position和可见截图一致。旧200×52失败原件保留，原因未知；不宣称已定位或修复间歇问题。
- 下载：普通Actor按钮一次点击、官方先挂事件后等待8秒仍超时；无关固定TXT延迟30秒revoke对照也超时，不支持直接归因ObjectURL释放太快。正常Dialog中的唯一可见Blob下载链接经官方Locator.downloadMedia明确返回`Blob downloads are not supported by this browser.`，该路线停止；`chrome://downloads`的URL拒绝同样未绕过。尚未取得真实产品文件落盘证据，需要人工正常Chrome保存后读回。完整UI JSON不替代这一门禁。
- 本批专用browser测试入口由隔离Bun1.3.14构建并通过局部TypeScript；npm完整性及二进制SHA有runtime收据，没有变更全局Bun。首批68／225／95日志实际使用1.3.8，保持其原结果，不改写成1.3.14，也不为此重复未受影响的整套业务矩阵。

人工下载入口曾具体准备：tab651348984中普通AI候选“更多操作→下载Actor JSON候选”，以及战斗包“下载此Actor JSON候选／下载生成的战斗包”，三个默认文件名与期望内容在`manual-download-entrypoints.json`和`download-expectations.json`。期望JSON是当时真实UI只读原件，不是手写产物。用户后续回复“没注意看，就被我关掉了，所以没有下载好”，没有取得下载文件，记录为`human-download-unavailable.json`；不要求再次手动保存，不把未下载视为下载功能已坏或已通过。

等待期间还发现普通待审候选摘要误写“本地校验通过”；首批严格状态和问题记录本身没有变成accepted，但该文案可能误导使用者。本次已按formalStatus／Intake校验／blocking findings改为“候选已生成；本地检查仍有待核对问题”，并在既有语义失败UI用例补三项断言。Bun1.3.14下225项UI检查／2492断言、模块TypeScript与构建通过。原snapshot先恢复后，仅本地安装新脚本SHA`155dbd2eb3a69b80738f1fc2eee808740a7645eeea8f96a1ca4e2804b44bdf55`；刷新加载身份核对后，同源冻结提案Analyze／Generate窄复验实际显示上述摘要，严格needs_review、created=null、0模型／纠错／审核，不再create或download。`summary-fixed.dom.txt/png/readback.json`保留完整证据，构建与前一版创建证据分开。

本次实际失效的4个手册条目markdown-convert／monster-intake／verification-development／fvtt-json-forge已逐项人工复核，原说明准确，无需改文案。Bun1.3.14下review／build／check全部通过，完整33项覆盖；日志`handbook-followup-*.log`，该阶段根HTML SHA`58d9cf39210fe6bc35a0de3a36ad01d0e071b876bd97ad4bc2a96611a2f983f2`。文档检查不替代下载或实际界面证据；最后收尾文档的watch变更另外按实际失效项复核。

最终收尾文档实际引起前三项失效，3项人工review后Bun1.3.14下build／check通过，仍完整33项，未改准确文案或扩大watch。最终HTML SHA`ce1f12437395f7f22ed2950e51162557eec7009eacd151786742b248130518d8`；日志`handbook-final-closure-*.log`。本批总收据`final-receipt.json`明确为PARTIAL_DOWNLOAD_NOT_VERIFIED，其余已验证结果和精确恢复保留。

最终精确恢复完成：先核实原页面和原snapshot内存仍在，再正常关闭Forge窗，通过guarded CAS恢复原snapshot SHA`29d5d975377ed9b59d64fdd1186f500bdfd557823cbd458c16b10fc53b31895a`，revision267→268。摘要补验后11集合完整ID、Guard及24Token、view／时间／暂停／目标与baseline相同，无Actor fixture或Forge窗口。父控独立比较`parent-final-world-review.json`通过后，helper`CPV2D1gJhRtC0ake`正常删除，fresh DOM核94原宏完整ID一致；owned页651348984关闭且owned列表为空。两个task-only工具asset经精确路径及SHA校验后移除，源工具／证据继续保留。本地产品仅脚本更新，服务PID36196持续运行，无重启、备份或生产操作。下载完成仍是独立未验证项，不能用清理或其他PASS代替。

接口原文、实测与反证见[补验接口记录](../reviews/2026-10-22-forge-candidate-followup-interfaces.md)。

## 证据与限制

证据根：`.local/forge-candidate-output-20261022/`。包括`replay-receipt.json`、三份report／Actor／包、安装前后文件清单、`frozen-readback.json`、`independent-artifact-review.json`、`chrome-acceptance-receipt.json`、`parent-native-review.json`、`n3-native-schema-narrow.json`、`final-world-comparison.json`、`final-macro-cleanup.json`与`chrome-tab-closed.json`。聚焦检查日志在`.local/forge-candidate-*.log`，手册日志在证据根。

本轮真实模型调用0，不包含生产验收、提交／合并／推送或系统升级。普通Actor创建与初开尺寸已在后续限定补验通过，浏览器文件下载完成仍为工具能力阻塞；旧尺寸异常原因仍未知。黄铜龙通用误判与灵体武器Cast连接仍为后续事项。完整源语义正确性、候选交付可用性和真实运行分别评价。
