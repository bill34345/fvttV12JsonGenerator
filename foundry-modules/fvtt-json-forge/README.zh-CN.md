# FVTT JSON Forge 0.3.0（开发候选）

本次增量在 Forge Intake 内加入人类写法MD的多生物提取、正式生成、固定自动化配置提取、工具编译与独立审核，并保留“战斗包导入 / 启动控制”。0.3.0 当前是本地构建候选，未发布；安装本增量请使用本次构建的 `fvtt-json-forge-0.3.0.zip`，不要把旧版0.1.0当作已包含新入口。

FVTT JSON Forge 是 Foundry VTT 内的 GM-only Actor / Item 生成与证据审阅模块。0.1.0 把 Forge A–E 作为一个产品交付，精确锁定 Foundry `14.364`、dnd5e `5.3.3` 和 `core` profile；其他版本会 fail closed。

> English summary: FVTT JSON Forge is a GM-only, exact-target browser module for reviewed Actor/Item generation and encounter packages with separately started bound companion macros. This 0.3.0 candidate targets exactly Foundry 14.364 and dnd5e 5.3.3. Existing review recovery, source library and batch paths remain separate. It is not a generic JSON importer or a background server.

## 安装

### Foundry Setup 安装

本次0.3.0候选尚未发布，先使用下一节的本地ZIP方式。下面的Setup链接只有在本增量正式发布后才能取得新功能；旧0.1.0发行包不包含战斗包入口。

在 Foundry 的 Setup 页面打开 **Add-on Modules → Install Module**，把下面的 manifest URL 粘贴到 **Manifest URL**：

```text
https://raw.githubusercontent.com/bill34345/fvttV12JsonGenerator/master/foundry-modules/fvtt-json-forge/src/module.json
```

安装后进入目标世界的 **Manage Modules**，启用 **FVTT JSON Forge**，再刷新世界。

### ZIP 手工安装

使用本次本地构建的 `foundry-modules/fvtt-json-forge/dist/release/fvtt-json-forge-0.3.0.zip` 和同目录 `SHA256SUMS.txt`，先核对 SHA-256；不假设尚未发布的GitHub Release已经存在。停止 Foundry 后，把 ZIP 解压为：

```text
<Foundry Data>/Data/modules/fvtt-json-forge/module.json
<Foundry Data>/Data/modules/fvtt-json-forge/scripts/index.js
...
```

ZIP 内是 module 根内容，不能再多套一层版本目录。不要覆盖身份不明的同名目录；升级前先确认旧目录确实是本模块。此仓库的运维规则不创建备份，失败时停止并核对目标。

## 三个入口

只有 GM 能在 **Configure Settings → Module Settings → FVTT JSON Forge** 看到入口：

- **Forge Actor**：把结构化 Actor Markdown 转为当前目标的完整 Actor，预览后执行 create-only、readback 和 deterministic reuse。
- **Forge Item**：对单一、受支持的 world Item 做同样的 preview、create-only、readback 和 reuse；不会隐式创建或修改 Actor。
- **Forge Intake**：处理 `plaintext-actor`、`ai-monster` 和 `ai-item`。Analyze 只建立来源证据与审阅状态；Generate Candidate 后仍须 formal verification 与 review 同时 `accepted`，Confirm Create 才可用。

原单Actor/Item入口遇到`needs_review`、`failed`、`rejected`、多candidate、多artifact、过期snapshot、权限或版本变化时保持零世界写入。战斗包使用独立审核路径：只有明确的GM辅助、外部规则或文字保留行为具有唯一绑定宏，才能进入包级GM确认；未知错误仍拒绝。模块没有“忽略并继续”按钮，也不会把历史review bundle当成可创建response。

## Provider 与凭据

预览已有战斗包不调用 Provider。人类 MD 入口由 AI 提取生物与固定能力配置，工具生成控制入口；AI 不编写宏代码。本地 Intake 默认使用 DS API 的 deepseek-flash（DeepSeek V4.1 Flash），提取与审核均使用同一模型，默认低推理档；非本地连接继续保留用户明确选择。Luna Max 仅用于受委派的本地验收操作。

AI 模式必须先选择 Provider、协议和精确 model ID，并完成当前连接/结构化输出测试。界面提供 OpenAI、Anthropic、Gemini、DeepSeek、xAI、Mistral、OpenRouter、Qwen、Kimi、GLM 与 Custom presets；preset 只代表连接配置，不代表每个 provider/model 都有同等语义验收。

当前人类 MD 样例已由 deepseek-flash 完成提取、规则选择与独立审核，生成两 Actor 和固定控制入口。来源与静态审核通过不代表场景运行通过；实际本地验收另行记录。其他组合需单独验证。

固定齐射的恍惚使用 Foundry 原生状态身份，避免状态同步模块把同一效果再补成第二份。已有其他来源的启用状态不由本控制器接管或提前结束；本控制器创建的状态按记录的目标回合到期处理。此兼容修复的实际 Chrome 复验尚未完成。

Actor 蓝图保留来源固定 HP 和生命骰公式；场上未链接 NPC Token 是否重掷 HP 遵从 dnd5e 世界设置，固定控制器不覆盖该设置。

API Key 默认只存在当前页面内存。只有显式勾选持久化时才会写入当前浏览器的 local storage；它不会进入世界 Document、Chat、review bundle、Collection/ZIP、日志或 Forge response。浏览器存储不是加密保险箱；推荐保持持久化关闭，并在结束后使用清除 Key 操作。

## Review、Library 与恢复

- **Review Bundle**：导入后只显示严格解码的历史记录。历史 `accepted` 仍不可直接创建；“以当前来源开启新 attempt”会生成新的 identity、snapshot、calls 和 review。
- **Managed Source Library**：来源与安全 review 保存在当前浏览器、当前 `worldId:userId` scope 的 IndexedDB。它不写世界 settings/flags，不自动 Analyze，也不保存完整 artifact/response。
- **Portable export/import**：Library、Collection、标准 ZIP 和 Queue 都有 strict decoder、identity/hash/size/path/CRC 门禁；导出不含 Key、完整 endpoint、provider raw payload 或世界数据。

## Collection 与 Batch Queue

Forge Intake 可以导入 mixed Actor/Item Collection JSON 或标准 ZIP。每项拥有独立 source、kind/mode、identity、attempt、status 和 review；输入顺序保留，单项失败不会让其他项升级为 accepted。

Runner 固定 concurrency `1`，只有 GM 显式点击才运行。刷新或关闭页面时，`running` / `applying` 项变为 `interrupted`，不会自动重发可能计费的 Provider 请求。跨会话恢复的历史 accepted review 不含完整 response，必须显式 fresh run 后才能重新进入 apply manifest。

批量 Apply 只接受当前页面仍持有完整 accepted response 的项目。确认框会列出 immutable manifest、Document ID、source/artifact hash 和 target；Actor 与 Item 继续走各自 adapter。多 Document 操作不是原子事务，部分成功/失败会逐项报告，不会伪装为全成功或回滚已完成的其他 Document。

## 明确限制

### 角色、召唤物与配套宏整包导入

在 **Forge Intake → 战斗包导入 / 启动控制** 打开新入口：

1. 选择`fvtt-json-forge-encounter` v1 JSON，或仅包含`encounter.json`的标准ZIP。此前普通龙兽交付ZIP、Review Bundle和Batch Collection不是这个格式。
2. 点击“预览战斗包”。模块在当前浏览器通过正式workflow重新生成每个Actor，显示基础属性、来源、生成数据、宏代码、图片绑定和具体GM操作规则。这个步骤不会调用AI、创建文档或运行宏。
3. 核对内容后勾选确认，再点击“一起导入角色与宏”。相同且未改变的文档会复用；同一包身份的不同内容、已有文档改变或ID冲突会阻止覆盖。
4. 导入后在“已导入的战斗控制”里查看宏，点击“启动战斗控制”。固定配置首次启用后会在刷新时重验并恢复；控制面板“停用自动化”会持久停用，关闭面板不等于停用。旧式专用宏仍需手动重新启动。

Macro创建与执行是两个动作。脚本仍在GM客户端权限下运行；导入包不能自行宣称代码可信。启动前重新核对命令hash、绑定Actor的身份与其应有的机制标记；被替换、删掉机制或代码改变的内容需要重新审阅。不要修改hash或flags来绕过检查。

明确的GM辅助/外部规则只在新整包路径中进入显式审核，且必须各自关联一份有正确Actor绑定的宏。原有单Actor/Item accepted-only路径不变；失败来源、未知诊断或缺失覆盖不能借宏包绕过。

多文档导入不保证跨浏览器原子事务。普通失败清理本次新建文档并检查结果；无法清理时列出准确UUID。既有文档不会被覆盖。已上传的内容寻址图片可能保留供重试，图片不同则拒绝覆盖。已在游戏中改变过的角色再次导入可能报告冲突，这是避免覆盖当前状态的预期行为。

样本制作：在仓库运行`bun run tools/forge-encounter/build-example.ts`，产生`crystalbleed.forge-encounter.json`和`crystalbleed.forge-encounter.zip`。包携带来源和绑定宏；Actor JSON由接收端正式生成。样本宏使用`forgeEncounter.actors.dragon`与`forgeEncounter.actors.crystal`，不会按同名任意选择世界角色。

晶血样本的专用宏 2.1.2 读取正式生成的恍惚效果和自定义条件标记，并保留目标下一个回合结束的期限。启用 Custom Conditions 时应用其独立恍惚状态，并遵守既有恍惚免疫；未启用时以具名效果表示，行动选择仍由 GM 裁定。样本需要单独启动，刷新后重新启动；其修复版本须按具体候选完成导入、绑定和效果结算验收。

人类 MD 路径支持 2 至 6 种生物、最多 24000 字符。AI 提取并审核生物数据，再选择已实现的固定能力和参数；工具校验并编译控制入口，AI 不写 JavaScript。明确启用的固定配置会在刷新时重验身份后恢复，停用按钮持久生效。未知或不支持的规则保留审阅，不会现场生成代码补齐。完整步骤见[原始MD战斗包指南](../../tools/forge-encounter/README.md)。

前后条件分支使用仅限Encounter的明确GM/配套宏机制：不同时应用互斥的原生效果，完整来源留在能力说明中。该角色的单独状态保持needs_review，必须由来源审阅接受其保留方式，并由正确绑定的唯一宏承担该机制，才可进入包级确认；其他文字或未知机制仍被拒绝。

### 其他边界

- 只支持 Foundry `14.364` / dnd5e `5.3.3` / `core`；不是 v12/v13 模块。
- 只允许 GM；不是玩家 JSON 导入工具。
- 不是任意文本、任意模型、任意 Actor/Item 都能 accepted 的保证。
- 不支持 OCR/PDF/图片 Intake、update/overwrite、按名称合并、embedded Item 产品入口或跨 Document 原子事务。
- 页面关闭后不会继续 AI/HTTP。真正后台执行需要另行设计 Companion/Gateway、认证与 Key custody。
- 本地 Lab PASS 不代表生产、任意模块组合或四小时真实桌面会话 PASS。

当前分层证据见 [support matrix](../../docs/acceptance/current-support-matrix.md)，A–E 实施与边界见 [产品计划](../../docs/plan/2026-08-21-forge-fvtt-module-product-execution-plan.md)、[Task D](../../docs/plan/2026-08-24-forge-fvtt-intake-task-d-plan.md) 与 [Task E](../../docs/plan/2026-08-30-forge-fvtt-task-e-plan.md)。

## 维护者构建

```powershell
bun install --frozen-lockfile
bun run test:fvtt-json-forge
bun run release:fvtt-json-forge
bun run verify-release:fvtt-json-forge
```

发行输出位于 `foundry-modules/fvtt-json-forge/dist/release/`：

- `fvtt-json-forge-0.3.0.zip`
- `fvtt-json-forge-module.json`
- `SHA256SUMS.txt`

构建器固定 ZIP 排序与时间戳；两次 fresh build 必须产生相同 ZIP SHA-256，并验证 archive、独立 manifest、package version 和下载 URL 一致。


## 当前验收与通用性边界（2026-09-15）

人类 MD 是可复用的输入模板，生物名称不决定执行分支。自动化使用已实现的固定能力库；其具体形态、模板和操作顺序见[战斗包指南](../../tools/forge-encounter/README.md#人类-md-模板与当前能力范围)。任意新机制不能仅凭填写模板获得自动化支持。

本地专项已验证守护真实伤害阈值、混合伤害合计、临时 HP，以及原生拒绝次数耗尽后的削弱。重复腐化证据保留 PARTIAL，用户决定待独立状态设计后再处理；不宣称每次失败增加一级已严格实测。Dazed修复专项与FVTT页面完整AI生成链尚未复验。当前可提交并合并的0.3.0候选未发布远端，合并不代表生产部署。
