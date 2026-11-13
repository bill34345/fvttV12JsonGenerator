# Forge 浏览器 PDF 输入验收

## 身份、来源与边界

本轮根据[用户原话与实施计划](../plans/2026-10-31-forge-pdf-input.md)，从已提交 master `13e7d23f` 建立独立分支。旧 PDF reader worktree 保持只读，复用样本和保真要求，浏览器实现不依赖其 Node/Python/CLI。

引擎精确锁定 `pdfjs-dist@6.4.299`，同版 main、worker、CMap、标准字体与许可证随模块分发。接口差异与一手调研见[引擎评估](../reviews/2026-10-31-forge-browser-pdf-engine.md)。PDF.js 原始 TextItems 与坐标均保留，不称逐字符 glyph 或已知真实粗体。

本地证据分别保留了首轮失败和修正结果。

## 已完成的检查

- 官方 Chrome 使用实际浏览器提取实现读取 SRD 5.2.1 物理第 258 页；六项属性及各自 MOD/SAVE、Multiattack 的 if available、Consume Memories 跨栏续文、相邻 Air Elemental 的原始文字均保留。初轮属性表 Con/Cha 串入右栏已修复；固定结果与截图分别为 `browser-source-srd521-258-fixed.json`、同名 PNG 和 `browser-pdf-probe-fixed-result.json`。
- 同一 Chrome 读取中文样本物理第 72–73 页，中文、属性表和次页“尖刺外壳”文字保留。该样本只验排版转录，不作 D&D 2024 规则或 Actor 语义接受。
- 真实样本另暴露字体指标 NaN；未知原指标保留为 null，派生坐标使用矩阵尺度，非有限坐标问题已修复。
- Bun 1.3.14：PDF 核心 15 pass / 75 断言；PDF 模型适配与实际 App/controller 18 pass / 156 断言；既有 candidate UI 通过；既有生物链 110 pass / 736 断言；相关包 typecheck 与 architecture:verify 通过。增加的公开导出不改变既有 Intake 逻辑。
- 构建／确定性发布包 3 pass / 391 断言。同版分发资产逐字节核对；本地安装 205 文件与候选完全一致，无额外文件。不是公开发布或生产部署。
- 独立审查发现并修复补页空答／部分变体覆盖首轮正文，以及补页取消后 UI 丢弃已得 MD 两项缺陷；聚焦反例验证已有 MD、变体和候选保留。尚未读取成功的新 PDF 不覆盖旧恢复任务。

## 实际 Forge 链路

在本地 Foundry `14.368`、dnd5e `5.3.3` 上以 GM 身份使用 Chrome 验证。观察宏记录了既有文档指纹和基线。测试未启动旧 reader 服务或请求 AI 内容复核，卡片保留来源语言。

首次业务调用自动读取 364 页并定位到物理 257–259 页，模型重建用时 28,066 ms，在接收结构处失败，尚无 MD 或 Actor。`pdf-generation-failed-receipt.json` 保留来源和错误；宿主遗漏核心的 responses 字段，首次模型原答已经无法取回，不把错误文字“原始回答保留”当成已交付事实。

调查发现 JSON-object 模式仅发送 JSON 格式要求，PDF 适配器却没有把字段 schema 写进提示词；本轮修复在所有协议模式显式附 schema，同时保留原生结构化输出配置。收据增加可选回答正文，经既有凭据脱敏后进入查看、下载和恢复；原始 reading／MD 不被清洗改写。新增入口／恢复／下载反例通过。旧失败、第一版安装与修复版安装各自保留，`local-module-install-schema-fix.json` 登记修复版 bundle `ccbc4a0e8ca8fb39a7ba9dc6053a2e03327abe3c7a5e7ae8aab1a8883d75ce00`。

修复后的第二次业务调用完成原语言 MD → 现有规则提取 → 正式 Actor。成功本轮 PDF 重建 1 次、28,835 ms，规则提取 1 次；发现、AI 内容复核、纠错均为 0。生成报告 analysis/generation 的提取计数指同一次调用，不重复相加。加上首次失败，本任务实际业务共 2 次 PDF 重建与 1 次提取；刷新清除会话 Key 后按页面要求重测连接，前后共 2 次独立连接测试。

### 来源、产物与语义

`pdf-aboleth-source.md` 为 3495 字符原语言 MD；完整 `pdf-aboleth-receipt.json` 保存上下文 257–259 页、PDF 指纹、4662 字符模型回答正文与读取说明。MD 只引用第 258 页的 Aboleth，邻接 Air Elemental 未混入。with_doubts 两项是 Dex -1/+3 与 Con15 的碎片表格重建说明、同页邻怪隔离说明；没有读取失败。

父任务查看独立渲染的原 PDF 第 258 页，并对照 MD、正式 Actor 及报告，`check-aboleth.py` 产生 `pdf-aboleth-semantic-check.json`：60 项通过、0 失败。包括六属性与豁免、AC17、HP150、速度、先攻+7、CR10/PB4、技能、感官、语言、全部 11 能力完整正文、跨栏 Consume Memories 的 Humanoid／0HP 条件、Dominate Mind 全部重复豁免／距离／平面限定、伤害与 DC、每日 2 次、传奇动作／抗性 3／巢穴4及自身回合开始恢复。中性 Tentacle 使用既有 GM 攻击检定 1d20+9 和独立 2d6+5 伤害，不冒称武器／法术攻击。完整限定继续由 GM 处理。

Actor 原生产物为 `pdf-aboleth-candidate.json`，SHA-256 `14a1e0fe585b463e04f8666303b00085dc0b4550a688d5678437a0ca98c43911`，来自正常 Forge workflow，不手改。生成报告与完整导入包各自保留。正式转换／Intake verifier 均 accepted，AI review not_requested；另有五个空防御字段规范化提示，原页确实没有防御栏，提示原样保留，不用 accepted 代替人工核对。

### 原生创建、刷新与恢复

经 GM 确认，创建了一个测试 Actor 和一个配套资源控制 Macro。宏仅保存，未启动。原生卡片显示 AC、HP、属性、豁免、次数与能力。

观察宏分别记录了创建后与刷新后的状态。使用 `actorReadbackWarnings(candidate, actual)` 检查均通过，0 条警告。两次读回只发现测试创建的两个文档，原有文档指纹、场景、时间和暂停状态一致。测试文档在刷新前后的指纹一致。未执行投骰、Use／Cast／Apply 或资源控制宏。

刷新后通过正常入口恢复并重新预览，MD、PDF 收据和 Actor 候选与刷新前逐字节一致；未重新上传或请求模型、连接测试。GM 确认未继承，导入按钮仍要求新确认。结果见 `pdf-aboleth-reload-recovery-result.json` 及 after-reload 三份产物。

按精确 ID 正常删除本任务 Actor／Macro 后，观察宏最终核对并自删。父任务读回 `observer-restored.json`：differences=[]、stateUnchanged=true、helperAbsent=true。全部既有文档和场景状态恢复到基线。`connection-public-restored.json` 确认可见连接配置与任务前逐字段相同、会话 Key 为空，未重复测试。来源与候选恢复记录保留，不清理来源库／用户其他草稿；常驻 Foundry 继续运行。本地提交／合并在手册与最终门禁通过后进行，不推送。

另记录已有窗口联动限制：生物窗口的当前连接回调属于原工作台，关闭原工作台后旧生物窗不能靠重开工作台恢复连接。测试先保留错误证据，再以正常新工作台／重选 PDF 恢复；没有发出失败的业务模型请求。操作说明要求先测试连接、生成期间保留原工作台，可最小化。该问题与 PDF／模型结构失败分开记录。

## 不推广的范围

文字层提取样本不能证明所有排版、扫描件、加密文档或其他浏览器兼容。扫描件没有 OCR；Chrome 接受不推广 Safari。中文样本不作规则版本证明。创建读回不等于执行所有复杂能力或长期测试。未升级 Core、dnd5e、生产或其他模块，不推送远端。
