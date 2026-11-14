# Forge PDF 插图转角色图与动态 Token 评估

2026-11-13。本地原型基线包含 Forge 已锁定的 PDF.js 6.4.299，以及目标 Foundry 14.370 / dnd5e 6.0.6。本轮核对来源和本机代码，并运行合成 PDF 探针。文档中的接入方案与验收条件是建议。

## 建议

首版由 Forge 做「从 PDF 选图、用预设开始、拖动缩放、看结果后确认」，用浏览器里已有的 PDF.js 和 Canvas，再用 Foundry 原生动态环渲染。角色卡使用选中的完整插图，地图使用单独裁好的透明主体贴图。沿用旧裁切的归一化坐标与候选思路，保留原图与裁切参数，重新编辑可以从原图继续。不要把静态环框烘进动态环的主体图。

现成的 Tokenizer 2 可以作为对照和后续高级编辑入口。首版的圆内裁切、预设、预览与保存流程可以用现有依赖完成。若真实样本证明「角、头饰或武器伸出环外」经常需要人工抠图，再评估本地 BiRefNet。模型只负责输出透明蒙版，原图、取图、主体位置与环仍由 Forge／用户控制。

## 本地已经有什么

| 层 | 当前能力与接入缺口 |
| --- | --- |
| PDF 输入 | [PDF 入口](../../foundry-modules/fvtt-json-forge/src/pdfInput.ts) 使用 [PDF.js 文字和坐标提取](../../packages/forge-browser-runtime/src/pdfSource.ts)。读取源最终销毁 PDF loading task，收据保留选页和文字。取图需在选页确定后明确复用本地 File／Blob 或重新打开该 PDF，按需渲染相关页。历史 [PDF 验收](../acceptance/2026-10-31-forge-pdf-input.md) 没有验收插图、扫描件或本次目标的新流程。 |
| 旧 Token | [候选算法](../../packages/assets-icons/src/assets/tokenCropCandidates.ts) 根据共享插图、位置提示、极端长宽比给出左／中／右、上部、全图等候选，要求人工确认。[旧渲染](../../packages/assets-icons/src/assets/imageAssets.ts) 用 Node Sharp 裁切并合成静态环。复用纯坐标、建议和适合的初始构图，不把 Sharp、SSH 上传逻辑或静态成品接进 Foundry 浏览器模块。 |
| 图片保存 | [生物导入文件](../../packages/forge-browser-runtime/src/encounterPackage.ts) 已支持 PNG、WebP、JPEG 和图片 SHA-256。当前目标白名单只有 `img` 与 `prototypeToken.texture.src`。[导入实现](../../foundry-modules/fvtt-json-forge/src/encounterRuntime.ts) 通过原生 FilePicker 上传并读回校验。若要求 ZIP 重导后也保留动态环，需显式增加并验证主体与启用状态的约定，保留旧包可读。 |
| 地图渲染 | Foundry v14 的原型 Token 支持 `ring.enabled` 与 `ring.subject.texture`，场景由原生渲染合成底板、环和主体。主体图在环的上方，想让某些部分在环后面，需要在主体贴图中遮掉。未指定主体时，Foundry 使用普通 Token 图片。实际引擎不需要新的 Forge 渲染器。[制作指南](https://foundryvtt.com/article/dynamic-token-rings/)、[v14 数据定义](https://foundryvtt.com/api/v14/interfaces/foundry.documents.types.TokenRingData.html) |

## 取图怎么做

1. 在当前生物的来源页和用户点选的补充页展示插图缩略图，保留页码与区域。可用页面中的图像坐标生成候选。同页多怪、多图、相邻页放图时，由用户确认归属。没有候选时，允许在页面预览上框选或跳过。
2. 如果可确认插图是独立位图，且能恢复正确的颜色和透明度，可以导出该位图；保留分辨率。若页面通过软蒙版、矢量、文字和多块位图组合，用 PDF.js 渲染选区取得**页面中实际显示的插图**。两种来源标注清楚，页面截图不标作字节级原图。Poppler `pdfimages` 或 PyMuPDF 可作本地对照工具，Forge 默认不需要 Python 或额外服务。
3. 用户选择后，左侧预览角色图，右侧预览最终圆内构图和 Ring。预设给初始取景，支持拖动、缩放、重置及重新选图，保留来源和参数。初版普通插图通过圆形遮罩得到透明画布；已有透明图可以保持轮廓。可为主体输出透明 WebP 或 PNG。只设角色图、不做 Token 也是有效操作。
4. 提交前保留预览与本地素材。GM 确认后复用 Foundry 上传、校验和文档创建流程。原图写 `actor.img`，裁好的图分别用于原型 Token 普通图和动态环主体图，环由 Foundry 开启。无图、取图失败或上传失败应给出具体提示并保留生物候选，让 GM 可继续以无图方式采用。角色已经创建时，补图归为单独的确认操作，不创建第二张同源角色卡。

## 第三方工具与模型

| 候选 | 能解决什么 | 采用判断 |
| --- | --- | --- |
| Tokenizer 2 | 模块带图层、遮罩、拖动缩放、动态环和可回编的图层。公开 `openEditorStandalone` 接受 `sourceImage` 与图层，角色创建前返回图像路径、原型补丁与图层。 | 最强第三方工具候选，优先作人工对照或建角后可选入口。独立编辑器点保存即上传，即使 Actor 还没建。直接接进 Forge 预览会改变写入时机。API 文档示例是图片路径，尚未在本地验证 PDF Blob 或对象 URL、旧预设初始构图、取消、重新编辑与当前世界 Ring。包列表明确给出 3.1.0 Verified 14，候选先固定该版本并核对实际 API。30001 模块目录未发现它的 manifest。[包登记](https://foundryvtt.com/packages/tokenizer-2)、[API](https://docs.ddb.mrprimate.co.uk/docs/tokenizer-2/api) |
| 旧 Tokenizer / 外部编辑器 | 旧模块可以用分层与遮罩完成破框；GIMP 用 Foundry 模板也可得到合格的主体图。 | 适合人工生产或做对照。旧模块重新打开只拿到合成图的经验支持保留裁切参数，不能作为 Tokenizer 2 的缺陷结论。[旧版说明](https://github.com/MrPrimate/tokenizer)、[GIMP 实操](https://www.reddit.com/r/FoundryVTT/comments/1myzhjw/dynamic_token_rings_tutorial/) |
| 本地 BiRefNet | 给复杂背景的插图做前景蒙版。可通过 rembg 或 ComfyUI 独立运行。 | 只作为显式「去背景」候选。增加运行时、权重、维护成本，需要看怪物触手、翅膜、毛发、烟雾是否被误抹。浏览器推理也有成功样本，但需要按目标显卡、WASM 与内存验证；不把权重加进 Forge 包。[模型](https://github.com/ZhengPeng7/BiRefNet)、[ComfyUI 权重与工作流](https://huggingface.co/Comfy-Org/BiRefNet)、[rembg](https://github.com/danielgatis/rembg) |
| 云端去背景 | 接收单张图片或 URL，返回抠图结果。 | 能省推理运维，仍要开发从 PDF 取图、人工编辑和 Foundry 写入，同时增加传图、凭据、费用和服务变动。remove.bg 官方 API 已公布迁移计划。首版无必要依赖它。[官方 API](https://www.remove.bg/api) |

作者发布的 Feather & Frame 贴文展示了动态环实时预览、破框与蒙版编辑，所列 GitHub 仓库本轮公开读取返回 404。作为交互参考保留，暂不列入可接入候选。[作者原帖](https://www.reddit.com/r/FoundryVTT/comments/1xgj3bf/feather_frame_a_token_maker_with_live_preview/)

## 一手经验与本地证据

- 一位 Foundry 用户报告，把已去背景的 PNG 载入 Tokenizer，调整位置并用遮罩控制露出区域，最后使用动态环，熟练后每张约 1–2 分钟。另一帖两位用户确认旧 Tokenizer 应用蒙版后能由 Foundry 原生加环。前者也有人报告旧编辑器重新打开会丢图层。它们支持「初始构图可调、保留可编辑状态」，不能证明 Forge 或 Tokenizer 2 的处理耗时，也没涉及 PDF。[用户工作流与问题](https://www.reddit.com/r/FoundryVTT/comments/1j8y56d/whats_the_better_workflow_for_tokenizer/)、[蒙版和动态环结果](https://www.reddit.com/r/FoundryVTT/comments/1od98xm/how_do_i_make_the_foundry_dynamic_token_appear_on/)
- PDF.js 用户和后续项目提交记录了重复图片对象不一定存在于预期页面对象缓存中的情况。pypdf 另一位用户看到一幅可见插图被拆成二十余项，维护者解释是底层图片、矢量和文字分别绘制，建议渲染页面再取图。不能用某个对象的提取成功率代表完整插图的提取率。[PDF.js 原始问题](https://github.com/mozilla/pdf.js/issues/13742)、[pypdf 原始讨论](https://github.com/py-pdf/pypdf/discussions/4095)
- 浏览器推理的一手报告用 BiRefNet-lite 512 做出抠图演示，但同一作者的 1024 版本在其 WebGPU 缓冲或 WASM 内存条件下失败。另一位用 BiRefNet 处理剪贴画的作者报告，模型掩模细节不如适用于其纯色背景的色键做法。两者都不能代替奇幻怪物样本对比。[浏览器模型尝试](https://www.reddit.com/r/huggingface/comments/1sp9b3k/firsttime_contribution_birefnet_in_the_browser/)、[剪贴画反例](https://www.reddit.com/r/comfyui/comments/1vvcoty/i_gave_up_on_ai_background_removers_for_my/)
- 本机用已安装 PDF.js 6.4.299 和 Node Canvas 生成并渲染三页合成 PDF。第 1 页是带软蒙版的嵌入图，第 2 页复用同一对象且覆盖一块蓝色矢量，第 3 页是纯矢量。读取 `page.imageCoordinates` 后，前两页各取得一组图像坐标且透明像素保留，第 2 页采样到叠加的蓝色，第 3 页没有位图坐标但可渲染出绿色矢量。最初用独立操作列表中的 ID 直接同步读取页面图片缓存，抛出对象尚未解析；误从 render task 读坐标也得到空值。结果支持用页面渲染作可靠的降级路径，同时把嵌入位图提取留作可选优化。这个探针未用真实素材，也未走 Chrome、Token UI 或 Foundry 保存。
- AnySearch 成功返回 Foundry 相关案例，部分 PDF 与模型查询出现 TLS 连接中断，后续用网页搜索读取了原始材料。

## 待验证的引入与本地化清单

1. Forge 自有最小流程。固定一组真实样本，包含独立透明位图、带背景插图、多怪共图、相邻页插图、软蒙版或混合绘制、无图。对照嵌入图、页面选区和手工参考图，记录正确匹配、漏图、误选、原始分辨率与透明边缘，优先查错配与裁掉主体。确认用户改位置后左右两种预览各自正确，保存与刷新后角色图和动态主体均可读，已在场景的棋子与新拖出的棋子行为分别核对。无图、取消、重选、上传失败与旧 ZIP 重导各验证一次。
2. Tokenizer 2。用同一插图和初始构图对比拖动缩放、改后重开、保存步骤和最终地图效果。固定 v14 样本和接口版本，核对保存时上传、Blob／同源路径、配置依赖、返回 patch、取消及动态环实际显示。再决定是否做可选编辑入口；没有本地运行证据前按 Untested。
3. 去背景模型。先人工做一组可比主体，再用同一组样本比 BiRefNet 和纯手动圆裁的可用率、修边时间、首次加载与处理时间、内存，以及用户愿不愿意保留结果。只在能明显减少工作量的插图类型上做可选模型功能。云端方案保留为后备，需要另行选择服务和素材传输方式。

上述调研和合成 PDF 探针先于实现。以下是后续首版的验收结果。
## 首版本地验收

- 开发环境 30001，Foundry 14.370 / dnd5e 6.0.6+local.3，官方 Chrome。实测 Better Monsters 的《Mezzoloths》PDF。第 2 页的既有生物文字候选通过同版本本地生成重新核验。通过本地候选恢复入口保留原工作台草稿，并走 Forge 实际 PDF 配图、复核、上传和创建流程。
- 第 1 页选中 850×1036 的透明内嵌插图，完整保存为角色 PNG。已验证从页面手动框选、重选、拖动、缩放、键盘微调及窄窗布局。最终选「取上部」预设并把缩放从 148% 调至 146%，生成独立的 512×512 透明 WebP。应用新构图后需要重新确认导入。
- 早期候选继承原型的 2 倍环主体缩放。真实场景中渲染器已启用且贴图正确，环和底板仍被压到主体下面。修复后，带 Forge 构图元数据的主体以 1 倍写入，原型和地图棋子均读回 1 倍。最终在约 220 像素的地图棋子上看到了原生银灰环和深色底板，目视构图与预览一致。两份图片的落盘 SHA-256 和最终构建的磁盘、HTTP SHA-256 均一致。
- 回归检查覆盖旧比例被替换、角色图与棋子图独立、导入未改变生物数据和物品。Forge 构建、类型检查及手册检查通过。
- 验收证据存放于仓库外的数据目录 `maintenance/2026-11-13-forge-pdf-art`。以 `chrome-receipt-05.json`、`chrome-ring-diagnostic-05.json`、`chrome-33-r3-composition.jpg` 和 `chrome-37-r3-map-ring-clear.jpg` 为准。测试棋子已从场景移除，测试角色、图片及复验宏保留。测试名牌仍有 `(Hidden)` 后缀，Foundry 读回为可见，来源未查。
- 本次真实 PDF 验收覆盖一份样本、一个世界和钢色环。扫描件、多怪共图、其他世界环和全新 AI 文字提取未做实测。没有接入第三方模型。本段验收时的安装范围为开发环境 30001。

## Token 采用与重新确认

- 用户要求「生成 token 后，需要让用户选择并决定该 token 是否可用。如果不行，允许用户自行调整。」PDF 配图预览提供「采用此 Token」「调整构图」「只用角色图」和「跳过配图」。已确认的构图修改后，需重新选择配图方式，再确认导入。
- 在本地 30001 使用同一份《Mezzoloths》PDF 的透明插图验证了预设、拖动、键盘移动、缩放、只用角色图和跳过配图。实际导入的测试 Actor 保留完整 PNG，Foundry 原型 Token 的普通贴图和原生环主体均指向同一份裁切 WebP。只用角色图和跳过配图两条分支均核对候选资产和导入按钮。
- 复验确认，缩放从 67% 调到 69% 时，顶部和预览都变为待确认，角色审核自动取消，导入锁定，资产列表标明当前仍列出上次确认的图片。重新采用后只替换 Token，角色图校验值一致。重新勾选角色审核后可以导入。本轮复验止于导入按钮，实际创建结果沿用上一轮。
- 浏览器证据存放在仓库外数据目录 `maintenance/2026-11-13-forge-pdf-art`，见 `chrome-receipt-06.json`、`chrome-receipt-07.json` 和 `chrome-approval-status-01-pending-after-edit.jpg`。构建、类型检查、PDF 和导入回归以及手册一致性检查通过。

## 验收构建标识

Forge manifest 为 0.6.0。最终本地 Chrome 验收产物以 SHA-256 区分。样式来自同批布局验收，后续仅更新状态和审核模板。

| 文件 | SHA-256 |
| --- | --- |
| `scripts/index.js` | `fa1a093ca5c88b0d944534669a4fc5dfe4b8b48f611227fab346df00e63ff1a2` |
| `styles/fvtt-json-forge.css` | `f64c520233f4604e7a729402c267435741595b23ede9875ced25e033dd1eb607` |
| `templates/forge-encounter.hbs` | `d10912987dd64cea8c1fe399bfdd74443b6ca2959f38b9c391ca4e718fc3bba8` |

## 2026-11-13 同步至 8080

用户授权将本次 Forge PDF 转 Token 改动与验收记录合并到本地 master，再同步本地已验的同一版，线上核对更新结果。原功能已先合并至本地 master。合并后重建的入口脚本、样式和生物审核模板与上述三个 SHA-256 一致，手册一致性检查通过。

8080 只替换上述三个文件。写入前核对原文件、运行实例及现装 Forge 0.6.0 清单。清单及 PDF.js 支持文件共 189 项，与本地构建的摘要一致。更新后，服务器磁盘、服务器 HTTP 和现有 SSH 转发的 HTTP 响应均读回同一份文件。目标世界进程持续运行，Core 14.370／dnd5e 6.0.6+local.3，服务器及转发的登录页均为 HTTP 200。核对期间错误日志无增长，远端暂存已清理。

本机直连公网地址的请求返回 404。本次生产读回使用服务器侧和已核对的 SSH 转发。Chrome 功能验收沿用本地结果。Git 外证据在本次数据目录的 `8080-sync`，包含前像 `preflight.json`、安装 `installed.json`、服务器读回 `verified.json`、转发读回 `tunnel-http.json` 和清理 `cleanup.json`。

## GitHub 发布

本次从公开分支的候选页接入 PDF 配图。先在主角色卡展开「角色图与 Token」，再选图、调整构图和决定采用方式。打开配图区前，首屏仍以差异清单为主。

复用上面的本地 Chrome 功能验收，并核对公开版配图、候选页、图片写入和包格式源码与已验构建中的实现。公开分支通过 309 项候选与导入检查、33 项 PDF 检查、Forge 和共享包类型检查、构建及手册检查。地图上的动态环结果沿用 Mezzoloths 实测。本次发布未重新部署 Foundry。

| 公开构建文件 | SHA-256 |
| --- | --- |
| `scripts/index.js` | `db10068dc015a00d4b3b640681c838caf7ae7226e8e5092dc69ae7cde3c2572b` |
| `styles/fvtt-json-forge.css` | `ce57d14b06244eb393e51bd30a87057e584416007cdf65607abe9a0a1af14b0a` |
| `templates/forge-encounter.hbs` | `dfa808209c4c5ed09ddf1d336f85f821475d327ed0d9fb9242d3dcfc920ce0d4` |
