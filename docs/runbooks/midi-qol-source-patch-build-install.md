# 在独立工作树使用历史测试输入

历史 Midi 6.0.2/local.9 与 ServerNext 外部候选测试需要当时锁定的源码、分发文件、离线候选及对照输入。按[历史测试输入准备流程](legacy-next-test-inputs.md)准备主工作区的本地输入库后，当前 checkout 和新 worktree 自动读取它，不再需要指向旧迁移树。新检出没有这些 ignored 输入时不能宣称通过。

```powershell
$env:FVTT_LEGACY_NEXT_INPUT_ROOT = $null
bun run midi-qol:test
bun run test:classpack-next
```

定位器只重定位明确列出的 ignored 缓存路径；测试、实现、lock 和补丁仍从当前候选读取，固定提交、版本及 SHA 检查继续执行。定位器本身不写入输入；一次性准备工具需显式 `--apply`，默认只读。仍可用非空 `FVTT_LEGACY_NEXT_INPUT_ROOT` 指定经过核对的输入根，它优先于自动定位；为空时先查本 checkout 的库，再查主 checkout 的库，没有库时沿用原缓存路径。准备库的完整校验用 `bun run legacy-next-inputs:prepare -- --check`，不读取旧来源。不能把当前运行系统替代历史 6.0.2 来源；通过结论仍须注明输入与本机参考环境，不能当作未准备输入的新克隆通过。

锁定的 `0001-dnd5e6-active-effect-base-type.patch` 有原始混合换行，其完整 SHA 为 `3bfbe35bf569faaee6952fd2cb7abba67f5ead47365abe7dd987720456ffde79`。精确 Git `-text` 属性保留这些字节；不要改预期 SHA 或宽泛忽略差异来绕过来源门。

## Midi-QOL 锁定源码、补丁、构建与 ServerNext 安装

本流程只用于 Foundry 14.368 / dnd5e 6.0.2 的 `server-next`。`server-mirror` 是只读来源，工具会拒绝将它作为安装目标。

## 1. 先检查官方更新

```powershell
bun run midi-qol:upstream-check
```

结果会列出官方分支、最新 release、开放 MR 中与当前修复相关的差异，以及锁定分支是否前进。该检查是决策证据，不会改变 `upstream.lock.json`；构建始终使用锁定的完整提交 SHA。

如果官方已包含适用修复，先更新来源锁定并删除重复补丁，再运行下面全部检查。不能只根据版本号或说明文字认定问题已经修复。

## 2. 构建本地候选

```powershell
bun run midi-qol:build
bun run midi-qol:test
```

构建在仓库忽略的 `.local/midi-qol` 下重新取得锁定源码，校验 `package-lock.json` 与补丁 SHA-256，先记录未打补丁的 TypeScript 诊断，再应用补丁并比较候选诊断。补丁不能精确应用或诊断新增时停止。

真实源码回归测试读取这个锁定 checkout；首次使用须先构建准备源码，已有同一候选源码时直接运行测试即可。测试会验证源码身份、执行真实方法及逐入口负向变异，并用实际 Foundry common helper 复现 dnd5e 的缺 ID 迁移碰撞。此离线模型测试只读取固定版本文件，不连接数据库或启停服务。

构建不读取或修改 `I:\OpenCode\remote\builds\midi-qol-beta-dnd6-4338eeab`。它不会调用上游 `dev`、`clean` 或 `tag`，不会写 Foundry 数据目录。候选 ZIP 与 `build-result.json` 位于 `foundry-modules/midi-qol/dist`；`dist` 不进入 Git。

## 3. 预览安装门禁

```powershell
bun run midi-qol:install
```

默认只验证候选包和目标身份：数据根必须精确为 `F:\FoundryLab\foundry-v14\data\server-next`，世界必须是 `cor-cotn`，Foundry/dnd5e 必须为 14.368/6.0.2。30002 必须未监听，`options.json.lock` 必须不存在，且任何进程命令行都不能引用该 dataPath；无法读取进程所有权时 fail-closed。ZIP 必须只包含 `midi-qol/`，manifest ID 必须保持 `midi-qol`，解压树不得含 symlink/junction。

Windows 进程查询包含 PowerShell 启动在内最多等待 10 秒，内部 WMI 操作预算为 5 秒。超时会回收本次查询子进程并中止检查，不会把无法确认占用当成空闲；先排查系统进程查询，再重新执行预检。

ServerNext/30002 由用户管理为永久运行的共享环境。本任务不得启停或重启；E2E 使用现有服务，只操作自己标记的测试文档。完整包安装器保持停止状态门禁，不能为了安装而停止服务。候选工具当前只接受 local.7 → local.8 的独立浏览器资源入口；local.7 的 A–G/Z 35 项历史验收已关闭，local.8 的新效果创建修复仍须单独做浏览器验收。local.4 在源码审查被拒绝、未部署。旧 PID、旧 handoff 和“本轮曾启动”均不构成停止权限。

### 常驻实例的受限浏览器资源更新

```powershell
bun run foundry-modules/midi-qol/browser-update.ts
bun run foundry-modules/midi-qol/browser-update.ts --apply
```

先预览，只有明确 `--apply` 才替换资源。该入口只接受锁定 local.8 构建与已知 local.7 包之间的浏览器 bundle、source map 和版本 manifest 差异，验证真实目标与监听进程，并保留原 compendium 和世界。它不调用启停、不覆盖整个模块目录、不创建备份；检查失败停止。更新后重新核对磁盘和 HTTP 返回的 bundle 哈希及原 PID。

服务器可能继续缓存 local.7 的 manifest 版本。不要把缓存 UI 版本当作新代码已加载的证据：测试宏从候选 ZIP 生成两项 cleanup 方法、`Workflow.item/activity` getter、伤害目标渲染、附魔 clone，以及 `CONFIG.ActiveEffect.documentClass.prototype._initializeSource` 的源码指纹。getter 用属性描述符读取函数，不执行取值；local.8 必须比对新增 `_initializeSource` 指纹，否则仍加载的 local.7 会被误判为候选。分别记录候选和缓存版本，只在当前场景完成后刷新自己的标签页（控制链失联时允许恢复自己的页面，并先读回不确定操作是否执行）。该入口不适用于含服务端元数据/依赖变化的其他更新，也不是冷启动验收。

## 4. 安装到停止状态的 ServerNext

确认 dry-run 通过后：

```powershell
bun run midi-qol:install -- --apply
```

安装器先把候选解压到 ServerNext 模块目录中的本次临时 staging，再删除旧 `midi-qol` 并原地改名。它不创建备份，不修改世界数据库或模块启用配置。任一身份、端口、归档或路径检查失败即停止。

停止状态安装流程属于历史/未来协调入口，当前永久服务不执行它。历史 cold-start smoke 单独保留；浏览器资源更新后核对 ZIP、manifest、磁盘及 HTTP bundle 哈希，再进行当前 C/F 验收。真实玩法由独立 Chrome 任务执行；测试临时对象必须清理，不能用静态检查或服务器启动代替玩法结论。

### 2026-09-24 local.9 的精确离线更新边界

本次 ServerNext 迁移已获用户持续推进授权，可在共享世界没有其它操作且正常关闭后受控停/启**同一**服务；此为本次任务的具体授权，不修改上面通用安装器的停止门禁。local.9 的[只读差异预检](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/midi-local9-controlled-update-20260924/preflight-path-diff.json>)发现候选 ZIP 与安装目录的 **107 个非 pack 文件路径完全相同，只有 `midi-qol.js`、`midi-qol.js.map`、`module.json` 三项哈希不同**；但两个已安装 pack 的 LevelDB 文件路径与 ZIP 不同（候选12项、安装18项）。全包安装器会删除并替换整个模块目录，超出这个补丁的文件范围，不能用于本次 local.8→local.9 更新。运行世界时没有读取 pack 数据库内容。

先核对当前 local.8 的 manifest/bundle 哈希、local.9 锁定构建 ZIP SHA-256 `039E766D07A80C832CF610128B58C590CA438BADF2298209BA0B04E21D1AC432`、精确 PID/dataPath/world/port，并确认所有本轮 Chrome 临时对象已清理。通过正常 Foundry UI 返回 Setup；父任务独立核对 `/api/status active=false`、23个世界 `LOCK` 文件全部可独占打开，才停止精确 Node PID。服务完全停止后对安装目录全部文件做完整清单/哈希比较，尤其核对 pack 仍为原安装内容；**只**将候选三项经同目录临时文件哈希校验后原子替换，不新建备份、不删除或替换 pack。任何额外差异、链接、占用或读回失败均停下报告，不启动不完整模块。

更新后三项与候选哈希匹配、其余安装文件与原哈希一致，再按原 app/data/world/loopback 参数恢复常驻服务。分别核对磁盘/HTTP资源、当前世界模块加载、真实 Chrome 的手动 APPLY 前后 HP/临时 HP 与基础 DAE `isDamaged` 到期；带类型 `isDamaged.<type>` 仍是候选已知限制，不能因基础路径通过而提升。旧 `browser-update.ts` 仅锁定 local.7→local.8，不可用于 local.9。本段是受控现场操作边界，不是替代完整安装器的一般命令。

Chrome handoff 必须写明“服务器由用户永久运行，结束时不得停止”。执行器只清理自身临时文档；不得退出或中断其他线程使用的服务。

## C/F 已配置夹具

运行 `bun run midi-qol:prepare-cf` 生成 `dist/cf-fixture/cf-macro.json` 和同目录 `cf-macro.js`。这是测试用 Script Macro，通过 Foundry 原生 API 创建临时文档，不是正式 Actor 生成输出。

在 30002 的 GM 会话导入名为 `E2E-MIDI6-CF-20260920-Harness` 的宏，执行后按面板顺序操作：

1. **Prepare and verify**：创建被标记的两个 NPC、嵌入法术及临时 Scene；只切换本客户端 view，不全局激活 Scene。必须看到 PRECHECK PASS，核对 1 minute、Circle 30 ft、creature、120 ft、非专注、template prompt=true 与 MidiUtilityActivity。
2. **Cast and place Circle**：调用实际 `activity.use`；在画布目标 Token 附近放置圆形预览。不是直接创建模板或直接构造预期 effect。
3. **Inspect effect and links**：读回真实清理 effect 的 type、system model、duration、UUID 和全部模板 dependentOn。错误、类型为 condition 或无 effect 均记录，不以 toast 消失替代结论。
4. **Delete cleanup effect only**：只删除已验证唯一关联的 base effect，等待并核对对应 Region/Template 是否由真实依赖实现删除。夹具不帮这一步删除 Region，因此不会伪造 cascade PASS。
5. **Export evidence JSON**，然后 **Cleanup owned fixture**，再导出清理后报告。面板同时提供 Troubleshooter 入口。构造器探针只作模型诊断，不计 C/F 通过。

宏不修改任何全局 Midi 设置、不重写 prototype/Workflow、不停止服务。若前置条件不符或执行失败，保留诊断，使用清理按钮删除标记对象；实际临时文档准备和读回必须单独记录，不能把生成测试输入称为运行时准备完成。

## 5. 结果边界

- `midi-qol:test`：锁定源码方法行为、迁移碰撞对照、夹具前置校验及安装拒绝路径；不能代替真实 model/cascade 验收。
- `midi-qol:build`：来源、补丁、类型诊断和打包可重复。
- dry-run：候选包及停止状态 ServerNext 身份可安装。
- 冷启动 smoke：服务器能加载世界和模块。
- Chrome A–G：攻击、法术、DAE、专注、反应、模板及 Console 的真实行为。

每一层分别记 `PASS`、`FAIL` 或 `NOT_EXECUTED`。本流程不包含 commit、merge、push、公开发布或远程生产回迁。

当前总验收入口为 [A–G 打钩清单](../plan/midi-qol-ag-acceptance-checklist.md)。每次派发列出固定测试编号、已过不重测和未执行项；父方复核原始证据后打钩。2026-09-21 用户单独授权的服务故障恢复已完成，这不授权执行器在日常 E2E 中启停共享服务。
