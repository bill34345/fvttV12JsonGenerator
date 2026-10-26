# Forge Mirror：已有候选保留与失败提示

当前结论：本批安装、三个失败分支的真实界面行为、正常创建、刷新读回、实际下载内容对照与清理收尾均完成。下载实际字节已落盘并与候选逐字段、逐字节一致；用户明确不再把最终文件名列为待办。AI 内容复核关闭，真实模型调用 0，未提交、合并或推送。本次收尾没有重跑已通过测试。

## 环境与构建

- 继续使用 `20261019-forge-ab-fixed-replies` worktree、`codex/20261019-forge-ab-fixed-replies` 分支，HEAD `080fb7c4080a77dd5c8da526d081cb01ace6b10e`。
- 既有 Mirror：Core14.368 / dnd5e5.3.3 / cor-cotn / PID20308 / 127.0.0.1:30001。未重启、未切换世界。
- 只替换 Forge `scripts/index.js`，SHA256 `719f32222bed8a2e77175954c34af59fefc2a916a56f7b7b1fc8250f57b5b344`。模块其余文件及 Resolver 未变。
- 同任务 Chrome 执行器 `forge_mirror_ui`，实际 Sol/medium、Full Access；官方 Chrome 连接器，任务页 `http://forge-preserve-20261026.localhost:30001/game`。其它用户／MCP 页不操作。

## 输入与方法

使用上一批 Unicorn 原来源和已保存的双语 IR；没有新提取或复核模型请求。原来源 SHA256 `65a06fcb62ffe0946b85073fb0edbc8e8aeb9a4bf02fc2c5b9466dc5ccdb6d17`。正常 Forge 分析入口通过任务页的固定回复传输器读取这份 IR，再调用已安装的实际生成器、检查器、下载及创建处理器。

检查差异场景仅把派生规范资料的生命值 97 改成 96，触发真实转换检查；这不是新的模型错误，也不是修补最终 Actor JSON。无产物场景在本任务的规范资料转换入口抛出明确异常。测试工具不设置应用状态、不注入候选 JSON；实际操作通过正常页面按钮完成。

原始 185 份前批证据与 65 份冻结 fixture 的 hash 全部保持。

## 真实界面结果

| 场景 | 实际结果 |
| --- | --- |
| 首次转换失败，没有 Actor JSON | 显示规范资料转换失败；没有候选、没有说明卡替代品，创建与 Actor 下载不可用。1987 字符完整来源和提取 IR 保留，可正常返回编辑。 |
| 已生成 JSON，检查出差异 | 页面显示 HP97→96 的具体问题，同时保留完整候选及正常查看、下载、重新生成、GM 确认入口。候选仍标为待 GM 确认，不把差异记为通过。 |
| 同次本地重新生成失败 | 正常点击“重新生成”，明确提示本次未生成新 JSON、此前候选完整保留；整个 candidateResponse 与失败前严格相同，requestId、attemptId、来源、IR 和候选 hash 相同。新失败只追加到问题记录。 |
| 采用保留的候选 | 正常 GM 确认创建 Actor `533ece87f3e1fee7`，随后刷新任务页并打开原生角色卡。完整原生对象刷新前后严格相同，9 项基础特性、9 个法术 Item、9 项 Cast 均在。未掷骰、未施加伤害，不重复已有法术玩法验收。 |
| 下载落盘 | A/B 初次正常点击下载时未获得事件回执。续接时正常点击当前保留候选的下载后，在系统下载目录找到63,969字节浏览器临时文件；完整JSON与该候选严格相同，序列化SHA256也完全一致。原字节作为下载证据保留；按用户最新决定，不再为最终文件名补操作。 |

创建会按既有设计清除已经采用的本地候选恢复副本；这与“本次转换失败后保留未采用候选”是不同阶段。没有新增跨尝试历史或失败分析刷新持久化。

## 本轮补齐的入口

实机准备发现待 GM 确认页没有本地重试按钮；原应用测试曾手动改状态，因此不能证明用户能操作。现已增加“重新生成”次按钮，Create 保持主按钮；随后去掉这条本地路径对 Key 和连接探针的要求。沿用已保存的 provider 身份，所有模型请求函数明确禁止；来源、目标及候选身份检查保持。“重新分析”仍是新的模型提取。

新增检查对应这两个具体缺口：现有安全入口 7 项通过、96 次断言；正常恢复后空 Key／未探针，实际绑定按钮可本地生成，失败保留原件。完整模块类型检查、构建、独立增量审查、手册 build/check 均通过。测试中的 Bun fetch 类型断言错误仅修正测试类型，没有更改产品行为。

## 取证工具问题与下载调查

第一次 C 提取被测试工具错误拒绝，尚未进入 Forge 转换。原因是实际 provider 会增加 `sourceLength` 并移除重复的 `candidate.quote`，初版夹具的假协议不一致。工具 r2 已改为真实 provider 序列化并验证；保留原阻断记录，不计作产品生成失败。长 DOM 取证初次被截断为 200000 字符，后续分块保存可见只读文本并成功解析；截断原件保持，不重复已有效业务步骤。

下载研究未得到当前环境的确诊依据：[Playwright #17335](https://github.com/microsoft/playwright/issues/17335) 是 Windows 下同类事件超时的旧报告，缺少最终定位；[Chromium #41380177](https://issues.chromium.org/issues/41380177) 的立即撤销 Blob 问题发生于 Chrome65 扩展页，后续已修复并验证，不能据此归因当前页面。当前 Foundry 自带下载函数使用 Blob、临时链接和100ms撤销，同样未得到下载回执；因此没有凭旧案例修改 Forge 下载代码。

官方 Chrome 工具拒绝访问 `chrome://downloads/`，仅允许 HTTP(S) URL。对应路线已停止，没有改用其它通道查看该内部页，也没有改浏览器权限。后续仅补下载证据，不重做已经通过的场景或角色创建。

## 证据与接续

完整私有证据目录：`H:/CodexData/visualizations/2026/10/25/01a1720b-4563-7511-82df-e8cb00ed7e53/forge-mirror-generation-preservation-20261026/`。

- `install-local-retry.json`：最终安装前后清单与 hash。
- `C-no-candidate-full-dom.json`、`A-check-difference-full-dom.json`、`B-retained-candidate-full-dom.json`：实际页面取证及完整候选。
- `created-full-dom.json`、`reloaded-native-full-dom.json`：正常创建与刷新后的完整原生对象。
- `parent-behavior-verification.json`：主控独立比较，下载明确待确认。
- `A-download-receipt.json`、`B-download-receipt.json`：实际超时回执。
- `raw-evidence-preservation.json`：原始证据与 fixture 未变。

前次因Windows原生窗口工具无法确认浏览器URL而停止界面操作，临时保留了本批Actor、Macro及页面。该历史停止记录保持；本次按用户明确要求，通过已就绪Mirror MCP及原官方Chrome页面完成对象清理，没有继续操作保存窗口或内部下载页。

为补齐下载证据，r3只额外读取一次同源固定回复，正常生成再本地失败，未再创建Actor；正常清除了假Key，无Key重试仍完整保留。该页现保留真实候选和展开的下载按钮，已向用户请求一次手动点击并回报文件位置。累计固定models/probe/extract为2/2/3，真实模型HTTP仍为0，读取完固定回复后自动封闭。`manual-download-ready-full-dom.json`与`manual-download-handoff.json`保存本次待下载候选身份；不能把它当成已经落盘的文件，也不能覆盖原A/B结果。

下载续接：用户表示“以后这个事情不要问我，我下好了”。找到的用户保存文件是初次helper取证JSON；随后一次正常Forge下载点击结果未知，但只读文件检查发现`H:/Download/e766ef37-4922-40ef-88f3-d54268dd487f.tmp`。其63,969字节、SHA256 `372799866d653558f1ef29e80928aa57dd25b84a25223d13fe724571a2db218f`与此前待下载候选的精确序列化预期相同，完整JSON结构相同。原字节采集为证据`download-recovered-actor.json`，未重建或编辑生成数据，原下载临时文件未动。`download-file-verification.json`保留路径、hash和最终命名未确认的边界。以后此类下载取证由代理使用可用工具处理，不再要求用户代操作；本次不继续请求手工步骤。

## 清理收尾

用户最新原话：“下载内容已经核对一致，就别再纠结最终文件名了。用 MCP 或其他可用工具把本批测试角色、宏和页面清理收尾，保留证据，不要重跑已经通过的测试，也不要再让我代操作。”

- Mirror MCP重新确认正确实例、世界和版本，复用PID20308。按唯一ID删除测试Actor `533ece87f3e1fee7`，再查返回不存在；没有按名称批量删除。
- 通过现有候选存储接口只删除本批`single`记录，删除前核对完整checksum和候选hash；原候选存储为空，最终也为空，没有直接编辑IndexedDB。
- 原世界完整基线守卫通过后，恢复本页临时包装并删除任务Macro `7C1W5y7HtlU1BvBs`。仅关闭ownedtab `651351366`，用户页 `651351219`、`651351330` 保留。
- 主控独立比较最终世界与原始基线完全一致：318个Actor、180个世界Item、67个Scene、94个Macro、10个Combat、1242条ChatMessage；设置、模块、场景和时钟也一致。任务页关闭后，Mirror MCP仍可正常读回原世界。
- 清理前54份本轮证据、185份前批证据及65份冻结fixture逐个hash不变，下载证据保留。收尾只做删除后读回、证据比较及新清理脚本的语法检查，没有重跑产品测试、没有新模型请求。

新证据：`mcp-actor-cleanup.json`、`cleanup-final-full-dom.json`、`cleanup-tabs.json`、`cleanup-parent-verification.json`。本批不再保留待清理世界对象或页面。

另有一项新发现，未在本次清理中改产品代码：“清除本地恢复副本”按钮把`DialogV2.confirm`取出后直接调用，Foundry14.368内部使用`this.wait`，实际因此报错。该按钮的问题与本批生成保留行为分开记录；本次使用同模块现有`candidateStore.clear`事务接口精确清理成功。失败取证及清理工具源码保留，不能把此处的清理成功写成该按钮已修复。
