# 血猎手 2024 独立 Foundry 模块

`fvtt-blood-hunter-2024` 是 Foundry Virtual Tabletop `14.364`、dnd5e `5.3.3` 的独立模块，版本为 `1.0.0`。它提供三个 Item compendium pack：`classes`、`subclasses`、`features`。模块不依赖 Plutonium 或 classpack；MIDI-QOL `14.0.11` 与 DAE `14.0.12` 只是推荐依赖，不是硬依赖。

## 构建

构建必须使用已经接受的 `BloodHunter2024` enriched source JSON 的原始 UTF-8 bytes：

```powershell
bun run build:blood-hunter-v14 --source="C:\absolute\path\BloodHunter2024.json"
```

`--source` 必须是绝对路径。构建脚本只通过 `packages/blood-hunter-v14/src/index.ts` 的公开接口调用编译器，先把 raw bytes 交给编译器，再由公开 validator fail-closed。它不会复制编译器的匹配规则、ledger schema 或 Effect/Activity 生成逻辑；每次都以编译器返回的 `logicalHash` 为准，因此 coverageLedger 的语义修正会自然进入新构建。

每次构建在随机临时根内完成两份候选结果：三份 LevelDB Item pack、canonical package、migration contract、coverage ledger、review、identity manifest 和确定性 ZIP。构建会比较两次结果的文档/UUID、manifest、logical identity、pack index、Activity/Effect 引用，并递归检查整个编译结果中的 12 个 dnd5e 外部 Item UUID（7 equipment、1 Boon、4 fighting styles）。缺少任何 UUID，或锁定的 `dnd5e/5.3.3/repo/packs/_source` reference cache 缺少对应 document，都会失败。Effect change 的 mode 等语义由最终编译器输出负责，模块只序列化输出。

构建成功后才会把结果原子发布到本目录的 `dist/`：

- `dist/module/`：可安装模块树；
- `dist/fvtt-blood-hunter-2024.zip`：ZIP 及其 SHA-256；
- `dist/module/data/identity-manifest.json`：source SHA-256、编译器 logical hash、81 documents、94 ledger、117 Activities、UUID 清单；
- `dist/module/data/migration-contract.json`：浏览器迁移使用的 canonical/migration 契约。

`dist` 不是运行中 Lab 的 pack；构建不会原地写 Lab 世界或运行中的 compendium。

## Lab 安装与验证

Lab CLI 只允许配置后的本地 `FVTT_OPS_LAB_ROOT`，目标严格为：

```text
<FVTT_OPS_LAB_ROOT>/data/server-mirror/Data/modules/fvtt-blood-hunter-2024
```

示例：

```powershell
bun run foundry-modules/fvtt-blood-hunter-2024/labCli.ts dry-run
bun run install:blood-hunter-v14
bun run install:blood-hunter-v14 --apply
bun run verify:blood-hunter-v14-install
```

CLI 会拒绝生产/远程变量、8080、路径逃逸、symlink/junction/reparse、LevelDB `LOCK` 或占用目标。已有同 ID 目录必须带本模块的 `data/owned-marker.json` 才能替换；foreign same-ID 目录会停止。替换前把旧目录移动到配置的 backup root，stage 通过完整 hash、manifest、pack documents/index 检查后再原子替换，并在失败时尝试恢复 backup。

`verify-install` 只报告字节、manifest、LevelDB documents/index 和 identity 一致性；它不启动 Foundry、不启用模块，也不冒充真实 runtime 或游戏性 E2E。构建/测试只使用随机临时 Lab 根和配置的只读 `classic-level` 入口，不把真实 `F:\FoundryLab\foundry-v14` 的 app/data/world 当作数据库写入。

Foundry Ops 的公开只读证据入口使用：

```powershell
bun run foundry:ops lab blood-hunter-v14 plan --input="C:\absolute\matrix-plan-input.json"
bun run foundry:ops lab blood-hunter-v14 verify-actor --input="C:\absolute\actor-snapshot-input.json"
```

还支持 `inspect`、`verify-migration` 与 `evidence-manifest`。这些动作只读取显式 JSON 并返回验证结果，不启动 Foundry、不写世界，也不会把 pack/API 探针提升为 E2E PASS。

## 迁移 UI

模块在 `init` 阶段只注册 GM-only 菜单，不在 `ready` 自动扫描 Actor，也不自动修改任何 Actor。菜单标题是“血猎手 2024：角色迁移”。

1. GM 明确输入 Actor ID 或精确名称后点击 `Preview`。Preview 只读，不写 Actor。
2. flags `fvttJsonGenerator.bloodHunter2024.canonicalId` 优先；没有 flags 时，只有 `source + class/subclass + level + normalized name` 全部严格相等才使用 legacy match。多候选、重复 canonical 或歧义会停止。
3. 点击 `Create migrated copy`，模块通过 Foundry 公共 Actor Document API 创建迁移副本，并生成 Actor JSON backup；副本通过非血猎手投影、选择/消耗、重复和 Activity/Effect 引用检查后，才允许下一步。
4. `Apply original` 需要已有副本、通过副本验证、JSON backup，以及输入与 Actor 名称完全相同的确认文字。冲突逐项选择 `Keep`、`Overwrite` 或 `Cancel`；关闭窗口等同 `Cancel`。任何未决冲突都不能 Apply。

迁移只原位更新唯一匹配的 Blood Hunter Item，并补充编译契约明确的固定授予；不按名称批量删除，不改 HP、Actor system、职业等级、spent uses、已选 advancement、非 Blood Hunter Item 或其他 flags。Activity/Effect/说明冲突默认暂停。Apply 通过公共 Document API 完成；失败会用 Apply 前 JSON/Actor snapshot 补偿回滚，禁止直接写 LevelDB。

Callum 的旧“破晓血仪” fixture（0 Activity、0 Effect）覆盖 Preview、迁移副本、Apply 和 rollback：原 Actor 在 Preview/副本阶段保持不变，副本应得到 5 Activity、2 Effect。

## 自动化边界

- **Core**：Foundry/dnd5e 原生 class、subclass、advancement、Activity/Effect 结构；不要求 MIDI-QOL 或 DAE。
- **Modded**：可利用推荐的 MIDI-QOL `14.0.11` / DAE `14.0.12`，但模块不会把它们当作硬依赖，也不会把未验证效果宣称为原生自动化。
- **assisted**：需要 GM/玩家按规则确认的跨 Item、目标条件、休息或选择流程；ledger/review 中会保留边界。
- **external-rule**：依赖外部规则或外部 compendium UUID 的部分；identity manifest 会保留 12 个 dnd5e UUID，缺引用即 fail-closed。

这是一次构建快照，不是实时同步：安装后不会监视远程 homebrew、旧 side-data 或 Actor 变化。旧 side-data 只作为迁移识别/审查的历史输入，不是权威规则来源；权威来源是本次 raw source 与公开编译器输出。线上生产 Foundry（8080）不在本任务部署范围内，也不会由本模块 CLI 触碰。
