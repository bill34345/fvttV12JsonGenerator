# 自制种族内容模块

普通 `--fvtt-version 14` 和默认构建使用 Core `14.370`／dnd5e `6.0.6`／Core／2024。Species 使用 dnd5e6 的原生移动、感官、Advancement、Activity 和 Effect 字段。模块只有 `species` 与 `features` 两个 Item Compendium，没有浏览器脚本、socket、自动迁移或世界扫描。

| 入口 | 内容投影身份 | 默认输出 |
| --- | --- | --- |
| 默认或 `--fvtt-version 14` | Core14.370／dnd5e6.0.6 | `dist/` |
| 显式 `--fvtt-version 14.368` | 保留 Core14.368／dnd5e6.0.2 已接受来源身份 | `dist/v14-368-candidate/` |
| 显式 `--fvtt-version 12` | Core12.331／dnd5e4.3.9 静态候选 | `dist/v12-candidate/` |

V14 清单在对应 minimum 以上开放 Core14／dnd5e6 主版本内后续版本。清单范围、内容来源身份和实际玩法接受分别记录；所有新构建保留 `supportStatus: "static-candidate"`，不会凭构建成功增加运行时接受。旧 Core14.364／dnd5e5.3.3 包和记录保留作历史来源，当前安装器拒绝它们。

从仓库根目录使用 `bun run build:homebrew-species` 和 `bun run verify:homebrew-species` 构建、校验当前目标。新目标必须先通过既有 Species Intake 取得对应接受结果；仅切换默认版本不会把旧5.3.3 ledger 变成6.0.6接受记录。构建会重新编译来源并检查 Markdown SHA、来源 SHA、logical hash、正式 audit JSON，任一旧记录不匹配即提示重新执行 `--intake-species`。不自动修改接受账本。

已有原生6来源可以显式运行：

```powershell
bun run build:homebrew-species --fvtt-version 14.368
bun run verify:homebrew-species --fvtt-version 14.368
```

这条路线保留6.0.2内容身份、来源、稳定 UUID、ledger hash，默认清单最大值为 Core14.999／dnd5e6.999.999。历史 `--dnd5e-runtime-maximum 6.0.2|6.0.5|6.0.6` 只适用于显式14.368，用于重现原候选清单，不把内容改标为指定版本，也不授予新的运行时接受。V12 的两个根 `*:v12-candidate` 入口仍生成静态候选，不调用安装器。

安装器只指向配置 Lab 的开发实例，核实际 Core14.370、dnd5e6版本、清单范围、完整构建摘要和 owned identity；拒绝链接、foreign same-ID、运行中的 Pack LOCK 和历史5.3.3包，不创建旧包备份。构建可从公开 `buildHomebrewSpeciesModule({vaultPath, fvttVersion, distRoot})` 指定正式来源根；安装器 API 的 `distRoot` 可指向经过校验的显式14.368候选。环境写入由任务指定的唯一环境 owner 执行。安装前复用开发实例和数据目录的停服检查；正常关闭后残留的LOCK须通过Windows独占读句柄探测，真实占用仍拒绝，不删除锁文件。

散装 JSON 是绑定本模块的审阅和构建输入，ItemGrant UUID 指向本模块 `features` pack。已授予 Actor 的嵌入 Feature 是快照，更新合集不会自动替换。原生自动化限于来源明确的基础字段、allowlist 内每级HP／AC永久 Effect，以及次数和恢复明确的 Utility；复杂武器、推击、建筑物和状态裁定继续由玩家或GM处理。

历史 Ogre 的有限接受见[来源逐项核对](docs/server-next-ogre-source-review-20260925.md)和[原生6候选记录](docs/server-next-candidate.md)。其 Large、零级授予、每级HP、速度、AC、暗视、5级脱困资源、长休与重载代表链不能推广至全物种、全等级或生产。ASI 授予存在但当时未观察到属性分配生效，不宣称力量加值或完整升级自动化。当前环境结果与未覆盖范围以[唯一维护记录](../../docs/plans/foundry-environment-maintenance/EXECPLAN.md)为准。
