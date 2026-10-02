# 36 个退役对象取证与首批遗留整合候选

日期：2026-10-02。结论：**有限取证与可审阅候选已准备；未提交、合并、推送、部署或继续删除。不是全部旧内容无损 PASS。**

## 本轮基线、授权与取证方法

- 从新聊天独立读当前根说明、worktree runbook、Git 和验收原件。开始时主工作区／索引为空，master 与本地 origin/master 为 `61974058f1af4e0f70fc675a0c856cae07d99a8f`。`git ls-remote origin refs/heads/master` 实时核对收到 GitHub HTTP 403／account suspended；不能用本地缓存证明远端当前 HEAD。
- 新候选：`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261002-101841-retirement-integration`，分支 `codex/20261002-101841-retirement-integration`，从上述已提交 master 建立。旧树均为只读来源。未写 ServerNext 主线或 next-605-restore，未操作任何 Foundry／Chrome／生产服务。
- 原库存及精确删除计划位于 `H:/CodexData/visualizations/2026/10/01/01a0f679-cb27-7e81-82bb-84fd4a8d37fd/worktree-audit-20261002/inventory.json` 与 `worktree-cleanup-20261002/plan.json`／`receipt.json`。对象由这三者对齐，不按目录名、日期或旧 category 判废。
- 移动索引：`F:/FoundryLab/foundry-v14/evidence/worktree-retirement/20261002-06054e6e-640e-44d8-a119-d7bc97990921/relocation-index.json`。本轮重新读回列明的 542 文件，SHA-256 全部匹配。历史原件中的旧绝对路径不修改，按索引解析。
- 本轮脚本与完整机械结果：`H:/CodexData/visualizations/2026/10/02/01a0fa67-2bb8-7e93-bed9-ce2b29452f7d/retirement-readback.py`／`retirement-readback.json`。脚本直接验证 Git 祖先、refs、当前文件和移动原件。旧 re-audit 仅提供候选 blob／路径定位；每个候选重新 `cat-file` 或读取文件计算 SHA，并用当前 `rev-list --objects --all` 核可达性。未重跑旧脚本，未以旧报告 verdict 作结论。
- Windows 长路径须用 extended path 读取；五个超过普通路径限制的原件最初未被普通 Path 判为文件，改用 extended path 后五件均读回且哈希匹配。这是工具路径问题，未记录成缺件。

## 分层收尾结论

36 个对象的 35 个历史 HEAD 在 master 祖先链中；Painter 的 `5e7455db...` 不在主线，但原分支仍持有其七个独有提交。分支和 Git 对象只保护已提交内容。

94 项删除前 dirty 记录中：22 项原字节仍在当前 master 同路径；通过其他保留工作树／可达 Git blob 等定位重新核验，合计 42 项原字节可定位，另 2 项可从可达 blob 证明 LF／CRLF 等价。余下 50 项在本轮有界范围内不能完整重建原版本。该数字不包括未作文件库存的 ignored 目录，也不表示 50 项永久丢失。

后继语义保留与旧字节保留分开：当前实现和有效规范可用明确接口、代码和测试定位；不能据此推断旧稿没有独有增量。所有不匹配项保持未验证。生成说明与旧 HTML 是附带未验证项，不作为主要业务恢复对象。

## 36 对象逐项台账

表中“提交保留”仅指 Git 层；“原字节／行尾等价／未验证”针对删除前 dirty 记录。ignored 数量是有界路径条数，既不证明已保留，也不是无价值判定。所有完整路径、HEAD、dirty 哈希、候选位置和 ignored 根保存在机械 JSON。

| 对象 | 历史 HEAD | 提交保留 | dirty 原字节／行尾等价／未验证 | ignored 路径／已移动文件 | 收尾状态 |
|---|---|---|---|---|---|
| 1. `aab4/fvttV12JsonGenerator` | `b0396c3b6f39` | master 祖先 | 0／0／0 | 0／0 | 有证据保留（提交层及列明原件） |
| 2. `d42e/fvttV12JsonGenerator` | `91435d1f5bbd` | master 祖先 | 0／0／0 | 40／0 | 有证据保留（提交层及列明原件）；未列明 ignored 原字节不作 PASS |
| 3. `e258/fvttV12JsonGenerator` | `63bc9c15572c` | master 祖先 | 0／0／0 | 0／0 | 有证据保留（提交层及列明原件） |
| 4. `20260814-092014-battlefield-painter-runtime-acceptance` | `5e7455db6b15` | 原分支持有，非 master 祖先 | 0／0／0 | 46／16 | 发现有效缺口并补回（英文说明正例）；其他提交由分支保留；未列明 ignored 原字节不作 PASS |
| 5. `20260820-095325-species-v12-candidate` | `8451d1d06c36` | master 祖先 | 17／0／11 | 36／8 | 有证据保留（提交层及列明原件）；原版本无法完整重建、保持未验证；未列明 ignored 原字节不作 PASS |
| 6. `20260821-210609-forge-fvtt-module-plan` | `997e76fd126a` | master 祖先 | 1／0／0 | 0／0 | 有证据保留（提交层及列明原件） |
| 7. `20260822-010024-forge-protocol-task-a-review-fixes` | `3d16388089f1` | master 祖先 | 0／0／7 | 45／8 | 有证据保留（提交层及列明原件）；原版本无法完整重建、保持未验证；未列明 ignored 原字节不作 PASS |
| 8. `20260822-150000-forge-fvtt-product` | `925377eb97d5` | master 祖先 | 0／0／0 | 6／0 | 有证据保留（提交层及列明原件）；未列明 ignored 原字节不作 PASS |
| 9. `20260822-150300-forge-fvtt-actor-task-b` | `e9a9cc0fa5e6` | master 祖先 | 0／0／6 | 52／8 | 有证据保留（提交层及列明原件）；原版本无法完整重建、保持未验证；未列明 ignored 原字节不作 PASS |
| 10. `20260823-231637-open-session-deck` | `333c23ca0614` | master 祖先 | 0／0／0 | 37／4 | 有证据保留（提交层及列明原件）；未列明 ignored 原字节不作 PASS |
| 11. `20260824-021316-forge-fvtt-intake-task-d` | `7cea7c15e321` | master 祖先 | 0／0／7 | 52／8 | 有证据保留（提交层及列明原件）；原版本无法完整重建、保持未验证；未列明 ignored 原字节不作 PASS |
| 12. `20260826-001451-moonshark-json` | `8451d1d06c36` | master 祖先 | 5／0／9 | 43／8 | 有证据保留（提交层及列明原件）；原版本无法完整重建、保持未验证；未列明 ignored 原字节不作 PASS |
| 13. `20260830-134745-forge-fvtt-task-e-review-recovery` | `91d87dd256b4` | master 祖先 | 0／0／0 | 47／4 | 有证据保留（提交层及列明原件）；未列明 ignored 原字节不作 PASS |
| 14. `20260830-165605-forge-fvtt-task-e2-source-library` | `925377eb97d5` | master 祖先 | 0／0／0 | 47／4 | 有证据保留（提交层及列明原件）；未列明 ignored 原字节不作 PASS |
| 15. `20260830-211947-forge-release-closure` | `60f164f82c62` | master 祖先 | 0／0／0 | 52／4 | 有证据保留（提交层及列明原件）；未列明 ignored 原字节不作 PASS |
| 16. `20260906-155332-project-robustness` | `3d7c332a2188` | master 祖先 | 0／0／0 | 56／8 | 有证据保留（提交层及列明原件）；未列明 ignored 原字节不作 PASS |
| 17. `20260908-184831-aseprite` | `3d7c332a2188` | master 祖先 | 0／0／0 | 1／0 | 有证据保留（提交层及列明原件）；未列明 ignored 原字节不作 PASS |
| 18. `20260912-131540-offline-handbook` | `63bc9c15572c` | master 祖先 | 0／0／0 | 28／7 | 有证据保留（提交层及列明原件）；未列明 ignored 原字节不作 PASS |
| 19. `20260913-020729-astra-instructions` | `d1e8fc4877e2` | master 祖先 | 0／0／0 | 27／0 | 有证据保留（提交层及列明原件）；未列明 ignored 原字节不作 PASS |
| 20. `20260921-conditions-master-integration` | `8c8bad682b7c` | master 祖先 | 0／0／0 | 45／3 | 有证据保留（提交层及列明原件）；未列明 ignored 原字节不作 PASS |
| 21. `20260922-102836-paid-module-evaluation` | `e2739f0d507c` | master 祖先 | 0／0／0 | 0／0 | 有证据保留（提交层及列明原件） |
| 22. `20260922-134014-condition-hud-localization` | `e8604d64e48b` | master 祖先 | 0／0／0 | 47／1 | 有证据保留（提交层及列明原件）；未列明 ignored 原字节不作 PASS |
| 23. `20260928-103500-module-delivery-audit` | `e8604d64e48b` | master 祖先 | 8／2／2 | 0／0 | 有证据保留（提交层及列明原件）；原版本无法完整重建、保持未验证 |
| 24. `20260930-104207-development-feedback` | `312f394ccfca` | master 祖先 | 0／0／0 | 31／38 | 有证据保留（提交层及列明原件）；未列明 ignored 原字节不作 PASS |
| 25. `20260930-122735-acceptance-next-vm` | `7dfe173cefe7` | master 祖先 | 0／0／0 | 31／18 | 有证据保留（提交层及列明原件）；未列明 ignored 原字节不作 PASS |
| 26. `20260930-142313-acceptance-next-vm-runtime` | `e5c3dd66e963` | master 祖先 | 0／0／0 | 31／39 | 有证据保留（提交层及列明原件）；未列明 ignored 原字节不作 PASS |
| 27. `20260930-222439-feedback-handoff` | `cf52e4b8330d` | master 祖先 | 0／0／0 | 30／21 | 有证据保留（提交层及列明原件）；未列明 ignored 原字节不作 PASS |
| 28. `20260930-225855-dlc-pack-preparation` | `4029e425156d` | master 祖先 | 0／0／0 | 30／20 | 有证据保留（提交层及列明原件）；未列明 ignored 原字节不作 PASS |
| 29. `20261001-000036-acceptance-dlc-trial` | `072b50a37856` | master 祖先 | 0／0／0 | 30／64 | 有证据保留（提交层及列明原件）；未列明 ignored 原字节不作 PASS |
| 30. `20261001-023802-acceptance-v1-verification-report` | `0b0c75a0e9d3` | master 祖先 | 0／0／0 | 30／1 | 有证据保留（提交层及列明原件）；未列明 ignored 原字节不作 PASS |
| 31. `20261001-095633-acceptance-v1-closeout` | `5a6abfff0390` | master 祖先 | 0／0／0 | 30／8 | 有证据保留（提交层及列明原件）；未列明 ignored 原字节不作 PASS |
| 32. `20261001-101954-acceptance-v1-evaluation` | `0c729814b2f7` | master 祖先 | 0／0／0 | 30／12 | 有证据保留（提交层及列明原件）；未列明 ignored 原字节不作 PASS |
| 33. `20261001-110849-dlc-skill-repair` | `d411c75cca9b` | master 祖先 | 0／0／0 | 30／43 | 有证据保留（提交层及列明原件）；未列明 ignored 原字节不作 PASS |
| 34. `20261001-133211-master-docs-review` | `053a592b940d` | master 祖先 | 0／0／0 | 1／0 | 有证据保留（提交层及列明原件）；未列明 ignored 原字节不作 PASS |
| 35. `20261001-142408-dnd5e-version-policy` | `053a592b940d` | master 祖先 | 7／0／4 | 2／5 | 有证据保留（提交层及列明原件）；原版本无法完整重建、保持未验证；未列明 ignored 原字节不作 PASS |
| 36. `20261001-230000-next-master-sync` | `61974058f1af` | master 祖先 | 4／0／4 | 1／182 | 有证据保留（提交层及列明原件）；原版本无法完整重建、保持未验证；未列明 ignored 原字节不作 PASS |

## 重点业务与规范取证

### Species V12

删除前 28 项 dirty；当前同路径原字节 6 项，连同保留树／可达对象定位共 17 项可核原字节；11 项原版本仍未验证，详见附表。既有 V12 projector、static-candidate 测试与支持记录能证明当前能力存在，不能反向证明旧 28 项增量完整。

八份 `.local/species-intake-runs/species-20260820020146-7adcfa43/` 原件已移动，包含 source、manifest、IR、candidate package 与审阅材料，全部 hash 读回。旧 `document-runs` 未见于移动索引；未作字节库存的 dist／依赖也不以 ignored 自动判废。本轮没有找到可机械复原且明确仍缺的业务 hunk，未造一份猜测的 Species 补丁，也未重生成假装恢复原版本。

### Moonshark

删除前 14 项 dirty；当前同路径原字节 3 项，其他候选定位后共 5 项原字节有证据，9 项旧版本未验证。tracked 月鲨来源、相关动态伤害路径及较新 project-robustness 回归在 master；有些文件是后继能力保留，不能称旧未提交补丁逐字相同。

八份 audits 原件已移动且 hash 相同。旧 ignored `moonshark__月鲨.json` 未记录旧哈希、未移入索引，当前同路径不存在；`.local/document-runs` 和 temp 也没有完整字节证据。本轮未找到可直接复原的缺失代码 hunk。此处写“有界搜索未验证”，不写“永久丢失”或“业务已无损”。

### 模块交付审计与版本策略

- 交付审计正文 [2026-09-28 对抗性审查](2026-09-28-custom-module-delivery-adversarial-audit.md) 是 master tracked 文件，SHA `6ef48207931741a50d54fe8ba4356b2e9015653da8da8f639c09abcb6628b7fe` 与删除前记录逐字节相同。有效正文没有遗漏。旧 WMP 历史段里的已删除工作树绝对路径应改由此保留的仓库相对链接定位；不修改原验收材料。
- 当前 [开发反馈闭环](../runbooks/development-feedback-loop.md) 与 ADR-0006 有实际正文：产品／权限歧义、精确版本接口事实、失败分层、相同失败的诊断出口、派发前往返与权限检查、分层接受及 common harness 边界。旧稿 hash 不同，记录为后继规范有证据保留，而非原稿逐字恢复。该对象 12 项 dirty 中 8 项原字节、2 项行尾等价、2 项原版本未验证。
- [双版本流程](../runbooks/dnd5e-version-following.md)、根说明、REFERENCE_INDEX、版本路由、reference manifest、精确 system.json 共七项原字节保留。11 项版本策略 dirty 中余四项为旧 review／handbook／HTML 版本，不能重建完整旧稿。移动的 dnd6-update 五件原件 hash 相同。当前策略没有发现可证明遗漏的有效规范；不回迁旧文字覆盖较新的 6.0.5 记录，不重新操作 Next。

## 已补回与首批整合候选

| 增量 | 选择与实际结果 | 接受边界 |
|---|---|---|
| Painter 英文说明正例 | 从保留 `5e7455db...` 的 `src/tools/__tests__/agentsInstructionsCheck.test.ts` 精准取回 `accepts explicit English Scope and Acceptance sections`。当前检查器本来已有 Scope／Acceptance 支持；补测试，未恢复整棵旧树。 | 补回的正例通过；不证明其他 Painter 旧 ignored 字节完整。finish 树继续保留。 |
| WMP 与必要依赖 | 移入新模块、CC 武器效果生命周期 API、TE 数据事件桥、parser／models／contracts／generation、相关来源回归；冲突逐 hunk 适配，保留当前 HUD／管理器和 Next 后继接口。未复制旧根 AGENTS、旧手册或旧服务维护改动。 | [9/29 终审](2026-09-25-weapon-mastery-user-report.md) 文首是当前历史接受；details 中旧 INCOMPLETE 不当作当前状态。锁 14.364／5.3.3。新组合静态可审阅，runtimeVerified=false；不外推 6.0.5。 |
| WMP verifier 窄修复 | 独立审阅发现 native-mastery-only Actor 缺来源路径、多攻击 Item 共用一个 critical baseline 两处 P2。补来源路径及逐 Activity 稳定 ID 基线；补接受／篡改拒绝回归，独立复核闭合。 | native-only 用真实 Markdown→workflow→verifier；多活动 baseline 用 ItemGenerator→canonical verifier，现有 Markdown 无逐活动原 critical bonus 字段，未扩来源 schema。 |
| Crystalbleed V12 | 其他旧生成器增量已由 master 后继吸收。只补缺失的跨版本 save `onSave` hunk与回归，并纳入独立 V12 来源、宏源／测试／构建和历史接受记录；不复制旧 JSON。旧状态断言适配 master 独立状态 ID。 | 新 CLI 输出为 needs_review，source verifier 无错，手动对照来源；新 JSON 不同于旧接受 hash。旧 12.331／4.3.9 宏接受保留原身份，不能升级为新 Actor runtime PASS。 |
| Trigger Manager | 核保存的实际 await HP 更新脚本、读回 logger=3→3 及 AX 摘录；补[9/22 重载专项](2026-09-22-trigger-manager-reload-acceptance.md)并更新旧就绪表和当前索引。 | 14.364／5.3.3 的 Manager 创建／编辑／完整刷新／启停专项；不复测 Combat 或外推 Next。 |
| Chrome 时间规则 | 仅收敛 Session Monitor 叶级说明／README、验收索引和手册仍残留的 30 分钟总上限。Foundry Ops、根说明、版本规则和后续已发布内容保留。 | 单操作超时仍有效；四小时等长时接受仅在用户明确要求时运行。未启动长时测试。 |

WMP 原接受 build 为 `a56a09da0dc04f2cfc082598900477ed78d7155f30f80646d1fffd940bb2edf0`；9/29 文档打包为 `05f3c3a4947fa9e7fd032ece209f46e0c0f285b49ff84530a4b3835884c880e6`。本轮核旧 ZIP SHA `56bf08f1bf3319ac4d325abc4eac9e20b0f270d3f89bcd5ddcc58a374c359a10`、61 个模块文件原字节、保存的完整收据与父审数据。最终 Bun 1.3.14 产物归一化 buildId 后，与旧文档交付包仅六条 master 后继 CC 状态说明不同，其余运行脚本文字相同；diff 原件保存在外部证据目录。另核六份父审关联原件哈希，直接从玩家 Slow 完整收据确认 HP200→194、walk30→20、实际损失6及玩家 requester，记录于 `wmp-reused-evidence-readback.json`。不能把这些静态／历史数字核对叫新实机接受。

本轮 WMP buildId 为 `35da6df59a5838c4c0f6e175108dbef1ec0c236a0bc6596b6dba1726c44f79ad`，runtimeCodeSha256 `7d918f2b03e9432fa3bd444a4d89991897a325bddd4e62aafb24725b664be69b`。最终身份与本轮检查摘要在外部候选收据；产物自检不是运行接受。

Crystal V12 当前产物：dragon SHA `4e042d456559bbdb9bccc7773495d4380a2f69ad528ff04c44247fdd09ac293e`、crystal SHA `3ab606d534370720de6564ab203f06f144e9223b3a71b0ccebdcc13ac4249f51`。宏 JS `7723c8c6b1998d99629ff77c04a10d957ffdb2f4895e005f4962b75540b0019c` 和 Macro JSON `96fa9dab3af901d07775d82aa39835493234fe17dc78134a8d5b5c65e8fe9d51` 与旧接受一致。锁定 4.3.9 `309046cc7548778f5f06812dc2038abb3fae66bb` 的 `save-data.mjs` 定义、`save.mjs` 使用 `damage.onSave`，支持该窄生成修复。

## 后续范围（不自动扩大本轮实现）

- Crystalbleed V14：当前 Forge 的 crystal 来源逐字相同，dragon 只差末尾空行；后继 bundle→确定性 Actor ID→Macro UUID 绑定与机制标记已存在。已构建当前 bundle，JSON hash `ebf1a8bb40d7f30a2c2677b0ef71a26f9da79e5df5babeb6d8cf15046e8e14dd`，两 Actor needs_review／五条配套要求。补同名旧 Actor 的模拟导入／绑定／旧对象不变回归。**实际 Foundry 导入、ID／绑定读回、宏仅作用于新 UUID、同名旧 Actor／Token 原字节不变仍 NOT_EXECUTED。** 后续只做该窄门，复用旧核心战斗证据，不回迁整棵旧版或重跑全部矩阵。
- Painter finish：按用户选择保留原 dirty 树及资产；本轮不移植、发布或删除。旧 scratch／temp 原件边界仍未验证。
- Forge GM UI：`20260913-021943-forge-encounter-import` 最新第二轮代码与离线／打包已有记录；首轮 UI 不能替代第二轮接受。后续仅新版 UI／创建回读必要门。
- Creature Blueprint：第一期 9/23 有旧本地接受；9/24 工作台与2024预览更改后仍 NOT_EXECUTED，且当前源码比历史安装更新。后续整合须单独保留版本与真实视觉边界。
- 暂停的 Injury 接口、政策／流程提案：仅登记；不把旧 draft 当现行规范，不自动实现。已发布的 HUD／伤势桥后继保留。

## 实际验证与发布状态

聚焦结果：英文说明及跨版本 save 回归 19/19；Crystal V12 来源／宏／save 回归 16/16；最终 WMP 255/255、CC 100/100、TE 36/36；packages／modules／apps 类型、架构、局部 anti-overfit 与三模块构建／WMP artifact 自检通过。共同检查由各 writer 执行一次，新增 Crystal 源／hunk 与审阅修复后在最终组合再执行所需集成门。

本机默认 Bun 为 1.3.8，聚焦检查使用它；最终整合按仓库 CI 锁定 Bun 1.3.14，通过独立 npm exec 的临时包入口运行，不改变全局 Bun。第一次新增 workspace 的 frozen install 拒绝后，生成本树锁文件再 frozen install 通过；旧包版本项仅同步现有 package.json，无外部依赖顺带升级。

最终整合组成门禁：Bun 1.3.14 下覆盖率测试 **3309 pass / 1 skip / 0 fail，347 文件**；CLI **24 pass / 0 fail**；生产行覆盖 **85.66%**、函数 **86.75%**，阈值通过。anti-overfit 全量 432 source、hygiene、锁定参考 5.3.3／current-6 校验、Web 构建及 White Tusk Shaman 离线 smoke（6 source items／0 verifier warning／0 network）通过。类型／架构、Session Monitor 单独构建门、AGENTS／Ruler 幂等和 30 项手册检查在先前 CI 阶段通过。覆盖率包括新增同名旧 Actor 绑定回归，旧 Actor 模拟数据未变；这不是实际世界接受。

**单次 ci:verify 仍记录为中断（不是 PASS）**：原运行停在 CLI 子进程超时（4000ms／无 stdout、stderr），一次 CLI 复查换了另一个用例发生 15000ms 无输出超时。未改源码或阈值，改为明确的 Bun 1.3.14 实际 exe 与子进程 PATH 后 CLI 24/24 通过，随后从安全包装入口续跑覆盖率及后续门禁。不宣称已证明超时根因；原失败日志保留。Blood Hunter 的一项既有 real-effect migration skip 保留，没有用其他测试补成运行 PASS。

Crystal 两份当前 CLI 命令均实际退出 1 并报告 needs_review（GM 辅助／外部规则）；两份 verify:actor 退出 0，warning/sourceIntegrityErrors 均为空。新产物的来源数值与 save／recharge／效果关系已人工核对；其行为状态仍 needs_review，未手工修补或推广为新 runtime 接受。

本轮完整日志、重用原件数字核对、最终 build identity、文件清单与包含新增文件的审阅 patch 保存在 `H:/CodexData/visualizations/2026/10/02/01a0fa67-2bb8-7e93-bed9-ce2b29452f7d/`。台账写入后核对局部链接、状态措辞与 final diff；没有为纯文档执行 Foundry／Chrome。

没有执行 commit／merge／push、生产部署或进一步删除。发布需用户明确授权，之后重新核主区索引、dirty overlap、远端状态、候选基线和受影响门禁；本轮候选不在其他工作树背后移动 master。历史未验证项不阻塞独立窄修复，但也不改为 PASS。

## 删除前 dirty 的逐路径边界

这是原版本保留取证，和本轮新代码测试结果无关。所有完整原 SHA 和重新核验的候选位置见外部 JSON；行尾等价单列，不包装成原文件逐字节同一。

### 20260820-095325-species-v12-candidate

| 路径 | 删除前 SHA 前缀 | 本轮状态 |
|---|---|---|
| `apps/cli/AGENTS.md` | `124e6b7d5dba` | 有证据保留（原字节） |
| `apps/cli/src/main.ts` | `e5071c75532f` | 有证据保留（原字节） |
| `docs/acceptance/current-support-matrix.md` | `38f9d868f966` | 原版本无法完整重建、保持未验证 |
| `docs/species-ai-intake-v14.md` | `e48bbe1ce558` | 原版本无法完整重建、保持未验证 |
| `foundry-modules/fvtt-homebrew-species/AGENTS.md` | `8bed1b84914c` | 有证据保留（原字节） |
| `foundry-modules/fvtt-homebrew-species/README.zh-CN.md` | `9a1c2581bea0` | 有证据保留（原字节） |
| `foundry-modules/fvtt-homebrew-species/build.ts` | `88a82add673a` | 有证据保留（原字节） |
| `foundry-modules/fvtt-homebrew-species/package.json` | `dc91ad0252f0` | 有证据保留（原字节） |
| `foundry-modules/fvtt-homebrew-species/tests/build.test.ts` | `c6d4551ba2c1` | 有证据保留（原字节） |
| `foundry-modules/fvtt-homebrew-species/verify.ts` | `b544169b425e` | 有证据保留（原字节） |
| `package.json` | `0c848daa7c30` | 原版本无法完整重建、保持未验证 |
| `packages/generation/AGENTS.md` | `9a6e999fd331` | 有证据保留（原字节） |
| `packages/generation/package.json` | `933d31cca769` | 有证据保留（原字节） |
| `packages/generation/src/index.ts` | `a4c012c72520` | 有证据保留（原字节） |
| `packages/generation/src/species.ts` | `5937389433cd` | 原版本无法完整重建、保持未验证 |
| `packages/intake-ai/AGENTS.md` | `04e0a3b6a869` | 有证据保留（原字节） |
| `packages/intake-ai/src/species-orchestrator.ts` | `081230995428` | 原版本无法完整重建、保持未验证 |
| `packages/intake-ai/src/species-types.ts` | `4089c360d612` | 有证据保留（原字节） |
| `src/core/application/cli.ts` | `ee3bdf8dc159` | 有证据保留（原字节） |
| `src/core/application/workflows.ts` | `398655f3cf21` | 有证据保留（原字节） |
| `src/tools/agentsInstructionsCheck.ts` | `16f90361a74f` | 原版本无法完整重建、保持未验证 |
| `tests/cli-species-intake.test.ts` | `4e1a42943efd` | 原版本无法完整重建、保持未验证 |
| `tests/species-intake-gates.test.ts` | `583bd04a89aa` | 原版本无法完整重建、保持未验证 |
| `tests/species-intake-projector.test.ts` | `d0f736840b63` | 有证据保留（原字节） |
| `packages/generation/src/speciesV12.ts` | `d2f6ff845def` | 原版本无法完整重建、保持未验证 |
| `packages/generation/src/speciesV14.ts` | `6fbc12b32f68` | 原版本无法完整重建、保持未验证 |
| `references/dnd5e-4.3.9/species-contract.json` | `ca53f5f5b7b7` | 有证据保留（原字节） |
| `tests/species-v12-projector.test.ts` | `b7b4157868ac` | 原版本无法完整重建、保持未验证 |

### 20260821-210609-forge-fvtt-module-plan

| 路径 | 删除前 SHA 前缀 | 本轮状态 |
|---|---|---|
| `docs/plan/2026-08-21-forge-fvtt-module-product-execution-plan.md` | `f74d4f4faaed` | 有证据保留（原字节） |

### 20260822-010024-forge-protocol-task-a-review-fixes

| 路径 | 删除前 SHA 前缀 | 本轮状态 |
|---|---|---|
| `AGENTS.md` | `7b49cd491664` | 原版本无法完整重建、保持未验证 |
| `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` | `58f9f765306b` | 原版本无法完整重建、保持未验证 |
| `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` | `d8090c85e2c8` | 原版本无法完整重建、保持未验证 |
| `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` | `21b18eee1f67` | 原版本无法完整重建、保持未验证 |
| `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` | `746d057790de` | 原版本无法完整重建、保持未验证 |
| `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` | `09e529505da1` | 原版本无法完整重建、保持未验证 |
| `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` | `544841cf90c9` | 原版本无法完整重建、保持未验证 |

### 20260822-150300-forge-fvtt-actor-task-b

| 路径 | 删除前 SHA 前缀 | 本轮状态 |
|---|---|---|
| `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` | `58f9f765306b` | 原版本无法完整重建、保持未验证 |
| `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` | `d8090c85e2c8` | 原版本无法完整重建、保持未验证 |
| `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` | `21b18eee1f67` | 原版本无法完整重建、保持未验证 |
| `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` | `746d057790de` | 原版本无法完整重建、保持未验证 |
| `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` | `09e529505da1` | 原版本无法完整重建、保持未验证 |
| `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` | `544841cf90c9` | 原版本无法完整重建、保持未验证 |

### 20260824-021316-forge-fvtt-intake-task-d

| 路径 | 删除前 SHA 前缀 | 本轮状态 |
|---|---|---|
| `AGENTS.md` | `fda48ddd1fe9` | 原版本无法完整重建、保持未验证 |
| `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` | `58f9f765306b` | 原版本无法完整重建、保持未验证 |
| `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` | `d8090c85e2c8` | 原版本无法完整重建、保持未验证 |
| `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` | `21b18eee1f67` | 原版本无法完整重建、保持未验证 |
| `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` | `746d057790de` | 原版本无法完整重建、保持未验证 |
| `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` | `09e529505da1` | 原版本无法完整重建、保持未验证 |
| `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` | `544841cf90c9` | 原版本无法完整重建、保持未验证 |

### 20260826-001451-moonshark-json

| 路径 | 删除前 SHA 前缀 | 本轮状态 |
|---|---|---|
| `packages/generation/src/activity.ts` | `ec8676bfb383` | 原版本无法完整重建、保持未验证 |
| `packages/generation/src/actor.ts` | `9bdedbbf4dc4` | 原版本无法完整重建、保持未验证 |
| `packages/generation/src/adapters.ts` | `824f9a79c1c7` | 原版本无法完整重建、保持未验证 |
| `packages/generation/src/item-generator.ts` | `90b19f76c080` | 原版本无法完整重建、保持未验证 |
| `packages/generation/src/verification.ts` | `4d716bd09ee5` | 原版本无法完整重建、保持未验证 |
| `packages/models/src/action.ts` | `64084aaaa214` | 有证据保留（原字节） |
| `packages/models/src/item.ts` | `60c0b73b4d84` | 原版本无法完整重建、保持未验证 |
| `packages/parser/src/itemParser.ts` | `25cf0b4de859` | 原版本无法完整重建、保持未验证 |
| `tests/core/generator/structuredActionItems.test.ts` | `2114dde9d5db` | 有证据保留（原字节） |
| `tests/item-ai-intake.test.ts` | `d0ed6ceffb4f` | 原版本无法完整重建、保持未验证 |
| `obsidian/dnd数据转fvttjson/input/items/moonweavers-spear__织月者之矛.md` | `855382965fc4` | 原版本无法完整重建、保持未验证 |
| `obsidian/dnd数据转fvttjson/input/moonshark__月鲨.md` | `8766eee73a63` | 有证据保留（原字节） |
| `packages/generation/src/item-description.ts` | `0977f8e1ad68` | 有证据保留（原字节） |
| `tests/core/generator/v14DynamicDamageVerification.test.ts` | `a8a199e32bd7` | 有证据保留（原字节） |

### 20260928-103500-module-delivery-audit

| 路径 | 删除前 SHA 前缀 | 本轮状态 |
|---|---|---|
| `.ruler/AGENTS.md` | `bdc206fb67ff` | 有证据保留（原字节） |
| `AGENTS.md` | `acd7d9291605` | 有证据保留（原字节） |
| `docs/plans/2026-09-29-development-feedback-pilot.md` | `694fc29137fb` | 原版本无法完整重建、保持未验证 |
| `docs/reviews/2026-09-28-custom-module-delivery-adversarial-audit.md` | `6ef482079317` | 有证据保留（原字节） |
| `docs/reviews/2026-09-29-development-flow-postmortem.md` | `1bd3578049b4` | 有证据保留（原字节） |
| `docs/reviews/2026-09-29-workflow-audit-evidence/external-practices.md` | `8bead3f7639d` | 有证据保留（原字节） |
| `docs/reviews/2026-09-29-workflow-audit-evidence/servernext-metrics.json` | `02813b2c3da6` | 有证据保留（仅行尾等价） |
| `docs/reviews/2026-09-29-workflow-audit-evidence/servernext-process.md` | `55b0b4f867bc` | 有证据保留（原字节） |
| `docs/reviews/2026-09-29-workflow-audit-evidence/wmp-metrics.json` | `cef1e1ed5de2` | 有证据保留（仅行尾等价） |
| `docs/reviews/2026-09-29-workflow-audit-evidence/wmp-process.md` | `c939250deaf3` | 有证据保留（原字节） |
| `docs/runbooks/development-feedback-loop.md` | `6267bb059bbe` | 原版本无法完整重建、保持未验证 |
| `docs/templates/development-task-contract.example.json` | `93b20169675b` | 有证据保留（原字节） |

### 20261001-142408-dnd5e-version-policy

| 路径 | 删除前 SHA 前缀 | 本轮状态 |
|---|---|---|
| `.ruler/AGENTS.md` | `578e6d32ca99` | 有证据保留（原字节） |
| `AGENTS.md` | `33d3d6effeef` | 有证据保留（原字节） |
| `docs/REFERENCE_INDEX.md` | `a35c9752213d` | 有证据保留（原字节） |
| `docs/handbook/catalog.json` | `91acbdf2e061` | 原版本无法完整重建、保持未验证 |
| `docs/handbook/reviewed.json` | `c62ba1327fdc` | 原版本无法完整重建、保持未验证 |
| `docs/runbooks/foundry-v14-development-source-routing.md` | `b78de78a1887` | 有证据保留（原字节） |
| `references/reference-cache-manifest.json` | `48c2c1d4218a` | 有证据保留（原字节） |
| `工具手册.html` | `5318705a2d11` | 原版本无法完整重建、保持未验证 |
| `docs/reviews/2026-10-01-dnd5e-version-following-policy.md` | `cf756c12364a` | 原版本无法完整重建、保持未验证 |
| `docs/runbooks/dnd5e-version-following.md` | `c61c432c1bc6` | 有证据保留（原字节） |
| `references/dnd5e-6-current/system.json` | `21d9a6729075` | 有证据保留（原字节） |

### 20261001-230000-next-master-sync

| 路径 | 删除前 SHA 前缀 | 本轮状态 |
|---|---|---|
| `docs/handbook/catalog.json` | `c793fe1b5a72` | 原版本无法完整重建、保持未验证 |
| `docs/handbook/modules.json` | `bbead6e3f7d5` | 原版本无法完整重建、保持未验证 |
| `docs/handbook/reviewed.json` | `e01b199df725` | 原版本无法完整重建、保持未验证 |
| `package.json` | `38e5a34d1445` | 有证据保留（原字节） |
| `tools/foundry-ops/README.zh-CN.md` | `8b1f305668d6` | 有证据保留（原字节） |
| `tools/foundry-ops/src/commandCatalog.ts` | `21ec1c746a9b` | 有证据保留（原字节） |
| `tools/foundry-ops/src/routing.ts` | `f40ffed7d2cd` | 有证据保留（原字节） |
| `docs/plan/server-next-migration-handoff-20260927.md` | `95e0a771f8b9` | 原版本无法完整重建、保持未验证 |
