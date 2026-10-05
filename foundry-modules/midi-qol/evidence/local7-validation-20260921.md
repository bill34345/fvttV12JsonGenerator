# local.7 验证记录

**运行时进展：** batch6P原始证据已支持C03/C04附魔创建、实际加值和正常移除恢复，以及B04刷新后5环旧卡新10d6伤害。A–G尚未全过；剩余遭遇上下文/目标重新渲染/Console与清理由Q执行单补齐。

**后续状态（2026-09-21 02:58 UTC）：** O 已正常重连 Chrome 并恢复遗留设置；父方完成三资源 `--apply`，磁盘与HTTP bundle均为本文件候选哈希，前后PID36368，未重启。安装证据保存在 batch6P 的 browser-update-applied.json；真实 C03/C04 与剩余 A–G 待P执行。下面离线阶段记录保留，不覆盖历史。

## 修复与来源

固定上游 `4338eeab85041cd71b76ede36818e2265cbf06ae`。2026-09-21 02:15 UTC 官方复核：dnd6 未前进、最新 release v14.0.12；扩大 clone/enchantment 差异筛选后仍未找到适用修复。

新增独立 `0004-dnd5e6-enchantment-clone-id.patch`。只在 Midi 现有 ActiveEffect 子类中保护 dnd5e major6、enchantment 类型、明确附魔 profile、未传显式 clone context 的原生应用 clone：生成新 ID 并让 native clone 保留它。保持 enchantment 类型、原 profile、flags、changes、dependency 和原生应用流程。普通 clone、其他类型、显式 context、其他 major 版本仍委托原方法；不修改全局状态或 Foundry/dnd5e prototype。

实际原因已有 batch6M 运行证据：缺 ID 的 native clone 与九条缺 ID 状态定义发生 dnd5e 迁移误匹配，enchantment 被改成 condition。此补丁保护具体 Midi 使用路径，不宣称修好了系统通用迁移或其他模块的状态注册。

Patch SHA-256：`316BE603E37B7E97BC6EAE4F20C3105F0A9392249B4B3692265DA10143D671F4`。

## 已执行检查

- 从锁定 SHA 重新获取源码与依赖，按序精确应用四个补丁，未使用外部 dirty checkout。
- 基线与候选 TypeScript noEmit：**0 / 0**。首次候选被 mixin 缺类型声明拦截；修正局部类型说明后重建通过。补丁 hunk 计数在合并类型说明后曾被精确应用门禁拒绝，已修正并重新完整构建，没有模糊套用。
- `bun run midi-qol:test`：**70 PASS / 0 FAIL / 272 expect 调用**；新的 Node probe 另含 native assert。执行 pinned Document.clone、dnd5e migration 与实际候选 clone，保留未打补丁负向对照，验证类型/字段/新 ID/输入不变及不相关分支委托。
- Probe 使用 capture-only document storage；不等于完整客户端 schema/hook/持久化测试。旧版本检查只证明委托分支未改，不宣称 dnd5e 5/7 完整兼容。
- 独立 Astra review：无未解决 material finding；两处旧候选/指纹测试预期已修正。
- 构建 ZIP：148 entries，manifest/id/version 校验通过。
- `midi-qol:prepare-cf`：宏语法和静态 fixture 配置检查通过；新增第六项 clone 指纹，避免前五项相同而误认已加载补丁。
- `browser-update.ts` **仅 preview**：实际 PID36368 / ServerNext 身份通过，磁盘与 HTTP 仍是 local.6；未写模块。适配该进程的 main.mjs/loopback-preload 启动方式及斜杠路径，仍要求精确实例和独占 loopback 监听。

## 候选身份

- Version：`14.6.0-beta.4338eeab.local.7`
- ZIP SHA-256：`8D02F565BC0503AB560BFAA4CCADFC146BCA55784E5D61668E1D3ADAA1B0BCA9`
- Bundle SHA-256：`1BF57FB02BCBB0C67A53CEBF38763F527DE11D872C7DB8ED5A32249871048BAC`
- `MidiActiveEffect.clone` 指纹：`73840e4f60418f7af40dde6b91449ba218ec7994725bb53be7822ef847ed5ab7`
- 文件：`foundry-modules/midi-qol/dist/midi-qol-v14.6.0-beta.4338eeab.local.7.zip`（构建产物，不入 Git）。

私有验证记录：`F:\FoundryLab\foundry-v14\evidence\server-next-migration\local7-offline-20260921`。

## 离线阶段的未完成项（历史，已被后续安装/P验收更新）

未执行 `--apply`；ServerNext 继续使用 local.6。浏览器工具明确停止 UI 操作，不能绕过。C03/C04 要在能力恢复和受控更新后正常施法验证；A–G 总清单仍有 11 个未关闭条目，临时反应设置与自有测试对象尚待正常恢复/清理。没有 commit、merge、push 或生产操作。

当前状态以本文件顶部运行时进展及`docs/plan/midi-qol-ag-acceptance-checklist.md`为准：local.7已安装，C03/C04/B04已有P运行证据；2026-09-22交接尚有六条未关闭，Z02需在新操作后再次复核。上述未安装/11项仅为离线阶段历史，不能当作当前状态。
