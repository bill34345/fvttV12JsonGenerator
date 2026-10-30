# Better Monsters 新怪 Mezzoloth Company：来源与原生操作验收

本次限定结果通过：之前未生成或验收的 **Mezzoloth Company** 已走真实 DeepSeek、正式来源链、中文审核和普通 Forge 导入；亲自查看角色卡并点击攻击、伤害、三项豁免、范围模板和每日次数。首次结果没有通过，失败原件保留。此结论只接受本例和下述通用修正，不改写历史六例 0/6，也不宣称任意怪物或任意中文翻译都会一次成功。

继续使用 `20261006-111625-bettermonsters-eye-deep-sample` 工作树，HEAD `f79c25fbac747a7e08f98c48779f052c3db68599`，没有提交、合并或推送。证据根为 `.local/forge-mezzoloth-company-20261017/`，下文相对路径均指该目录。

## 来源与首次结果

使用之前保存的作者 Conflux Creatures《Mezzoloths》PDF，第2页右栏的 Company；排除之前使用过的 Sellblade 和 Rune-Veteran。选择前对 `.local`、docs、tests 的准确名称检索没有 Company 使用记录，选定后没有因失败换怪。

- 原 PDF：`H:/CodexData/visualizations/2026/10/12/01a12e90-4de0-75c1-92d5-714811781a77/bettermonsters-newpdf-20261013/Mezzoloths.pdf`，7,981,566字节，SHA-256 `c33b74cb7eb83237c31f1098e1882232e7b6a847c8e5a1e2a24f145a79cff6ef`。
- 保存的下载收据指向作者公开发布帖 [Ecology of the Yugbugs](https://www.patreon.com/confluxcreatures/posts/ecology-of-167683283) 和[原附件](https://www.patreon.com/file?h=167683283&m=726795204)。本次使用本地原件，没有将旧收据的日期、链接可达性或“最新”身份当作当前联网验证。
- 已目视完整渲染第2页，能力没有跨页；`source/binding.json` 保存页码、裁切坐标与原始抽取。首次右栏抽取将相邻页眉串为 `Speed 40 ft. Medium)`，真实 run1 在 movement 核对处失败，1 HTTP，未导入。
- `source/Mezzoloth-Company-layout-v2.md` 按页眉左右列分别读取；全文单词多重集一致，整个 Traits 之后的能力正文逐字节一致。没有编辑规则或数值。其 SHA-256 为 `4468a368378447825b92b44f583ab7acb631f79fcae17ababa77abc374f07761`；原抽取 `87ceb28113e877f02cc43e33b946ac9cb459520ec6379f712f91f33c768389dc` 保留。
- run2 基础通过，在 **Multiattack / unit-5** 的模型 `activationType: Action` 与源绑定时机冲突处失败，2 HTTP。父任务初始将停点说成 Spindly Shred，已由独立复核纠正；现代近战缺口由另行真实来源回归证实。
- 修复后的 run3：`normal-deepseek-run-3/`，实际 **4 HTTP**（1基础、3中文请求），0 IR repair、0付费审核，`ready_for_gm_review`，1 Actor、0宏。三轮实际总计7 HTTP；最早两份失败和全部回复未覆盖。

调用为生产 `createEncounterIntakeProviders → generateEncounterFromHumanMarkdown → workflow`，使用已有 DeepSeek 配置，未传旧IR、旧草稿或旧批准。它是实际生产函数链，不是“浏览器点击 AI 按钮”的入口 E2E。正式英文 source／IR／rendered Markdown／Actor 经 CLI `verify:intake`、`verify:actor` 通过；静态生成 target 14.364/core/5.3.3，实机为已授权 Mirror 14.368/5.3.3。

## 修正与中文审核

本次219文件初始业务清单中，仅三份业务源码发生变化：`staged-feature-mechanics.ts`、`staged-extraction.ts`、`renderer.ts`。

通用修正支持省略 Weapon 和目标短句的现代英文攻击头，保留明确 Spell Attack 分类；0尺触及不再被真假值判断丢成默认5尺；Save 保留多段明确伤害；远处 Sphere 的半径和射程分别保留，自身 Emanation 单独表达；前一句传送／移动距离不再被后续 Save 推断为射程。仅派发其他来源操作的组合规则保留完整GM正文，省去无支持收益的额外时机提案。

额外伤害的逗号／句点条件、`against` 目标类别限定，以及未知 `Success:` 固定伤害都增加了实际红灯反例后再修正。不能表达的分支保留GM原文，不能变成无条件追加伤害或成功无伤害。规则没有怪物名称、Actor ID 或本例动作名分支。

中文原始模型草稿保留。通过现有 `reviseForgeEncounterLocalizationBody` 修正了5个正文显示槽：集群体型断行、Bloodied只修饰伤害减半、球体中心60尺的关系；不改标题、数值、规则数据或最终JSON，仍经原校验并保持未批准。随后在真实 Forge 窗口展开中文字段对照原文，勾选批准，重新生成正式中文候选，再单独确认导入。原 run3 receipt 的 `actualGmApproval=false` 保持历史原值，后续UI批准不能反写为首次模型自动成功。

独立 Luna/medium 聊天 `01a147cd-6e7d-7211-9bfc-38efab4d100a` 完成只读复核并自动回传；报告在 `independent-source-review.md`。其发现的 `against` 风险已用反例修复。其报告只接受自己实际检查的层级，不将存档中的旧“UI pending”提前改判成功；最终UI证据由父任务补齐。

## 亲自进行的原生操作

新卡 **Actor.016453bb261d67dc**，名称“梅佐罗斯连队 Mezzoloth Company”，没有生成的名称括号。Strike-Gate 的原始名称自带 `(1/Day)`，按用户允许的例外保留。专用靶点 `TLVqdsnhfSrZvVpN`；操作在已有非活动测试场景 `mEKTcvdeHtjVkmUc`，没有切换全世界活动场景。

| 能力 | 原文核对及实际操作 |
|---|---|
| Spindly Shred | +10，触及0尺，10d8+4挥砍；正常攻击与伤害已投出28／56。Bloodied半伤、擒抱与附赠动作逃脱DC18保留完整GM规则。 |
| Weaverot Volley | 60尺内半径15尺Sphere，DEX18，失败4d6穿刺+2d10黯蚀、成功无伤害；真实模板Region `fiPMaoCnYWya7mz5`，原生双伤害7／6，专用靶DEX9。无论成功失败均结束2环以下法术的规则完整保留给GM。 |
| Toxic Emission | 自身10尺Emanation，CON17、4d8毒素、成功半伤；Region `hNjyQc1kqZcScB2U` 附着本卡Token并保留10尺尺寸，原生伤害21，专用靶CON8。巨型Token的发散按原生边缘扩展；不把该Region原始像素半径当作独立球半径。失败目盲至目标下回合末保留GM，未创建永久目盲。 |
| Strike-Gate | 附赠动作，1/day，CHA16；本体传送120尺及仅自身擒抱者的资格完整保留GM，不将120尺误作Save射程。正常使用后 `spent=1,max=1,recovery=day`；专用靶CHA5；第二次0可用尝试没有新增使用消息，次数仍只扣一次。 |

这里只验证生成的数据、正常可投操作、来源范围与资源归属，不重测 Foundry 的命中、DC判定或HP结算算法。未强制骰值、直接写入预期结果或对旧卡应用伤害。专用靶HP保持40，原生掩护模块在其身上生成的半身掩护保留。真实7条消息、三个目标豁免来源、Activity IDs和完整机械字段见 `native/actual-operations.json`。

基础数据核对包括AC18、HP225/30d8+90、六属性18/11/16/7/14/10、CR20/PB6、盲视60、Huge的3×3Token、由Medium个体组成的集群、独立火焰抗性和完整“Damage from Attacks”GM抗性规则、两种伤害免疫和九种状态免疫。完整中英文规则在卡中保留。

本例没有施法列表，未虚构 Spell manifest 或 Cast；它不能替代前两只天使的法术匹配验收。八个能力图标已在卡上查看，部分类别使用近似图标；Actor与Token仍是系统默认SVG，没有声称从PDF提取了角色美术。

## 重载、保护与最终构建

`native/post-reload.json` 证明刷新后Actor指纹仍为 `362a2dfa6bb6aa473d06fde486d2a8383b9b187f282355c7b4fac727f96ee2db`、每日spent1、两种Region和7消息持久化；旧305Actor、94Macro指纹未变，worldTime `21085811`、活动场景 `EBJYd289N5uyTmlC` 未变。

独立反例修正后用4份原始真实wire按相同request SHA离线重放，`final-source-parity-r2.json` 证明IR、正式Actor、来源包与中文草稿对象完全一致，0新HTTP、0重复原生操作；没有手改最终JSON或为绿色结果重抽模型。

已按路径和哈希只移除本轮两个owned验收文件，恢复Forge16文件／Resolver9文件，最后安装正式业务构建：Forge index SHA-256 `0a8b2a749b7f3a9184a3221d3591f7b9a2b44e6c48216806486012d5a6e7a3f8`，Resolver index保持 `a3066d327417052290a52fba865f7f94c3feef5633a2663b9930185d41cb1357`。Mirror重启后正常启动为PID43624、Administrator、精确server-mirror/30001/cor-cotn；后续安装没有停止或重启服务。

父任务再次普通刷新，从角色目录重新打开同一张卡，确认验收按钮消失、攻击/三Save/双伤害可见、每日仍0/1，未重新投骰或消耗。最终卡面为 `native/final-card.jpg`；误用旧窗口坐标截到背景的截图保留为 `native/final-attempt-wrong-window.jpg`，不作为通过证据。旧阶段pending收据未改写，最后读回见 `native/final-accepted-ui.json`。

## 检查与保留内容

- 最终局部检查：223 staged、19正式workflow、90基础回归，共332项通过；`typecheck:all`、3业务源码anti-overfit通过。保存旧卡相关Cloaker和两只天使回归。
- 正式 `verify:intake` 和 `verify:actor` 通过；真实来源与18项原生/语义核对另有 `parent-source-review.json`、`native/operation-review.json`，没有以schema绿色代替实机操作。
- 手册说明、review和根HTML已同步，`handbook:check` 33项通过。新增断言仅覆盖本次变化；没有运行全仓CI或重放无关已通过场景。
- 旧卡、两份真实失败、原PDF、两种抽取、原始回复、原中文草稿和已有未提交改动均保留；新卡与操作靶保留，方便用户查看。没有备份、世界删除、生产操作、提交、合并或推送。

仍由GM处理：群体共享空间、魔法抗性与伪装失败、Bloodied半伤、擒抱/逃脱、两环以下法术解除、目盲期限、传送位置和符合擒抱资格的同行者。这些边界不影响上述原生攻击／Save／次数入口保留；它们也没有被声称为自动实现。
