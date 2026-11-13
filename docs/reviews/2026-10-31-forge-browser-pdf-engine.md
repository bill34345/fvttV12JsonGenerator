# Forge 浏览器 PDF 提取引擎

日期：2026-10-31。用途为本轮 Forge PDF 输入集成，不新增用户侧独立服务。此文件记录接口依据，真实提取结果另见本轮验收记录。

## 精确来源与采用方式

锁定 `pdfjs-dist 6.4.299`，官方发行提交 `d0991a0d53f3bb3a7307e3b83f279c1d117aafb3`，2026-10-03 发布，Apache-2.0。使用 modern build 与完全同版 worker，主库、worker、CMaps、standard_fonts 及许可随 Forge 本地分发，不访问 CDN。

- [npm 官方精确元数据](https://registry.npmjs.org/pdfjs-dist/6.4.299)
- [官方发行](https://github.com/mozilla/pdf.js/releases/tag/v6.4.299)
- [锁定源码 API](https://github.com/mozilla/pdf.js/blob/v6.4.299/src/display/api.js)
- [同版文字层矩阵处理](https://github.com/mozilla/pdf.js/blob/v6.4.299/src/display/text_layer.js)
- [worker 配置类型](https://unpkg.com/pdfjs-dist@6.4.299/types/src/display/worker_options.d.ts)

`getDocument` 接收本地 `Uint8Array`；先计算 PDF SHA-256，再给 worker 字节。仅提取文字，不引入 viewer、注解交互或脚本管理器。`useWasm:false` 对本轮纯文字接口生效；不据此声称图片渲染已接受。本轮不启用 XFA、PDF 脚本或图像 OCR。

TextItems 为字符串片段与矩阵，不是逐字符 glyph。即使 `disableNormalization:true`，接口仍会把空白转成 U+0020。保存原件应称 PDF.js 原始 TextItems；公开 TextStyle 不能证明字重，fontName 是内部标识，不据其名字判粗体。原页文字、页面矩阵与派生行分别保留，坐标需要组合 viewport 和 item transform。未测语义置信度仍为 null。

6.4.299 已没有 `isEvalSupported` 参数；不照旧版文章虚构配置。读取时明确使用同源 CMap/font 路径，库与 worker 的精确版本不符时拒绝本次提取。

## 一手报告与反证检查

- [#21557](https://github.com/mozilla/pdf.js/issues/21557)：Safari 的 ReadableStream async iterator 报告；6.4.299 精确源码仍有相同使用方式。本轮目标是官方 Chrome，不能把它推广成 Safari 接受。
- [#21760](https://github.com/mozilla/pdf.js/issues/21760)：多栏文字尾空格与 hasEOL 报告，未附样本即关闭；不能据此认定当前版本有该 bug，但支持按几何重建片段而非简单拼接。
- [#9041](https://github.com/mozilla/pdf.js/issues/9041)：早期中文空文本通过 CMap 路径恢复；仅作为真实资源缺失的失败案例，不能推广成当前中文通用修复。
- [#11904](https://github.com/mozilla/pdf.js/issues/11904)：部分 PDF 一字一个片段的报告没有足够公开复现；片段粒度仍不能作为业务契约。

本轮最小反证是旧 SRD5.2.1 第258页：核六属性表、Multiattack 的 if available、Consume Memories 跨栏续文和相邻 Air Elemental 的隔离。中文72–73页用于文字布局回归，不将第三方旧规则当作2024规则基准。

初次真实 Chrome 已发现表格第三列被错误归入右正文栏；该失败保留并推动按正文起点范围修正分栏。此前 Node 同库的 token 存在不能算派生顺序通过。Mezzoloth 的字体 ascent/descent 实际可为 NaN，虽然官方类型写 number；需要在外部数据入口记录为未测值并使派生坐标有限，不伪称已知字体度量。

## 本地化与后续复查

PDF 引擎不翻译内容；Forge 默认来源语言，用户显式选中文时才走既有翻译。本轮没有新增外部 Foundry 模组待汉化候选。

升级候选时先核 npm/tag、主库与 worker 一致性，再用同一真实 PDF 样本、字体/CMap资源、分栏/属性表/跨页和取消恢复复查。旧接受不自动推广到新引擎。AnySearch 本次可用；GitHub REST latest 一度共享IP限流，发行页和npm元数据独立核实成功。
