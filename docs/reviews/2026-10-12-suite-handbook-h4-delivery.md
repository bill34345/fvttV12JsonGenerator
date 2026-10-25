# H4 手册双交付与本地模块包契约

日期：2026-10-12。Suite候选0.3.0，帮助ABI1；只读窗口仍适配精确Core14.368，不调用dnd5e数据接口。当前接受与已知缺口由[执行总账](../plans/2026-10-11-fvtt-suite-refactor/EXECUTION_LEDGER.md)维护，本文固定交付接口和检查边界，不把准备成功当作外部发行。

## 两个读取面

`docs/handbook/delivery.json`显式登记28个Foundry用户条目和8个仅离线条目，并逐项写明工程/历史归属原因。完整离线HTML保留全部36个稳定ID、来源、review及监测；Foundry导出保留选中条目引用的公开sources和review日期/fingerprint，详细review note替换为用户用途摘要。Foundry更新页同样只显示用途和核对日期；完整工程核对正文保留离线。引用的原始文档仍可能带技术或历史背景，不声称逐段删除这些原文。

两侧ID必须构成完整且不重叠的目录分区；新增ID未登记、未知/重复ID或没有排除理由时拒绝构建。没有缩小watch或新owner覆盖，不修改各条目实际功能和支持范围。

- `handbook:export`生成完整`dist/handbook/content.json`。
- `handbook:export:foundry`生成`content.foundry.json`和`projection.foundry.json`，后者列出保留/省略ID、引用/排除来源和总目录计数。
- 根`工具手册.html`始终使用完整投影，继续是无需服务、网络或Foundry的单文件。

## 模块包和独立文件

Suite模块ZIP严格只含`module.json`、`scripts/index.js`、`styles/suite-handbook.css`、自包含`README.zh-CN.md`和`build-identity.json`。不带其他模块、完整工程HTML、fixture、测试、reference或本机工具。完整HTML作为release目录中的独立文件交付，不装入用户模块目录。

`release:suite-console`先检查手册review与根HTML同步，再构建Foundry投影和确定性ZIP，输出同字节独立manifest、完整HTML、SHA256SUMS和机器可读交付清单。校验和覆盖ZIP/manifest/HTML；清单绑定白名单、字节数、每文件SHA和离线HTML源/交付SHA。原有工程README不直接作为安装后帮助，打包使用本模块的`docs/INSTALL.zh-CN.md`。

路径/树检查拒绝链接、硬链接、未知残留和不安全ZIP路径，不清空目录或靠强制删除继续。浏览器bundle的可执行加载/求值拒绝继续有效，文档命令只作为字符串。

## 最小反证与接受范围

| 接口/风险 | 所选检查 |
| --- | --- |
| 完整目录与显式省略 | 28+8穷举、36ID离线保留、17runtime映射、未知/重复/未登记拒绝 |
| 工程来源错误进入Foundry | 专用fixture的独占sources/reviews在Foundry消失、完整HTML仍保留；未引用来源不得带入 |
| 更新页泄露工程核对过程 | 用户页显示用途/日期，原工程note在视图及Foundry导出消失；原note仍在完整离线HTML，日期/fingerprint不变 |
| ZIP与manifest/HTML不一致 | 实际ZIP逐文件读回/CRC/bytes/SHA，独立manifest同字节、HTML不在ZIP且独立文件与根源相同 |
| 陈旧或不安全输出 | 实际build前置handbook:check、拒绝未知树/链接/硬链接、固定白名单/危险路径拒绝 |
| 确定性与首次成本 | 两次实际构建SHA相同、记录包/JS/HTML大小；Foundry测首次和重复打开，不用世界启动耗时冒充窗口首开 |
| 正式发行 | 保留真实品牌/授权/渠道/下载地址及渠道安装接受的前置，不伪造地址或批准 |

旧H2/H3未变的阅读、帮助和权限证据按相同实现复用；H4实际运行只补投影/包身份/首开与读取面变化。不重试此前被拒绝的file URL，不托管HTML或换浏览器通道追认视觉。
