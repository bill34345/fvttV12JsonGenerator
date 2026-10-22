# Forge 候选交付、显式审核与原生 Cast 补验

日期：2026-10-22。唯一续接入口为[当前状态](../plans/2026-10-20-forge-ab-current-state.md)。用户确认 Mirror 修好后，授权复用原 worktree 与已有冻结回复完成实机验收，零新增模型调用。

## 环境与证据边界

- 工作树：`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261019-forge-ab-fixed-replies`，分支 `codex/20261019-forge-ab-fixed-replies`，没有提交或发布。
- 唯一目标：`127.0.0.1:30001`、`server-mirror`、`cor-cotn`；PID35252，Core14.368／dnd5e5.3.3。没有启动、升级或修改服务。
- 正常本地安装 Forge 脚本 SHA `885d42d5e0da51a13a0d038119185a57ef1eb6ae2c362b57d6745d6386f84a73` 和受影响模板；Resolver 保持 SHA `68f6cd75d39f6eb56e95dd57f45e46e7b4ec3b97cc9114f57d25f7fb1387d390`。
- 同任务 Chrome 执行器复用，最新实际配置 `gpt-6.1-sol`／`medium`／Full Access；官方 Chrome 连接器最小往返和安装文件哈希已核。第一次容量不足后仅重试一次成功，未更换模型或浏览器通道。
- 新证据均在 `.local/forge-runtime-followup-20261022/`；513份保护原件保持。沿用既有冻结 N2／N3／Mage IR，真实 Application、正式生成、模板事件和 IndexedDB 保存／恢复。候选UI测试使用真实保存器的独立 QA scope；正式包导入使用普通产品入口和原 GM scope。
- 额外审核端口回放既有测试中的 `accepted` 固定回复，SHA `21bf335d36405722526fe0367a6987a4dbe507e550e8a07eb1f5e3bda88e4772`。验证用户显式操作、身份绑定与状态显示，不构成新的模型语义质量结论。没有 HTTP 模型调用。
- 正常 Macro UI 安装唯一任务读回工具，公开 Hook 观察原生调用，无 prototype patch、不直接调用 Cast、不写期望资源值。实际保存源码仅去除文件末尾换行，逐行一致，见 `helper-source-review.json`。

## 部分候选与刷新续跑：PASS

真实页面第一只 N2 完成，第二只 N3 由冻结测试端口受控中断。完整清单显示第一只可获取、第二只失败，整包尚未生成且不能导入。正常查看／复制得到的完整 JSON 与保存的最终 N2 Actor 逐字段相等，3个原能力均保持，SHA `15cb9ce45fbd1c0b47fd98e76281ac5614e13a7488f67c183ecc421995767157`。

关闭窗口、整页刷新、重新打开后，原候选与失败状态恢复，计数没有增加。点击正常“继续任务”仅补第二只抽取：discover累计1，extract顺序 N2／N3失败／N3成功，repair0。第一只完整候选及 generation 全文保持，`reusedCandidate=true`。第二只与旧正式 Actor 同hash，`57b38b9d23fa73805bca00a08ee85247f61d3cc661266497ba091c368c56bff7`。没有冻结控制器回复时，受控端口拒绝后保留两只完整 Actor 的无宏候选，不生成空宏或静默删成员。

证据：`partial-before.json`／截图、`partial-first-ui-copy.json`、`partial-reloaded.json`、`partial-resumed.json`、`parent-partial-first-review.json`、`parent-partial-resume-review.json`。原 GM checkpoint 仍268／SHA29d5…95a，独立基线未重采。

下载按钮本次正常触发一次；已有用户亲自确认弹框证据继续有效。官方连接器仍不支持 Blob 下载，不反复尝试、不另走绕过通道；文件实际落盘及下载文件内容仍未验证。JSON 内容证明来自真实查看／复制读回，不能替代落盘证明。

首个 QA 文件上传因 Windows 文本写出将 LF 改成 CRLF，被冻结来源精确守卫拒绝，尚未进入 Actor 抽取或世界创建。已仅将两个临时来源文件改为精确 UTF-8 字节写出，冻结seed与产品代码未改；重做受影响文件入口后通过。失败原件和 `source-preparation-repair.json` 保留。

## 单／多 Actor 无宏显式审核：PASS（固定回复回放）

两角色候选正常点击标明额外 API 费用的审核按钮，分别执行两条固定审核，原候选／包 hash 不变；没有新增抽取、纠错或控制器请求。界面显示全部角色完成显式审核、无配套控制审核、仍需 GM 最终确认，审核按钮撤下。

单只旧 Mage 冻结提案正常生成后，严格状态仍 `needs_review`。点击审核只增加该角色一条固定回复；11项原诊断逐项保持、完整 Actor 与包 hash 均不变、严格状态不被提升。实际页面审核完成标签与原问题分别截图父审。实际产品没有第二个审核确认弹窗，带费用说明的显式按钮即发起审核，不声称存在额外 modal。

证据：`multi-audited.json`／DOM、`single-before-audit.json`、`single-audited.json`、`single-audit-status.png`、`single-audit-findings.png`、`parent-explicit-audit-review.json`。累计3条固定审核回复，repair0、liveModel0。候选审核与严格来源诊断分别保留。

## N2／N3 原生导入与灵体武器 Cast

限定实机 PASS。正式 N3 包正常创建 Actor `820a6949bec63fd4` 与固定资源宏 `9669ea4b4f4a47b0`，未启动宏；N2 正常创建 Actor `066f8a30abad74d9`，无宏。包身份与原保护文件一致。实际组合另核 Midi14.0.11、PHB2.1.0、Resolver0.1.7。

N3 原9能力完整，另有7个原生缓存；6个主表Cast，加Blazing Light传奇费用1并选择同一Scorching Ray来源UUID。每个缓存的cachedFor与对应父Item／Activity一一绑定，Compendium provenance正确；唯一Actor账本保持普通3／巢穴4与own-turn-start，传奇抗性Item没有第二份次数池。仅核保留与连接，没有运行传奇回合或巢穴控制。

N2 原3能力、5个原生缓存；Spiritual Weapon父Item独立2/day、bonus、itemUses消耗1、WIS／DC12／+4，无额外成分豁免或捏造施法等级。首次点击折叠活动子控件没有Hook、消息或消费，原件保留；随后由可见父能力进入原生活动选择器和真实施法对话框。对话框显示2可用／消耗1，保持资源消耗，仅正常取消召唤物摆放后施法。

真实公共Hook依次为preUseLinkedSpell → 原生Spell的preUseActivity → postActivityConsumption → postCreateUsageMessage → postUseActivity → postUseLinkedSpell；缓存身份、官方来源和父Cast关系正确，无观察器错误。独立父池spent0→1，即可用2→1，其他Item次数池完全不变，新增唯一关联聊天`1v7pjSHsDpu4g7zn`，没有Token或模板。N3完整DTO完全不变。未直接调用activity.use或写次数模拟结果。

正常关闭窗口、整页刷新后，N2／N3完整DTO、所有Cast缓存身份／provenance与N3宏DTO逐字段等同施法后；spent仍1／max2。6条公共事件通过任务持久记录保留，观察器已停止，原baseline未重采。该范围是原生施法连接、独立消费与刷新保持；不宣称已验证召唤武器Token、移动、攻击、专注结束或期限自动结算。

证据：`n2-before-cast.json`、`n3-imported.json`、`n2-activity-choice.*`、`n2-use-confirm.*`、`n2-after-cast.json`、`n2-after-reload.json`、`parent-native-precast-review.json`、`parent-native-cast-review.json`、`parent-native-reload-review.json`。原生读回工具v2只增补本包宏的完整DTO／commandhash，旧源码和命令副本保留；初始化、观察与恢复逻辑未变。

## 保护与恢复

已采 fresh baseline：318 Actor／180 Item／67 Scene／94原 Macro／67 Journal／12 Tables／0 Playlist／0 Cards／133 Folders／10 Combat／1239 Messages；原 Guard8 Item／24 Token、完整11集合ID、模块全集、场景、视图、世界时间、暂停与目标均纳入核对。原恢复记录 SHA `29d5d975377ed9b59d64fdd1186f500bdfd557823cbd458c16b10fc53b31895a`／审计268。

最终恢复 PASS：正常UI精确删除两个任务Actor、N3固定宏、唯一关联施法消息，读回后最后删除helper。`final-world-after-helper-delete.json`与fresh baseline的11集合完整ID逐项相同；Guard与24Token完整DTO、全部模块、场景DTO、视图／时间／暂停均相同。当前318Actor／180Item／94Macro／67Scene／1239消息，没有本任务Actor、宏、消息或场景对象残留。

原GM恢复记录经CAS272→273还原原snapshot SHA29d5…95a，不回滚审计修订号；独立baseline完整性hash保持且全程未重采。两个独立QA scope及provider计数key已清理；最后工具的受保护清理入口返回baseline已清理成功通知。此项依据正常UI通知，不声称额外直接检查浏览器存储。owned标签651349015已关闭，fresh owned清单为空；原4个用户页及用户后来新开的一页均保留。

父审`parent-final-restoration-review.json`、`browser-cleanup-receipt.json`、`qa-scope-disposal.json`、`task-baseline-disposal.dom.txt`、`final-macro-dom-ids.json`保留。两个task-only安装asset按精确路径、哈希及非reparse路径核对后移除，源码、bundle与证据保留，见`qa-asset-removal.json`；前置目录检查循环曾在任何删除前中止，修正遍历后完成同层清理，没有重跑业务。513保护文件最终hash无变化。

本批只新增QA诊断源码和实际验收／手册记录，复用先前已过产品回归，不重复模型或已验战斗矩阵。新浏览器QA构建及严格类型检查通过；手册按实际stale条目人工核对后保持33项覆盖并生成检查。没有提交、合并、推送或生产操作。

客户端证据分层：A／B实际使用通过正常Macro导入的任务QA browser bundle内当前Application代码；普通入口由安装后新建任务页及正常整页刷新验证。磁盘index SHA与实际客户端操作分别记录，没有把磁盘哈希声称为浏览器字节捕获。
