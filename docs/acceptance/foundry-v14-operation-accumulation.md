# Foundry v14 操作累积诊断报告

生成日期：2026-07-11

## 修正后的结论

**原 50 分钟混合操作测试不能证明真实游戏存在同等规模的内存泄漏。**

原测试确实测得 Chrome Renderer 私有内存约 2.80 GB、工作集约 2.34 GB，
但后续 Console/CDP 根因排查确认：测试脚本反复创建了没有先攻值的 Combatant，
随后非阻塞调用 `Combat.startCombat()`。`monks-combat-details` 的
`prevent-initiative` 设置为 `true`，每次调用都会生成一个“并非所有先攻已掷骰”
确认框。脚本没有确认或关闭这些窗口，因此约 32 次战斗组会累积大量 Dialog、
DOM 节点和监听器。

所以原始曲线仍是有效的机械记录，但不能再作为“正常玩家操作会泄漏到 3 GB”
的语义证据。需要使用不会遗留确认框的正确操作路径重新采样。

## 固定配置

- Foundry 14.364；dnd5e 5.3.3
- 83 个启用模组
- 保持关闭：`simple-quest`、`5e-chm-online`、`chat-media`、`scene-packer`
- 模组配置 SHA-256：`754b048835a3511e316a65ec58ab57829a55504c7feb7e5a40c2b1cb6acb26a1`
- 仅使用本地 `server-mirror`；未访问或修改生产服务器

## 原测试机械记录

- 189 次场景切换，约 32 个战斗/掷骰操作组
- 50.6 分钟主动操作，结束后在轻量场景自然等待 60 秒
- 页面 JS Heap 从早期回落值约 870 MB 增至约 1.10 GB
- 最终 Nodes 约 132,826，Listeners 约 29,287
- Foundry Node 服务端最终工作集约 133 MB，未表现出相同增长
- Chrome Renderer 最终工作集约 2.34 GB、私有内存约 2.80 GB

这些数字描述的是测试脚本实际造成的状态，其中包含未关闭 Dialog 的污染。

## 定向根因排查

### 仅切图

在同一页面连续进行 36 次轻量、中型、重型场景切换：

- JS Heap：约 1.61 GB 降至约 921 MB（发生自然 GC）
- Nodes：62,809 降至 51,936
- Listeners：22,763 降至 18,963
- 没有遗留确认框

短时结果不支持“单纯切图必然持续累积”的判断，但发现真实资源错误：

- 缺失资源：`assets/srd5e/img/bestiary/tokens/MPMM/Tanarukk.webp`
- 调用链经过 `vision-5e` 的 `Token5e._draw`
- `Scene.view` 由 `monks-common-display` 包装；该堆栈只能证明它参与调用链，
  不能单独证明它制造了缺失资源或内存泄漏

### 错误的战斗脚本路径

连续 12 次创建无先攻 Combatant 后调用 `startCombat()`：

- 12/12 次在 5 秒内没有完成
- 页面累计出现 15 个“并非所有先攻已掷骰”Dialog（含后续追踪调用）
- 根因是 `monks-combat-details` 的正常确认逻辑等待用户输入，不是 Hook 死锁

### 正确的战斗路径

先为 Combatant 设置先攻，再连续执行 10 次启动战斗、推进轮次和清理：

- 10/10 次完成，0 个脚本错误，0 个遗留 Dialog
- `startCombat()`：约 180–371 ms
- `nextRound()`：约 130–412 ms
- JS Heap：约 917 MB 至约 921 MB
- Nodes：64,921 降至 62,171
- Listeners：19,275 增至 19,693；短样本不足以判定泄漏

这组结果不支持原先的“战斗启动 Hook 持续卡死”判断。

## 已确认的独立问题

1. `monks-combat-marker` 版本 12.01 在 Foundry v14 战斗更新中访问旧版全局
   `Token` 和 `loadTexture` API。Console 堆栈直接指向
   `monks-combat-marker.js`，属于明确的 v14 兼容告警和战斗性能嫌疑项。
2. `custom-css` 2.4.4 在 Game ready 前尝试写入 World setting，启动时产生真实错误。
3. `fvtt-party-resources` 仍使用 V1 Application 框架。
4. MIDI-QOL 14.0.9 仍触发部分 v13 起弃用的全局 API/Chat hook 告警。
5. 重型场景引用了不存在的 Tanarukk Token 贴图，场景加载会产生资源错误。
6. 服务端启动报告受保护包 `mcdm-flee-mortals-where-evil-lives` 签名无效；
   该问题属于授权环境无法验收，不尝试绕过。

## 当前语义边界

- 已证明原长测被自动化确认框污染，原“已复现真实泄漏”结论撤回。
- 已证明正确战斗启动路径在 10 次短样本中正常完成。
- 后续正确复现器和单变量 A/B 已把长期操作卡顿缩小到下述三个主要机制；
  它们可以叠加，但不是一个单独的服务端泄漏。

## 根因闭环

### 1. MIDI-QOL Workflow 强引用和聊天卡片保留

当前原始配置为：

- `midi-qol.SaveToChatCard = false`
- `midi-qol.UseWeakReferences = false`

MIDI-QOL 14.0.9 的 `Workflow.addWorkflow()` 会把每次 Activity 的 Workflow 放进
静态 `Map`。上述配置下 Map 保存强引用；15+30 次 Activity 后，45 个已经完成的
Workflow 仍全部保留。与此同时，每张 MIDI 聊天卡片继续保留 DOM 和事件监听器。

Activity-only 30 次的即时变化：

- Heap：约 +141 MB
- Nodes：+10,581
- Listeners：+526
- AudioHandlers：+16

55 秒后 Heap 和 AudioHandlers基本回落，但 Nodes 和 Listeners 随聊天卡片保留。
删除精确匹配的测试消息后，Workflow Map 从 30 变为 0。

启用 `SaveToChatCard=true` 和 `UseWeakReferences=true` 后，相同 Workflow 以 WeakRef
保存；自然 GC 后 10/10 个 WeakRef 均不可再解引用，Heap 相对短测基线仅保留约
13 MB 差异。删除聊天消息后 Map 条目也被清除。

结论：长期战斗会通过 MIDI Workflow、复杂聊天卡片及其监听器产生真实的客户端
累积压力。弱引用能释放 Workflow 主体；聊天卡片仍会使 DOM 随消息数增长。

### 2. MIDI-QOL 调试级别放大 Console 压力

原配置 `midi-qol.Debug = warn`。相同 5 次 Activity 的 CDP Console 事件量：

- `warn`：435 条，87 条/Activity
- `none`：55 条，11 条/Activity

设为 `none` 后日志事件减少约 87%。剩余日志主要来自无效 Legendary Resistance
公式和 AC5E 无 Token 提示。

结论：`Debug=warn` 不是唯一根因，但会显著放大战斗时间越久越卡的现象，尤其在
Console/CDP/浏览器日志捕获开启时。

### 3. Automated Animations 与 Sequencer 的切图竞态

正确设置先攻并等待 `canvasReady` 后，重复“战斗 → Activity → 切到重型场景 →
返回轻量场景”10 次，在动画启用时复现 2 次：

```text
TypeError: Cannot set properties of null (setting 'volume')
[Detected 1 package: sequencer(4.2.2)]
at CanvasEffect._createSprite
at async CanvasEffect._initialize
```

Sequencer 在 `await this.sprite.activate(...)` 返回后继续设置 `this.sprite.volume`，
但场景切换可能已销毁该 sprite。把客户端
`autoanimations.killAllAnim` 设为 `off` 后，完全相同的 10 次操作出现 0 次
Sequencer 异常。

结论：Automated Animations 7.0.15 触发的 Sequencer 4.2.2 效果与场景切换存在
已复现竞态。这会制造未处理 Promise、动画峰值和额外 Canvas 开销；关闭自动动画
是当前已验证的缓解方案。

## 已验证的本地缓解配置

- `midi-qol.Debug = none`
- `midi-qol.SaveToChatCard = true`
- `midi-qol.UseWeakReferences = true`
- `autoanimations.killAllAnim = off`（客户端关闭 Automated Animations）
- 保持 `scene-packer`、`simple-quest`、`5e-chm-online`、`chat-media` 关闭

缓解配置下的 10 次战斗/Activity/重型切图 A/B：

- 10/10 操作完成
- 0 个遗留 Dialog
- 0 个 Sequencer 异常
- 充分自然回落后 AudioHandlers 回到基线
- 10 个 MIDI Workflow WeakRef 全部不可解引用
- 删除测试聊天消息后 Workflow Map 回到 0

## 仍需独立修复的附带问题

- `加梅利` 的 `Legendary Resistance` 来自 MIDI 示例包，其效果仍使用
  `@resources.legres.value`。在 dnd5e 5.3.3 当前 Roll Data 中无法解析，每次
  Activity 重复产生警告；应禁用该旧效果，或由确认过的 v14 版本重新建立基于
  Item uses（当前为 3/日）的传奇抗性自动化。
- `monks-combat-marker` 12.01 使用旧 `Token`/`loadTexture` API；建议默认禁用，
  直到安装明确支持 Foundry v14 的版本。
- 重型场景缺少 Tanarukk Token 贴图，应修复 Token 资源路径或移除失效引用。
- `custom-css` 2.4.4 在 Game ready 前写 World setting；建议升级或禁用。
- `fvtt-party-resources` 的 V1 Application 告警不是本轮内存主因，但属于后续
  Foundry v16 前必须处理的兼容债务。

## 生产端建议顺序

1. 先把 MIDI-QOL Debug 改为 `None`。
2. 同时开启 Save to Chat Card 与 Use Weak References for Workflows。
3. 客户端关闭 Automated Animations；若仍需要动画，至少避免动画尚未结束时切图，
   并等待 Sequencer/Automated Animations 修复该竞态后再启用。
4. 默认禁用 `monks-combat-marker` 12.01。
5. 修复 Tanarukk 资源路径和旧 Legendary Resistance 效果。
6. 对长时间战斗定期清理无用聊天消息；不想删除记录时，可先刷新客户端释放
   已渲染聊天 DOM，但刷新只是缓解，不代替上述配置修改。

原始证据保存在忽略目录
`.local/foundry-v14/evidence/diagnostics/operation-active-50m.jsonl`。
