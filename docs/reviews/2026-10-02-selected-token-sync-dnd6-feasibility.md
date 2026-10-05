# 框选Token同步的dnd5e6适配评估

日期：2026-10-02。用户询问 `fvtt-selected-token-sync` 能否用于dnd5e6。本轮只读检查包和目标源码，未修改实现、安装、启用、更新世界或执行浏览器功能测试。

## 结论与当前状态

这是本仓自有模块，版本0.1.0。可以适配Next，但当前不能标为已支持6.x；除了声明范围以外，dnd5e6的分级状态处理存在需要修正的实际语义差异。

- 仓库 `src/module.json` 和Mirror已安装manifest均将Core minimum/verified/maximum固定为14.364，将dnd5e固定为5.3.3。局部AGENTS、README和 `build.ts#validateManifest` 使用同一范围；仅修改manifest会被现有构建校验拒绝。
- 2026-10-02上海18:39/18:46的既有真实模块管理器审计证明Mirror当前matrix世界及线上cor-cotn启用0.1.0；Next当时未安装。本轮再次检查Next模块目录仍不存在。启用不代表状态同步玩法验收。
- Next目标Core14.368/dnd5e6.0.5。没有为本模块取得该组合的运行时证据，健康状态保持Untested/NOT_EXECUTED。

## 可复用的实现与实际差异

`src/index.ts` / `src/core.ts` 和Mirror安装的 `scripts/index.js` 使用 `Actor.toggleStatusEffect`、ActiveEffect创建/删除hooks、`TokenDocument.updateDocuments`、`movementAction`、`CONFIG.statusEffects` 和 `CONFIG.Token.movement.actions`。未见读取职业、法术、Advancement、dnd5e角色system字段或私有Midi/DAE接口，也没有运行时精确版本assert。现有实现支持对象/数组两种状态配置；只写Token移动方式，不写Actor移动速度。

精确Core14.368本机源码的Token HUD仍有 `div.status-effects`、`data-status-id`、movementActions palette和 `data-movement-action`；Actor方法和TokenDocument字段也仍存在。移动方式部分具有较直接的接口复用依据，尚未实机验收。

但dnd5e6.0.5的TokenHUD5e在左/右键处理状态时传入 `levels: +1/-1`；Actor5e对分级状态先调用ConditionData._applyDelta。疲乏在此配置为6级；已有状态升/降级通常是更新ActiveEffect的 `system.level`，并非创建/删除。

本模块当前意图只记录布尔active/overlay，仅监听创建/删除；它无法完整捕获这种已有分级状态的更新。另右键contextmenu分支会拦截默认动作并调用 `toggleStatusEffect(statusId, {active, overlay:true})`，未传levels；目标6源码对分级状态缺省levels为+1。由代码可判断存在与原生右键减级不一致的路径，不能把版本放宽当作完成适配。是否影响具体客户端手势及表现仍待真实HUD验收，不把静态判断描述为已经回放的失败。

## 后续最小适配与边界

保留模块ID与现有开关/权限/linked Actor去重、合成Actor隔离和递归保护。更新声明、构建校验和说明；针对HUD发起的分级状态定义并实现正确的等级增减/同步，不将物品、法术、DAE/Midi程序化效果纳入批量复制。

候选验证优先覆盖普通状态添加/删除、overlay、疲乏首次添加与已有状态升/降级、默认/null和可选movementAction、无权限目标、同Actor多个linked Token、合成Actor、其他客户端只接收一次更新以及正常重载/本任务对象清理。原14.364/5.3.3支持是否继续声明，按最终实现与受影响回归证据决定，不提前升级健康状态。

本轮没有安装/启用或解除旧迁移排除。Next接纳和测试为后续范围决定；不修改Mirror/生产、不创建备份/额外实例、不停止服务、不直接编辑LevelDB。

## 来源与证据层级

- 仓库owner：`foundry-modules/fvtt-selected-token-sync/` 的AGENTS、README、manifest、index.ts、core.ts、build.ts及已有测试源。未运行构建或测试，避免把旧目标机械检查作为6运行证据。
- Mirror实际模块根：`F:/FoundryLab/foundry-v14/data/server-mirror/Data/modules/fvtt-selected-token-sync`。manifest SHA256 `70cd0e244b2ffc7d6c12b75c3389ef5b04c9af6bf2f30060082e900544528ac3`；安装bundle SHA256 `43123bd971c74065113609b71a53f413acee7b9728784edd35b97347774aacad`。
- Core实际14.368源码：`F:/FoundryLab/foundry-v14/app/14.368/client/applications/hud/token-hud.mjs`、`templates/hud/token-hud.hbs`、`client/documents/actor.mjs`、`common/documents/token.mjs`。
- 6.0.5固定tag参考源码：`F:/FoundryLab/reference-cache/dnd5e/6.0.5/repo`，HEAD `3ee48de02f8f6f7b2638c9f6cf3e9540c9c181cc`；Actor、TokenHUD、ConditionData和config。Next安装包仅有构建后的dnd5e.mjs，没有这些源文件路径；本轮没有取得源文件与安装bundle的字节一致证明，目标版本身份来自已安装system.json和此前运行时审计。
- AnySearch成功读取[官方v14 Actor API](https://foundryvtt.com/api/v14/classes/foundry.documents.Actor.html)和[官方6.0.5固定tag TokenHUD源码](https://raw.githubusercontent.com/foundryvtt/dnd5e/release-6.0.5/module/applications/hud/token-hud.mjs)。API作导航，行为差异以精确源码为依据。
- 状态审计引用[三环境实时对账](2026-10-02-servernext-live-modules-comparison-and-wall-tools.md)。本轮没有重新登录或重放已接受清单。

待适配项：面向现有Next的Selected Token Sync候选。静态接口复用有依据；普通状态、分级状态、权限、多客户端和持久化均未取得6运行验收。无发布动作。
