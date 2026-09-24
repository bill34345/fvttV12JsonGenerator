# 参数化 Custom Conditions「灼烧」的 HUD 入口

> 后续范围说明：本页只记录当时「灼烧」相对原生「燃烧」的独立入口与现场验收。用户随后发现自定义「流血」也缺入口，引发[全 19 项 HUD / 状态 ID 审计](2026-09-24-all-custom-condition-hud-audit.md)。本页的灼烧 PASS 不能代表流血或其余 17 项已完成本轮统一修复及页面验收。

日期：2026-09-24。目标环境仍是 server-mirror 的 CoTN `cor-cotn`，Foundry 14.364 / dnd5e 5.3.3。本文记录本地候选变更及验收边界；它不把此前原生 Burning 的浏览器截图当作自定义入口的通过证据。

## 用户问题与区分

用户指出的是：可填写骰式和伤害类型的 **Custom Conditions「灼烧」**（内部 ID `burning`）在 Token Action HUD 中没有入口。2026-09-23 的[现场记录](2026-09-23-cotn-burning-hud.md)及截图只确认 dnd5e 原生「燃烧」可见；该按钮不能建立参数化实例，不能作为本问题的解决结果。先前把「原生按钮可见」解释为这一项已处理，判断对象错误。

## 候选行为

- 保留 dnd5e 原生裸 ID `burning` 的状态、规则、图标与 HUD 按钮。
- 为本模块增加独立的 `fvtt-custom-conditions.burning` HUD 项，中文状态名称和 HUD 标签均为「灼烧」，英文 HUD 标签为 `Custom Burning`。原生按钮仍称「燃烧」，两者不共用同一按钮语义。先前草稿中的「自定义燃烧」已被用户修正，不再作为中文 UI 名称。
- 灼烧在 Foundry 原生 Token HUD 中设置 `hud: false`，避免原生 `toggleStatusEffect()` 绕过必填参数或删除已配置效果；Token Action HUD 2.1.1 仍从 `CONFIG.statusEffects` 枚举该项，并由本模块的点击拦截器处理。原生「燃烧」保持原有 HUD 行为。
- active GM 在只有一个明确目标 Actor 时点击灼烧项，会打开绑定该 Actor、预选灼烧（内部 ID `burning`）的状态管理器。HUD 点击本身不会施加无参数效果；GM 在管理器中显式填写 `formula` 和 `damageType`，由既有参数校验拒绝缺项。
- 已存储的旧 `flags.fvtt-custom-conditions.condition` 灼烧实例仍可读取与显示，不因 HUD 入口改变而迁移或删除。

## 验收分层

- **历史 PASS，仅原生按钮**：在 CoTN 所选 Token 的效应组中看到 `actionId=burning`；证据见 2026-09-23 现场记录。
- **候选静态检查 PASS**：实现已固定状态 ID、点击路由、Actor 绑定、空参数拒绝与旧 flagged 实例读取；Custom Conditions 模块测试 71/71、受影响 effectProfile 测试 33/33、模块类型检查与构建通过。这些检查不证明 CoTN 页面已经显示新按钮。
- **CoTN 新入口视觉与表单打开 PASS**：2026-09-24 的独立外部 Chrome 在同一个 Token Action HUD「效应」列表看见「燃烧」与「灼烧」两个按钮。只点击「灼烧」后，Custom Conditions Manager 显示所选 Token 对应的 Actor「泽菲尔·艾什伍德」、预选「灼烧」，参数 JSON 初值为 `{"formula":"","damageType":""}`；没有提交、施加或停用状态。浏览器 AX 证实两个不同标签及管理器内容；AX 不暴露 `actionId`，原生 `burning` 与本模块 `fvtt-custom-conditions.burning` 的 ID/图标映射另由精确安装源码和文件哈希核对，不能误称为浏览器直接读到 DOM 属性。证据见 `F:/FoundryLab/foundry-v14/evidence/condition-optimizations-20260924/chrome-custom-burning-localhost/chrome-run-20260924.md`，原字节 CUA 截图及提取来源见同目录 `burning-and-scorching-hud.jpg`、`scorching-manager.jpg` 和 `screenshot-provenance.json`。
- **未执行的边界**：本轮按用户要求未提交参数、结算伤害或重跑旧玩法规则；空参数拒绝由单测覆盖，未在 CoTN UI 中尝试。Frozen 五段新版浮框因 Chrome 控制接口缺少可靠悬停/tooltip 读取，仍为视觉 **NOT_EXECUTED**。首次使用 `127.0.0.1:30001` 的 Chrome 标签登录成功提示后返回 `/join`；后以 `localhost:30001` 进入同一 PID 32428 的 server-mirror 世界。两主机名的会话隔离是排查假设，未读取 Cookie 来证明具体冲突。

这次入口变更不要求重跑先前已通过的整套独立世界规则 E2E；若发现新入口引入行为回归，再针对该路径补测。
