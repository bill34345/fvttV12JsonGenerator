# Foundry VTT 原生内存第一阶段运行时定责记录

> **2026-07-28 resident 口径纠正：** 本报告中的两个 Worker“合计约 572 MiB”
> 是 `VirtualQueryEx` 观察到的 committed 地址空间，不是同量的物理 RAM。后续
> `K32QueryWorkingSetEx` 逐页检查确认两个 WASM 区域实际 resident 各约
> `1.15 MiB`。因此下文把 500 MiB Blob 容量上限、572 MiB Worker committed 和
> 254 MiB TextureLoader 估算相加为 1,326 MiB 的做法只保留为第一阶段历史推断，
> 不能作为当前真实驻留内存归因。当前结论以
> [resident 归因](./2026-07-28-fvtt-resident-memory-attribution.md)和
> [优先级调查](./2026-07-28-fvtt-resident-memory-priority-investigation.md)为准。

> 日期：2026-07-28
> 环境：Foundry 14.364、dnd5e 5.3.3、Chrome 150.0.7871.182
> Scene：`RTb8HaqvexdHgtwf / B5.狂蛙人洞穴Bullywug Cave`
> 模块：Sequencer 4.2.3、Automated Animations 7.0.17
> 操作：只读运行时检查，加上通过 `AutomatedAnimations.playAnimation` 公开 API 播放瞬时动画；没有修改 HP、Combat、ChatMessage 或世界文档

## 1. 本轮最重要的新结论

之前约 1.5 GiB 的 Chromium PartitionAlloc committed 页面，已经出现了可以在本地源码和运行时同时解释的大项：

1. **Sequencer WebM Blob LRU 缓存：最高约 500 MiB。**
2. **Sequencer 常驻 spritesheet 解码 Worker：本地限制为 2 个；旧审计实测合计约 572 MiB。**
3. **Foundry/Pixi 当前纹理缓存：本轮实测约 254 MiB。**

三项相加：

```text
Sequencer WebM Blob cache upper bound       ≈ 500 MiB
2 × Sequencer decode Worker historical      ≈ 572 MiB
Foundry TextureLoader current estimate      ≈ 254 MiB
------------------------------------------------------
Combined capacity / observed components     ≈ 1,326 MiB
```

这还没有计算：

- V8 JS heap；
- Blink/DOM 原生对象；
- 视频解码临时缓冲；
- PartitionAlloc bucket、thread cache 和碎片；
- GPU/SharedImage；
- 其他模块原生 backing。

因此，旧审计约 1.494 GiB 的两座 PartitionAlloc 地址池不再只是“可能混有媒体资源”。当前已经有明确的本地实现证据，说明 **Sequencer 的 WebM Blob 缓存、解码 Worker 和 Foundry/Pixi 纹理缓存足以构成这一数量级的主要来源**。

这仍不代表三项在旧采样时都恰好达到上限；其中：

- Worker 572 MiB 是旧审计的实测值；
- TextureLoader 254 MiB 是当前实测值；
- WebM Blob cache 500 MiB 是源码硬上限，当前精确占用尚未通过公共 API暴露。

## 2. Sequencer WebM Blob 缓存的直接源码证据

文件：

`I:\OpenCode\fvttV12JsonGenerator\.local\foundry-v14\data\server-mirror\Data\modules\sequencer\dist\sequencer.js`

关键实现：

- 第 6144 行：`_videos: new Map()`；
- 第 6146 行：`_totalCacheSize: 0`；
- 第 6159–6183 行：`loadVideo()` 使用 `fetch(...).blob()`，并把 Blob 留在 `_videos`；
- 第 6169 行：只有在加入新 Blob 会超过 `524288e3` bytes 时才开始逐出旧项；
- 第 6175–6178 行：累加 Blob 大小并写入缓存；
- 第 6180–6181 行：命中时通过删除再插入实现 LRU 顺序。

硬上限：

```text
524,288,000 bytes = 500 MiB
```

这个缓存存放的是压缩 WebM Blob，不是 Pixi BaseTexture，因此：

- 不会进入 `TextureLoader.approximateTotalMemoryUsage`；
- JS heap 通常只计算 Blob 包装对象，不会把全部 Blob backing 作为普通 JS 对象计算；
- Blob backing 更可能反映在 renderer 原生 private memory / PartitionAlloc 或共享 backing；
- 只要没有新文件触发 LRU 超限，旧 Blob 就会继续保留；
- 同一个已缓存动画再次播放不会重复 fetch，也不会重复增加 `_totalCacheSize`。

这与本次实测吻合：

- 第一批不同动画后 renderer private 明显抬高；
- 第二批重复完全相同的动画，增量明显缩小；
- TextureLoader、BaseTexture、DOM、JS heap 均未同步增加；
- 新测试的三个 WebM 总压缩体积只有约 1.53 MiB，却仍需要创建解码和渲染工作区。

## 3. Sequencer 解码 Worker 的直接源码证据

文件：

`I:\OpenCode\fvttV12JsonGenerator\.local\foundry-v14\data\server-mirror\Data\modules\sequencer\dist\SpritesheetGenerator-Dw7_9Yk1.js`

关键实现：

- 第 2 行创建 `new Worker("/modules/sequencer/dist/assets/decodeWorker-....js")`；
- 第 44 行是本地已经存在的 Worker 上限补丁：

```js
const workerCount = Math.min(
  Math.max(Math.floor((navigator.hardwareConcurrency - 2) / 2), 1),
  2
);
```

- 第 45–50 行在 generator 构造时一次创建全部 Worker；
- 第 104–109 行将整个视频 `ArrayBuffer` transfer 给 Worker；
- `sequencer.js` 第 6227–6229 行在首次需要持久视频 spritesheet 时创建并保留 generator；
- 当前 Scene 存在一个持久的 `纠缠术entangle` Sequencer effect，因此 generator/Worker 路径具有真实触发条件。

旧审计已经测得两个 Worker 各约 286 MiB，合计约 572 MiB。这与本地源码中固定创建两个 Worker完全对应。

Worker 是持久对象；完成一次 decode job 后，Worker 本身不会自动 terminate。其 WASM 线性内存和内部 decoder 高水位也不一定在任务结束后归还操作系统。

## 4. Foundry/Pixi 纹理基线

### 4.1 版本纠正

运行时实测：

```text
PIXI.VERSION = 7.4.3
```

因此上一份外部调研中 PixiJS v8 的具体 issue 不能直接套用到当前 Foundry。它们只保留为纹理、视频和 GPU 生命周期的机制参考。

### 4.2 Foundry TextureLoader

```text
TextureLoader.approximateTotalMemoryUsage = 254.094 MiB
TextureLoader.CACHE_TTL                   = 900,000 ms（15 分钟）
```

Pixi cache：

| 指标 | 数值 |
|---|---:|
| `TextureCache` keys | 224 |
| `BaseTextureCache` keys | 218 |
| 唯一 BaseTexture | 124 |
| 原始 RGBA 估算 | 193.163 MiB |
| Foundry TextureLoader 估算 | 254.094 MiB |

按资源类型：

| 类型 | 数量 | 原始 RGBA 估算 |
|---|---:|---:|
| ImageBitmap | 18 | 114.775 MiB |
| HTMLCanvasElement | 105 | 77.777 MiB |
| HTMLVideoElement | 1 | 0.610 MiB |

最大的三项：

| 资源 | 尺寸 | 原始 RGBA |
|---|---:|---:|
| `token-ring-gargantuan-bkg` | 4096×4096 | 64 MiB |
| 当前狂蛙人洞穴背景 | 2508×2508 | 23.995 MiB |
| 一个 PC 头像 | 2048×2048 | 16 MiB |

这说明纹理缓存是明确的大项，但当前约 254 MiB，不足以独立解释 renderer/GPU 的 GiB 级 private memory。

## 5. 自动动画受控测试

### 5.1 测试内容

通过 AA 的公开接口：

```js
AutomatedAnimations.playAnimation(sourceToken, item, { targets: [target] })
```

运行：

- 第一批：4 种攻击动画，各 2 次，共 8 次；
- 第二批：完全相同的 4 种动画，各 2 次，共 8 次；
- 第三批：4 种新的法术/能力动画，共 4 次；
- 总计 20 次；
- 全部成功；
- 没有调用 Item activity，不产生攻击、伤害、ChatMessage 或 HP 变化。

### 5.2 第一、二批前后

| 指标 | 初始 | 最终冷却后 | 差值 |
|---|---:|---:|---:|
| TextureLoader | 254.094 MiB | 254.094 MiB | 0 |
| TextureCache keys | 224 | 224 | 0 |
| BaseTextureCache keys | 218 | 218 | 0 |
| 唯一 BaseTexture | 124 | 124 | 0 |
| 持久 Sequencer effect | 1 | 1 | 0 |
| DOM elements | 8,618 | 8,618 | 0 |
| JS heap used | 457.2 MiB | 441.0 MiB | **-16.2 MiB** |
| renderer private | 1,699.9 MiB | 1,868.0 MiB | **+168.1 MiB** |
| GPU private | 1,851.1 MiB | 1,842.3 MiB | **-8.8 MiB** |
| Chrome total private | 4,089.9 MiB | 4,261.6 MiB | **+171.7 MiB** |

### 5.3 解释

可以排除：

- AA 每播放一次就永久增加一个 Pixi BaseTexture；
- 这批动画增长来自 DOM；
- 这批动画增长来自 persistent Sequencer effect；
- 这批动画增长来自 JS live heap；
- 这批动画主要把数据留在 GPU private。

当前最符合的是：

1. 首次播放多种动画时，Sequencer/Chrome 建立视频 Blob、decoder、ArrayBuffer、Canvas/video backing 和 allocator 工作区；
2. 动画对象和 Texture 本身结束后被正确清理，所以 Pixi cache 和 JS heap 不增长；
3. renderer 的原生分配器/媒体解码高水位没有完全 decommit；
4. 重复播放同一资源时，大部分走缓存，增量显著缩小；
5. 因此表现更像“资源缓存 + decoder/allocator 高水位”，而不是每次播放都无限增加同等大小的泄漏。

第三批新资源的 Resource Timing 证明 Sequencer 确实以 `fetch` 加载 WebM：

| 动画 WebM | 压缩大小 |
|---|---:|
| Divine Smite 400×400 | 458,240 bytes |
| Toll the Dead 400×400 | 737,755 bytes |
| Ranged Projectile 1600×400 | 403,636 bytes |
| 合计 | 1,599,631 bytes / 1.526 MiB |

压缩文件只有约 1.53 MiB，renderer 原生工作区变化却更大，说明磁盘/网络文件大小不能代表浏览器解码和 allocator footprint。

## 6. 当前定责层级

现在已经可以把 1.5 GiB 的调查从“Chrome 不知道什么原生池”推进到：

```text
Chromium PartitionAlloc committed pages
  ├─ Sequencer WebM Blob LRU cache：0～500 MiB
  ├─ Sequencer spritesheet decode Workers：旧实测约 572 MiB
  ├─ Foundry/Pixi texture cache：当前约 254 MiB
  ├─ 视频 decoder / ArrayBuffer / Canvas backing
  └─ allocator 高水位、碎片及 Blink/DOM 其他对象
```

其中前三项已经是我们可以处理的层面：

- Blob cache 上限可以改成配置项或更小上限；
- Worker 数量已被本地补丁限制为 2，还可按玩家设备固定为 1；
- Worker 可以改为按需创建、空闲后 terminate；
- persistent effect 的 spritesheet 生成可以延迟或按用户设置关闭；
- 纹理最大项可以按资源逐个处理，不需要禁用 Automated Animations。

但用户先前已经将 Worker 优化列为第四优先，因此本轮没有修改这些实现。

## 7. 还缺少的最后一项

当前 Sequencer 公共 API 没有暴露：

```js
SequencerFileCache._totalCacheSize
SequencerFileCache._videos
```

所以本轮只能确认：

- 缓存实现存在；
- 上限是 500 MiB；
- WebM 确实通过该路径 fetch；
- 重复资源不会重复 fetch；
- renderer native private 随首次多资源动画显著抬高；
- 当前无法在不改模块源码的情况下读取精确缓存总数。

浏览器控制通道同时拒绝：

- `Memory.startSampling`；
- `Memory.getDOMCounters`；
- 自动打开 `chrome://memory-internals`。

因此本轮没有获得 native allocation backtrace。该限制不影响前三个主要组成项的源码和运行时证据，但仍无法把剩余部分精确分配到 Blob backing、media decoder 和 PartitionAlloc 碎片。

## 8. 下一步最小可回滚处理

如果下一步允许做一个极小的诊断补丁，最有价值的不是关闭动画，而是只给 Sequencer 增加一个只读调试接口，暴露：

```js
{
  videoBlobCount: SequencerFileCache._videos.size,
  videoBlobBytes: SequencerFileCache._totalCacheSize,
  generatedSpritesheetJobs: SequencerFileCache._generateSpritesheetJobs.size,
  activeSpritesheets: SequencerFileCache._spritesheets.size,
  workerCount: ...
}
```

这个补丁：

- 不改变缓存策略；
- 不减少动画；
- 不终止 Worker；
- 不修改世界；
- 重载模块即可回滚；
- 可以直接回答当前 500 MiB Blob cache 实际用了多少。

随后再决定是否把 500 MiB 上限降为可配置值，或让玩家端默认采用更低上限。

## 9. 验收结论

机械验证：

- 真实 Chrome 页面 `game.ready=true`；
- Pixi 版本、TextureLoader、Pixi cache、Sequencer effect、JS heap 和进程内存均从当前 renderer 读取；
- 20 次公开 AA 动画调用全部成功；
- 动画前后没有 Texture/BaseTexture、DOM、持久 effect 或 JS heap 累积；
- 本地 Sequencer 4.2.3 源码中的 500 MiB Blob cache 和双 Worker 构造已逐行复核。

语义验收：

- 不能说“AA 本身完全没有内存成本”；
- 可以说“本次瞬时 AA 动画没有形成 Pixi texture 或 JS live-object 逐次泄漏”；
- 当前最大的新归因是 Sequencer 的 500 MiB WebM Blob cache 与两个常驻解码 Worker；
- 首次播放多种动画后的 renderer 原生高水位确实增加，但重复同资源增量缩小并部分回落，更像缓存/allocator 平台而不是固定速率的无限泄漏；
- 还不能声称旧样本的 WebM Blob cache 当时恰好装满 500 MiB，除非增加只读诊断暴露。
