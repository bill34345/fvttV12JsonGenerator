# Open Session Deck v0.1 产品、交互、架构与验收计划

状态：用户于 2026-08-24 明确批准并授权实现。

## 一、产品目标与成功标准

- 新建独立 Foundry 模块 `open-session-deck`，面向 GM，开源、local-first，不依赖本项目的生成器运行时。
- v0.1 精确支持 Foundry `14.364` + dnd5e `5.3.3`；Daggerheart `2.7.4` 作为 v0.2 独立里程碑，不在 v0.1 宣称支持。
- GM 只登录一次 Foundry，即可同时使用主窗口面板和电脑上的浏览器副屏；副屏不是第二个 Foundry 客户端，不加载 Canvas、不建立额外 Foundry socket、不要求 GM 助手账号。
- v0.1 完成标准是：GM 能在副屏持续查看队伍与遭遇状态，并完成最常用的 HP、状态和回合操作；玩家原有登录、权限和界面不改变。
- 模块目录采用独立 MIT License；只分发自有代码、模板、样式和翻译，不复制 dnd5e/Daggerheart 规则文本、Logo 或美术素材。

## 二、产品与交互设计

### 入口与窗口

- 仅 GM 可见场景控制按钮，并注册一个默认不绑定按键的快捷键入口。
- 第一次打开默认显示 Foundry 内的 ApplicationV2 面板；之后记住该 GM 上次使用的面板/副屏模式。
- 面板标题栏提供“弹出副屏”；副屏已存在时只聚焦原窗口，不重复创建。
- 主屏面板与副屏允许同时显示，使用同一份状态；关闭其中一个不影响另一个。
- 弹窗被浏览器阻止时保留主屏面板并明确提示；Foundry 主窗口关闭或刷新时关闭副屏，重新进入世界后由 GM 手动恢复。
- 副屏使用固定命名的同源空白浏览器窗口，由主 Foundry 窗口渲染和处理事件；副屏本身不导航到世界 URL。

### 布局与视觉

- 采用中性跑团工作台风格，跟随 Foundry 深浅色变量，使用当前世界中的 Actor 头像和系统图标，不自带 D&D 主题素材。
- 宽度不小于 `960px` 时为双栏：左侧队伍、右侧遭遇；更窄时自动切为“队伍/遭遇”分页。
- 提供中文和英文界面，跟随 Foundry locale，英文为缺失翻译的回退语言。
- 所有资源同时显示数字和视觉状态，不仅依赖颜色；按钮具备键盘焦点、工具提示、忙碌状态和可读标签。

### 队伍栏

- 自动名单包括分配给非 GM 用户的 dnd5e Character，以及至少被一名非 GM 用户以 OWNER 权限持有的 Character；离线玩家角色仍显示。
- GM 可固定其他兼容 Actor，或隐藏自动发现的角色；固定与隐藏名单作为世界设置在 GM 之间共享。
- 自动、固定、遭遇三种来源去重；失效 UUID 不阻止加载，但在管理界面列出并允许清理。
- 角色卡显示头像、名称、所属玩家及在线状态、当前/最大/临时 HP、AC、灵感、力竭、当前状态和是否参与当前遭遇。
- 快捷操作包括规则感知的伤害、治疗、授予临时 HP、切换灵感、增减力竭、切换系统状态和打开原生角色卡。
- 专注与死亡豁免在 v0.1 只显示，不允许直接修改。

### 遭遇栏

- 使用当前激活的 `game.combat`，显示轮次、当前回合、战斗者、先攻、HP、AC 和状态；v0.1 不提供多遭遇选择器。
- 支持原生上一回合、下一回合；不提供创建、结束、增删战斗者或编辑先攻。
- 支持将当前战斗者滚动到副屏可视区；Token 位于当前场景时，可让主 Foundry 画布平移到该 Token，但不自动改变 Token 选择。
- 无战斗、Token 不在当前场景、Actor 已删除或当前操作不可用时禁用对应按钮，并显示具体原因。

### 操作反馈与范围边界

- 常用写操作不弹确认框；每个目标在操作完成前锁定相关按钮，禁止重复提交。
- 不做乐观写入：收到 Foundry 更新后再刷新数值；成功显示简短结果，失败保留旧值并显示实际错误。
- 每次操作重新按 UUID 解析最新 Document，避免从旧卡片状态计算增量。
- v0.1 不包含玩家 Deck、地图/Canvas 镜像、技能与法术操作、掷骰请求、物品管理、AI、音效动画、自由拖拽布局、完整战斗管理或性能专项优化。

## 三、架构与接口

### 模块结构

- 在 `foundry-modules/open-session-deck/` 建立独立 workspace package，使用 TypeScript、ApplicationV2、Handlebars 与原生 CSS；不引入 React 或 Node 运行时依赖。
- `DeckController` 负责权限、命令执行、窗口生命周期和 Foundry hooks；`DeckStore` 保存不可变快照并合并更新；`Dnd5eAdapter` 负责系统投影与命令；`PanelSurface` 与 `PopoutSurface` 共享模板和状态。
- Actor、ActiveEffect、Combat、Token、User、Scene 和设置 hooks 只触发状态失效；一次事件批次只重建一次快照。
- 不声明模块自定义 socket；玩家端同步继续由 Foundry Document 更新和系统 hooks 完成。

### dnd5e 命令映射

- 伤害与治疗调用 dnd5e `Actor5e.applyDamage`，确保临时 HP、死亡恢复、血量状态、专注检定及相关 hooks 保持系统原生语义。
- 临时 HP 调用系统方法；灵感与力竭使用正式 Actor 字段；状态使用 `toggleStatusEffect`。
- 回合推进调用当前 Combat 的原生方法；所有写入前再次验证 GM 身份、目标存在和精确系统版本。
- 不直接修改 LevelDB，不绕过 Actor/DataModel 生命周期，不复制系统内部算法。

### 数据契约与模块 API

- `DeckSnapshot` 包含世界、系统、场景、在线用户、队伍、遭遇、更新时间和错误。
- `DeckActorCard` 包含 Actor UUID、展示字段、资源、状态、所有权、名单来源和可用命令。
- `DeckEncounter` 包含 Combat UUID、轮次、回合、当前战斗者及战斗者卡片。
- `DeckCommand` 包含稳定命令 ID、目标 UUID、已验证参数、忙碌键和结果；视图不能直接修改 Documents。
- `game.modules.get("open-session-deck").api` 暴露 `openPanel()`、`openPopout()`、`focusPopout()`、`close("panel" | "popout" | "all")` 与 `refresh()`；非 GM 客户端 fail-closed。
- v0.1 不公开第三方适配器注册接口。Daggerheart v0.2 使用正式 resources、Fear 设置、Spotlight API 与 Countdowns 模型，精确版本进入 Lab 前不声明支持。上游证据见 [Daggerheart 官方系统源码](https://github.com/Foundryborne/daggerheart)。

### 版本、设置与故障处理

- Manifest 将 Foundry 与 dnd5e 的 minimum、verified、maximum 锁定为 `14.364` 和 `5.3.3`，并声明 `socket: false`。
- 世界设置保存固定/隐藏 Actor UUID；客户端设置保存最后打开模式、卡片密度和分页状态。
- 未支持系统或版本、弹窗失去同源关系、主窗口卸载、Document 删除或写入失败时停止对应操作并给出可恢复提示。
- 发布包使用浏览器 ESM、确定性 ZIP，禁止 Node/Bun/server/generator 运行时依赖；本地安装与 hash 核验 fail-closed 且不创建备份。

## 四、交付顺序与权限边界

- 使用 worktree `I:\OpenCode\fvttV12JsonGenerator-worktrees\20260823-231637-open-session-deck` 和分支 `codex/20260823-231637-open-session-deck`。
- 依次完成模块骨架与文档、核心 Store/Controller/Surface、dnd5e 适配器、聚焦测试与打包、Foundry Lab 语义验收。
- 修改既有符号前执行 GitNexus upstream impact；完成代码后执行 change detection。
- 本计划的实现授权不自动包含 commit、merge、push、生产安装或生产重启。

## 五、测试与真实验收

### 机械验证

- 单元测试覆盖自动/固定/隐藏/失效名单、dnd5e 投影与命令、GM/玩家权限、未知版本拒绝、Hook 合并、失败恢复、双 Surface、Manifest、语言、License、依赖边界、确定性 ZIP 和安装 hash。
- 执行 `bun run test:open-session-deck`、`bun run build:open-session-deck`、`bun run typecheck:foundry-modules`、`bun run architecture:verify`、`bun run agents:generate`、`bun run agents:check` 与 `bun run ci:verify`。
- 安装验证报告保持 `runtimeVerified: false`，直到真实 Foundry 验收完成。

### Foundry Lab 语义验收

- 在 `fvtt-v14-module-matrix` 使用任务创建的临时 Actor、Token 和 Combat 做写操作；不修改既有世界文档、不创建备份，验收后精确删除任务创建对象。
- 在 `cor-cotn` 只读确认真实角色数量、长名称、头像、权限与当前遭遇能正常投影。
- 使用一个 GM 主窗口和至少一个玩家客户端验证：玩家无入口/API 权限；GM 单次登录可同时使用面板和副屏；副屏无登录、Canvas 或第二条 Foundry WebSocket；双 Surface 与原生角色卡同步；伤害/治疗/临时 HP/死亡恢复/专注/灵感/力竭/状态保留原生语义；回合推进和 Token 定位正确；删除、权限变化、重复点击和失败路径不会留下假状态。
- 在 `1920×1080`、`1280×720` 和小于 `960px` 的窗口进行目视验收，确认双栏/分页、溢出、颜色之外的信息表达以及中英文布局。
- 性能基准、长时 soak 和四小时真实团务不作为 v0.1 门槛；本地 Lab 不代表生产验收。本任务不连接、不安装、不修改远程 8080。
