# Forge 首用与模型目录

本轮处理首次进入 Forge 的 AI 配置提示、模型下拉和连接窗口阅读顺序。以用户的两张实机截图、模块 PRODUCT.md 和现有 Foundry 主题为基线，按 Impeccable 的 audit、onboard、layout、polish 审查。

| 表面 | 发现与处理 |
| --- | --- |
| 生物蓝图、标准资料和 AI 整理 | 原导航的弱状态文本容易漏看。三种模式共用可行动的提示，已验证的连接在工具栏显示。草稿与独立预览沿用各模式原入口。蓝图导航选中线调为两像素。 |
| 物品标准资料和 AI 整理 | 使用同一提示和状态刷新。检查长模型名、窄窗口和导入页可用空间。 |
| 生物与召唤物 | 原连接操作埋在生成段。窗口开头增加配置入口，旧包预览仍可直接使用。修正导入标签重复字样。 |
| AI 连接 | 原 search 输入由浏览器绘制清空按钮与 datalist 下拉，当前值还会筛掉其它候选。统一输入、清除和下拉高度，明确加载、空、失败和筛选状态。保存、测试放在基本连接旁，较少用的选项使用同样的间距与折叠结构。 |
| 来源库、恢复、批量、指南与战斗控制 | 检查共享表单样式的选择器作用域、可滚动区域及模式切换入口；连接改动限定在工作台导航、连接窗和召唤窗口。 |

模型目录复用既有 Provider 和 HTTPS 连接设置。OpenAI、Gemini 兼容入口和 DeepSeek 按目录 API 读取当时返回的 ID；Anthropic 请求较大页面，OpenRouter 官方目录按其提供的流行度顺序请求文本模型。服务端有模态信息时过滤明确不接收或不输出文本的项，其他目录将非日期 ID 和明确标注文本输出的项优先，并在同组中使用目录提供的创建时间。日期规则不承担兼容性判断。已有 ID 继续由 GM 选择或手填，生成测试按真实端点验证。列表不落盘，切换连接取消旧请求。

一手案例中，Open WebUI 用户对一个目录未返回可选模型的远程连接手填模型 ID，随后成功选择并发送聊天请求。它验证了目录发现与实际推理可独立成功；Forge 是 Foundry 浏览器直连，还需要独立检查 CORS、授权范围、延迟和模型切换，不能照搬该案例的服务端连接。 [原始讨论](https://github.com/open-webui/open-webui/discussions/16369)

公开 OpenRouter 目录的无 Key 请求实测 HTTP 200，返回 472 个文本候选并声明允许任意来源。该目录在未填写 Key 时也可读取；生成仍需 Key。

接口依据及复查入口为 [OpenAI Models](https://platform.openai.com/docs/api-reference/models/list)、[Gemini OpenAI 兼容接口](https://ai.google.dev/gemini-api/docs/openai#list-models)、[Claude Models](https://platform.claude.com/docs/en/api/models/list)、[DeepSeek Models](https://api-docs.deepseek.com/api/list-models/) 和 [OpenRouter Models](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties)。键盘和选项语义按 [W3C APG Editable Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-list/)核对。后续添加 Provider 时先核目录端点、认证、模态和浏览器访问，再用慢答切换及模型手填反例验证。当前没有额外待引入的模块。

验证包括实际模板的键盘选择、模型来源切换、手填及目录失败、包构建和本地 Foundry 实机。离线测试与浏览器结果分别登记。

## 2026-11-13 首轮 Chrome 实测

官方 Chrome 在开发环境 30001 验证了生物三种入口、物品两种入口、召唤窗、资料库、批量和图解。Provider、模型输入、清空和下拉共用顶部位置及 40 px 高度，两枚图标的中心相同。展开全部设置滚到底仍有约 32 px 余量，键盘焦点可见。OpenRouter 公开目录在界面上成功加载和刷新 472 项，鼠标、键盘、清空及切换 Provider 均实测。已打开时输入筛选有效。浏览器未实际保存连接或请求付费推理。

发现关闭列表时先输入再打开会丢失筛选，已修正并通过实际模板回归。已选模型或已有保存值仍可直接展开全目录，手填文字用于筛选并在重新展开时保留。新脚本在同一 PID 5844 上从本机安装和 HTTP 读回一致。首轮构建及行为证据保持原身份。

540 px 视口中的连接表单正常单列，无横向溢出。低于 Foundry 要求的 1024×768 时，Core 的尺寸告警会覆盖上部。会话监测器自有浮层的固定叠放在窄工作区覆盖了部分底栏，属于独立模块；可用其标题栏移动或收起。首轮收据及截图位于 Git 外任务证据目录。

## 2026-11-13 筛选复验与交付

同一开发环境的专用 Chrome GM 页复验通过。OpenRouter 无 Key 时，关闭列表先输入 glm，首次展开与 Escape 后重新展开都只显示 22 个匹配项。选中后重新打开显示完整 472 项。不存在的手填 ID 在无匹配时仍保留，清空后恢复完整目录。浏览器加载 Forge 脚本且命中新行为，独立 HTTP 响应与安装脚本 SHA-256 同为 A636997B1D2F41071426ED397829F9D0C7FDD7516BB4F636BBEA6A36188A0F21。复验关闭了自有页面，30001 保持运行。收据为 Git 外 chrome-receipt-02.json，截图为 chrome-11-filter-before-opening.jpg。

复验范围为连接界面与公开模型目录。保存和连接测试逻辑已通过离线回归，Provider 的实际推理以及 Key 持久化没有进行浏览器验收。本地构建包 SHA-256 为 7DA124EF03FF765C2407B232878412FE6BAD8E1C7AD0F462A47449E9B50C5A53。交付位于本任务工作树，安装限 30001。

## 2026-11-13 同步至 8080

用户授权提交并合并本次 Forge 改动，再将本地已验的同一份更新同步到 8080，线上只核对更新结果。实现提交为 6b14ca35。整合保留 master 已有的手册内容，重新生成手册，Forge 实现与本地验收候选一致。

同步仅替换 Forge 0.6.0 的入口脚本、样式和三个模板。SFTP 暂存后核对文件前像和候选摘要，逐一覆盖，并从服务器磁盘、服务器 HTTP 和公网入口读回五个 SHA-256，均与 30001 验收产物一致。入口脚本 SHA-256 为 A636997B1D2F41071426ED397829F9D0C7FDD7516BB4F636BBEA6A36188A0F21。线上 cor-cotn 保持活动，Core 14.370／dnd5e 6.0.6+local.3，服务沿用 PID 980，登录页 HTTP 200，观察期间错误日志未增长，本次暂存目录已清理。Chrome 操作验收沿用本地两轮结果。

Git 外收据在本次任务证据目录的 8080-sync 子目录，verified.json、external-http.json 和 cleanup.json 分别记录服务器读回、公网读回及暂存清理。
