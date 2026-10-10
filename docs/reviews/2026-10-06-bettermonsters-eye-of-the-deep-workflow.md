# Better Monsters Eye of the Deep：真实资料输入样本

日期：2026-10-06。基线：6a7845650a04b8a78b458e5edd5f74fb2bb35ab3。当前状态：悬浮归一化与名称误报已修复，真实Intake通过正常resume和来源静态核对；随后按用户批准增加限定特殊机制，并在Mirror14.368／5.3.3原模组组合中完成首批真实效果、GM控制与玩家权限／跨客户端伤害验证。实现和生成的当前派生样本仍在独立worktree，未提交、合并或发布。精确owned清理与最后Audit删除后的独立九集合读回已完成；原成员、设置和视图恢复，保留一个明确报告的旧Combat modifiedTime变化，不声称原始全字段快照存在。各轮原始失败及未覆盖层级保留为历史证据。当前运行范围、样本及候选身份见[特殊机制职责与接受记录](2026-10-06-forge-special-mechanics-routing.md)。

## 用户实际场景与来源

用户通常在 r/bettermonsters 找适合的怪物，再使用作者提供的资料。此次明确选定截图中的“Complete Beholders - 15 variants with lore, lairs, treasure, plots, allies, and more”，用 Eye of the Deep 测试现有资料生成工作流。

- [对应帖子](https://www.reddit.com/r/bettermonsters/comments/1tofdp0/complete_beholders_15_variants_with_lore_lairs/)。
- 作者 u/Oh_Hi_Mark_ 的评论通过 AnySearch Reddit 专项搜索定位：[公开 Homebrewery](https://homebrewery.naturalcrit.com/share/Krtcor4lXhui)、[标为 PDF 的作者 Patreon 链接](https://www.patreon.com/posts/159304027?pr=true)。
- 普通 AnySearch extraction 读取 Reddit 时只返回人机验证页；Homebrewery extraction 仅返回网站外壳，没有取得怪物正文，不能当作内容已读取。
- Chrome 已通过用户现有正常页面核实作者评论及 PDF 附件。下载工具两次未返回事件，OS 是否曾下载未知；未扫描 profile 或默认下载目录。父使用核实后的公开附件 URL 正常文档下载，HTTP 200、application/pdf、有效 PDF 签名。
- 原始附件 URL：https://www.patreon.com/file?h=159304027&m=670237709 。PDF 文件大小 26,063,092 bytes，共 21 页，SHA-256 为 cc7f114b0dcf7e96386665488ee57ec27139440fb46be94aaadca763d0ed2034。
- PDF 原文件保留于 H:/CodexData/visualizations/2026/10/03/01a10117-3f4e-77c2-b7d3-e99e6da803af/eye-deep-source-20261006/Beholders.pdf。已使用 Poppler 查看第 7 页完整原图，pypdf 和正式文档提取分别读取文本。PDF 创建元数据为 2026-05-26T17:49:03Z，不等同于独立证明的出版时间。

## 必须保留的版本区别

选定 Eye of the Deep 是 Better Monsters 的 CR 7 版本。仓库现有 obsidian/dnd数据转fvttjson/input/eye-of-the-deep.md 是 Frozenfeet2 / Call of the Netherdeep: Additional Netherdeep Monsters 的 CR 6 版本，数值和机制均不同。本次没有复用或覆盖它。

浏览器确认作者表示 Homebrewery 会持续更新，所以可变公开页面与冻结附件应分别记录。此次测试绑定作者附件第 7 页：AC18、HP152/16d10+64、步行10/飞行20（悬浮）/游泳20、六属性16/12/18/14/15/14、先攻+1（11）、CR7。先前从低分辨率截图推测先攻+11（21）的说法不作为已验证版本差异；当前仅以 PDF 原页为基准。

## 已完成准备

- 从已提交 master 建立独立 sibling worktree；主区 clean，其他 worktree 保留。
- 使用已存在的 Bun 1.3.14 执行 frozen-lockfile 安装；819 个依赖安装成功，无依赖版本变更。
- 正式 CLI 帮助入口可运行，PDF 提取接口、候选筛选、来源证据与 actor verifier 已定位。
- Bundled pdfplumber、pypdf、pypdfium2 与 Poppler 可用。文本型 PDF 的原生提取与页图核对可以执行。
- 第一轮 AI Intake doctor 显示本地 Codex OAuth bridge 不可达，当时未调用 Provider。后续用户授权后已按下文恢复任务级 DeepSeek 连接并完成第二轮实际 Intake；未复制凭据或改变全局默认。
- 辅助标准资料路径已生成 Actor 并完成两层检查。没有进入 Foundry、修改产品代码／界面、提交、合并或推送。

## 当前样本检查选择

取得正确 PDF 后先记录下载来源、文件 SHA-256、精确页码及页面图像，再从正式文档输入入口进行原生提取和候选筛选，保留坐标、阅读顺序、源语言与 run 身份。

仅选定 Eye of the Deep 进入后续整理／生成；目标显式 Foundry 14 / dnd5e 5.3.3 / core / icon off。英文来源保持英文。若出现 needs_review 或提取错误，保留该层状态并处理真实原因，不手改最终 JSON 或绕过 promotion gate。

逐项核对基础数值、特性、多重攻击、攻击、附赠动作、传奇动作、DC／伤害／条件及使用限制。把原文保留、原生机制、GM 辅助与未支持项按实际证据记录；生成检查不代替真实 Foundry 使用。

本次结果用来决定主界面应帮助用户完成哪些操作，不据此加入完整角色卡编辑器、自动 CR 或全套能力自动化。

## 第一轮实际运行与结论

| 层级 | 实际结果 |
| --- | --- |
| 作者 PDF 来源及原页 | VERIFIED：正确作者附件与 CR7 第7页，原页已审 |
| 正式文档提取／筛选 | 执行成功：21页、15候选，Eye of the Deep 为 p7-eye-of-the-deep-p7-block1、confidence1/high |
| 提取内容质量 | PARTIAL：六属性缩写被拆行，美术竖排署名及 Lore 插入动作连续段落；高置信度只代表字段信号齐备 |
| 自动文档→AI整理→生成 | NOT_EXECUTED：AI连接预检未通过；没有宣称直接 PDF 自动闭环成功 |
| 辅助标准资料生成 | CLI成功：手工核对原页后写支持的 layout: creature 英文 YAML/Markdown，原始文档 run 与页号绑定保留 |
| 原有 actor verifier | 执行成功，warnings0、sourceIntegrityErrors0 |
| 独立来源语义审核 | FAIL：52参数断言中31通过、21失败；失败断言有共同原因，不等于21个独立缺陷 |
| Foundry 导入／掷骰／效果 | NOT_EXECUTED：未将失败产物导入世界 |

辅助整理是本次试验的实际人工步骤。第一份通用 Markdown statblock 因缺少标准 frontmatter 被 CLI 拒绝；查询实际入口后只修复来源格式为 layout: creature，保留原文机制。没有修改任何 Intake failed/needs_review 产物或最终 Actor JSON，也没有把手工步骤冒充自动文档入口。

### 已保留与失败项

- 已保留：AC18、HP152及生命骰、CR7/XP2900、体型／类型、六属性、CON/INT/WIS豁免熟练、察觉专精、黑暗视觉、倒地免疫、传奇资源2、10个能力条目、附赠／传奇分类及 Purge Distractions 的每日2次资源。
- 关键失败：Chitinous Claw 应提供攻击配置，Crushing Rend、Strobeflash Gaze、Glacial Ray、Paroxysm Ray 应提供豁免配置；五项均成为没有相应规则字段的 utility。命中／DC／伤害虽留在文字里，未形成对应可执行 Activity。
- 字段遗漏：Fly 的 hover 为 false；Aquan 与 Telepathy120未在生成 Actor 中保留。
- 语言偏移：五项说明出现未请求的局部中文替换，形成中英混写。英文 chatFlavor 部分仍完整保留，不抵消用户可见描述的语言漂移。
- 高级规则如暴血重击禁用眼梗、失败差值5的额外后果、幻景的结束条件、下一回合／受伤解除仍需明确原生、GM辅助或文字保留层级；此次没有宣称自动化。

因此，本样本的验收结果覆盖原有 verifier 的绿色：**FAIL_SOURCE_SEMANTICS / importEligible=false**。生成文件留在任务 .local 中作失败证据，不进入正式 output，不作为可用 Actor 交付。

### 对前端设计的实际影响

主流程应围绕“取得原始资料→选定这只怪物→核对整理与机制覆盖→确认创建”。此样本优先暴露来源格式、文字／结构化机制转换与审核门禁缺口；大量新增手工字段或改成完整角色卡编辑器不会自动修复这些问题。

建议后续顺序：先使明确攻击／豁免和基础字段在该英文2024样本中保真，再让验收检查独立识别漏机制，最后用同一份样本调整前端的原文对照、需复核提示与最少修改操作。已有模板／蓝图与其他模式的历史接受不被该单一路径试验自动否定，也不用于覆盖本失败。

## 可复验材料

- .local/document-runs/4a079d35-1431-48f9-b534-4a07f06307b5/：原始提取、页码坐标、候选与报告。
- .local/bettermonsters-eye-deep/eye-of-the-deep.source.md：已核对的辅助标准来源。
- .local/bettermonsters-eye-deep/eye-of-the-deep.actor.json：未经手改的失败生成产物。
- .local/bettermonsters-eye-deep/audit-generated-actor.cjs 与 semantic-audit.json：独立预期字段、逐项结果及 source/actor hash。
- .local/bettermonsters-eye-deep/normalization-notes.md：人工整理范围、首轮输入格式失败及语言／自动化边界。
- 外部来源目录的 receipt.json、download-receipt.json 与第7页渲染：Chrome来源定位、实际下载身份及原页。

此次只有上述样本运行与局部检查，没有产品代码变化，未运行全仓CI或重放其他模块验收。

## AI 连接诊断与本轮恢复（2026-10-06 后续）

用户追问“自动 AI 整理路径的本地连接不可达怎么处理”。此次诊断确认，之前的报错来自 CLI 所继承的机器本地配置，不代表 Forge 界面的 AI provider 也不可用：

- Windows 用户级／进程变量与主仓库 .env 指定 codex-oauth、127.0.0.1:8787/v1、gpt-5.6-luna、xhigh。
- 8787 实际无监听。项目历史记录说明该兼容代理是临时验收服务，完成后已停止；它不是仓库正式 API-key provider 的常驻依赖。
- 本地 Forge 界面及已有本地战斗资料入口使用 DeepSeek API／deepseek-flash，而 CLI 的旧 OAuth 设置仍然存在。
- 本机已有 FVTT_LOCAL_DS_KEY_FILE 指针，文件存在。本轮仅读取到内存，没有复制凭据、打印其值或写入仓库。

本轮采用任务级修复：.local/bettermonsters-eye-deep/run-cli-with-deepseek.ts 显式设置 DeepSeek API-key 配置，再进入原有公开 CLI。它不复制生成逻辑；启动时绑定该任务工作树。Windows 用户级配置、主 .env 和旧代理均未修改或启动。

已完成一次真实小型 JSON 连接探测：deepseek-flash／openai-chat／low／json_object 返回 connected；连接、协议及结构化输出通过。随后通过该入口执行原有 --intake-doctor，返回 configured=true、authMode=api-key、model=deepseek-flash、baseUrl=https://api.deepseek.com。

证据为 .local/bettermonsters-eye-deep/connection-receipt.json。此次只发连接探测，没有发送 PDF 正文、抽取 Eye of the Deep、重新生成 Actor 或写入 Foundry。连接恢复不改变前述来源语义 FAIL；也没有把 CLI Chat 探测提升为浏览器 Responses 协议或整份 PDF 自动闭环的 PASS。

本次来源测试后续可使用这个任务入口继续 AI Intake。若要改变日常 CLI 的全局默认连接，应单独确定配置作用域，而非覆盖其他工具仍使用的用户级变量。

## 原始 PDF 文本的 AI Intake 实验

用户已授权继续处理。此次检查补足“原始提取文本是否能通过实际 AI 整理生成可审阅产物”的证据缺口：从已保存 document-candidates.json 中原样取出 p7-eye-of-the-deep-p7-block1.rawMarkdown，保留拆字、列间交错、署名和 Lore，不复用人工整理的标准来源。ai-source-binding.json 绑定原 PDF SHA-256、第7页、坐标、原生提取 run 和输入文本 SHA-256。

使用任务级 DeepSeek / deepseek-flash / low 配置进入原公开 CLI 的 --intake-monsters，显式 target14/core/icon off，vault 仅指向本任务 .local 下的隔离样本目录。先观察实际 accepted/needs_review/failed 状态和证据 IR，再对同一来源/run 的产物核对攻击、四种豁免、伤害及 hover／语言／心灵感应。没有覆盖上一轮失败产物；不修改渲染 Markdown 或最终 JSON 来绕过门禁。此次仍为提取候选到 AI Intake 的真实链，不等于文档 UI 自动闭环或 Foundry runtime 接受。

### 第二轮初次实际结果（修复前）

- runId：2026-10-06T04-21-35-146Z-1a389328；来源 SHA-256：27e0fa7023292771426923a4be728827f0af67313a690d5f75becd1d612824bb。source.txt、原始候选输入、manifest 与 IR 的来源身份一致。
- 只发现一只 EYE OF THE DEEP，覆盖原始输入全部 3309 个 UTF-16 单位。原页拆字、列间交错与竖排署名仍在原始输入中，未先人工改写。
- 三次真实调用均为 deepseek-flash、attempt1：discover160711ms、extract181355ms、review42873ms，总计384939ms，约6分25秒。没有实际 repair 或重试；没有采集 token／费用，不能据此推断成本。
- 已产生 intake-ir.json、确定性 standard.md、实际生成 Actor 的投影及审阅报告。AI review 返回 accepted／findings[]；确定性报告与整个 run 仍为 needs_review。candidate-actor.json／actor.json 未被写出或推广，正式样本 vault 没有 accepted Actor。

| 来源机制 | 第二轮 IR／实际生成投影的检查结果 |
| --- | --- |
| Chitinous Claw | attack、+6、触及10尺、2d10+3钝击，Grappled 与 escapeDC14 在 IR／说明中保留 |
| Crushing Rend | save、CON／DC14、8d8钝击；失败差值5及恢复HP条件保留在说明 |
| Strobeflash Gaze | bonus＋save、CON／DC15、30尺锥形 IR、Blinded 与下回合开始文字保留 |
| Glacial Ray | legendary＋save、DEX／DC15、60尺、2d8寒冷；半速及结束条件保留在说明 |
| Paroxysm Ray | legendary＋save、WIS／DC15、60尺、Paralyzed；结束时机／受伤解除文字保留 |
| 基础数值、豁免、技能和资源 | AC18、HP152、六属性、六项总豁免、察觉8、CR7、XP2900、PB3；传奇池2在IR、Purge每日2次在投影 |
| 语言 | Aquan、Deep Speech、Telepathy120在投影保留 |
| 来源语言 | 十个能力的 IR 和投影说明保持英文；内部标准格式的中文字段名不代表能力正文被翻译 |
| 悬浮 | FAIL：原始来源及 movement evidence 明确含(Hover)，但IR未写hover=true，投影hover=false |

独立 PDF 第7页审阅的109个分层断言中107通过、2失败；两个失败均来自悬浮遗漏这一原因，不是两个独立缺陷。状态为 FAIL_STATIC_SOURCE_SEMANTICS／importEligible=false。此检查读的是实际 IR 和生成投影，不是完整 Actor 文件或 Foundry runtime；伤害成功时处理、资源消费、持续时间、逃脱动作和效果应用均未作运行验收。

### 检查逻辑发现的问题

1. 名称误报：IR name=EYE OF THE DEEP、englishName=Eye of the Deep。renderer.ts 的 displayName 按小写去重，生成名称为EYE OF THE DEEP；verifier.ts:48 使用大小写敏感 includes，因未再包含标题格式的Eye of the Deep而报ACTOR_NAME_DRIFT。当前名字意义完整，不能把这个误报解释为资料改名。
2. 来源漏项未被发现：movement claim 已逐字引用(Hover), Swim 20 ft.，IR却遗漏hover。确定性核对比对的是IR与投影，AI复核同样没有指出遗漏。因此即使修复名称误报，也不能直接把该样本提升为accepted。
3. 能力命名整洁性：AI写出的Strobe flash Gaze／Strobeflash Gaze仅空格不同，投影出现双重名称；规则与结构化豁免仍保留，但应收敛为一个可核对名称。
4. 复杂规则边界：Eyestalks、Purge、Abyssal Mirage、失败差值5、半速及条件结束的原文已保存。当前没有证据证明暴血判定、眼梗禁用、重击范围、专注、优势／劣势、回合时机或受伤解除已正确自动执行，不能称为完整自动化。

本轮未对产品代码、prompt、renderer、verifier、已渲染 Markdown 或最终 JSON作修改；未导入世界、提交、合并或推送。仅修复本任务连接、真实执行公开 CLI、保存独立来源审核与报告。正式输出门禁保留。由于没有接口、支持版本、产品操作步骤或安全限制变化，工具手册条目无需改写；没有执行全仓CI、重复已通过的PDF提取或其他模块验收。

### 恢复与下一步顺序

用户报告死机后重新核对HEAD、工作树、manifest、IR和源文件：结果已完整落盘，来源哈希一致，main仍clean。复用已经完成的三次Provider调用，没有重发AI请求或重新下载PDF。

后续优先处理数据链，再用真实样本收敛前端：

1. 在正式Intake入口补足来源明确的hover保真检查／修复路径，并使名称比较与renderer一致；保持真正的来源遗漏阻断，不以忽略全部名称／语义检查代替修正。
2. 通过正常生成与source-scoped verifier取得合格候选；明确复杂规则的文字保留／GM辅助边界，再验收五个关键Activity、资源、成功伤害、效果及结束时机。尚无合格Actor，不进行当前样本Foundry导入。
3. 再依据真实问题完善“专注编辑与审核”的同页工作台：默认呈现整理好的这只怪物，突出具体需复核项，支持就地修正和原文对照；保留浮窗与最大化，减少重复翻页和全量手工填表。

第二轮证据位于.local/bettermonsters-eye-deep/ai-source-binding.json、audit-ai-intake.cjs、ai-semantic-audit.json，以及.local/intake-runs/2026-10-06T04-21-35-146Z-1a389328/。原始PDF、第一轮失败样本与记录均保留；第二轮状态没有覆盖第一轮失败结论。

## 已授权的修复与验证选择

用户追问“那怎么修复”，本轮直接修复两个已定位的缺陷，仍在本任务 sibling worktree 中，不修改主区或发布。更精确的根因是 ensureMovementQualifiers 要求每一条 movement evidence 同时含 fly 和 hover，否则删除 hover；真实来源的 Fly 与(Hover)分属两条正确引文。原始模型响应未单独保存，不能据此断言一定是模型没有抽取 hover。

本轮先保留最小回归：分段移动证据、来源明确却缺少hover的阻断、同批另一只怪物／无关特性的hover不串用、伪造或缺少引文不授予悬浮，以及名称大小写等价／真实名称改变的正反例。修复后复验这组及相邻Intake／CLI／Forge消费者，按package要求做typecheck:packages与architecture:verify；实际样本通过正常resume重新归一化、渲染、生成与审阅，不手修IR、Markdown或Actor JSON。记录新旧状态与哈希，不覆盖第一轮失败报告。手册关注的用户结果改变，需人工核对相关条目、更新review并生成页面；不以全仓CI或重打其他模块作为此次局部修复的默认检查。

恢复后首次取得完整Actor文件，补查完整JSON中的hover、传奇池、伤害成功处理及Activity字段；此前投影审阅未覆盖这些完整文件信息。另补一条直接validator拒绝无证据hover的反例，补齐新增UNSUPPORTED_HOVER出口的检查，不重放已通过的真实AI识别／抽取。

共享validator/verifier也由Forge browser runtime调用。新增移动证据辅助模块为纯文本逻辑，仅有type import；本轮额外构建Forge浏览器发布目录，检查该新依赖可以进入真实bundle。此构建不安装模块，不改Live服务，不代替Chrome或Foundry接受。

### 最终修复与复验

- 悬浮归一化现在按本候选范围检查正确的移动引文。相邻片段使用原始source中的短间隔复接，以明确的飞行速度和正向(hover)／（悬浮）限定作证；不使用其他候选、无关特性、否定限定、远隔文本或伪造引文。
- 独立validator新增SOURCE_HOVER_OMITTED与UNSUPPORTED_HOVER：正确证据已证明悬浮却未保留字段时阻断，未证实的hover=true也不能直接通过。该出口通过共享validator进入Forge真实分析路径；浏览器遇到模型漏字段仍需正常修复／复核，不会仅因JSON生成成功而放行。
- 名称核对使用与renderer一致的大小写等价处理；真实改名、缺少不同的英文名称继续阻断。没有取消全部名称核对，也没有修改最终Actor文件。
- 第一组10个回归在修复前4通过／6失败，覆盖实际分段证据、跨候选误授予、否定限定和名称误报；修复后10通过。Intake及相邻CLI／Forge检查共300通过／0失败，新增直接validator无证据悬浮反例另1通过。英文／中文／分段／跨候选／否定／伪造／远隔输入作为局部反过拟合对照，不包含怪物名称特判。
- typecheck:packages、architecture:verify均退出0；无依赖违规或循环。Forge模块build成功，新增纯文本依赖进入实际浏览器bundle。
- 普通test包装入口不转发文件筛选参数，第一次尝试误启动全仓测试且子进程选到系统Bun1.3.8；已中止，该运行不计为接受证据。后续任务级小检查复用现有hermetic environment函数、清除真实Intake凭据环境，使用process.execPath锁定Bun1.3.14并明确传入文件。没有修改共享测试运行器，局部日志保留。

真实来源run保持2026-10-06T04-21-35-146Z-1a389328与原始source SHA-256不变。使用空decisions列表进入公开--resume-intake；只刷新已有source证据并按修复后的逻辑重建，不伪造用户确认或手修IR／Markdown／JSON。新增真实调用仅review1次，deepseek-flash／attempt1／24189ms；没有重做discover、extract或repair。最终manifest为succeeded，唯一候选accepted且findings[]。

实际生成位置：.local/bettermonsters-eye-deep/ai-vault/input/eye-of-the-deep.md及output/eye-of-the-deep.json。完整Actor SHA-256为68cee8d6b5639b77e79dd4fa51ec2dccc7c3aefb02aece4fcf3f492e8f0a1c97，目标_stats为Foundry14.364／dnd5e5.3.3。

- verify:intake读取同一run的source、IR、standard.md及该完整Actor，accepted／findings[]。
- verify:actor读取同一正式标准来源及Actor，warnings[]／sourceIntegrityErrors[]。
- 独立PDF原页的IR／投影审核109通过／0失败；另对完整JSON核对hover=true、传奇池2、精确目标以及Crushing Rend／Glacial Ray／Paroxysm Ray成功不受伤害，共7通过。
- 五个对应Activity、伤害和语言已保留；复杂规则和sourceDuration仍为文字／来源元数据边界，不宣称自动效果到期、回合结算、专注、半速或受伤解除。此次没有Foundry创建、掷骰或效果生命周期证据。

初次失败审阅ai-semantic-audit.json、ai-run-receipt.json及外部ai-intake-receipt.json保留，指向修复前IR／Markdown哈希。修复后另存ai-semantic-audit-fixed.json、full-actor-static-audit.json、verify-intake-fixed.json与ai-fix-receipt.json，避免用较新通过结果覆写历史失败。

已人工核对monster-intake、item-intake、species-intake与human-encounter-intake四个watch条目。Monster说明补足名称／悬浮边界；Item和Species独立IR入口未改，人类MD的固定控制器与原有运行限定未改。手册review及根HTML已生成，handbook:check通过33条目，生成页中的新说明与catalog一致；没有改页面交互或重放既有UI验收。

当前完成的是这两项来源处理缺陷及真实样本的静态来源链修复。下一层为在精确本地Foundry候选中做功能验收，再据实际编辑／审核反馈完善已选的同页布局；代码集成和安装权限与本次修复分开，不宣称正式安装的Forge已经更新。

末尾尝试仅清理本任务的空测试隔离根时，临时父目录身份字符串核对未通过，已停止清理且没有删除内容；四个已记录测试根保留。该收尾层限制不改变已经保存的来源、真实生成、验证和构建证据。

## 所有效果是否已可正确附加：后续逐项审计

用户进一步追问所有效果是否可正确附加。重新读取实际完整Actor，SHA-256仍为68cee8d6b5639b77e79dd4fa51ec2dccc7c3aefb02aece4fcf3f492e8f0a1c97。结论为PARTIAL_EFFECT_CONFIGURATION_NOT_RUNTIME_ACCEPTED／allEffectsVerified=false，不是完整效果自动化接受。

| 能力／规则 | 实际JSON的效果覆盖 | 当前判定 |
| --- | --- | --- |
| Chitinous Claw受擒 | attack Activity引用同Item内grappled效果，ID正确、disabled=false、transfer=false；escapeDC14在规则元数据和说明中 | 已配置，目标附加／命中分支／免疫／逃脱实测未执行 |
| Strobeflash Gaze目盲 | save Activity引用blinded效果，绑定正确 | 已配置状态，但原生duration各字段为null；下个自身回合开始只在sourceDuration文字中 |
| Paroxysm Ray麻痹 | save Activity引用paralyzed效果，绑定正确 | 已配置状态，但原生duration各字段为null；下个自身回合结束或受伤解除只在sourceDuration文字中 |
| Glacial Ray速度减半 | 有DEX／DC15及2d8寒冷Activity，effects[]，没有速度修改效果 | 半速及其解除没有生成原生效果配置 |
| Crushing Rend失败差值5的劣势 | 有CON／DC14及8d8钝击Activity，effects[] | STR／DEX d20劣势和恢复HP解除没有对应效果配置 |
| Eyestalks | utility＋说明，effects[]／rules为空 | 暴血重击后禁用指定眼梗未自动实现 |
| Magic Resistance | utility＋说明，effects[]；Actor.flags={}，没有对应优势配置 | 来源规则保留，未生成豁免优势自动化 |
| Purge Distractions | 每日2次／itemUses消耗1已配置，utility＋说明，effects[] | 结束法术／条件及下一次攻击15–20重击规则未自动实现 |
| Abyssal Mirage | utility＋说明，effects[]，Activity.duration为空 | 攻击劣势／隐匿优势／专注及终止规则未自动实现 |

三个效果引用均指向实际存在的同Item效果，静态绑定检查通过；这只证明配置存在，不证明Foundry应用成功、豁免分支、免疫、叠加或结束行为。生成器embeddedEffectDuration只把明确数值的轮／分钟／小时／天转换为duration，当前自然语言回合边界无法由此变成原生到期。此样本使用core；modded-v14针对精确untilDamaged标记的DAE映射不构成当前core样本的运行证明。没有对本样本运行效果或修改JSON。

本次效果覆盖审计另存.local/bettermonsters-eye-deep/effect-coverage-audit.json。既有accepted及109项通过仍限定为来源／IR／生成字段与文字保留；若以“全部规则效果正确附加并按条件结束”为目标，此目标目前未达成。需先补齐或明确GM处理上述未实现部分，再用正式产品入口验收命中、豁免成功／失败、免疫、回合边界和受到伤害／恢复HP等分支。不能以既有绿色覆盖这些缺口。
