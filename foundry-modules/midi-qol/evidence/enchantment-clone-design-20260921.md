# 附魔 clone 兼容修复设计（尚未实施）

batch6M/c-enchant-diagnostic.json 已确认：正常 enchantment source 在 native Document.clone 默认删 ID 后，被 dnd5e 6.0.2 的 `_initializeSource` 误判为 condition。九条 Monks Little Details status entries 缺 `_id`，与 clone 的 undefined ID 相等；preApplyEnchantment Hook 看到的数据已经错误，不能在此 Hook 全局改类型来掩盖。

拟实施独立 patch 0004 / local.7，仅在 Midi 现有 `MidiActiveEffect` 子类中加窄范围 clone override：dnd5e 6、源类型 enchantment、调用数据明确带 enchantmentProfile、caller 未要求 keepId 时，为这次原生附魔应用 clone 生成新 ID，并以 keepId:true 交给 super.clone。保持 native applyEnchantment 的验证、changes、hooks、create 流程，不复制整个原生方法；不修改 Foundry/dnd5e prototype，不修改状态名单，不把 enchantment 改 base。

实施前仍须验证 nested/dotted flags 输入和 context 语义；正常 clone、显式 keepId/save、其他类型、原 source ID 以及旧版本行为不能被误改。只有 ID 防护，不覆盖调用者类型。该设计尚未作为最终补丁批准，父方负责实现取舍与独立审查。

测试应执行真实 pinned Document.clone 和 dnd5e migration 路径，使用现有 actual-source harness。包含复现原失败的去补丁负向对照、九条 ID-less status、定义了 ID 的合法 condition 迁移、enchantment 类型保留、源 profile ID 不变、flags/changes/dependency 保留。再做锁文件/patch精确应用、baseline/candidate typecheck、构建/ZIP、测试和 Astra review；C03/C04 最后真实 E2E。不能以此设计或静态绿色勾选 C03。

父方在派发 batch6N 前先完成服务恢复。batch6N 只测独立缺口及恢复/清理；不要求执行器做源码设计。后续源码实施可重新建立测试 fixtures，不为保留失败现场无限期留下临时设置。
