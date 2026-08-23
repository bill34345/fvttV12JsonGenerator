# Forge FVTT 浏览器架构修订说明

日期：2026-08-22

本文件是对 `2026-08-21-forge-fvtt-module-product-execution-plan.md` 中运行架构和 Task B 定义的补充说明。原产品 Plan 保持原字节、原内容不变；本文件只记录用户后来明确锁定的架构决定。

## 已锁定的方向

Forge 的第一条 FVTT mode 路径先直接在 Foundry 浏览器页面内完成 Actor 的生成、预览、创建和回读。Gateway 不再是 Actor 生成的必经路径。

Foundry 模块可以直接调用用户配置的 OpenAI-compatible HTTPS endpoint。API Key 默认只保留在当前内存；只有用户明确勾选后才保存到当前浏览器的 client-only 设置。界面必须持续提示：同一 Foundry 页面中的其他模块理论上可以读取已保存的 Key。API Key 不得进入世界数据、Actor、Chat、日志、诊断、Forge request 或导出内容。

Codex OAuth 依赖本机已登录的 Codex CLI。浏览器不能自行启动本机 CLI，因此 OAuth Companion 保留为后续可选能力，不阻塞第一版浏览器 Actor 路径。

## 第一版 FVTT mode 的边界

进入第一版：

- 规范中文 YAML / English bestiary Markdown Actor 输入；
- 用户明确选择后的普通文本 Monster AI Intake；
- 现有 parser、generator、verifier 和 accepted/needs_review/failed 门禁的浏览器可运行版本；
- Foundry 14.364 / dnd5e 5.3.3 / core Actor 预览、GM 确认创建和 readback；
- 单次一个 Actor，重复创建保护和创建失败回滚。

暂不进入第一版：

- GoddessFantasy 登录抓取；
- Collection/ZIP 离线合集包；
- Vault Sync 和翻译同步；
- PDF/OCR；
- Sharp 图片处理、Token 裁切、contact sheet、SSH 上传；
- Item/Species 的世界创建闭环；它们在 Actor 闭环之后分别规划；
- Codex OAuth Companion；
- 多 Actor 批量导入、既有 Actor 更新和生产部署。

Collection/ZIP 被排除是因为 FVTT mode 的目标交付是直接在当前世界创建 Actor，而不是先生成离线合集文件。未来批量输入仍可以通过批量预览和逐项创建实现，但不复刻 ZIP 交付层。

## 运行边界

```text
Foundry module
  输入、用户确认、GM 权限、预览、单次 Actor.create、readback
       │
       ├─ 规范文本：browser runtime
       └─ 普通文本：browser AI Intake + 用户配置的模型 endpoint

browser runtime
  parser → generation → verification → ForgeActorResponse
       │
       v
Foundry public Document API
  完整 artifact + Forge identity → 单次 Actor.create → toObject/readback
```

浏览器 runtime 不得依赖 Node、Bun、Windows、文件系统、SSH、CLI server、Sharp 或 Crawlee。CLI/Web 继续使用现有本地 I/O 适配器，不能因为浏览器路径而复制第二套生成规则。

## 来源身份

规范文本的同一份最终 UTF-8 字节必须同时用于 `forge-source-id`、source hash、parser、generation、verification 和 artifact hash。

Forge 的 Node 与 browser 入口在 hash 前共用一层纯 artifact 投影：把已有生成时间归一为 `null`，把嵌入 ActiveEffect ID 和全部对应引用按内容确定性重键，再以投影后的 Actor 重跑正式 verification。该投影不改变普通 CLI/Web 的原始 Actor 输出。

普通文本 AI Intake 额外保留：

```text
raw source hash → evidence IR → rendered Markdown + forge-source-id
              → final source hash → Actor/artifact hash
```

AI 生成多个候选时，第一版必须报告并停止，不能只取第一个候选。

## 安全和失败边界

- 只有用户明确选择 AI 模式才发送来源文本；规范模式不得自动调用模型。
- API Key 只允许用户配置的 HTTPS endpoint；不跟随跨站 redirect。
- 401/403、429、超时和非法模型响应分别显示，不能降级成 accepted。浏览器 Fetch 无法可靠区分 CORS 与底层网络失败，因此两者使用诚实的 browser transport 诊断，不做启发式假精确分类。
- Actor 创建只在全部验证和 GM 确认后，以一次 `Actor.create()` 写入完整 artifact 和 Forge identity；写入后立即 readback。提交前可以取消；调用世界写入后进入不可取消的短提交区间，窗口会明确显示“正在提交并重新读取核对（不可取消）”，并锁定生成、创建、取消、来源、名称和模式控件。readback 等普通失败会尽最大努力删除本次 Actor。
- 浏览器若在服务器提交 `Actor.create()` 后瞬间崩溃，完整且带 Forge identity 的 Actor 可能已经存在。纯浏览器第一版不宣称跨进程事务回滚；重新确认时按 `sourceId` 复用相同 artifact 或报告 hash 冲突。
- `needs_review` 和 `failed` 永远不能进入创建步骤。
- 创建失败时只删除本次新建的临时 Actor，不碰既有 Actor。
- Actor 的确定性世界 ID 只由 `sourceId` 派生，形成跨窗口服务端唯一 claim。同一 `sourceId + artifactHash` 已存在时复用既有 Actor；同一 sourceId 但 hash 不同则报告冲突，第一版不覆盖。
