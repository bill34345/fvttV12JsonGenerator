# R02：音频退役与旧 AmbientSound 清理

本批只验证当前音频退役契约、媒体资源和旧声音清理；不为 B08 的已退役听音要求制造新 PASS，也不重跑 B11、B12 或 SQ-011。

## 前置

- 使用精确 Foundry `14.364` / dnd5e `5.3.3`、Square、Hex Rows、Hex Columns 新场景。
- GM 使用命令行 Chrome，玩家使用独立 Codex in-app Browser；保存两端 console/network、玩家画面和 GM 文档/API。
- 安装包检查必须先确认六个 WebM、零个 OGG、无 `assets/audio`，并记录构建 ZIP 哈希。

## 新场景 Case

1. 在三种网格分别覆盖 P0、P0+P1、P0+P2、P0+P1+P2，以及 fire/frost/brambles 两阶段。
2. P2 开启时确认动画和 fire clustered lights 正常；每次新绘制的 owned `AmbientSound` 数量为零。
3. 两端 network 中不得出现 Battlefield Painter 音频请求；玩家不得听到 Battlefield Painter 音频；其他 Foundry 音频不作为本模块操作目标。
4. P2 关闭时确认静态 WebP、既有 P0 行为和零声音结果不回归。

## Legacy cleanup Case

构造同时含模块 owned `AmbientSound` 和 foreign `AmbientSound` 的旧场景：

- 初始 warning 和 audit 只统计 owned legacy sound。
- DialogV2 cancel 不删除任何声音。
- 确认前加入/删除目标造成 fingerprint 变化时，stale 检查拒绝执行。
- 确认后只删除当次 fingerprint 中仍由模块拥有的 ID，foreign sound 保留。
- undo/redo、erase、stage switch、clear 不得恢复已清理的旧声音；clear 仍只按 ownership 计数。

## 通过门槛

- 六个 WebM 可加载，零 OGG，零新 owned AmbientSound，零模块音频请求。
- 动画、clustered lights、阶段切换、clear 和 foreign-document 保护继续通过。
- legacy cleanup 不删除 foreign、不绕过 stale fingerprint、不进入 SceneHistory。

## 停止条件

出现音频请求、自动删除、foreign 误删、旧声音被 undo/redo 复活、动画/光源回归或跨客户端不一致时，冻结证据并停止本批。

## 运行结果 — 2026-08-16

**PASS。** 安装包核对为六个 WebM、零 OGG、无 `assets/audio`。干净 Square 场景逐一覆盖 fire/frost/brambles 两阶段，动画、聚类灯光、区域/成熟荆棘墙继续生成，owned `AmbientSound` 恒为 0；Square、Hex Rows、Hex Columns 的 P0-only、P0+P1、P0+P2、全阶段抽样同样均为零声音，且分别得到预期 WebP/WebM 与 P1 预览行为。GM/玩家新场景网络窗口未出现 Battlefield Painter 音频请求。

旧声音 fixture 通过了 GM-only 一次性 warning、DialogV2 cancel、stale fingerprint 拒绝、confirm 只删 owned、foreign 保留，以及 erase/stage/undo/redo/clear 不复活旧声音。一次未先核对 `canvas.scene.id` 的探索脚本误落笔被立即停止并按精确 bundle ID 清除；B12 最终文档 ID、计数和 foreign survival 与运行前一致（Foundry 的 Scene `_stats.modifiedTime` 因公共 Document API 写入而前进，未直接编辑 LevelDB 或元数据）。所有临时场景均已清理，B11/B12/SQ-011 未被本批降级。
