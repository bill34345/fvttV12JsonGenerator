# `cor-cotn` Chrome 真实驻留内存六项优先调查报告

> 日期：2026-07-28
> 环境：Foundry VTT `14.364`、dnd5e `5.3.3`、Chrome `150.0.7871.182`
> 世界：`cor-cotn`
> 采样 Scene：`RTb8HaqvexdHgtwf / B5.狂蛙人洞穴 Bullywug Cave`
> 范围：只读调查；没有修改模块、世界、动画设置或缓存，没有强制 GC
> 唯一主要物理内存指标：Windows `Private Working Set` 与逐页 resident 查询

## 1. 最终结论

用户列出的六项里，最关键的新结论是：

1. **原先约 283 MiB 的“匿名 resident 单块”已经闭合到容器级。**
   它不是一个由 Foundry、Sequencer、JB2A、Dice So Nice 或某张图片单独申请的
   283 MiB 大对象。完整枚举其 `AllocationBase` 后，它正好是一个
   **32 GiB 的 Chromium PartitionAlloc/GigaCage 系列地址池**，内部同时存在
   committed 和 reserved 区段。
2. Renderer 的约 1.16 GiB 独占驻留内存，已经有 **92.54%** 可以落到三个实际
   resident 地址组：
   - V8 heap cage：`407.81 MiB` resident；
   - PartitionAlloc pool A：`402.07 MiB` resident；
   - PartitionAlloc pool B：`266.02 MiB` resident。
3. 两个 PartitionAlloc 池合计 `668.09 MiB` resident。它们不是纯碎片：
   至少 `64 MiB` token-ring 图集、约 `24 MiB` 当前 Scene 背景和 `16 MiB`
   角色图，在 pool A 中都有与解码像素尺寸逐页吻合的 resident commit。
4. Renderer 当前共有 `121` 个唯一 Pixi BaseTexture，按 RGBA 解码尺寸合计
   `192.30 MiB`；其中栅格化 SVG 状态/图标约 `76.27 MiB`，token-ring
   图集 `64 MiB`，当前场景背景约 `23.99 MiB`。
5. GPU 进程的 `448.67 MiB` Private Working Set 也不是单由骰子或自动动画造成。
   Foundry/Pixi 当前管理 `58` 个 WebGL texture；按真实 RED/RG/RGB/RGBA
   格式修正后的 base-level 数据为 `230.48 MiB`，其中 `13` 个
   RenderTexture 就占 `111.09 MiB`。Dice So Nice 空闲时仅见 `2` 个纹理、
   `1` 个 geometry、`1` 个 program。
6. Chrome 主进程约 `165–183 MiB` 和基线扩展约 `105 MiB` 是实质消耗，但都不是
   `cor-cotn` 世界数据的首要责任点；当前最值得继续处理的是 Renderer 的
   V8 对象图、图片解码 backing、SVG 栅格化和 Canvas RenderTexture。

因此，这次已经不能再把问题描述为“还有一个不知道是什么的 1.5 GiB 原生池”。
更准确的描述是：

> Foundry Renderer 的高驻留由约 408 MiB 的 V8 驻留堆和约 668 MiB 的两个
> Chromium 原生分配池共同构成；原生池中已经直接证实存在大量解码图片 backing，
> 其余部分还混合 Blink/Pixi/Canvas 原生对象、分配器 slack 与缓存。GPU 侧另有
> 约 449 MiB 的共享 GPU 进程驻留，Foundry 当前画布本身持有约 230 MiB
> base-level WebGL 纹理和渲染目标。

## 2. 测量口径

本报告只回答“当前真正驻留在物理 RAM 的内容”：

- `Private Working Set`：当前 resident 且只属于该进程，可跨进程相加；
- `K32QueryWorkingSetEx`：逐个 4 KiB 页查询某地址范围当前是否 resident；
- V8 `usedSize`、TextureLoader 和 Pixi texture bytes：用于解释内容组成，但不会
  再作为独立物理内存与 Working Set 相加；
- GPU Local/Dedicated counters：属于显存/驱动视角，不与系统 RAM Working Set
  相加；
- Private Bytes、虚拟地址 reserve、Sequencer WASM commit：不再当成当前物理
  RAM。

Chromium 官方资料说明 PartitionAlloc 以 pool、super page、slot span 和
thread cache 管理原生分配；空闲 slot 或 span 不一定立即把页面归还给操作系统，
所以 pool resident 既可能包含活对象，也可能包含分配器 slack 或尚未 decommit
的页。[PartitionAlloc design](https://chromium.googlesource.com/chromium/src/+/HEAD/base/allocator/partition_allocator/PartitionAlloc.md)

## 3. 六项结果总表

| 用户指定项目 | 本轮真实驻留/基线 | 当前定责 | 是否可直接处理 |
|---|---:|---|---|
| Renderer V8 live heap | V8 cage `407.81 MiB` resident；Runtime logical used `447.53 MiB` | Foundry/dnd5e 文档运行时对象、prepared/derived data、embedded docs、模块状态、UI/closure 的混合对象图 | 可以继续用专门 heap snapshot 找构造器和 retaining path；本轮未强制 GC |
| Renderer PartitionAlloc pool A | `402.07 MiB` resident | Chromium 原生分配池；已直接找到约 104 MiB 大图像 backing 的页尺寸吻合证据 | 图片尺寸、token-ring、SVG 栅格化与 Canvas 资源是可处理方向；其余须 native heap profile |
| 原“283 MiB 匿名单块” | 本轮 `266.02 MiB` resident | **第二个 32 GiB PartitionAlloc/GigaCage 地址池**，不再是未知单体对象 | 与 pool A 一起调查；不能把整个 pool 归罪于单个模块 |
| GPU 进程 | 基线 `448.67 MiB` Private Working Set | Chrome GPU service + Foundry/Pixi 纹理、RenderTexture、SharedImage、驱动 staging；进程由所有 Chrome 标签共享 | 可先审计纹理和全屏 RenderTexture；每标签精确归属需隔离 Chrome |
| Chrome 主进程 | 基线约 `183 MiB`；后测 `165.22 MiB` | Chrome UI、标签/进程宿主、profile、缓存索引、扩展框架 | 体量正常且非 Foundry 世界专属，优先级低 |
| Chrome 扩展 | 原基线约 `105 MiB` | 多个 extension renderer 的独占 resident | 可在干净 Chrome 配置中逐扩展对照；不是当前首要大头 |

若按纯数值排序，GPU `449 MiB` 略高于 V8 和 pool A；但 GPU 进程由所有标签共享，
而两个 Renderer PartitionAlloc pool 合计 `668.09 MiB`，所以**可归因、可优化的
调查顺序应先从 Renderer 原生池和 V8 开始，再做只开 Foundry 单标签的 GPU 隔离**。

## 4. 第一项：V8 live heap

### 4.1 驻留量与逻辑量

同一轮近邻采样：

| 指标 | 数值 |
|---|---:|
| `Runtime.getHeapUsage.usedSize` | `447.53 MiB` |
| `Runtime.getHeapUsage.totalSize` | `472.45 MiB` |
| V8 allocation cage committed | `458.93 MiB` |
| V8 cage 实际 resident | **`407.81 MiB`** |

只看物理 RAM 时，应使用 `407.81 MiB`，而不是把 `447.53 MiB` logical used
直接当作驻留。

### 4.2 世界原始数据不能直接解释 447 MiB

当前世界顶层和嵌入数据：

- 268 Actors；
- 61 Scenes；
- 178 world Items；
- 67 Journals；
- 551 ChatMessages；
- 2,272 个 Actor embedded Items、39 Effects；
- 61 个 Scene 中共 6,815 个 Token/Wall/Light/Tile/Drawing/Region 等嵌入文档；
- 100 个 Compendium Pack、12,447 条 pack index row。

对这些世界 collection 做只读序列化测量：

| 数据 | 逻辑序列化大小 |
|---|---:|
| 世界顶层 collection 合计 | `27.80 MiB` |
| 100 个 Compendium index 合计 | `6.01 MiB` |
| 合计 | **约 `33.81 MiB`** |

这只相当于 V8 logical used 的约 `7.6%`。所以 Adventure 归档能减少原始世界文档，
但 V8 内存不会按“删除 JSON 的字节数”线性下降。主要放大来自：

- Foundry Document class instance；
- dnd5e 对 Actor、Item、Activity 的 prepared/derived data；
- embedded Item、Effect、Activity 和 Scene embedded document 的对象包装；
- hooks、applications、UI view-model 和闭包；
- 活跃模块的索引、缓存和运行时状态；
- 字符串、Map/Set、数组索引与对象形状开销。

这也解释了为什么章节 Adventure 迁移之后，内存确实可能下降，但不会一下砍掉几百
MiB，更不会直接消灭 Renderer 的全部 V8 堆。

### 4.3 Duplicate UUID 不是当前 V8 大头的证据

Quick Insert `3.7.7` 和 Plutonium `2.15.6` 当前均处于 active，但本轮读取到：

- `QuickInsert.searchLib === null`；
- `QuickInsert.hasIndex === false`。

所以此前 `Duplicate UUID` 控制台信息说明某次 Plutonium/搜索索引流程遇到重复 UUID，
但**当前 live heap 中并没有 Quick Insert 的 SearchLib 索引**。不能用那条报错解释
当前 408 MiB V8 resident。

### 4.4 为什么本轮没有给出“哪个 JS class 占多少”

Chrome heap snapshot 会在开始前强制 GC，并且快照构建本身可能额外占用大量内存；
这会破坏本轮“保持当前驻留状态”的口径。Chrome 官方也明确说明 heap snapshot
开始时会执行 garbage collection。[Chrome heap snapshots](https://developer.chrome.com/docs/devtools/memory-problems/heap-snapshots)

因此本轮没有为了得到一个漂亮的 constructor 排名而改变现场。要闭合 V8 retainers，
应另开一次明确标注为“profiling session”的测试：完整关闭 Chrome、只开 Foundry、
加载同一 Scene，记录快照前 PWS，再允许 snapshot/GC，并将快照结果与快照前基线
分开解读。

## 5. 第二、三项：两个 PartitionAlloc resident pool

### 5.1 两个 pool 的真实驻留

| AllocationBase | committed | resident | 形态 |
|---|---:|---:|---|
| `0x1BE800000000` | `412.61 MiB` | **`402.07 MiB`** | 2,484 个 committed/reserved 子区域 |
| `0x136C00000000` | `279.88 MiB` | **`266.02 MiB`** | 完整 AllocationBase 是精确 32 GiB 地址池 |
| 合计 | `692.49 MiB` | **`668.09 MiB`** | Chromium renderer 原生分配器容器 |

Chromium 当前实现包含 regular、BRP 和 configurable 等地址池，但没有 native
allocation dump 时，不能仅凭基址把这两个池分别命名为某个具体 subtype。
[PartitionAddressSpace](https://chromium.googlesource.com/chromium/src/+/6a269a6929b94deac8e4c5b3948ec9d1b0480c25/base/allocator/partition_allocator/partition_address_space.h)

### 5.2 283 MiB“匿名单块”的纠正

之前只统计 committed region 时，`0x136C00000000` 看起来像一个
`MEM_PRIVATE + PAGE_READWRITE` 大块。完整沿同一 `AllocationBase` 枚举后得到：

- 起始 reserved：`32 MiB`；
- committed RW：约 `205.25 MiB`；
- 中间 reserved：约 `13.13 MiB`；
- committed RW：约 `77.38 MiB`；
- 末尾 reserved：约 `31.68 GiB`；
- 完整地址范围：**恰好 `32 GiB`**。

这与 Chromium AddressPoolManager 管理连续虚拟地址池的结构一致，而不符合普通
应用缓冲区。[AddressPoolManager](https://chromium.googlesource.com/chromium/src/+/5ef4c5b62f83ef99ef04f344305c1419d6a12afd/base/allocator/partition_allocator/address_pool_manager.h)

所以本项的责任边界已经改变：

- 已闭合：它是什么容器——第二个 Chromium PartitionAlloc/GigaCage 系列 pool；
- 未闭合：pool 内每类 live allocation、缓存、碎片各占多少；
- 已排除：它不是可以直接命名为 Sequencer/JB2A/DSN 的单一 283 MiB对象。

### 5.3 pool A 中的解码图片实证

pool A 最大的几个 resident commit 与当前 Pixi texture 的解码字节逐页吻合：

| PartitionAlloc commit | 对应资源 | 解码 base-level |
|---:|---|---:|
| `64.00 MiB` resident | Foundry `rings-steel.webp`，4096×4096 RGBA | `64.00 MiB` |
| `24.00 MiB` resident | B5 当前背景，2508×2508 RGBA | `23.99 MiB` |
| `16.00 MiB` resident | 角色图，2048×2048 RGBA | `16.00 MiB` |

后两项与 allocator/page alignment 只差约一个 4 KiB 页。这不是“纹理可能很大”的
泛泛推测，而是地址池中真实 resident commit 与实时资源尺寸的直接对应。

当前 Renderer 侧 121 个唯一 BaseTexture：

| 用途 | 解码 RGBA 等效 |
|---|---:|
| SVG 图标和状态图标栅格化 | **`76.27 MiB`** |
| Foundry token-ring atlas | **`64.00 MiB`** |
| 当前 Scene 背景 | `23.99 MiB` |
| 玩家角色图片 | `17.37 MiB` |
| 模块媒体 | `7.91 MiB` |
| 其他 | `2.75 MiB` |
| 合计 | **`192.30 MiB`** |

其中 SVG 栅格化来源：

| 所有者 | 约占 |
|---|---:|
| dnd5e | `42.71 MiB` |
| Foundry core | `19.56 MiB` |
| Monk's Little Details | `10.00 MiB` |
| MCDM Flee Mortals | `2.00 MiB` |
| vision-5e | `1.00 MiB` |
| plutonium-cn | `1.00 MiB` |

大量 SVG 在 Pixi 中成为 512×512 `HTMLCanvasElement`，单个 RGBA backing 就约
1 MiB。这是一个明确的可优化方向，但仍不能把两个 pool 的全部 `668.09 MiB`
都写成图片：其余还包括 Blink/Pixi/Canvas 原生对象、字符串、布局、allocator
metadata、thread cache、碎片和空闲但尚未 decommit 的页。

## 6. 第四项：GPU 进程约 449 MiB

### 6.1 为什么这是真实消耗但不能全归 Foundry

GPU 进程基线 Private Working Set 为 `448.67 MiB`，属于当前驻留系统 RAM。
但 Chrome GPU process 为所有标签共享；本轮后段 Chrome 还存在三个 Bilibili
视频标签，因此后续更高的 GPU 读数不能再当成 Foundry 单独占用。本报告保留较早的
`448.67 MiB` 基线，并只用 Foundry 页面的 Pixi/WebGL 清单做内容归因。

Chromium 的 GPU memory-infra 也把 GPU allocations 视为跨进程、共享和驱动层
归属问题，而不是简单等于某个 renderer 的一张表。
[Chromium GPU memory probe](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/memory-infra/probe-gpu.md)

### 6.2 Foundry/Pixi 当前的直接图形负载

Pixi `7.4.3`，画布 `2524×1166`，共 `58` 个 managed textures。使用 texture
实际 format 修正通道数后：

| 类型 | 数量 | base-level bytes |
|---|---:|---:|
| Image texture | 45 | `119.40 MiB` |
| RenderTexture | 13 | **`111.09 MiB`** |
| 合计 | 58 | **`230.48 MiB`** |

按格式：

- 50 个 RGBA：`183.36 MiB`；
- 2 个 RGB：`16.84 MiB`；
- 5 个 RED：`30.11 MiB`；
- 1 个 RG：`0.17 MiB`。

主要 RenderTexture 包括：

- 两个 3584×3584 单通道 RED target，各约 `12.25 MiB`；
- 多个与窗口一样大的 2524×1166 RED/RGB/RGBA target；
- 一个 2048×1024 RGBA target，约 `8 MiB`。

这说明页面即便没有正在播放自动动画，Foundry Canvas 的光照、视野、遮罩、滤镜、
后处理或 compositor 管线仍会维持多张全屏/大型中间纹理。`230.48 MiB` 只是
base level；mipmap、driver alignment、SharedImage、上传 staging 和 compositor
surface 会进一步增加实际 GPU/renderer 成本。反过来，这个逻辑纹理清单与
GPU PWS 有重叠，不能把两者再次相加。

### 6.3 Dice So Nice 的责任边界

Dice So Nice 空闲 renderer 当前只有：

- 2 textures；
- 1 geometry；
- 1 program。

它可以在掷骰期间产生瞬时 shader、粒子、几何、纹理上传和 frame-time 峰值，因此
用户感觉“骰子动画有一点卡”仍可能成立；但它**不能解释空闲基线中整个 449 MiB
GPU PWS**。禁止自动动画也不是本报告的建议。

## 7. 第五项：Chrome 主进程约 183 MiB

基线 Private Working Set 约 `183 MiB`，后续近邻读数 `165.22 MiB`。它主要承载：

- 浏览器 UI、标签和进程宿主；
- site isolation、profile 和浏览器状态；
- cache/index 元数据；
- 扩展框架和 IPC；
- 一部分网络、存储与 GPU 协调元数据。

这个体量对当前整个 Chrome 会话是真实 RAM，但不是 `cor-cotn` Actors、Scenes
或 Foundry 模块直接堆出来的。它只有 Renderer 的约 14–16%，目前没有证据表明它
异常增长，因此排在后面是合理的。

## 8. 第六项：Chrome 扩展约 105 MiB

最初干净基线中 extension renderer 合计约 `105 MiB` Private Working Set。
在自动化检查期间，活动 extension renderer 增至 8 个、合计 `202.70 MiB`，所以
后者已经被浏览器控制活动污染，不能拿来代表用户平时的 Foundry 基线。

本轮没有强行绕过 Chrome 对 `chrome://extensions-internals/` 的安全阻止；普通
extension process 命令行也不公开扩展 ID。因此当前可以确认扩展总量，但不能诚实地
把基线 105 MiB 分摊到每个扩展名称。

即使全部 105 MiB 都能消除，它也只有原先 Chrome 独占 resident 的约 5%，远小于
Renderer 两个 PartitionAlloc pool 和 V8。后续若要处理，应在独立 Chrome profile
中逐扩展启停对照，不能混入 Foundry 世界优化结论。

## 9. Renderer 1.16 GiB 现在解释到了哪里

本轮最新 renderer Private Working Set：`1162.64 MiB`。

| 真实 resident 组 | MiB | 占 Renderer PWS |
|---|---:|---:|
| V8 heap cage | `407.81` | 35.07% |
| PartitionAlloc pool A | `402.07` | 34.58% |
| PartitionAlloc pool B | `266.02` | 22.88% |
| 三项合计 | **`1075.90`** | **92.54%** |
| 其他 resident | `86.74` | 7.46% |

这张表闭合的是“物理页在哪些地址容器”，不是“每个 Foundry 模块各占多少”。目前
已经有强证据把两个 pool 内至少一部分分解到解码纹理；剩余原生 allocation 若要按
类型或调用栈精确划分，必须使用 Chromium native heap profiler/memory-infra。
官方 heap profiler 支持把 allocator allocation 与调用栈关联，但这是新的专用
profiling session，不应伪装成本轮无扰动基线。
[Chromium heap profiler](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/memory-infra/heap_profiler.md)

## 10. 现在真正应该继续调查的顺序

在“不禁用自动动画、只优化真实 resident RAM”的前提下，顺序建议改为：

1. **Renderer 图片 backing 与 SVG 栅格化。**
   - 核查 4096² token-ring atlas 是否必须常驻或能否降低上传/解码尺寸；
   - 检查 512² SVG status canvas 的生成分辨率和缓存策略；
   - 检查 PC 大图是否在 token HUD、sheet 或目录预加载中被解码为 2048²；
   - 这是当前证据最强、也最可能在不禁用动画前提下降低 PA resident 的方向。
2. **Canvas 的 13 个 RenderTexture 和全屏中间 target。**
   - 逐个确定由 core lighting/vision/mask/filter 还是模块 filter 创建；
   - 判断同尺寸 target 是否存在可释放的闲置副本；
   - 单做静态 inventory 不修改画面；实际关闭某条 pipeline 必须另行 A/B。
3. **V8 retaining path 专用测试。**
   - 允许一次会触发 GC 的 heap snapshot；
   - 按 retained size 检查 Document、Actor、Item、ChatMessage、Application、
     module cache 和 closure；
   - 与 snapshot 前真实 PWS 分开报告，避免把 profiling 行为混入基线。
4. **只开 Foundry 单标签的 GPU 隔离测试。**
   - 完全关闭 Bilibili 等其他 GPU 用户；
   - 采样 GPU PWS、Pixi texture、RenderTexture 和 Dice 动画时 frame/PWS 变化；
   - 这样才能把共享 GPU 进程中的成本真正缩小到 Foundry。
5. **Chrome 主进程与扩展。**
   - 只有前四项处理后仍不够，才使用独立 profile 做扩展逐项对照；
   - 不应先花大量时间追 105 MiB，而忽略 Renderer 的 1.16 GiB。

## 11. 已闭合、未闭合与不可偷换的结论

### 已闭合

- `0x136C00000000` 是第二个 32 GiB PartitionAlloc/GigaCage 系列地址池；
- Renderer 三大 resident group 解释了其 PWS 的 92.54%；
- 两个 PartitionAlloc pool 合计 resident `668.09 MiB`；
- pool 中存在与大图解码像素尺寸直接吻合的 resident commit；
- 当前 Renderer 侧解码 BaseTexture 约 `192.30 MiB`；
- 当前 GPU/Pixi base-level managed texture 约 `230.48 MiB`；
- Quick Insert 当前没有 live SearchLib index；
- Dice So Nice 不是空闲 GPU 基线的唯一或主要解释；
- Sequencer 两个大 WASM commit 不再属于真实 resident 优先项。

### 仍未闭合

- V8 中每个 constructor 和 retaining path 的精确 retained bytes；
- 两个 PartitionAlloc pool 内各类 allocation 与碎片的精确比例；
- Chrome GPU 进程中 Foundry 与其他标签的精确分摊；
- 基线 105 MiB 扩展内存对应的具体扩展名称。

### 不能从本轮声称

- 不能说全部 668 MiB PartitionAlloc 都是图片；
- 不能把 449 MiB GPU PWS 全部归给 Foundry；
- 不能说 Dice So Nice 或自动动画是唯一根因；
- 不能说 Duplicate UUID 报错导致 408 MiB V8 resident；
- 不能把 TextureLoader、Pixi texture bytes、GPU PWS 和 renderer PWS 相加成总内存；
- 不能因为已经识别了地址池容器，就假装已经获得所有 allocation 调用栈。

## 12. 验收说明

机械验证：

- 读取了 Windows Private Working Set；
- 用 `VirtualQueryEx` 枚举完整 AllocationBase；
- 用 `K32QueryWorkingSetEx` 查询实际 resident page；
- 读取了 V8 Runtime heap usage、世界 collection、Compendium index；
- 枚举了 Pixi BaseTexture、WebGL managed texture、texture format 和 RenderTexture；
- 对 GPU 纹理按 RED/RG/RGB/RGBA 通道数重新计算，没有继续把所有纹理一律乘 4；
- 没有读取页面内容来人为触发 page-in。

语义验收：

- 已推翻“283 MiB 未知匿名单体”的旧结论；
- 已把 Renderer 1.16 GiB 的绝大多数 resident 页面闭合到 V8 与两个原生池；
- 已提供大图解码 backing 的直接页尺寸证据；
- 已将页面资源、GPU 共享进程、Chrome 主进程和扩展的责任边界拆开；
- 报告没有以关闭自动动画作为默认方案；
- 对仍需 GC/native profiler/单标签隔离才能回答的问题保持未闭合，没有伪装成已定责。

原始证据：

- `.local/foundry-v14/evidence/fvtt-resident-memory-priority-investigation-20260728.json`
- `.local/foundry-v14/evidence/fvtt-resident-memory-probe-20260728.json`
