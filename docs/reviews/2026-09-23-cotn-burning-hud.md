# CoTN 中 Token Action HUD 的 Burning 显示核查

> 2026-09-24 勘误：本页记录的是 **dnd5e 原生 `burning`** 的历史现场核查。用户所说的「自定义 Burning 没有 HUD 入口」指带骰式和伤害类型的 Custom Conditions Burning；原生按钮可见并未解决该问题。新候选设计见[自定义 Burning HUD 记录](2026-09-24-custom-burning-hud.md)。以下 PASS 仅属于原生按钮，不能用于新入口的视觉或功能验收。

日期：2026-09-23。目标：server-mirror 的 `cor-cotn`「溟渊的呼唤」，Foundry 14.364 / dnd5e 5.3.3，端口 30001。证据为独立外部 Chrome 任务的现场记录：`F:/FoundryLab/foundry-v14/evidence/condition-burning-hud-20260923/chrome/report.md`、`dom-observations.json`；截图保存在该任务的 CUA 记录中，未导出成单独 PNG。

## 结论与操作

所选 Token「卡勒姆·维雷」的 Token Action HUD **有原生** Burning 按钮。鼠标离开 HUD 时动作区隐藏；在 HUD 上打开「效应」组后，系统状态子组中可见唯一 `actionId=burning`、名称「燃烧」的按钮。检查时它没有隐藏祖先、未被视口裁切，页面保留「效应」展开状态供人工查看。这项观察只说明原生按钮在该 Token 上存在；不能由此推断用户要找的参数化「灼烧」入口已经存在。

该按钮的图标是 dnd5e 的 `systems/dnd5e/icons/svg/statuses/burning.svg`，tooltip 指向 dnd5e Compendium 规则项。这是原生 Burning 控件；点它不能等同于施加带骰式和伤害类型参数的 Custom Conditions Burning 实例。后者仍须通过本模块管理器或其公开 API 操作。

## 已执行与边界

- **PASS**：浏览器当前为 Gamemaster，30001 指向预期 `server-mirror`、`cor-cotn`；`/api/status` 报告 Foundry 14.364、dnd5e 5.3.3。Token Action HUD Core manifest 为 2.1.1。
- **PASS**：所选 Token 的「效应」组内有唯一 Burning 按钮，按钮启用且完整落在当前视口内；打开该组后可见。
- **NOT_EXECUTED**：没有点击 Burning、施加状态或测试结算与重载持久性；没有修改 Actor、Token、布局或模块配置。
- **NOT_EXECUTED**：浏览器只读 evaluator 不能访问实时 `window.game`、`CONFIG`、`localStorage`，因此未直接读到 `CONFIG.statusEffects` 归属或该用户持久化的 TAH `userSelected` 字段。已渲染的按钮只证明这个 Token 当前有效 HUD 布局包含 Burning，不证明其他 Token 的布局相同。
- **NOT_EXECUTED**：已有 Gamemaster 会话，无需重新走 `/join` 登录。没有触碰 30002。

若另一个 Token 在已展开的「效应」组里仍缺 Burning，应先检查那个 Actor 的 TAH 布局项 `burning`；不要把本例推论成所有 Token 均正常，也不要为单个布局缺项改变状态所有权或全局冲突逻辑。

## 再次定位给用户查看

同日另一轮外部 Chrome 在现有 Token「秋」上再次找到原生「燃烧」按钮。选中 Token 后打开 Token Action HUD 的「效应」组，在「状态」网格第二行，它位于「目盲」右侧、「魅惑」左侧；没有点击或施加该状态。页面最终停在这一展开位置，30001 仍为 `cor-cotn`，77 个启用模组的数量未变。

原始 CUA 截图已从该轮完成的任务记录中按原字节提取为 `F:/FoundryLab/foundry-v14/evidence/condition-optimizations-20260923/chrome-frozen-followup/burning-hud-final.jpg`，来源行号、SHA-256 和未修改字节的记录见同目录 `screenshot-provenance.json`。这张图证明所选 Token 的原生按钮可见，不证明自定义 Burning 的参数化 HUD 入口存在。用户要求不重复做已测功能，因此本轮只展示 HUD；Frozen 五段新版提示在这轮 Chrome 工具中没有可靠悬停/DOM 读取路径，仍标为 **NOT_EXECUTED**，不借静态测试冒充视觉通过。
