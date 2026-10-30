# D&D PDF 预处理与 Foundry 导入器调研

日期：2026-10-17。范围是用户提出的“先用通用工具处理 PDF，再交给 AI”，本轮只调查、复现现有读取问题和提出方案。未安装候选、执行第三方代码、修改产品实现、调用 AI 或操作 Foundry。旧卡、失败原件和既有未提交改动保留；不提交、合并或推送。

## 结论

建议采用预处理优先的方向，并扩展已有 `packages/ingest-documents`，避免另做一套只服务某只怪物的读取脚本。该包已经承担 PDF／图片到带页码、坐标的来源块；当前缺的是可靠的版面重建、读取质量检查，以及让 Forge 消费这份资料的连接。

可以借鉴三类真实实现：PDF Parse 与 Foundry Content Parser 的“独立读取工具输出结构化资料，再导入 Foundry”；Deidril 的 PDF 版本识别与明确的支持范围；5e Statblock Importer 的文本解析预览。它们没有提供已经通过本项目 Better Monsters、中文及 dnd5e 5.3.3 验收的通用替代品。

建议后续先做一个有固定样本的读取器对比试验，再决定采用哪个引擎。Docling 是首个试验候选，PyMuPDF4LLM 是对比候选；两者本机均未安装、未运行，不能据文档宣布胜出。读取器本身也不能代替后面的施法匹配、攻击附带豁免及使用次数验收。

## 1. 当前代码与真实失败

本轮复用 Forge 工作树 `codex/20261006-111625-bettermonsters-eye-deep-sample`，HEAD `f79c25fbac747a7e08f98c48779f052c3db68599`。已有改动与既有验收结论不作重写。

现有入口：

- `packages/ingest-documents/scripts/pdf_extract.py` 用 pdfplumber 取得文字及坐标，按高度容差拼行。第 143 行附近按页面中点分两栏，第 157–159 行用固定顶部区域处理页头；不能据此建立嵌套栏与属性表的阅读顺序。
- 同文件第 105、172 行将原生文字块／页面置信度设为 `1.0`。这表达不了当前实际的顺序与表格错误。
- `src/extractor.ts:176` 的 OCR 回退主要看空页、文字长度、字符比例和已有警告；有大量可读字符的错序页仍可能通过。
- `src/filter.ts` 的候选评分依靠 AC、HP、属性与章节等信号，并非内容正确率；`normalizePdfTitle` 已有数个 Beholder 名称特例，不宜继续用逐怪名称补丁代替版面处理。
- CLI 已有 `--extract-only`、`--document-engine` 和 `--document-candidate`；Web 也已有文档入口。Forge 的 `forge-encounter.hbs:6` 当前来源上传接受 `.md/.txt`，没有接受 PDF。当前 Forge 模型链消费的是来源文字，不能描述成已经把原 PDF 交给模型读取。

本轮只运行现有 `pdf_extract.py`，输入为保存的 `Mezzoloths.pdf`，SHA-256 `c33b74cb7eb83237c31f1098e1882232e7b6a847c8e5a1e2a24f145a79cff6ef`。PDF 第 2 页的两只怪物可以分开，但 Company 的嵌套页头和属性表读错：

```text
HP 225 (30d8 + 90) Size Huge (Swarm of
Speed 40 ft. Medium)
S 18 +4 +4 D 11 +0 +0 C 16 +3 +3
TR EX ON
I 7 -2 -2 W 14 +2 +2 C 10 +0 +0
NT IS HA
```

读取结果仍为页面／块 `confidence=1.0`、`warnings=[]`。完整六项属性标签为 0/6；此前已经对照原页的来源稿为 6/6。这个计数证明当前输入有明确读取错误，不是通用识别率，也不是 AI 准确率。

证据：`.local/forge-pdf-research-20261017/existing-native-extractor.json`、`local-reader-review.json`；来源参照 `.local/forge-mezzoloth-company-20261017/source/Mezzoloth-Company-layout-v2.md`，SHA-256 `4468a368378447825b92b44f583ab7acb631f79fcae17ababa77abc374f07761`。此前针对该页得到的正确来源不能推广成通用读取器已经修复。

## 2. 别人的模块实际怎么做

本轮在 [2026-10-13 同类导入器研究](2026-10-13-forge-comparable-importers-and-manual-fallback.md) 上补查 PDF 层，不重做其全部模型与 GM 手动承接研究。公开 stars/forks 是规模信号，不代表可靠性；直接相关的小项目优先于热门通用工具清单。

| 实现与已核版本 | 直接证据 | 可借鉴之处与边界 |
|---|---|---|
| PDF Parse，提交 `005355b284a3c2692e9a8144119f0486641510a8`，2023-06-28；14 stars／2 forks | `parse.py` 用 PyMuPDF 的字型大小、字体、flags、颜色组织标题、段落及注释，输出层级 JSON。Foundry Content Parser 官方说明明确用该 JSON 导入 Journals；Actor 则从 PDF 阅读器复制文字后解析。 | 最接近“独立工具先整理，后端再消费”的架构。该 JSON 路线主要是 Journal，不能说已经解决复杂怪物执行数据或多栏表格。仓库未发现 LICENSE，API license=null，暂不复制代码。 |
| Deidril PF2e PDF Import，提交 `e989b2efc551ae45ab54316d1c25bf0b2f117d44`，7.90；17 stars／3 forks | PDF.js 文字项进入应用读取流程；多个特定冒险处理类含页数、识别文本及坐标，例如 Shadows at Sundown 的 68 页与第 3 页固定识别区域。仓库有 144 个 `datas/` 文件。 | 借鉴文件／版本识别、支持范围和解析／导入分离。它面向 PF2e 和列明的冒险，不是任意 D&D PDF 的通用识别；不能把逐书坐标模板当泛化能力。 |
| 5e Statblock Importer，提交 `98f5bd9bf3a18b3cb50429f1bef6b735de32271e`，2.4.0；6 stars／6 forks | 作者说明与 `sbiWindow.js` 都以粘贴标准怪物文本、Parse 预览、Import 为入口；没有负责把任意 PDF 版面整理成正确文字。 | 借鉴来源文本预览和未识别问题展示。不能用下游解析器掩盖上游读错。manifest 的 Core14／dnd5e6.0.5 verified 声明不是本机5.3.3验收。 |

主来源：[Content Parser 官方说明](https://foundryvtt.com/packages/foundry-vtt-content-parser/)、[PDF Parse 固定源码](https://github.com/EthanJWright/pdfparse/blob/005355b284a3c2692e9a8144119f0486641510a8/parse.py)、[PDF Parse README](https://github.com/EthanJWright/pdfparse/blob/005355b284a3c2692e9a8144119f0486641510a8/README.md)、[Deidril 固定源码](https://github.com/deidril/pf2-pdf-en-import/blob/e989b2efc551ae45ab54316d1c25bf0b2f117d44/src/helyx.bundle.js#L27780)、[特定冒险识别配置](https://github.com/deidril/pf2-pdf-en-import/blob/e989b2efc551ae45ab54316d1c25bf0b2f117d44/src/helyx.bundle.js#L30580)、[5e Importer 固定入口](https://github.com/Aioros/5e-statblock-importer/blob/98f5bd9bf3a18b3cb50429f1bef6b735de32271e/scripts/sbiWindow.js)。

版本限制：Content Parser 官方记录为0.2.50、verified Core11；Deidril 当前 manifest 限Core14、PF2e8.5.0。这里的做法可研究，不是安装或兼容性推荐。Deidril 模块代码 MIT，PDF.js 另有许可证，美术用途受限，不借用美术。

另外核对了 [PDF to Foundry](https://foundryvtt.com/packages/pdftofoundry)：作者说明主要是受支持 Paizo 冒险的导入，官方当前5.1.0 verified13.351；本轮未审阅其解析实现，不对其内部算法作结论。[PDFoundry](https://github.com/Djphoenix719/PDFoundry) 是已经归档的 PDF 查看／表单工具，不承担 PDF 到可操作 Actor 的转换。

一手使用与失败记录：

- [2022 年 Foundry PDF 导入讨论](https://www.reddit.com/r/FoundryVTT/comments/rt9sp2/importing_content_from_pdf/)中，用户从 Tome of Beasts 等书复制标准能力块进入导入器，并反映部分攻击／豁免仍需修正。它证明历史上确实有人这样用，不是当前版本成功率。
- [5e Importer issue65](https://github.com/Aioros/5e-statblock-importer/issues/65)要求更清楚的已接受／未接受内容和原文保留。当前仍 Open；新版已存在部分预览，不能照搬问题中的全部描述为当前缺陷。
- [Docling 讨论2791](https://github.com/docling-project/docling/discussions/2791)中，2025-12-16 用户报告打开 OCR／表格识别仍按文字对象顺序而非视觉顺序输出。其后有机器人建议与用户追问，本轮没有找到已验证修复，不能把建议当作成功经验。

## 3. 候选引擎与选择办法

[DoclingDocument](https://docling-project.github.io/docling/concepts/docling_document/) 能表达文本、表格、图片、层级、阅读顺序及页码／框选位置；适合试验“可追溯资料包”。[置信度文档](https://docling-project.github.io/docling/concepts/confidence_scores/)也区分版面、OCR与解析评分，但 table_score 尚未实现，评分不等于 D&D 字段正确。Docling 主仓 MIT，当前约6.9万stars；它仅作热门通用技术基准，不能替代相关模块和真实样本研究。

[PyMuPDF4LLM 作者文档](https://pymupdf.readthedocs.io/en/latest/pymupdf4llm/)列出多栏读取、带位置的 JSON、分页块及按需要 OCR，适合做第二个对比后端。作者也提醒强制 OCR 可能降低干净原生 PDF 的质量。其 PyMuPDF／MuPDF 依赖采用 AGPL／商业双许可，选定嵌入或分发方式前须核对[官方许可](https://pymupdf.readthedocs.io/en/latest/about.html#license-and-copyright)。本轮没有安装或试跑，不宣布速度、准确率或资源消耗。

当前决策是“先按同一输入和评判标准对比”，而不是承诺某个引擎必然解决问题。保留现有 pdfplumber 作为原始文字坐标来源及对照，OCR 只处理确实缺失或损坏的文字区域。

## 4. 建议工具的职责与输出

建议流程：`原 PDF → 版面与表格重建 → 可核对资料包 → AI 规则提取 → 既有生成和验收`。CLI、Web、Forge 应共享读取结果与资料格式，读取包不维护 Foundry 字段映射。

1. **保存可追溯原始信息。** 记录原文件路径及 SHA、页码、文字坐标／字体、原始顺序与提取方式，并关联页图或必要裁剪。原始块与整理后的文字分开，不能用 Markdown 覆盖证据，也不复制原 PDF 进 Vault。
2. **按区域重建版面。** 先区分页面上的怪物，再处理怪物内部的页头分栏、六项属性表、正文栏及跨页续文；通用规则依据几何、字体和标题层级，不能靠怪物名称或逐怪手工坐标。
3. **做 D&D 来源适配。** 识别基础区、特性、动作、施法清单及次数；把跨栏／跨页能力拼完整，保留同书被引用的定义及引用关系。不是按关键词挑少量段落，避免遗漏限制条件和结尾效应。
4. **明确指出读取错误。** 检查数字与骰式、表格列对齐、重复或缺失标签、能力标题／正文覆盖及跨怪串文。识别置信度和来源完整性分别记录。有歧义的候选进入 `needs_review` 并显示原页区域；不让 AI 凭怪物名字补缺数值，也不能把错误基础数据降格成 GM 手动后放行。
5. **输出同一份资料包。** 包含机器 JSON、可读 Markdown、候选清单、问题清单及原页定位；缓存依据文件内容、引擎版本与选项，避免每次重读整书。AI 消费完整来源与定位引用；只有已验证的视觉接口才能额外接收必要裁剪图，不能假定现有 DeepSeek 文字通道已具备该能力。

读取器负责把“纸上写了什么、顺序如何”交代清楚；命中加值、额外 Save、条件状态、法术匹配与次数如何投影到 Foundry，仍由后续已存在的规则提取、生成及验收负责。不能因为文字完整就把可操作功能判为通过。

面向用户的入口可以保持简单：选 PDF → 看候选怪物与来源预览 → 确认读取疑点 → 生成。内部引擎、JSON和缓存不必成为每次操作的前置知识。

## 5. 最小试验与防止只修样例

实施前先冻结样本、原页标注和判定标准，记录选择理由；本轮没有开始此试验。

| 样本类别 | 必须回答的问题 |
|---|---|
| 保存的 Mezzoloths 第2页 | 两怪分离，Company 体型／速度独立，六项属性及其数值／加值不串列，完整能力不丢失。 |
| 已有 Beholders 宽版或双栏样本 | 同一怪物右栏续文不会变成另一只怪物；标题字形不会靠名称特例恢复。 |
| 真实跨页与引用定义样本 | 能力结尾、限制条件和所引用规则完整归属，重复页眉不会混入。选取后记录实际文件与页码，不能用类别名称宣称已测。 |
| 普通单栏对照 | 改进复杂版面时不破坏本来可读的内容。 |
| 实际扫描／中英混排样本 | 选择性 OCR 与语言保留成立；待找到和冻结真实来源后测试，当前未执行。 |
| 冻结方案后选的未参与开发 PDF | 不补怪物名称／专用坐标即可处理；保留首次失败，不能调过后改写首次结果。 |

以关键数值和骰式逐项正确、能力与条件覆盖完整、无跨怪串文、来源定位有效为判据，同时人工对照原页。记录真实耗时／资源后再比较引擎，不凭功能列表估算收益。

读取层通过后，才取未参与开发的新怪走正常 DeepSeek、正式 workflow／verifier，并看原生卡、点攻击／伤害／Save／法术和次数操作。只测本模块负责的数据与正常可用性，不要求重新证明 Foundry 本身的命中或 DC 裁决。

## 6. 待判断引入／本地化清单

状态沿用 `docs/acceptance/foundry-v14-module-health.md` 的证据口径；`Untested` 不是可用。以下都不是本轮批准的安装或改造。

| 候选 | 当前状态 | 下一次复查／最小反证 |
|---|---|---|
| 现有 ingest-documents 的资料包与质量检查 | 当前版面失败已复现；修改未开始 | 冻结上述来源，先让错误结果被识别，再验证通用阅读顺序与回溯。保留 CLI/Web 既有行为。 |
| PDF Parse / Content Parser | 外部源码／文档已核；本机 Untested | 只借鉴分层与预览；若要复制代码先取得明确许可，再检查格式适配，不能直接接入旧 Journal JSON。 |
| Deidril 的来源版本识别 | 固定源码已核；本机 Untested | 仅借鉴机制；不安装 PF2e 模块来处理 dnd5e，不移植书籍美术。新增书籍适配须明确通用／特定书籍的支持边界。 |
| Docling 后端 | Untested | 核定版本与依赖，真实样本对比，特别反证多栏顺序和表格；失败保留，评分不能替代人工核对。 |
| PyMuPDF4LLM 后端 | Untested | 确认许可与版本后在同样样本比较，检查 JSON 是否保留 Markdown 未输出的内容。 |
| 5e Importer 预览呈现 | 设计参考；本机 Untested | 检查来源／接受项／问题项能否逐项对应；不把其系统兼容声明当成当前 Foundry 行为证据。 |

## 7. 本轮证据与完成范围

外部固定源码及仓库元数据只读保存于 `.local/forge-pdf-research-20261017/`；`research-sources.json` 记录出处与结论层级，`file-manifest.json` 记录文件摘要。现有八个相关实现文件与调研开始时 SHA 比对，最终读回见 `final-readback.json`。原有提取、生成和浏览器验收不因研究文档更新而重复执行。

本轮是调研与方案完成，通用读取器改造、候选引擎对比、Forge PDF 入口和新样本端到端验收均未实施。没有变更用户可执行入口、支持版本或操作步骤，因此不刷新手册或重跑产品测试。
