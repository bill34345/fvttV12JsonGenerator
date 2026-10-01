# ServerNext Species 候选（Foundry 14.368 / dnd5e 6.0.2）

状态：**STATIC_CANDIDATE / SOURCE_ACCEPTED / BUILD_VERIFIED / INSTALLED / RUNTIME_PARTIAL**。正式来源已接受，独立新目标包已构建、校验并在世界关闭时离线装入 ServerNext，10个文件与构建逐个匹配；模块在游戏中单独启用并重载读回。临时人物已显示大型、40尺移动、60尺黑暗视觉、0级四项特性及护甲8；1级生命值向导显示基础12+种族3=15，整页重载后角色卡仍为15/15。5级能力、次数与长休恢复尚未执行，不能据此宣告全项通过。

2026-09-25 更新：[食人魔来源逐项核对](server-next-ogre-source-review-20260925.md)已完成，种族、五项特性、等级赠予、唯一附赠动作能力、生命值/护甲加值和主持人手动处理边界均与来源对应；专项 41 项测试通过。首次正式调用因本机审查桥未运行失败；桥恢复后正式运行 `species-20260925132446-5bf870e5` 得到 `accepted`，零审查问题，自动产生 schema v2 新目标记录与正式 JSON。根脚本两次确定性构建、ZIP 与 Compendium 回读校验通过。

以 ServerNext 已安装的 dnd5e `6.0.2` `dnd5e.mjs`（SHA-256 `E9570927A215948FB3A3923A322C7BBF1455009565F48813168EDD8C6DF4890F`）和本地 Foundry `14.368` 的 `common/data/active-effect.mjs`、`common/documents/active-effect.mjs` 为目标源码：Race `MovementField` 使用 `movement.speeds.*`，`SensesField` 使用 `senses.ranges.*`，Advancement 使用 `name`，Activity 使用 `effects` 而非旧 `appliedEffects`。Feature 的两类原生加值 Effect 直接使用 14.368 的 `start`、`duration.value/units/expiry/expired` 和 dnd5e 6 的 `system.changes`；每条 change 有稳定 `_id`、`type: "add"`、`phase: "initial"`，不依赖旧顶层 `changes.mode` 或旧 `duration.startTime` 的迁移兼容逻辑。新投影只在明确目标 `fvttVersion: '14.368'` 下应用这些形状；既有 `14` 和 `12` 的投影保持原样。

当前 Ogre 来源 `input/species/ogre.md` 的 Markdown SHA-256 为 `7243c8e4470efa2830d40c1e0e29b64155f6e8f7066d0121c387891f9871dfb7`，来源 SHA-256 为 `6b2374257353ee7d013d826c31ef57b9aca6c5a15677356a228ed12b1bd76d94`。schema v2 账本分别保存旧 `14` 和新 `14.368/core/2024` 的接受记录；新目标正式 JSON logical hash 为 `ce06c1c503b2c0e69416414449467655e0299a9c27ccecbfbe9a85e67d7aad41`，不能把旧目标结论跨版本复用。模块 aggregate logical hash 为 `56259032a319d4fe062d29a3dfa4a128b8087502507b125fd993d40c9186dd8f`，ZIP SHA-256 为 `967f3326d056c2dce1d538be207dee253c2e4e5b3b27980427e300c072849291`。

来源与正式新目标 JSON 已逐项对照：Giant / Large、步行40尺、黑暗视觉60尺；五个特性分别保留巨武器的 GM 辅助边界、身强力壮的描述项、5级附赠动作脱困2次/长休、每级生命值上限+3、AC−2及倒地站起由GM处理。Level 0 的四项 Feature grant 和 Level 5 的一项 grant 指向同一模块 features pack；限定使用次数由 Item 消耗，HP/AC 由原生 Effect 变化表达。正式文件与同 Markdown 重新生成的投影完全一致，旧目标文档 ID 保持不变。ServerNext临时人物已通过界面加入食人魔，看到Large、40尺、60尺、四项0级特性和AC8；HP升级向导显示基础12+种族3=15，角色页整页重载后也为15/15，生命值定点行为通过。

剩余门禁：ServerNext已在世界关闭时单独安装并启用这个候选，原生添加种族、等级0四项赠予、护甲8及1级生命值15/15整页重载已有界面读回；等级5赠予、2次使用与长休恢复仍待单独验收。本轮临时角色`CodexTemp-Species-20260925-2148`暂保留，后续清理须按用户选择。此前的静态构建不代表所有游戏内行为通过。现有 Mirror 安装器拒绝 `static-candidate`，本轮没有使用它。

## 2026-10-01：6.0.5 运行时兼容范围

原始来源审查、Markdown 投影、accepted ledger 和 compendium document identity 仍固定为 Foundry `14.368` / dnd5e `6.0.2`。本次只让 Next manifest 的 dnd5e `maximum` 可明确设为 `6.0.5`，并要求 `minimum`、`verified` 和 identity 继续显示 `6.0.2`；不新增 6.0.5 接受记录，也不重建或替换服务器中现存的两个 pack。使用显式构建参数时，构建器可从现存 accepted documents 生成可复现候选供静态校验，但重建的 LevelDB 物理文件不作为安装来源。服务器恢复时只读核验保留 pack 的索引、Item 模型与 UUID，再单独记录 6.0.5 的正常客户端启用与读回结果；其证据不能扩大既有角色升级、次数或长休行为范围。
