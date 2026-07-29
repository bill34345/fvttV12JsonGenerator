# Chat Memory Guard v1.0 运行时验收报告

日期：2026-07-27
目标环境：Foundry VTT 14.364、dnd5e 5.3.3、MIDI-QOL 14.0.11
当前状态：**机械验证、GM 运行时验收与非 GM 隐私实测均通过；`CHAT-MEM-001` 已关闭**

## 已完成的机械验证

- 模块单元与集成测试：26/26，通过 70 个断言。
- Foundry Lab 回归：172/172，通过 1072 个断言。
- 最终全仓测试：1421/1421，通过 6659 个断言。
- `typecheck:production`、`typecheck:all`、`ci:verify` 全部通过。
- `ci:verify` 同时通过生产覆盖率、反过拟合审计、仓库卫生检查、Web 构建和 Actor smoke。
- 连续两次从当前源码构建得到相同 ZIP SHA-256：
  `807A40FE488F6FB2D60615B693A5EE0D0A36F754F07BB1C655C23A3F22850C6F`。
- 模块已安全安装到项目本地镜像：
  `.local/foundry-v14/data/server-mirror/Data/modules/chat-memory-guard`。
- 本地 Foundry 14.364 已在 `127.0.0.1:30001` 启动，目标世界为 `cor-cotn`。

## 已完成的代码语义复核

- 聊天裁剪只移除已渲染 DOM，不删除 `ChatMessage` 文档。
- 只有位于底部时才裁剪；向上阅读历史时暂停裁剪。
- 动画删除使用 pending ID、DOM mutation 确认和有界重试，避免同一窗口重复提交。
- 头像替换同时覆盖 Core `renderChatMessageHTML` 和 dnd5e `dnd5e.renderChatMessage` 阶段。
- 非 GM 用户只在对 Actor 具有 OBSERVER 权限时使用身份相关头像；不按名称猜测 Actor 或 Token。
- 缩略图缓存具有并发去重、LRU 上限、Blob URL 回收、失败降级和刷新竞态防护。
- 诊断接口只暴露聚合统计，不暴露消息内容或媒体内容。
- MIDI-QOL 是精确版本推荐依赖，不会在缺少 MIDI-QOL 时阻止模块本身启用。

## GM 真实运行时验收

- 模块已在 `cor-cotn` 中启用；`game.modules.get("chat-memory-guard").api.getStats()` 可用，默认有效设置为启用、保留 40 条、token 缩略图、128px、质量 75。
- 禁用模块后向上加载历史，DOM 从 25 增至 50，`trimmedMessages` 保持 0。
- 在仍向上阅读时重新启用模块，DOM 保持 50，没有裁剪。
- 回到底部后 DOM 收敛到 40，10 条已确认移除，pending 为 0；继续向上加载后，一条刚被裁剪的消息 `MNsGSZgeLL94rBD9` 重新出现，证明历史可重渲染。
- 从重新加载的 21 小时前 MIDI 卡片 `srbKI5VT5AcPUifn` 执行真实感知豁免，生成新消息 `tbnSdXkY3DeTUie4`，结果为 `1d20 = 16`，并保留 `originatingMessage` 关联。
- A/B 前 510 条消息的 ID、内容和 speaker 指纹为
  `4600D0E0CCC054C8D8E7AEFC25315A80BD00142EA63D634B9E1F13E830CA46C6`；
  测试后排除新豁免消息的原 510 条指纹完全相同。数据库总数从 510 变为 511，仅增加了上述测试豁免，没有删除或改写原消息内容。
- 默认 token 缩略图模式产生 Blob URL 和有界缓存；隐藏模式在 15/15 个抽样卡片上移除媒体、保留 sender；系统原图模式恢复 15/15 个非 Blob 原图；最后已恢复默认设置。
- 侧边栏与 popout 分别加载到 40；两者最后消息均为 `tbnSdXkY3DeTUie4`，pending 为 0。
- 首次实测发现 popout 关闭后监听器未释放；已按 Foundry 14.364 `closeChatLog` 生命周期增加清理并回归。修复后 listener 计数为 `1 -> 2 -> 1`，关闭后的 popout `rendered=false`。
- 首次实测还发现入口在 ES module 导入时错误依赖尚未建立的 `game` 全局；已改为仅依赖 `Hooks` 注册并在 init/ready 时惰性读取 game，真实重载后 active/API 均通过。
- 世界实际语言代码是 `cn`，原清单只声明 `zh-CN`，首次 UI 检查因此显示英文设置按钮；已增加 `cn`/`zh-CN` 双映射。服务端重启后 `game.i18n`、设置入口和完整设置表单均显示中文。
- 为精确执行 A/B 和旧卡片动作，测试期间通过浏览器开发接口临时更改模块世界设置、滚动位置和指示物选择；世界/客户端设置已恢复默认，指示物选择已释放。唯一持久新增数据是上述一条豁免 ChatMessage。
- 最后一轮全仓首次运行出现两个无关 GoddessFantasy crawl 临时目录 lock 竞态；对应 API 文件随后 28/28 通过，全仓重跑 1421/1421 通过，最终 `ci:verify` 也通过。该瞬时失败没有用作绿色证据。

## 非 GM 真实运行时验收

- 使用无密码普通玩家 `SY` 成功登录同一 `cor-cotn` 世界；运行时确认 `game.user.isGM=false`，模块 active，默认有效设置仍为启用、保留 40 条、token 缩略图、128px、质量 75。
- 默认 token 模式抽样到 17 个玩家对其 Actor 不具有 OBSERVER 权限的可见聊天卡。模块没有把这些卡替换为 token 缩略图：它们保持 Foundry/dnd5e 已提供的非 Blob 系统头像；玩家拥有 OBSERVER 权限的 `卡勒姆·维雷` 卡片则使用模块生成的 Blob 缩略图。该对照证明模块的身份相关替换遵守 OBSERVER/GM 门槛。
- Foundry/dnd5e 自身提供的系统头像有时与 Actor 肖像相同。模块在无 OBSERVER 权限时不会进一步替换成 Token/Actor 图，但也不会承诺修正 Foundry 系统本身已经选择的头像；若需要完全隐藏，应使用模块的“隐藏头像”模式。
- 将该玩家的客户端覆盖临时切换为“隐藏头像”后，21/21 个已渲染聊天卡头像容器全部标记为隐藏，头像容器内 `img`/`video` 节点为 0、带 `src` 的头像媒体为 0，21/21 个 sender 文本仍保留。模块诊断同时报告缩略图缓存条目 0、估算字节 0、失败计数 0、监听器 1。
- 玩家客户端覆盖随后恢复为“跟随世界默认值”；再次确认隐藏标记为 0、默认 token 缩略图行为恢复。浏览器最后也恢复到已就绪的 `Gamemaster` 会话；没有读取密码存储、猜测密码、重设账号或修改 LevelDB。

## 明确的能力边界

- “隐藏头像”能保证模块处理完成后的聊天卡 DOM 不保留头像 `img`/`video` 或 `src`，并清空模块自有缩略图 Blob 缓存；它因此消除了这些头像在已处理卡片中的长期 DOM/模块缓存占用。
- 它不能保证绝对“从未渲染、零瞬时内存”：Foundry Core/dnd5e 会先生成聊天卡，模块随后在 `renderChatMessageHTML` / `dnd5e.renderChatMessage` 生命周期中移除头像。浏览器可能已发生极短暂的请求、解码或网络缓存保留，这不受该后处理模块完全控制。
- 长时间跑团稳定性及全部第三方聊天卡片兼容性仍按批准计划保留为用户观察边界；本报告不把短时 A/B 外推为整场跑团的绝对内存上限。

自动化、GM 与非 GM 规定验收项现均已完成，`CHAT-MEM-001` 按 ExecPlan 的关闭条件收口。
