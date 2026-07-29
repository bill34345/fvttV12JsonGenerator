# 本地 Foundry VTT 玩家端 Chrome 高内存与周期卡顿完整审计报告

> **2026-07-28 外部归因更新：** 本报告当时称为“两块未知原生池”的两个 32 GiB `AllocationBase`，现已根据 Chromium PartitionAlloc 官方设计与外部案例，高置信度识别为 PartitionAlloc/GigaCage 系列地址池容器。两池合计约 1,493.961 MiB 的 committed 页面是真实待解释项，但池内 Blink、Pixi/纹理、Skia/SharedImage、媒体解码及 allocator 碎片的占比仍需 native heap profiler 与 memory-infra 分解。详见 [Foundry VTT Chrome 约 1.5 GiB 原生分配池外部归因报告](./2026-07-28-fvtt-1.5gb-native-pool-external-attribution.md)。

> **2026-07-28 逐页 resident 纠正：** 本报告第 9 节把两个 Worker 的约
> `572 MiB` committed 当成了同量的当前物理占用。后续 `K32QueryWorkingSetEx`
> 证明确认两个区域实际 resident 各约 `1.15 MiB`；因此“7→2 已释放约
> 1,430 MiB 当前物理 RAM”和“两个 Worker 仍占 572 MiB RAM”均已被取代。补丁仍能
> 限制虚拟提交和并发解码风险，但 resident 结论以
> [最新调查](./2026-07-28-fvtt-resident-memory-priority-investigation.md)为准。

> 审计日期：2026-07-27
> 审计对象：本机 Chrome 中 `http://127.0.0.1:30001/game` 的玩家网页
> Foundry：14.364
> dnd5e：5.3.3
> 世界：`cor-cotn`
> 当前场景：`B5.狂蛙人洞穴Bullywug Cave`
> 报告性质：只读诊断、归因与优化路线；本轮没有修改世界设置或模块代码
> 文件状态：本报告完整覆盖 2026-07-26 的旧版报告

## 0. 先读结论

### 0.1 这不是一个单一故障

当前“Chrome 约 3.8 GB”和“页面动画一卡一卡”并不是同一个指标，也没有证据表明它们只有一个共同根因。审计必须拆成两条证据链：

1. **高内存链路**：主 Foundry renderer、GPU 进程、V8、Chromium 原生分配池、Sequencer WebM Worker、DOM、图片解码、PIXI 纹理、世界文档分别占用内存。
2. **卡顿链路**：主线程周期性 DOM 写入触发 `:has()` 全局样式失效，产生约 83–89 ms 的样式重算；这会直接错过多个画面帧。

两条链路有交集，但不能互相替代：

- 降低 Worker 数量能显著降内存，但不必然消除每秒一次的主线程卡顿。
- 停止隐藏侧栏的 DOM 写入能显著减轻卡顿，但不必然把 Chrome 内存从 3 GB 降到 1 GB。

### 0.2 当前已证实的卡顿根因不止三个

本轮重新追踪后，至少确认了两条彼此独立的周期性长样式计算链路：

| 链路 | 周期 | 本轮直接证据 | 对体验的影响 |
|---|---:|---|---|
| Dice So Nice 隐藏侧栏统计 | 1 秒 | `_updateStatsFooter()` → 修改 3 个文本节点 → `BODY` 的 `:has()` 失效 → 83–89 ms `UpdateLayoutTree` | 每秒可见顿一下，优先级最高 |
| Calendaria 聊天时间戳扩展 | Foundry 核心每 15 秒调用一次 | `Gs.updateTimestamps()` → 遍历并更新当前聊天消息 → 大量聊天节点受 `:has()` 影响 → 一次约 85 ms 长样式计算 | 较低频但明显的周期大顿 |

此外还有尚未通过隔离实验关闭的独立性能面：

- 13,286 个侧栏后代元素和 1,386 个侧栏图片节点长期挂在 DOM 中，大多数位于隐藏标签页；
- 68,348 个 DOM `Nodes`、12,652 个 JS 事件监听器、8,341 个布局对象；
- 413 个已解码 `<img>` 实例；按原始像素粗算约 523.7 MiB，去重后约 237.4 MiB；
- 99 个可去重 PIXI 基础纹理；按 RGBA 粗算约 224.6 MiB；
- 两个 Sequencer WebM Worker 各有一个精确的 299,958,272-byte 私有提交区，共 572.125 MiB；
- 主 renderer 内还有两个合计约 1,494 MiB 的大型 Chromium 原生私有分配池，当前接口无法安全地进一步按 Blink、PartitionAlloc、Skia、媒体解码等所有者闭合；
- 当前世界同时启用 69 个模块，仍需用模块隔离矩阵排除未被 3.6 秒追踪窗口命中的低频任务。

所以，**不能保证“只有三个优先项”**。可以保证的是：下面的优先级按照“已证实程度 × 玩家体感 × 可逆性 × 预计收益”排序，而不是把未排除项隐藏掉。

### 0.3 `Duplicate UUID` 不是当前 3 GB 内存和每秒卡顿的主证据

本轮控制台记录到 46 条 `Duplicate UUID`，全部集中在同一个时间戳：

`2026-07-27T11:50:07.255Z`

其中包括：

`Duplicate UUID: @vehicle[夸力许装置|xdmg|Apparatus of Kwalish]`

调用链指向 Plutonium 的索引构建 `_pDoIndexPlutoniumData`。`installHook.js` 是浏览器扩展对控制台方法的包装位置，不应被误判为 Foundry 根因。

这批日志证明的是：

- Plutonium 数据索引里存在相同逻辑 UUID 的重复条目；
- 搜索索引可能出现覆盖、歧义、重复结果或额外索引工作；
- 应作为搜索正确性和索引卫生问题修复。

它没有证明：

- 日志在持续无限循环；
- 每条日志都保留大量对象；
- 它创建了两个 700–800 MiB 原生池；
- 它是每秒一次 83–89 ms 样式重算的触发者。

因此本报告把它列为**正确性优先、性能次级**的问题，而不是把它冒充为已证实的内存泄漏。

## 1. 审计目标、完成标准与边界

### 1.1 用户目标

最终目标不是“解释一个报错”，而是减少玩家网页可感知的卡顿。第一阶段的有效完成标准是：

1. 对当前 Chrome/Foundry 实例重新采样，不沿用已经变化的旧 PID 和旧内存数值；
2. 分开说明操作系统进程内存、renderer 私有提交、V8、DOM、图片、PIXI、Worker 和 GPU；
3. 对长任务、丢帧和模块调用栈给出直接证据；
4. 区分已证实根因、强相关贡献项、待 A/B 验证项和当前无法归属项；
5. 给出可逐项回滚的优化顺序；
6. 给出能证明玩家体感改善的 A/B 验收协议，而不只看“脚本运行成功”。

### 1.2 本轮没有做的事

- 没有禁用模块；
- 没有更改世界设置；
- 没有修改 Dice So Nice 或 Calendaria；
- 没有进一步降低 Sequencer Worker 上限；
- 没有删除聊天记录、Actor、Scene 或图片；
- 没有把本地测试镜像当作生产服务器；
- 没有凭推测给两个大型原生池强行命名。

## 2. 审计环境与采样条件

### 2.1 浏览器与硬件暴露值

| 项目 | 值 |
|---|---:|
| Chrome 版本 | 150.0.7871.182 |
| `navigator.hardwareConcurrency` | 16 |
| `navigator.deviceMemory` | 32 GiB |
| 页面视口 | 1981 × 1110 |
| `devicePixelRatio` | 1 |
| Foundry `core.maxFPS` | 30 |
| Foundry `core.performanceMode` | 2 |

### 2.2 世界规模

| 集合 | 数量 |
|---|---:|
| Actors | 516 |
| World Items | 178 |
| Scenes | 252 |
| Chat Messages | 522 |
| Journals | 67 |
| Compendium Packs | 99 |
| 启用模块 | 69 |

### 2.3 当前场景

| 项目 | 值 |
|---|---:|
| 场景逻辑尺寸 | 3584 × 3584 |
| 背景图片 | 2508 × 2508 WebP |
| Tokens | 12 |
| Walls | 61 |
| Tiles | 0 |
| Lights | 0 |
| Ambient Sounds | 0 |
| Regions | 1 |

当前场景本身并不复杂：没有 Tile、光源或环境音，墙和 Token 数量也不高。因此“当前画布对象过多”不是每秒周期卡顿的首要解释。

## 3. 先澄清：用户看到的“Chrome 3.8 GB”到底是什么

### 3.1 Chrome 是多进程应用

同一时间本机有 15 个 `chrome.exe` 进程：

| 类型 | 数量 | Working Set 合计 | Private Bytes 合计 |
|---|---:|---:|---:|
| renderer | 8 | 3,902.0 MiB | 4,276.7 MiB |
| GPU process | 1 | 515.1 MiB | 2,791.1 MiB |
| browser | 1 | 299.1 MiB | 236.9 MiB |
| utility | 4 | 127.1 MiB | 58.3 MiB |
| crashpad | 1 | 9.2 MiB | 2.5 MiB |
| **全部 Chrome** | **15** | **4,852.6 MiB** | **7,365.4 MiB** |

这些数字不能简单解释成“Foundry 单标签独占 7.3 GB”：

- Working Set 是当时驻留在物理内存中的页；
- Private Bytes 是进程的私有提交量；
- GPU 进程的资源和共享表面可能有特殊记账方式；
- 多个 renderer、扩展进程、浏览器进程和 utility 进程不都属于 Foundry；
- Windows 任务管理器和 Chrome 任务管理器的分组及列含义不同。

### 3.2 可直接归属给当前 Foundry 标签的主 renderer

DevTools trace 直接把当前 Foundry 主 renderer 定位为 PID `26968`：

| 指标 | 当前值 |
|---|---:|
| Working Set | 约 2,641.5 MiB |
| `PrivateMemorySize64` | 约 3,110.9 MiB |
| `VirtualQueryEx` 的 `MEM_PRIVATE + MEM_COMMIT` | 3,091.191 MiB |
| 5 秒 CPU 增量 | 1.766 CPU 秒 |
| 折算为单核心占用 | 35.3% |

因此用户看到约 3.8 GB 是合理的量级，但它不一定等于某一条单独的 Windows 计数：

- 主 renderer 本身约 2.6 GiB Working Set / 3.1 GiB Private；
- Foundry 使用的 GPU 资源在独立 GPU 进程；
- Chrome UI 可能把部分关联资源归入标签；
- 采样时间不同会发生数百 MiB 浮动。

### 3.3 不能归属给 Foundry 的其他大 renderer

PID `2140` 当时约：

- Working Set：875.5 MiB
- Private：923.8 MiB

它不属于当前 DevTools trace 的 Foundry 主 renderer。当前 Chrome 只有一个可见用户标签，但 Chrome 仍可能保留后台页面、扩展或其他不可见目标。由于标签作用域的 CDP 不允许 `SystemInfo.getProcessInfo` 和 `Target.getTargets`，本轮不能诚实地把 PID `2140` 计入或排除为 Foundry 附属目标。

这部分必须保持为“其他 Chrome 进程，归属未闭合”，不能混进 Foundry renderer 的内存饼图。

## 4. 主 Foundry renderer 的内存总账

### 4.1 旧报告中的一项口径错误已纠正

旧报告把所有 `MEM_COMMIT` 合计约 4.06 GiB 称为“私有提交”。重新按 `VirtualQueryEx.Type` 分类后，正确拆分是：

| `VirtualQueryEx` 类型 | 已提交 | 说明 |
|---|---:|---|
| `MEM_PRIVATE` | 3,091.191 MiB | 与进程 Private Bytes 最接近的口径 |
| `MEM_MAPPED` | 669.746 MiB | 映射文件、共享映射或共享内存等 |
| `MEM_IMAGE` | 306.520 MiB | DLL / 可执行映像 |
| **全部已提交地址区** | **4,067.457 MiB** | 不能称为全部私有内存 |

这解释了为什么旧报告的 4.06 GiB 会高于 Windows 的进程 Private Bytes。后续优化比较应优先使用：

1. renderer `MEM_PRIVATE + MEM_COMMIT`；
2. renderer Working Set；
3. V8 heap；
4. GPU 进程单独记录。

不要混用“所有已提交地址区”和“私有提交”。

### 4.2 `MEM_PRIVATE` 大分配组

主 renderer 的 3,091.191 MiB 私有提交按 AllocationBase 聚合：

| 分配组 | 已提交 | 保留地址空间 | 区域数 | 当前判断 |
|---|---:|---:|---:|---|
| `0x1F500000000` | 855.488 MiB | 3,240.512 MiB | 545 | 与主 V8 cage/heap 高度匹配，但不等同于全部 V8 指标 |
| `0x759000000000` | 792.586 MiB | 31,975.414 MiB | 4,376 | 大型原生私有池 A，所有者未闭合 |
| `0x750800000000` | 701.375 MiB | 32,066.625 MiB | 1,675 | 大型原生私有池 B，所有者未闭合 |
| `0x1F600000000` | 286.063 MiB | 7,905.938 MiB | 1 | Sequencer WebM Worker/WASM 线性内存候选 1 |
| `0x1FE00000000` | 286.063 MiB | 7,905.938 MiB | 1 | Sequencer WebM Worker/WASM 线性内存候选 2 |
| `0x1F800000000` | 57.984 MiB | 16,326.016 MiB | 65 | 其他 V8/隔离上下文候选，未强行归属 |
| `0x7FF9E0000000` | 36.504 MiB | 475.496 MiB | 2 | 可执行/代码权限原生区 |
| `0x1CC900000000` | 30.750 MiB | 993.250 MiB | 21 | 其他私有区 |
| 其余 631 个私有组 | 约 44.4 MiB | 多个保留区 | 多个 | 小型栈、堆、线程或运行时结构 |

前五大分配组已经覆盖约 2,921.6 MiB，占全部私有提交约 94.5%。

### 4.3 为什么还不能给两个 700–800 MiB 池命名

两个池合计：

`792.586 + 701.375 = 1,493.961 MiB`

占 renderer 私有提交约 48.3%。它们是当前最大的不确定项。

本轮尝试了以下只读接口：

| 接口 | 结果 |
|---|---|
| `performance.measureUserAgentSpecificMemory()` | API 不存在；页面也不是 `crossOriginIsolated` |
| `Tracing.requestMemoryDump` | 当前 Chrome 扩展的 raw CDP 白名单不支持 |
| `Memory.getAllTimeSamplingProfile` | 不支持 |
| `Memory.getBrowserSamplingProfile` | 不支持 |
| `Memory.getSamplingProfile` | 不支持 |
| `Memory.getDOMCounters` | 不支持；改用 `Performance.getMetrics` |

因此不能在没有证据的情况下把这 1.49 GiB 全部叫成：

- DOM 内存；
- 图片解码；
- PIXI；
- GPU 纹理；
- Plutonium 索引；
- PartitionAlloc 碎片；
- “Chrome 泄漏”。

它们可能混合了 Blink/Oilpan、PartitionAlloc、Skia、媒体解码、ArrayBuffer backing、渲染资源和碎片化。要继续闭合，需要在允许 memory-infra 的调试启动条件下做 Chromium memory dump，或使用 Chrome 内置任务管理器、Perfetto/ETW 和带堆采样的独立复现实验。

### 4.4 虚拟保留空间不是实际占用

多个组保留了数 GiB乃至数十 GiB虚拟地址空间。64 位 Chromium/V8/WASM 会预留大地址范围以便后续增长。报告只把 `MEM_COMMIT` 计入当前提交量，不把数 TiB 的 `MEM_RESERVE` 当作实际 RAM。

## 5. V8、Embedder、Backing Storage 与对象规模

### 5.1 V8 当前值

`Runtime.getHeapUsage`：

| 指标 | 字节 | MiB |
|---|---:|---:|
| `usedSize` | 861,903,620 | 822.0 |
| `totalSize` | 954,003,456 | 909.8 |
| `embedderHeapUsedSize` | 452,635,528 | 431.7 |
| `backingStorageSize` | 90,384,252 | 86.2 |

同一阶段 `performance.memory`：

| 指标 | MiB |
|---|---:|
| `usedJSHeapSize` | 约 911.7 |
| `totalJSHeapSize` | 约 995.9 |
| `jsHeapSizeLimit` | 4,192.0 |

两套值的采样时间和口径不同，不能相减得到“泄漏量”。但它们一致证明：

- JS heap 已经达到约 0.8–0.9 GiB，是显著贡献项；
- 仍远低于 renderer 的约 3.1 GiB 私有提交；
- 所以“所有内存都是 JavaScript 对象”不成立。

### 5.2 世界文档的序列化下限

逐文档序列化为 UTF-8 的体积：

| 集合 | 数量 | 序列化体积 |
|---|---:|---:|
| Scenes | 252 | 49.418 MiB |
| Actors | 516 | 21.787 MiB |
| Chat Messages | 522 | 3.898 MiB |
| Journals | 67 | 1.627 MiB |
| World Items | 178 | 1.145 MiB |
| Users | 7 | 0.090 MiB |
| Folders | 189 | 0.072 MiB |
| Tables | 12 | 0.054 MiB |
| Macros | 89 | 0.049 MiB |
| **合计** |  | **约 78.14 MiB** |

这是**源数据下限**，不是运行时对象总内存。进入 Foundry 后还会产生：

- Document 实例；
- schema 字段、索引、引用和缓存；
- Active Effect、Activity、Item 嵌套对象；
- 模块 flags 的派生结构；
- Hook、应用视图和搜索索引；
- 字符串、Map、Set、代理对象及 V8 对齐开销。

Scenes 和 Actors 是源数据最大的两类，值得长期治理，但它们不能单独解释 0.9 GiB V8 heap。

### 5.3 最大单文档

| 类别 | 最大对象 | 序列化字节 |
|---|---|---:|
| Scene | `凯尔·莫罗的无底洞 Maw of Cael Morrow` | 1,851,295 |
| Journal | `溟渊的呼唤-中文模组` | 1,485,059 |
| Actor | `“太阳熊”登达隆` | 336,136 |
| Item | `法术 - Backup` | 106,090 |

这提供了后续内容治理的切入点，但不能仅按名字删除或迁移。

## 6. DOM、布局对象和事件监听器

### 6.1 页面总量

| 指标 | 数量 |
|---|---:|
| `document.querySelectorAll("*")` | 16,186 elements |
| CDP `Nodes` | 68,348 |
| CDP `LayoutObjects` | 8,341 |
| CDP `JSEventListeners` | 12,652 |
| CDP `Documents` | 98 |
| CDP `Frames` | 97 |
| CDP `WorkerGlobalScopes` | 23 |
| CDP `ArrayBufferContents` | 474 |
| Resource metric | 1,316 |

页面 DOM 查询只看到 0 个 `<iframe>`，但 CDP 报告 97 Frames 和 98 Documents。这里可能混入扩展隔离上下文、已创建的内部文档或 renderer 级对象，不能把它们误写成“页面上有 97 个可见 iframe”。它们仍说明 renderer 承载的上下文数量很高，后续内存快照应把扩展上下文与页面主世界分开。

### 6.2 侧栏 DOM 已经全部预渲染

| 标签页 | DOM 后代元素 | `<img>` 节点 | 当前显示 |
|---|---:|---:|---|
| Chat | 4,348 | 86 | 是 |
| Actors | 3,501 | 516 | 否 |
| Scenes | 2,010 | 250 | 否 |
| Compendium | 1,334 | 99 | 否 |
| Items | 618 | 164 | 否 |
| Combat | 197 | 38 | 否 |
| Journals | 96 | 0 | 否 |
| Tables | 78 | 12 | 否 |
| Settings | 54 | 1 | 否 |
| Playlists | 45 | 0 | 否 |
| Cards | 28 | 0 | 否 |
| **整个 Sidebar** | **13,286** | **1,386** | 容器可见 |

关键点：

- `display:none` 只让子树不绘制，不会自动删除 DOM、监听器、图片元素和 JS 引用；
- `:has()` 的祖先失效可能从 `BODY` 开始，使隐藏子树也参与选择器匹配与样式解析；
- 516 个 Actor 和 250 个 Scene 的目录一次性预渲染，会放大每次全局失效成本；
- 当前聊天内存保护模块把聊天 DOM 控制在 36 个消息附近，但整个 Sidebar 仍有 13,286 个后代元素。

因此聊天保护是有价值的，但它没有解决其他目录的预渲染。

## 7. DOM 图片解码压力

### 7.1 实例与去重估算

| 指标 | 值 |
|---|---:|
| `<img>` 总实例 | 1,434 |
| 已完成且有自然尺寸 | 413 |
| 已解码唯一 URL | 181 |
| 所有已解码实例按 RGBA 粗算 | 523.7 MiB |
| 唯一 URL 按 RGBA 粗算 | 237.4 MiB |

这两个数都不是“确定的物理内存”：

- 同 URL 可能共享解码缓存；
- 浏览器可能按显示尺寸或内部格式保存；
- 部分图像会进入 GPU；
- 压缩文件大小与解码后的像素内存不同。

它们的用途是比较优化前后图片规模，而不是和 V8、PIXI、GPU 数字直接相加。

### 7.2 按 DOM 区域统计已解码实例的 RGBA 上限

| 区域 | 已解码实例 | 其中可见 | 实例 RGBA 粗算 |
|---|---:|---:|---:|
| Items | 98 | 0 | 154.5 MiB |
| Actors | 27 | 0 | 114.8 MiB |
| Chat | 86 | 86 | 106.9 MiB |
| Macros | 89 | 0 | 50.2 MiB |
| Other | 48 | 43 | 49.5 MiB |
| Combat | 38 | 0 | 46.6 MiB |
| Compendium | 14 | 0 | 1.1 MiB |

大量解码图片处于隐藏标签页，说明“仅仅把目录设为 `display:none`”不足以控制图片生命周期。

### 7.3 最大 DOM 图片

| 图片 | 尺寸 | RGBA 粗算 | 所在区域 |
|---|---:|---:|---|
| `worlds/cor-cotn/PC/A3FA...jpg` | 2048 × 2048 | 16.0 MiB | Chat |
| `items/失败者的里拉琴.jpg` | 2048 × 2048 | 16.0 MiB | Items，隐藏 |
| `berserker-01.webp` | 1440 × 1305 | 7.2 MiB | Actors，隐藏 |
| `berserker-commander.webp` | 1242 × 1440 | 6.8 MiB | Actors，隐藏 |
| 多张 1200 × 1200 Item 图 | 1200 × 1200 | 各 5.5 MiB | Items，隐藏 |

目录缩略图通常不需要 1200–2048 像素源图。为目录提供 256/512 像素缩略图、延迟设置 `src`、虚拟化不可见行，是明确的内存和样式计算优化方向。

## 8. PIXI/Canvas 纹理

### 8.1 缓存计数

| 缓存 | 数量 |
|---|---:|
| `PIXI.Assets.cache` | 206 个键 |
| Assets cache map | 198 |
| Texture cache | 234 |
| BaseTexture cache | 228 |
| 通过对象身份去重的 Assets BaseTexture | 99 |

同一纹理可能同时有绝对 URL 和相对 URL 两个 key，因此不能按 key 数直接乘像素。

### 8.2 去重后 RGBA 粗算

99 个可去重基础纹理合计约 235,500,524 bytes，即 224.6 MiB：

| 来源 | RGBA 粗算 |
|---|---:|
| Core / other | 85.3 MiB |
| World | 73.7 MiB |
| System | 43.7 MiB |
| Modules | 21.9 MiB |

最大的纹理：

| 纹理 | 尺寸 | RGBA 粗算 |
|---|---:|---:|
| `canvas/tokens/rings-steel.json` atlas | 4096 × 4096 | 64.0 MiB |
| `Brokenveil Marsh...webp` | 3584 × 2362 | 32.3 MiB |
| 当前 `Bullywug Cave...webp` | 2508 × 2508 | 24.0 MiB |
| PC 头像 `A3FA...jpg` | 2048 × 2048 | 16.0 MiB |

特别值得调查的是：当前场景是 Bullywug Cave，但缓存仍保留了 `Brokenveil Marsh` 的 32.3 MiB 纹理。它可能是之前场景、导航预览或其他已加载资产。需要通过切换场景前后和手工释放实验判断其生命周期，不能仅凭缓存存在就删除。

## 9. Sequencer WebM Worker

### 9.1 已应用的 Worker 上限

当前本地 bundle：

`Data/modules/sequencer/dist/SpritesheetGenerator-Dw7_9Yk1.js`

包含：

```js
const workerCount = Math.min(
  Math.max(Math.floor((navigator.hardwareConcurrency - 2) / 2), 1),
  2
);
```

SHA-256：

`08540669C22A5DE4986F515716E9BECB3BC1833A04C5E0832E6F11CB8B7799B0`

16 逻辑核心机器的原公式会创建 7 个 Worker；当前补丁把它限制为 2。

### 9.2 运行时验收现在已经成立

`VirtualQueryEx` 看到恰好两个：

- `MEM_PRIVATE`
- `MEM_COMMIT`
- `PAGE_READWRITE`
- 大小精确为 `299,958,272 bytes`

合计：

`599,916,544 bytes = 572.125 MiB`

这与“两个 Worker 各持有一个约 286 MiB 的 WASM/媒体处理线性区”高度一致。相比旧的七 Worker 估算，约减少：

`5 × 286.0625 MiB = 1,430.3 MiB`

这是一项已经获得实时运行证据的内存优化，不再只是静态代码证明。

### 9.3 为什么仍然占 572 MiB

当前有一个持久 Sequencer 效果：

- 名称：`纠缠术entangle`
- 效果数：1
- 类型：持久效果
- 资源解析到 JB2A 的 Entangle WebM
- 资源尺寸：400 × 400

即使只有一个 400 × 400 WebM，Worker 池仍按 Worker 固定线性内存模型保留两个约 286 MiB 区域。这个成本主要由 Worker/解码架构决定，不与画面像素面积线性对应。

### 9.4 下一步不是直接断言“一 Worker 一定更好”

从纯内存看，把 2 改为 1 理论上还可减少约 286 MiB。但必须 A/B 验证：

- 第一次播放延迟；
- 多个并行动画的解码等待；
- 持久化效果恢复；
- 场景切换；
- 自动动画触发；
- Worker 崩溃或队列拥塞。

因此它是高价值内存实验，不是无需验收的既定修复。

## 10. 玩家可见卡顿的直接证据

### 10.1 5 秒帧与 Long Task 采样

| 指标 | 结果 |
|---|---:|
| 采样时长 | 5,002.2 ms |
| Long Task 数 | 5 |
| Long Task 总时长 | 539 ms |
| 最大 Long Task | 113 ms |
| 各次 Long Task | 105、105、109、107、113 ms |
| rAF gap > 40 ms | 5 |
| rAF gap > 50 ms | 5 |
| rAF gap > 100 ms | 3 |
| 最大 rAF gap | 104.2 ms |

在 30 FPS 目标下，一帧预算约 33.3 ms。一次 105–113 ms 主线程任务会错过约 3 帧以上，足以让动画呈现“每隔一下就停顿”。

采样期间浏览器 `requestAnimationFrame` 回调频率高于 Foundry Canvas 的 30 FPS 目标，所以不能把 rAF 平均频率当作 Canvas FPS；本报告使用的是长间隔和长任务，而不是用一个虚假的“平均 130 FPS”掩盖顿帧。

### 10.2 3.6 秒 DevTools trace

trace 共分析 59,834 个事件，关键计数：

| 事件 | 数量 |
|---|---:|
| `StyleResolver::ResolveStyle` | 26,412 |
| `LocalFrameView::UpdateStyleAndLayout` | 2,314 |
| `Document::UpdateStyleAndLayout` | 1,851 |
| `StyleRecalcInvalidationTracking` | 805 |
| `UpdateLayoutTree` | 19 |

其中 4 个 `UpdateLayoutTree` 超过 50 ms：

| 顺序 | 时长 | 最近触发栈 |
|---|---:|---|
| 1 | 83.108 ms | Dice So Nice `_updateStatsFooter` |
| 2 | 89.310 ms | Dice So Nice `_updateStatsFooter` |
| 3 | 85.478 ms | Calendaria `Gs.updateTimestamps` |
| 4 | 84.726 ms | Dice So Nice `_updateStatsFooter` |

两个相邻 Dice So Nice 长事件间隔约 997–1,001 ms，和源码的 `setInterval(..., 1e3)` 闭合。

### 10.3 代表性样式重算内部计数

一轮约 89.3 ms 的 `Document::updateStyle`：

| 内部计数 | 值 |
|---|---:|
| `resolverAccessCount` | 6,603 |
| `elementsStyled` | 5,649 |
| `pseudoElementsStyled` | 954 |
| `stylesChanged` | 747 |
| `stylesUnchanged` | 4,682 |
| `rulesMatched` | 51,005 |
| `rulesRejected` | 553,305 |
| `rulesFastRejected` | 4,213,153 |

这说明耗时不是因为三个文本赋值本身很慢，而是三个赋值引发了大范围选择器重新匹配。

### 10.4 CPU/GPU 不是持续满载，但主线程会周期阻塞

5 秒系统采样：

| 进程 | CPU 秒 | 单核心折算 |
|---|---:|---:|
| Foundry renderer PID 26968 | 1.766 | 35.3% |
| GPU PID 21524 | 0.734 | 14.7% |
| Browser PID 27584 | 0.078 | 1.6% |
| 其他大 renderer PID 2140 | 0 | 0% |

GPU Engine：

| Engine | 平均 | 最大 |
|---|---:|---:|
| 3D | 0.19% | 3.67% |
| Copy | 0.03% | 0.18% |

因此当前卡顿更符合“主线程周期性长样式计算”，而不是“GPU 长期 100%”或“持续 JS 忙循环”。

## 11. 根因链路 A：Dice So Nice 隐藏侧栏统计

### 11.1 当前状态

| 项目 | 值 |
|---|---|
| 模块 | Dice So Nice 6.2.9 |
| `hideSidebarTab` | `false` |
| DSN 侧栏应用 | 已渲染 |
| `_statsInterval` | 存在 |
| 当前侧栏 | Chat，不是 DSN |
| 3D 骰子当时可见 | 否 |
| 统计显示值 | `---` |

### 11.2 源码行为

DSN 侧栏渲染后：

```js
this._statsInterval = setInterval(
  () => this._updateStatsFooter(),
  1e3
);
```

`_updateStatsFooter()` 每秒都给三项统计写 `textContent`：

- calls
- triangles
- textures

即使：

- DSN 标签未激活；
- 3D 骰子不可见；
- 三个值仍然都是 `---`；
- 新值与旧值没有变化。

### 11.3 完整触发链

```text
DSN setInterval 每 1 秒
  -> _updateStatsFooter()
  -> 三个 textContent 赋值
  -> DOM 文本节点被替换/插入
  -> BODY 的 :has() 依赖被标记失效
  -> 约 6,603 个 resolver access
  -> 约 5,649 个元素重新计算样式
  -> 83–89 ms UpdateLayoutTree
  -> 丢失约 3 个 30 FPS 帧
```

### 11.4 为什么这是 P0 体感优化项

- 直接调用栈证据；
- 周期与 1 秒源码完全吻合；
- 3.6 秒中命中 3 次；
- 每次都超过单帧预算两倍以上；
- 即使用户不看 DSN 标签也发生；
- 修复可以非常小且可回滚。

推荐的最小 A/B 不是先卸载整个模块，而是：

1. 打开 `hideSidebarTab` 并重载；
2. 或补丁为仅在 DSN 标签可见时运行 interval；
3. 或比较新旧文本，只在值实际变化时写 DOM；
4. 关闭时必须 `clearInterval`。

## 12. 根因链路 B：Calendaria 聊天时间戳

### 12.1 当前状态

- Calendaria：1.2.0，启用；
- 它 monkey-patch 了 Foundry ChatLog 的 `updateTimestamps()`；
- Foundry 核心 `UPDATE_TIMESTAMP_FREQUENCY = 1000 * 15`；
- 当前 Chat DOM 约 36 条消息。

### 12.2 源码行为

Foundry 核心每 15 秒调用一次聊天时间戳更新。Calendaria 的包装实现遍历：

```js
document.querySelectorAll(".chat-message[data-message-id]")
```

然后为每条消息更新 `.message-timestamp` 的：

- `innerHTML` 或 `textContent`；
- tooltip；
- Calendaria 的世界时间显示。

### 12.3 trace 证据

在一次调用内，失效追踪记录到：

- 72 次从 `BODY` 安排的 `:has()` 样式失效；
- 499 次普通聊天消息节点受 `:has()` 影响；
- 95 次 whisper 消息节点受影响；
- 48 次 round marker 消息节点受影响；
- 36 次 sender 节点受影响；
- 多次文本节点插入；
- 对应一次约 85.5 ms 的长 `UpdateLayoutTree`。

### 12.4 与 Dice So Nice 的区别

| 维度 | Dice So Nice | Calendaria |
|---|---|---|
| 频率 | 1 秒 | 15 秒 |
| 写入节点 | 固定 3 个统计字段 | 当前显示的多条聊天消息 |
| 当前可见性 | DSN 标签隐藏 | Chat 标签可见 |
| 体感 | 高频小节拍式顿挫 | 低频较大的顿挫 |
| 最小修复 | 不可见时停 interval / 值未变不写 | 只更新需要变化的消息 / 值未变不写 / 关闭扩展时间戳 A/B |

因此两者必须分别验收，不能把“关了 DSN 后改善”错误地解释成所有周期卡顿已经解决。

## 13. 放大器：`:has()` 与大 DOM

### 13.1 CSS 盘点

| 指标 | 值 |
|---|---:|
| Stylesheets | 35 |
| 可读取 CSS rules | 3,066 |
| 含 `:has()` 的规则 | 27 |
| Foundry `foundry2.css` | 25 |
| Inline | 2 |

常见规则涉及：

- 聊天输入；
- 表单；
- placeables sidebar；
- ProseMirror；
- Quick Insert；
- Foundry 核心 UI。

### 13.2 根因与放大器要分开

`immersive-translate-popup` 和 `codex-agent-overlay-root` 在 trace 中作为“Related style rule”节点出现，但当前调用栈明确来自 DSN 或 Calendaria。它们是被全局样式失效波及的节点，不是这两次周期写入的发起者。

同理，`:has()` 不是“单独每秒主动运行的模块”；真正触发它的是 DOM 写入。优化顺序应是：

1. 先停止无意义的周期 DOM 写；
2. 再缩小 DOM；
3. 最后才考虑调整高代价选择器。

直接全局删除 `:has()` 规则风险较大，会破坏 Foundry UI 状态样式。

## 14. 其他已量化但尚未完成因果闭合的贡献项

### 14.1 Quick Insert

Quick Insert 3.7.7 启用，且页面存在 inline：

```css
.quick-insert-app:has(input:focus)
```

这证明它参与 `:has()` 选择器集合，但没有 trace 证据表明它发起当前每秒周期写入。它应在模块隔离矩阵中测试，但不应在 DSN/Calendaria 之前被定罪。

### 14.2 聊天相关模块

当前还启用了：

- Chat Memory Guard 1.0.0；
- Monk's Chat Timer 14.01；
- Chat Commander 2.0.6；
- Calendaria；
- dnd5e 聊天卡片；
- MIDI-QOL 14.0.11。

聊天 DOM 是当前可见且最大的单个标签子树。任何对消息时间、按钮、卡片状态和计时器的周期更新都可能被 `:has()` 放大。当前已直接抓到 Calendaria，但其他模块仍需 60 秒以上 trace 或逐项隔离。

### 14.3 其他模块定时器

静态扫描在多个启用模块中发现 `setInterval`，包括：

- global-progress-clocks；
- multiple-document-selection；
- plutonium-cn；
- monks-chat-timer；
- monks-combat-details；
- monks-little-details；
- Dice So Nice。

静态存在不等于当前活跃，也不等于性能问题。后续必须以运行时调用栈、长任务或 A/B 差值为准。

### 14.4 FPS 调试显示本身

trace 还捕获了 Foundry `refreshFPS()` 替换文本节点，并产生少量样式失效。它不是 80 ms 长样式计算的主要栈，但在最终玩家配置中没有必要长期显示 FPS 时，可以关闭；测试阶段则应保留外部采样，避免测量工具本身污染页面。

### 14.5 浏览器扩展

页面中可见：

- `immersive-translate-popup`
- `codex-agent-overlay-root`

扩展增加了 DOM、样式表和隔离上下文。当前证据把它们归为受影响节点，而非周期触发源。正式玩家验收应做一次“普通玩家 Chrome Profile / 无调试扩展”对照，以区分 Foundry 本体与审计环境开销。

## 15. 优化优先级：不是只有三项

### 15.1 体感卡顿优先队列

| 优先级 | 项目 | 已证实程度 | 预计收益 | 风险 | 先做什么 |
|---|---|---|---|---|---|
| P0 | DSN 隐藏侧栏每秒统计写入 | 直接 trace + 源码闭合 | 极高，去除 1 Hz 长任务 | 低 | `hideSidebarTab` A/B 或仅可见时更新 |
| P1 | Calendaria 每 15 秒批量改写聊天时间戳 | 直接 trace + 核心周期闭合 | 高，去除低频大顿 | 中 | 关闭扩展时间戳 A/B；再做“值不变不写” |
| P2 | 侧栏目录虚拟化/按需渲染 | DOM 规模直接证据，因果待 A/B | 高，降低每次样式失效基数 | 中高 | 先 Actor/Scene/Item 标签 |
| P3 | 隐藏目录图片延迟加载与缩略图 | 图片尺寸直接证据 | 中高，内存和样式都受益 | 中 | 256/512 缩略图 + 未显示不设 `src` |
| P4 | 聊天模块低频计时任务隔离 | 有候选，尚未全部命中 | 中 | 低到中 | ≥60 秒 trace + 单模块 A/B |
| P5 | 缩小高代价 `:has()` 作用范围 | CSS 与 trace 已证实放大 | 中高 | 高，可能破坏 UI | 在停止无意义 DOM 写之后再做 |
| P6 | 玩家 Profile 去扩展对照 | 扩展上下文存在 | 中或低，待测 | 低 | 独立 Chrome Profile 基线 |

### 15.2 内存优先队列

| 优先级 | 项目 | 当前规模 | 已证实程度 | 下一实验 |
|---|---|---:|---|---|
| M0 | Sequencer Worker 7→2 | 已减少约 1,430 MiB；当前仍 572 MiB | 静态补丁 + 精确运行时区域闭合 | 保持 2 为基线 |
| M1 | Sequencer 2→1 | 理论再减约 286 MiB | 尚未实施 | 动画并发/首播延迟 A/B |
| M2 | 两个原生池 A/B | 合计约 1,494 MiB | 大小确定、所有者未知 | memory-infra/模块冷启动矩阵 |
| M3 | DOM 图片与缩略图 | 唯一解码粗算 237.4 MiB | 规模确定、实际驻留未闭合 | 隐藏目录不加载图片 A/B |
| M4 | PIXI 纹理生命周期 | 去重 RGBA 粗算 224.6 MiB | 缓存确定、GPU/CPU驻留未闭合 | 场景切换前后缓存释放 |
| M5 | V8 世界/模块对象 | used heap 约 0.8–0.9 GiB | 总量确定、对象所有者未闭合 | Heap Snapshot 或按模块冷启动差分 |
| M6 | 世界 Scene/Actor 源数据治理 | 序列化下限约 71.2 MiB | 文档体积确定 | 迁入 compendium 的受控副本测试 |
| M7 | 其他 Chrome renderer/GPU | 约 0.9 GiB renderer；GPU Private 约 2.8 GiB | 进程存在，标签归属不闭合 | Chrome Task Manager/独立 Profile |

### 15.3 正确性队列

| 优先级 | 项目 | 影响 |
|---|---|---|
| C0 | Plutonium `Duplicate UUID` | 搜索索引冲突、覆盖或重复结果；不应与主卡顿混为一谈 |
| C1 | Scene `background` v14 弃用警告 | 当前仍兼容，到 v16 会移除；是兼容性债务 |
| C2 | 69 模块组合兼容性 | Hook/patch 叠加可能产生二次放大，需版本锁定和矩阵验证 |

## 16. 推荐的分阶段优化方案

### 阶段 A：先去掉已经证实的周期卡顿

1. 保持同一场景、同一视角、同一聊天 DOM。
2. 记录 60 秒基线。
3. 只切换 DSN `hideSidebarTab`，重载，记录 60 秒。
4. 恢复 DSN；只关闭 Calendaria 扩展时间戳，重载，记录 60 秒。
5. 两者同时优化，记录 60 秒。
6. 比较每秒和每 15 秒的长样式计算是否分别消失。

为什么必须 60 秒：

- 5 秒足够抓 DSN；
- Calendaria 周期是 15 秒；
- 60 秒至少覆盖 4 次 Calendaria 周期，才能避免刚好漏采。

### 阶段 B：减少样式重算的页面基数

按以下顺序做可逆原型：

1. Actor 目录只渲染可见行；
2. Scene 目录只渲染可见行；
3. Item 和 Compendium 同样处理；
4. 非激活标签不设置图片 `src`；
5. 目录缩略图统一为 256 或 512 像素；
6. 切换标签时复用节点，避免反复创建监听器。

每一步都记录：

- DOM elements；
- `Nodes`；
- `LayoutObjects`；
- `JSEventListeners`；
- 已解码唯一图片；
- 60 秒长任务；
- 搜索、拖拽、目录滚动、切换标签是否仍正确。

### 阶段 C：内存专项

1. 保持当前 Sequencer 两 Worker 为对照；
2. 试验一 Worker；
3. 测试单动画、多动画、持久动画、场景切换和首次播放；
4. 对图片缩略图做重载后稳态比较；
5. 对 PIXI 场景缓存做切换前后比较；
6. 用允许 Chromium memory-infra 的独立调试会话拆分两个大型原生池。

### 阶段 D：内容与索引治理

1. 修复 Plutonium 数据索引的重复 UUID；
2. 检查重复条目来自相同数据源重复加载，还是不同类型共用了逻辑键；
3. 给索引构建加唯一性断言和来源信息；
4. 将不需常驻的旧 Scene/Actor 迁入受控 compendium；
5. 不按名字粗暴删除世界数据；
6. 修复 v14 `Scene#background` 弃用调用。

## 17. A/B 验收矩阵

### 17.1 固定条件

每轮测试必须固定：

- 同一 Chrome Profile；
- 同一窗口大小和 DPR；
- 同一 Foundry 用户；
- 同一世界；
- 同一场景和视角；
- 同一 Canvas 最大 FPS；
- 同一持久 Sequencer 效果；
- 同一 Chat DOM 条数；
- 测试前重载并等待 5 分钟稳态；
- 不在测量中打开设置、目录或 DevTools UI。

### 17.2 每轮记录

| 类别 | 指标 |
|---|---|
| 体感 | 盲测是否仍有每秒顿挫、15 秒顿挫 |
| 主线程 | Long Task 数、总时长、最大值 |
| 帧 | rAF gap > 50 ms、> 100 ms、最大 gap |
| 样式 | `UpdateLayoutTree` 次数、p95、最大值 |
| JS | `usedJSHeapSize`、`totalJSHeapSize` |
| 进程 | renderer Working Set、Private Bytes、`MEM_PRIVATE` |
| Worker | 299,958,272-byte 区域数量 |
| DOM | Elements、Nodes、LayoutObjects、Listeners |
| 图片 | 已解码实例、唯一 URL、RGBA 粗算 |
| PIXI | BaseTexture 数、去重像素 |
| GPU | GPU process Working Set、3D engine 平均/峰值 |

### 17.3 建议验收门槛

#### DSN 优化

- 60 秒 trace 中不再出现 `_updateStatsFooter` 引发的长 `UpdateLayoutTree`；
- 不再存在稳定的 1 Hz、>50 ms 主线程峰值；
- DSN 配置和实际掷骰仍可用。

#### Calendaria 优化

- 60 秒 trace 中不再出现 `Gs.updateTimestamps` 引发的 >50 ms 样式重算；
- 聊天时间戳显示语义仍正确；
- 世界时间推进后该变化的时间戳仍会更新；
- 不能以“时间戳彻底不更新”冒充性能修复，除非用户明确接受关闭功能。

#### 目录虚拟化

- 隐藏标签的 DOM 和图片实例显著下降；
- `UpdateLayoutTree` p95 和最大值下降；
- 目录搜索、滚动定位、拖拽、右键菜单和权限显示仍正确；
- 不允许仅凭 DOM 数下降宣布完成。

#### Sequencer 一 Worker

- 精确 Worker 区域从 2 个降为 1 个；
- renderer `MEM_PRIVATE` 稳态下降接近 286 MiB；
- 自动动画、持久效果、并行动画和场景切换无明显回归；
- 若动画首播或并发恶化，则保持两 Worker。

### 17.4 玩家体验最终验收

机械指标通过后，仍需要真实玩家场景：

1. 移动 Token；
2. 缩放和平移画布；
3. 播放自动攻击动画；
4. 同时掷骰；
5. 聊天中连续展开卡片；
6. 维持至少 10 分钟；
7. 观察是否仍有固定节拍的停顿；
8. 由玩家确认体感，而不是只看控制台无错误。

## 18. 风险、未知项与不能作出的保证

### 18.1 当前可以确认

- 主 Foundry renderer PID 是 `26968`；
- 它的 `MEM_PRIVATE + MEM_COMMIT` 约 3,091 MiB；
- 两个 Sequencer Worker 精确占 572.125 MiB；
- 7→2 Worker 上限补丁已在真实运行时生效；
- V8 heap 约 0.8–0.9 GiB；
- DSN 每秒隐藏统计写入直接触发 83–89 ms 样式重算；
- Calendaria 的 15 秒聊天时间戳更新也触发约 85 ms 样式重算；
- 大 DOM、隐藏目录图片和 `:has()` 是明确的放大条件；
- `Duplicate UUID` 是一次索引冲突批次，没有证据证明它是当前每秒卡顿或 3 GB 内存的直接根因。

### 18.2 当前不能确认

- 两个 700–800 MiB 原生池的唯一所有者；
- GPU Private Bytes 有多少应计入当前 Foundry 标签；
- PID `2140` 的确切页面/扩展归属；
- DOM 图片粗算有多少实际驻留在 CPU、GPU 或共享缓存；
- PIXI RGBA 粗算与 GPU 实际纹理格式是否一一对应；
- 69 个模块中是否还有 60 秒以上周期的长任务；
- 一 Worker 是否对所有动画负载都足够；
- 修复 DSN 和 Calendaria 后是否会暴露下一个较小瓶颈。

### 18.3 为什么不能保证“只需修三个地方”

性能瓶颈是分层的。去掉最大峰值后，第二层瓶颈才会变得可见。当前合理承诺只能是：

- 已证实项优先；
- 每项单独 A/B；
- 每轮重新测量；
- 不把尚未归属的 1.49 GiB 原生池说成已经解决；
- 不把“内存下降”冒充“动画流畅”；
- 不把“长任务下降”冒充“所有内存泄漏消失”。

## 19. 本轮机械验证与语义验收

### 19.1 机械验证

已完成：

- Chrome 当前标签只读连接；
- Foundry、dnd5e、世界和场景版本确认；
- Windows Chrome 多进程快照；
- 主 renderer PID 由 trace 闭合；
- `VirtualQueryEx` 按 State、Type、AllocationBase 和 Protect 重算；
- V8 heap、Performance metrics、DOM 和监听器计数；
- DOM 图片与 PIXI 纹理对象身份去重；
- 世界文档逐对象 UTF-8 序列化统计；
- 5 秒 Long Task/rAF 采样；
- 3.6 秒样式失效 trace；
- DSN 和 Calendaria 调用栈、源码周期核对；
- Sequencer bundle 哈希、workerCount 代码和两个精确内存区核对；
- Duplicate UUID 日志数量、时间戳和调用位置核对。

### 19.2 语义验收

本报告没有把“工具返回成功”当成最终结论，而是检查了：

- 玩家所说的“动画一卡一卡”是否能由 trace 中的周期长任务解释：**能**；
- 每次 83–89 ms 是否超过 30 FPS 帧预算并会产生可感知停顿：**会**；
- DSN 和 Calendaria 是否为同一个问题：**不是，必须分别优化**；
- 3.8 GB 是否能全部归因给 Duplicate UUID：**不能**；
- Worker 上限是否只有静态代码证据：**不是，已有两个精确运行时区域**；
- 旧报告的 4.06 GiB “私有提交”口径是否正确：**不正确，已修正为约 3.09 GiB 私有、0.67 GiB映射、0.31 GiB映像**；
- 是否已经完成玩家端优化：**没有；当前完成的是第一阶段完整审计，实施和 A/B 验收尚未开始**。

## 20. 最终行动建议

下一轮实施应严格按以下顺序：

1. 先建立 60 秒可重复基线；
2. 只做 DSN 隐藏侧栏/无变化不写的最小可回滚优化；
3. 验收 1 Hz 长任务是否消失；
4. 再单独处理 Calendaria 时间戳写入；
5. 验收 15 秒长任务是否消失；
6. 再做 Actor/Scene/Item 目录虚拟化和图片懒加载；
7. 之后才试 Sequencer 2→1 Worker；
8. 最后用 memory-infra 或独立 Profile 闭合两个大型原生池；
9. Duplicate UUID 另开正确性修复，不和页面流畅度优化混成一个补丁。

这条顺序的核心不是“只修三个点”，而是让每次改动都能回答一个明确问题，并能证明玩家网页真的更流畅。
