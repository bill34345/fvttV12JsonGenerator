# Foundry VTT Chrome 真实驻留内存定责

> **2026-07-28 后续纠正：** 本报告中把 `0x136C00000000` 写成“283 MiB
> 匿名 resident 单块”的结论已被更完整的 AllocationBase 枚举推翻。该地址组的
> 完整范围恰好为 32 GiB，是第二个 Chromium PartitionAlloc/GigaCage 系列地址池，
> 不是一个独立 Foundry/模块缓冲区。最新逐项调查、纹理页尺寸证据和 GPU
> 格式修正统计以
> `docs/reviews/2026-07-28-fvtt-resident-memory-priority-investigation.md`
> 为准。

> 日期：2026-07-28
> 环境：Foundry `14.364`、dnd5e `5.3.3`、Chrome `150.0.7871.182`
> 世界：`cor-cotn`
> Scene：`RTb8HaqvexdHgtwf / B5.狂蛙人洞穴Bullywug Cave`
> 本轮边界：只读检查；没有关闭模块、修改世界或触发垃圾回收

## 1. 结论先行

此前的 `2.29 GiB Chrome Working Set` 是**各 Chrome 进程 Working Set 的相加值**。
这些 Working Set 都是 resident 页面，但同一份 Chrome DLL、共享内存和 SharedImage
可能同时映射到多个进程，因此求和会重复计算共享页。它不是 Chrome 独占的唯一物理
RAM。

从本轮开始，主要指标改为：

> `Private Working Set`：当前确实驻留在物理 RAM、且只属于该进程的页面。

当前相同页面的短时复测中：

- Chrome 各进程 Working Set 求和约 `2.60 GiB`；
- 其中 Private Working Set 求和约 `1.93 GiB`；
- 其余约 `0.63 GiB` 是各进程看到的共享 Working Set，不能直接作为唯一物理 RAM
  相加。

因此用户所问的“约 2.29 GiB 到底都是什么”，应分成：

1. Foundry Renderer；
2. GPU 进程；
3. Chrome 浏览器主进程；
4. Chrome 扩展 Renderer；
5. 网络、存储、音频等 Utility；
6. 一部分被多个进程重复看到的共享 Chrome 代码与共享映射。

最重要的新纠正是：

> 两个 Sequencer Worker 各约 286 MiB 的 WASM 区域，在当前样本中实际 resident
> 都只有约 `1.15 MiB`，合计约 `2.3 MiB`。它们是巨大的 private commit，不是当前
> 物理 RAM 大头。

## 2. `2.29 GiB` 的进程级拆分

18:37:52 的快照：

| 进程类别 | Working Set | 比例 |
|---|---:|---:|
| Foundry Renderer | 1107.67 MiB | 48.58% |
| GPU 进程 | 458.99 MiB | 20.13% |
| Chrome 浏览器主进程 | 347.66 MiB | 15.25% |
| Chrome 扩展 Renderer | 229.67 MiB | 10.07% |
| Network/Storage/Audio Utility | 94.12 MiB | 4.13% |
| 其他普通 Renderer | 32.24 MiB | 1.41% |
| Crashpad | 9.98 MiB | 0.44% |
| 合计 | **2280.32 MiB** | 100% |

这张表回答“Chrome 表面上看到的约 2.29 GiB 分布在哪些进程”，但不能回答唯一物理
RAM，因为其中包含共享页重复计数。

## 3. 唯一驻留 RAM：Private Working Set

18:46:46 静置复测：

| 指标 | 数值 |
|---|---:|
| 各 Chrome 进程 Working Set 求和 | 2602.16 MiB |
| Private Working Set 求和 | **1973.61 MiB** |
| Shared Working Set 求和 | 628.55 MiB |
| Foundry Renderer Private Working Set | **1198.84 MiB** |
| Foundry Renderer Shared Working Set | 132.26 MiB |
| GPU 进程 Private Working Set | **448.67 MiB** |

Private Working Set 可以跨进程相加，因为它们是各进程独占的 resident 页面。Shared
Working Set 求和不可以当成唯一物理内存，因为同一物理页可能被多个 Chrome 进程映射。

所以当前 Chrome 对系统物理 RAM 的确定下界约为 `1.93 GiB`；再加上共享页中实际只
存在的一份，真实总量位于 `1.93～2.60 GiB` 之间，但明显不是简单把每个进程显示的
Working Set 全加起来。

## 4. Foundry Renderer 的约 1.2 GiB 独占 resident

Chrome 运行时直接提供：

| Renderer 内部指标 | 数值 |
|---|---:|
| V8 JS heap used | 439.58 MiB |
| V8 JS heap total | 460.56 MiB |
| Embedder heap used | 128.69 MiB |
| ArrayBuffer/backing storage | 84.61 MiB |
| 合计可直接归属 | **652.88 MiB** |

这里的 Embedder heap 主要是 Blink/DOM/Oilpan 管理的浏览器原生对象；backing storage
主要是 ArrayBuffer 等堆外存储。

相对 Renderer Private Working Set `1198.84 MiB`，仍有约 `545.96 MiB` 不能由
上述三个公开指标直接命名。它包括：

- Chromium PartitionAlloc 中的 Blink、布局、样式、字符串和模块原生对象；
- Canvas、Skia、图片解码和 SharedImage 的 renderer 侧 backing；
- 线程栈、JIT/code metadata、网络/压缩缓冲；
- 分配器 thread cache、slot span、碎片和当前仍 resident 的空闲页。

这 `545.96 MiB` 不是一个单独对象；它是 renderer 原生层的混合剩余项。

## 5. Renderer 逐页 resident 区域

本轮通过：

1. `VirtualQueryEx` 枚举 committed 区域；
2. `K32QueryWorkingSetEx` 对每个 4 KiB 页查询 resident 状态；
3. 不读取页内容，因此不会为了审计把未驻留页面主动读入 RAM。

最大的三个私有 resident 分配组：

| AllocationBase | committed | resident | 子区域 | 当前定责 |
|---|---:|---:|---:|---|
| `0x38400000000` | 452.43 MiB | 447.48 MiB | 207 | 高置信度 V8 heap cage；与 V8 heap 约 440～461 MiB 高度吻合 |
| `0x1BE800000000` | 381.24 MiB | 371.10 MiB | 2011 | 高置信度 Chromium PartitionAlloc pool |
| `0x136C00000000` | 295.75 MiB | 283.17 MiB | 旧探针只合并了 committed 区段 | 后续确认完整 AllocationBase 是精确 32 GiB 的第二个 PartitionAlloc/GigaCage 系列地址池 |

### PartitionAlloc pool

`0x1BE800000000` 包含数千个子区域，符合 Chromium 预留地址池后按 slot span/system
page 提交的形态。它是分配器容器，内部可能混合 DOM、Canvas/图片 backing、模块
C++ 对象和空闲/碎片页，不能将全部 `371 MiB` 归罪给单一 Foundry 模块。

### 原 295.75 MiB“匿名单块”的后续纠正

沿同一 `AllocationBase` 把 reserved 区段也纳入枚举后，完整地址范围恰好为
`32 GiB`，内部包含多段 committed 与 reserved 页面。它的外形符合 Chromium
PartitionAlloc/GigaCage 系列地址池，而不符合一个应用级匿名缓冲区。

- 它的 resident 页面是真实物理 RAM；
- 它与 `0x1BE800000000` 一样是分配器容器；
- 容器内部的具体对象、缓存和碎片仍需要 native heap profiler；
- 不再把它列为“最大未知单块”，也不能把整个 pool 命名为某个 Foundry 模块。

## 6. 两个 Sequencer WASM 区域的 resident 纠正

| AllocationBase | committed | resident |
|---|---:|---:|
| `0x38C00000000` | 286.06 MiB | **1.15 MiB** |
| `0x38E00000000` | 286.06 MiB | **1.15 MiB** |
| 合计 | 572.13 MiB | **2.30 MiB** |

因此必须纠正：

- `572 MiB` 是两个 Worker 的 committed private memory；
- 当前真正占据 RAM 的页只有约 `2.3 MiB`；
- Worker 区域能显著抬高 Private Bytes/Commit；
- Worker 区域本身几乎不解释当前约 2 GiB 的 Private Working Set。

这也说明“把 Worker 从 2 改成 1”主要降低 commit 风险，不一定能按 286 MiB 的幅度
降低任务管理器里当前 resident RAM。

## 7. GPU 进程的 resident 与显存

GPU 进程当前 Private Working Set 约 `448.67 MiB`，这是系统 RAM 中真实 resident
且该进程独占的部分，主要可能包括：

- Chrome GPU service 与用户态驱动内存；
- command buffer、shader/program cache；
- Canvas/WebGL staging、上传缓冲和共享表面；
- Skia/GANESH、Compositor、SharedImage metadata/backing；
- Pixi 与 Dice So Nice 的 renderer/Three.js 图形工作区。

Windows GPU counters 同时显示：

- Local Usage 约 `745.24 MiB`；
- Non-local/Shared Usage 约 `143.63 MiB`；
- Dedicated Usage 和 Total Committed 是另一套重叠的显存/提交口径。

这些 GPU segment counters 不能互相相加，也不能再加到 Chrome Working Set。Local/
Dedicated 主要是显存视角，不是系统 RAM。

Foundry `TextureLoader.approximateTotalMemoryUsage` 当前约 `253.76 MiB`。这是按照资源
尺寸得到的逻辑纹理估算，可能与 GPU local memory、renderer backing 和 SharedImage
重叠，不能再作为一块独立 RAM 加进总数。

## 8. Chrome 浏览器、扩展与 Utility

约 2.29 GiB 的进程求和中还有：

- 浏览器主进程约 `348 MiB` Working Set；
- 扩展 Renderer 合计约 `230 MiB`；
- Network/Storage/Audio Utility 合计约 `94 MiB`。

它们不是 `cor-cotn` 世界数据本身：

- 浏览器主进程管理 Chrome UI、标签、站点隔离、profile、缓存索引和扩展框架；
- 扩展 Renderer 包括 Chrome 扩展自己的 JavaScript/DOM；
- Utility 负责网络、磁盘缓存、存储和音频服务。

Private Working Set 复测中，浏览器主进程独占 resident 约 `183 MiB`，扩展合计约
`105 MiB`，Utility 合计约 `24 MiB`；剩余主要是共享 Chrome 代码页。

## 9. 当前责任排序

只看真实 resident RAM，优先级变成：

1. **Foundry Renderer Private Working Set：约 1.2 GiB**
   - V8 live heap 约 440 MiB；
   - Blink/embedder 约 129 MiB；
   - ArrayBuffer/backing 约 85 MiB；
   - 其余 renderer native resident 约 546 MiB。
2. **GPU 进程 Private Working Set：约 449 MiB**
   - 图形服务、驱动、Canvas/WebGL、SharedImage 和 staging。
3. **Chrome 主进程：约 183 MiB 独占 resident。**
4. **Chrome 扩展：约 105 MiB 独占 resident。**
5. **Utility 与其他：约 34 MiB 独占 resident。**

Sequencer 两个大 WASM 区域不再列为 resident 优先项；它们保留在 commit 风险清单。

## 10. 后续测量规则

从本轮开始：

1. 主要报告 `Private Working Set`，而不是 Private Bytes；
2. Chrome 各进程 Working Set 求和必须标注共享页重复计算；
3. Renderer、GPU、Browser、Extension、Utility 分开报告；
4. GPU Local/Non-local 与系统 RAM 分开报告；
5. WASM/PartitionAlloc region 必须用 `K32QueryWorkingSetEx` 验证 resident；
6. 不再把 committed region 大小直接称为内存占用；
7. TextureLoader 只作图形资源估算，不与 Working Set 直接相加；
8. 后续已确认 `0x136C00000000` 也是 32 GiB PartitionAlloc/GigaCage 系列地址池；
   当前未闭合目标是两个 pool 内部对象、缓存和碎片的组成，而不是其容器身份。

## 11. 验收边界

机械验证：

- 当前 Foundry 页面、Scene 和模块状态真实读取；
- Chrome 进程按 command line 分类；
- Windows `Working Set - Private` 性能计数器读取；
- Renderer 逐个 committed page 做 resident 查询；
- 两个 Sequencer WASM 区域均得到当前 resident 数；
- V8、Embedder、Backing Storage 和 TextureLoader 分开读取；
- GPU Local/Non-local counters 分开读取。

语义验收：

- 纠正了“2.29 GiB 等于 Chrome 独占物理 RAM”的说法；
- 纠正了“两个 Worker 的 572 MiB 等于当前物理 RAM”的说法；
- 当前可确定的 Chrome 独占 resident 约为 1.9～2.0 GiB；
- 最大头仍是 Foundry Renderer，其次是 GPU 进程；
- 原“283 MiB 未知单块”已重新定性为第二个 PartitionAlloc/GigaCage 地址池；
- 没有把容器级 resident 误报成某一个模块的责任；
- 没有执行模块开关、GC、缓存清理或世界修改来影响结果。

原始证据：

- `.local/foundry-v14/evidence/fvtt-resident-memory-probe-20260728.json`
