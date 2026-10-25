# 模块与子计划索引

总入口：[总计划](PLAN.md)；当前进度与下一步：[执行总账](EXECUTION_LEDGER.md)；实施共同约定：[MODULE_CONTRACT](MODULE_CONTRACT.md)。

下表是 2026-10-11 对已提交 `3734eb2` 加本任务候选的只读盘点。它登记 owner 和计划去向，不是一份“全部可售/全部兼容”的清单。完整版本范围与接受必须看模块子计划、实际 runtime gate 和[支持矩阵](../../acceptance/current-support-matrix.md)。

## 一、新增的合集入口

| owner / 技术工作名 | runtime ID | 作用 | 子计划 |
| --- | --- | --- | --- |
| `fvtt-suite-console` | `fvtt-suite-console` / 0.3.0（H4候选，未合并） | H4本地双交付/Foundry更新页限定接受；离线视觉与原恢复审计边界保留 | [统一操作手册](modules/fvtt-suite-console.md) |

## 二、本项目维护的 15 个功能模块

目录名不总等于 Foundry ID。表中的版本是当前源码包版本；目标构建变体与历史运行证据另行核对。内容模块是否可商业分发需单独确认，不由“本项目维护”推导所有来源版权。

| owner 目录 | 稳定 runtime ID | 包版本 | 实际协作/去向 | 子计划 |
| --- | --- | --- | --- | --- |
| `open-session-deck` | `open-session-deck` | 0.2.0 | D1/D2和606 GM代表链/普通重载/恢复接受；玩家/失效UUID等边界保留 | [Deck](modules/open-session-deck.md) |
| `fvtt-trigger-engine` | `fvtt-trigger-engine` | 0.2.0 | T1/T2与T3退订修复已装；606正常首次保存/单GM事件/重载/恢复接受，CC/WMP消费者待验 | [Trigger Engine](modules/fvtt-trigger-engine.md) |
| `fvtt-custom-conditions` | `fvtt-custom-conditions` | 0.2.0 | C1/C2/C3的606单GM状态/伤势/IFS当前episode代表链及恢复接受；完整组合不推广 | [Custom Conditions](modules/fvtt-custom-conditions.md) |
| `fvtt-weapon-mastery-properties` | `fvtt-weapon-mastery-properties` | 0.1.0 | 硬依赖CC/TE，Next还有明确能力/Midi门 | [Weapon Mastery](modules/fvtt-weapon-mastery-properties.md) |
| `fvtt-injury-fading-spirits` | `fvtt-injury-fading-spirits` | 1.1.0 | 复活owner；与CC双向可选公开API | [Fading Spirits](modules/fvtt-injury-fading-spirits.md) |
| `fvtt-selected-token-sync` | `fvtt-selected-token-sync` | 0.2.0 | 独立HUD同步；与multistatus冲突时阻断 | [Token Sync](modules/fvtt-selected-token-sync.md) |
| `fvtt-json-forge` | `fvtt-json-forge` | 0.5.0 | browser-runtime/protocol消费者；保护当前Forge工作 | [Forge](modules/fvtt-json-forge.md) |
| `monster-spell-resolver` | `fvtt-json-generator-spell-resolver` | 0.1.7 | 便携法术契约消费者，不要求Forge模块启用 | [Spell Resolver](modules/monster-spell-resolver.md) |
| `fvtt-battlefield-painter` | `fvtt-battlefield-painter` | 0.3.0-alpha.2 | 独立场景事务；没有现成Forge/Resolver模块依赖 | [Painter](modules/fvtt-battlefield-painter.md) |
| `chat-memory-guard` | `chat-memory-guard` | 1.1.0 | 独立客户端渲染/cache策略 | [Chat Guard](modules/chat-memory-guard.md) |
| `session-monitor` | `fvtt-session-monitor` | 1.1.2 | 浏览器模块与可选Companion组成一项功能 | [Session Monitor](modules/session-monitor.md) |
| `fvtt-house-rules` | `fvtt-house-rules` | 0.1.3 | 房规与可选系统/Midi/DAE适配 | [House Rules](modules/fvtt-house-rules.md) |
| `fvtt-babele-rolltable-embed-translation` | `fvtt-babele-rolltable-embed-translation` | 0.2.1 | 硬依赖Babele/libWrapper | [Embed Translation](modules/fvtt-babele-rolltable-embed-translation.md) |
| `fvtt-homebrew-species` | `fvtt-homebrew-species` | 1.0.0 | 纯内容，公开Species投影消费者 | [Species](modules/fvtt-homebrew-species.md) |
| `fvtt-blood-hunter-2024` | `fvtt-blood-hunter-2024` | 1.0.0 | 内容与显式迁移分开；旧备份路径不直接运行 | [Blood Hunter](modules/fvtt-blood-hunter-2024.md) |

## 三、外部适配 owner，各有独立计划

| 目录 | runtime 身份 | 归属与发行边界 | 子计划 |
| --- | --- | --- | --- |
| `midi-qol` | 上游 `midi-qol` | 精确源码/补丁工具；local.9锁与local.10接受分开，不作为自有商品 | [Midi适配](modules/midi-qol.md) |
| `server-next-external-candidates` | 没有单一ID | classpack/DAE/icons/item-piles/vision等逐来源登记；候选不是已接受商品 | [外部候选](modules/server-next-external-candidates.md) |

## 四、支撑工作流

| 工作流 | 负责什么 | 子计划 |
| --- | --- | --- |
| 共享生成与契约 | parser/generation/workflows、browser-safe接口、便携spellManifest和V14默认迁移 | [共享生成核心](workstreams/shared-generation.md) |
| CLI/Web/Companion | 用户执行宿主、job/下载、可选AI连接，不复制业务规则 | [应用与Companion](workstreams/apps-and-companion.md) |
| 发行与运维 | 逐模块artifact、合集目录、渠道/品牌迁移、必要整合检查 | [发行与运维](workstreams/release-and-operations.md) |

共计：1 个总计划，18 个模块/owner 子计划（含1个拟新增入口、15个维护功能、2个外部适配owner），3 个支撑工作流子计划。没有为现有每个小功能新建mod，也没有强迫纯内容模块加入运行时代码。
