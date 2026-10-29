# 中文 English 显示名与默认动画匹配：安装源码核对

日期：2026-10-25。任务范围：只读核对 ServerNext 已安装 Automated Animations 与 D&D5e Animations 的名称匹配，辅以维护者文档和原始问题报告；只新增本报告。未修改模块、配置、服务、世界、Actor、Item 或最终 JSON，未运行浏览器、导入、战斗或动画播放验收。

## 结论与使用影响

用户要求生物名称及独立特性、动作、反应、附赠动作、物品的显示名使用“中文 English”，不用括号。保留英语有明确的检索价值，也能保留一部分默认动画的包含匹配，例如 `长剑 Longsword`。**它不能保证默认动画全部兼容**：安装预设中的 `Fireball`、`Rage`、Active Effect 的 `Bless` 等要求整个名称精确相等，添加中文之后不会命中相应条目。

已核实名称匹配顺序与来源：

1. dnd5e Activity 的名称先加入 `overrideNames`，其后才搜索所属 Item 的名称；另有弹药优先路径。
2. Item 名称来自 `item.name ?? item.label`；Active Effect 被作为 item 传入，因此搜索的是效果自己的名称。
3. 这两个模块没有内置从 `flags.babele.originalName` 或 `system.identifier` 自动取得匹配原名的路径。仅把英文原名放入这些字段，不能令它们的默认识别恢复。
4. AA 提供 `aa.getRequiredData` 扩展钩子，其他模块可以向 `overrideNames` 添加原名。是否有其他已启用模块注册该钩子、世界是否接收过该版本预设、具体动画资源是否存在，本次未做完整运行时核实。

因此，“中文 English”可以作为用户已选的显示与检索规则；精确匹配条目的兼容需要独立的动画配置或原名适配证据，不能附带宣称已经解决。

## 版本与证据边界

安装根：`F:/FoundryLab/foundry-v14/data/server-next/Data/modules/`。

| 对象 | 本机版本 / 来源 | 本次确认范围 |
| --- | --- | --- |
| Automated Animations | `autoanimations/module.json`，7.1.3；加载 `dist/autoanimations.js` | 发布包的匹配器、dnd5e hooks、扩展钩子 |
| D&D5e Animations | `dnd5e-animations/module.json`，3.3.0 | 预设文件及其向 AA 菜单的更新路径 |
| dnd5e | `Data/systems/dnd5e/system.json`，6.0.6 | 仅用来选择 AA 的 `game.system.version > 6` 分支；不是系统运行验收 |
| Babele | `babele/module.json`，2.9.1 | 仅追加窄检索：JS 中没有找到字符串 `aa.getRequiredData`；未审计全部第三方模块 |

关键安装文件 SHA-256：

```text
autoanimations/dist/autoanimations.js
605A9A3296FA1083D0961C34AD71F41F7ED4862E3D1A551196CDA86A400C0814

dnd5e-animations/module/autorec.json
B5244E40E257EC13D438E4F2B2BEE774D3E8E8E09D4FE26C4D938418C344510C
```

AA 安装包带 source map，内含原始源文件。已在线取得 7.1.3 tag 的三个相关 JS 文件，以及 D&D5e Animations 3.3.0 tag 的 `autorec.json`、`updateMenu.js`，与安装包对应内容比较；统一 CRLF/LF 后五项均完全相同。以下 tag 源码行号因此可对应当前安装内容，构建包行号另列供本地复核。

证据分层：安装源码与在线 tag 一致为 **VERIFIED_SOURCE**；在隔离 Node 进程运行安装包原匹配函数为 **VERIFIED_OFFLINE_LOGIC**；Foundry 内 hook 是否实际触发、现用世界菜单内容、素材/宏执行与播放效果为 **NOT_EXECUTED**。

## 两模块的职责与实际名称路径

### Automated Animations 7.1.3

| 输入 / 分支 | 源码事实 | 精确定位 |
| --- | --- | --- |
| 普通 Item | `item.name ?? item.label`，不是 Actor 名称 | [findAnimation.js:10–13](https://github.com/theripper93/autoanimations/blob/7.1.3/src/system-handlers/findAnimation.js#L10-L13)；安装构建包 15620–15623 |
| dnd5e Activity | 非空名称先放进 `overrideNames`；仅剔除 trim 后恰好等于小写 `heal` / `summon` 的名称 | [aa-dnd5e.js:14–27](https://github.com/theripper93/autoanimations/blob/7.1.3/src/system-support/aa-dnd5e.js#L14-L27)、[29–65](https://github.com/theripper93/autoanimations/blob/7.1.3/src/system-support/aa-dnd5e.js#L29-L65)；安装构建包 108944–109003 |
| 候选名称优先级 | 依次尝试 `overrideNames`、Item 名、`extraNames`，第一个匹配即停止；不是把所有名称并成一个字符串 | [findAnimation.js:67–81](https://github.com/theripper93/autoanimations/blob/7.1.3/src/system-handlers/findAnimation.js#L67-L81)；安装构建包 15670–15684 |
| 弹药 | 若启用且命中，先返回弹药自定或按弹药名称匹配的配置 | [findAnimation.js:43–50](https://github.com/theripper93/autoanimations/blob/7.1.3/src/system-handlers/findAnimation.js#L43-L50)；安装构建包 15644–15651 |
| 自定动画 / 禁用 | Activity/Item 自定配置优先于普通名称搜索；启用、禁用和全局自动识别开关会改变结果 | [findAnimation.js:24–26](https://github.com/theripper93/autoanimations/blob/7.1.3/src/system-handlers/findAnimation.js#L24-L26)、[53–75](https://github.com/theripper93/autoanimations/blob/7.1.3/src/system-handlers/findAnimation.js#L53-L75)；安装构建包 15629–15631、15654–15678 |
| Active Effect | 效果以 `item: effect, activeEffect: true` 传给 AAHandler；匹配效果 `name ?? label`，只搜索 aefx 菜单 | 安装构建包 23221–23228；[findAnimation.js:59–64](https://github.com/theripper93/autoanimations/blob/7.1.3/src/system-handlers/findAnimation.js#L59-L64)，构建包 15662–15667 |
| Babele 原名 / identifier | AA 构建包中 `babele`、`originalName`、`.identifier` 无命中；上述候选读取链没有这些字段 | 前述 `findAnimation.js` 与 `aa-dnd5e.js`；本报告离线反例验证字段存在仍不匹配 |
| 外部原名适配 | 数据整理结束后初始化两组名称数组，并发出 `aa.getRequiredData`；外部模块可添加原名 | 安装构建包 108863–108866；[getRequiredData.js](https://github.com/theripper93/autoanimations/blob/7.1.3/src/system-support/getRequiredData.js)；维护者解释见下节 |

这里的“没有内置读取”限于所核对版本及其默认路径。扩展模块可以通过钩子改变输入；运行时注册情况不能由两个安装包单独证明。`data.originalItem.name` 的变体回退也不能当成 Babele 的 `flags.babele.originalName`：源码明确是不同数据路径。

### 名称比较规则

[aaAutorecFunctions.js:7–10](https://github.com/theripper93/autoanimations/blob/7.1.3/src/aa-classes/aaAutorecFunctions.js#L7-L10) 只将名称中的空白删除并转为小写，不会自动删除中文、括号、连字符或其他标点。

- 精确条目：`entry.label === trueName`，直接比较完整原字符串，大小写和空格也保留其影响。
- 普通条目：`rinseName(candidate).includes(rinseName(entry.label))`，并检查 `excludedTerms`。它是子串包含，不是英语词边界、模糊语义或中英文翻译匹配。
- 条目先按去空白后的标签长度降序；精确条目先查，再查普通条目。因此更长的匹配通常优先，但 Activity 和 Item 之间仍服从前述候选名称顺序。

依据：[aaAutorecFunctions.js:13–36](https://github.com/theripper93/autoanimations/blob/7.1.3/src/aa-classes/aaAutorecFunctions.js#L13-L36)、[74–98](https://github.com/theripper93/autoanimations/blob/7.1.3/src/aa-classes/aaAutorecFunctions.js#L74-L98)；安装构建包 15511–15533、15567–15580。

### D&D5e Animations 3.3.0

本模块提供预设，并将它们交给 AA，名称比较由 AA 执行。`module/updateMenu.js:9` 读取 `module/autorec.json`，14–56 行读取世界的 AA 菜单，530–533 行通过 `AutomatedAnimations.AutorecManager.overwriteMenus()` 写入整理后的配置。更新菜单自身用 label 精确比较来判断预设是否已存在，这与使用 Item 时的动画匹配是两件事。依据：[updateMenu.js](https://github.com/MrVauxs/dnd5e-animations/blob/3.3.0/module/updateMenu.js#L7-L56)、[125–168](https://github.com/MrVauxs/dnd5e-animations/blob/3.3.0/module/updateMenu.js#L125-L168)、[507–533](https://github.com/MrVauxs/dnd5e-animations/blob/3.3.0/module/updateMenu.js#L507-L533)。

安装预设共有 1289 条，其中 `advanced.exactMatch === true` 的有 38 条：ontoken 8、preset 10、aefx 20。这是安装文件的计数，不代表世界现用配置、实际可播放数量或其他条目都已兼容。

可复核样本，以下行号直接对应安装的 `module/autorec.json`：

| 条目 | 菜单 | 标签行 | 精确配置行 | 对双语显示名的影响 |
| --- | --- | --- | --- | --- |
| Longsword | melee | 12757 | 未启用 `advanced.exactMatch` | `长剑 Longsword` 可包含匹配 |
| Rage | ontoken | 152361 | 152583，true | `狂暴 Rage` 不等于 `Rage` |
| Fireball | preset | 231961 | 232053，true | `火球术 Fireball` 不等于 `Fireball` |
| Bless | aefx | 240681 | 240802，true | `祝福术 Bless` 不等于效果标签 `Bless` |

在线对应文件：[autorec.json at 3.3.0](https://github.com/MrVauxs/dnd5e-animations/blob/3.3.0/module/autorec.json)。大文件可通过 [raw 版本](https://raw.githubusercontent.com/MrVauxs/dnd5e-animations/3.3.0/module/autorec.json) 搜索标签及相邻 `advanced`。

## 离线反例：执行安装包原函数

为验证源码解释，使用独立 Node 进程读取 AA 的 source map，抽取其中 `AAAutorecFunctions` 和 `handleItem` 两份原源码，移除 import/export 声明，在 `vm` 中执行。`game.settings.get` 仅返回安装的 D&D5e Animations 预设；`flagMigrations.handle` 固定为空配置，无自定、禁用或外部 hook。没有导入整个模块，也没有创建 Foundry 文档或写入服务。

本次执行 12 个样例，实际返回：

| 输入名称与条件 | 返回条目 |
| --- | --- |
| Item `Longsword` | melee / Longsword |
| Item `长剑 Longsword` | melee / Longsword |
| Item `长剑`，另有 `flags.babele.originalName=Longsword`、`system.identifier=longsword` | false |
| Item `Fireball` | preset / Fireball，exactMatch=true |
| Item `火球术 Fireball`，另有 Babele 原名与 identifier | false |
| Item `Rage` | ontoken / Rage，exactMatch=true |
| Item `狂暴 Rage` | false |
| Active Effect `Bless` | aefx / Bless，exactMatch=true |
| Active Effect `祝福术 Bless` | false |
| Item `长剑 Longsword`，Activity 候选为 `啃咬 Bite` | ontoken / Bite，证明 Activity 先查 |
| Item `火球术 Fireball`，另有候选 `Fireball` | preset / Fireball，证明单独原名候选可以通过精确匹配 |
| Item、Activity 候选均为 `火球术 Fireball` | false |

`false` 仅表示该离线输入在安装预设中的匹配失败，不是已观察到某个真实世界角色的播放失败。样例中的中文用于说明格式，不是本报告对译名标准作出的裁定。

复核核心命令，PowerShell 中将下段 here-string 管道传给 `node` 即可；只读本机文件，未写测试脚本：

```powershell
@'
const fs = require('fs');
const vm = require('vm');
const base = 'F:/FoundryLab/foundry-v14/data/server-next/Data/modules/';
const map = JSON.parse(fs.readFileSync(base + 'autoanimations/dist/autoanimations.js.map', 'utf8'));
const presets = JSON.parse(fs.readFileSync(base + 'dnd5e-animations/module/autorec.json', 'utf8'));
const context = {
  custom_warning() {}, debug() {},
  flagMigrations: { handle: async () => ({}) },
  game: { settings: { get(module, key) {
    return key === 'disableAutoRec' ? false : presets[key.replace('aaAutorec-', '')] || [];
  } } }
};
vm.createContext(context);
const source = (suffix) => map.sourcesContent[map.sources.findIndex(p => p.endsWith(suffix))];
vm.runInContext(
  source('/aaAutorecFunctions.js').replace(/^import .*$/mg, '').replace('export class ', 'class ')
  + '\n' + source('/findAnimation.js').replace(/^import .*$/mg, '').replace('export async function ', 'async function ')
  + '\nthis.probe = handleItem;', context);
(async () => {
  for (const name of ['Longsword', '长剑 Longsword', 'Fireball', '火球术 Fireball', 'Rage', '狂暴 Rage']) {
    const result = await context.probe({ item: { name } });
    console.log(JSON.stringify({ name, matched: result && { label: result.label, menu: result.menu } }));
  }
})();
'@ | node
```

## 维护者文档与真人失败报告

公开检索先按 `firsthand-research` 与 AnySearch 技能执行，先发现 code/gaming 子域，再使用混合/一般查询和 code.snippet 定向查询。初始查询包含 Babele 翻译后动画不识别的实际问题方向。code.snippet 未返回本仓库相关代码，不能作为证据。Wiki 的两个 AnySearch 正文入口均返回 `Unable to extract content from the URL`；后通过 web 只读访问维护者 Wiki。GitHub issues/PR 正文随后由 AnySearch 成功提取。

1. [维护者 Wiki：Name Matching](https://wiki.theripper93.com/free/autoanimations#name-matching) 描述按名称包含搜索并优先较长名称；[Active Effect Animations](https://wiki.theripper93.com/free/autoanimations#active-effect-animations) 说明效果名称/标签参与匹配；[Custom Item Settings](https://wiki.theripper93.com/free/autoanimations#custom-item-settings) 说明可以在 Item 上单独配置。Wiki 是动态文档；精确比较的最终事实以已锁定 7.1.3 源码为准。
2. [D&D5e Animations #17，Supporting other languages than English](https://github.com/MrVauxs/dnd5e-animations/issues/17)，2023-07-05：法语用户报告翻译后的名称不匹配，且直接改预设名称有后续维护问题。维护者当时认为应由 AA 处理 Babele。该旧回复不能当作当前安装已兼容的证明。
3. [D&D5e Animations #36，Babel translations](https://github.com/MrVauxs/dnd5e-animations/issues/36)，2025-03 至 05：用户反复报告只显示译名时不能识别；维护者起初认为 AA 已读取原名，后续讨论提出应由 AA 或翻译适配提供原名，并链接实现提案。这条讨论直接说明“存在 Babele 原名”与“AA 会读取原名”不能画等号。
4. [AA PR #15，维护者 2025-05-13 最终回复](https://github.com/theripper93/autoanimations/pull/15#issuecomment-2876338905)：该 Babele 内置支持提案未被采纳；维护者改为提供 `aa.getRequiredData`，要求改名模块自行在钩子中获取原名并加入 `data.overrideNames`。安装 7.1.3 的钩子和候选搜索路径与此一致。

这些原始材料改变的是对集成责任与兼容保证的判断：不能因旧 issue 的“应该已经支持”就宣称默认兼容；当前证据支持“需要候选原名或自定配置”。它们没有证明当前机器运行时已经接上适配，也没有证明所有第三方自动化都采取同一种规则。

## 字段建议与待判断项

以下是从本次动画源码推得的建议，未提升为用户已经确认的新要求，也未实施：

| 对象 | 建议及理由 | 已知限制 |
| --- | --- | --- |
| Actor 名称 | 按用户选择使用“中文 English”，便于人类检索和识别 | 两模块的默认动画检索不以 Actor.name 为候选，不能据此声称生物动画自动兼容 |
| 独立特性、动作、反应、附赠动作、物品的 Item.name | 使用“中文 English”可保留包含匹配所需英文 | 精确条目仍失败；自定配置、Activity 或弹药可改变最终选项 |
| Activity.name | 单独核对其显示与匹配用途，避免只改 Item 后误以为已覆盖；本字段在 AA 中优先 | 若也改成双语，精确条目的原名候选仍会消失；需独立适配决定 |
| ActiveEffect.name | 单独核对，不能依赖所属 Item.name 的英语后缀 | aefx 中存在 20 个精确条目；双语效果名要另有匹配方案 |
| system.identifier、UUID、ID、宏名、资源路径、结构化枚举、第三方 flags | 保持其机器用途；不要将显示名规则自动扩张为翻译全部字符串 | 本报告只证明 AA 不直接读取 identifier；其他模块是否读取须按其确切版本另查 |
| flags.babele.originalName | 如现有翻译链维护此字段，应保留真实原名以供可用适配读取 | 仅有该字段不足以令当前 AA 默认路径使用它；不能凭本报告新造字段并宣称修复 |

待判断本地化 / 适配清单：

- [x] 本轮用户已明确要求双语显示名；主任务落实Actor、Item、Token同名及独立Activity显示名，保留来源英文证据。ActiveEffect名称列为额外建议，尚未实施。
- [ ] 仅在授权动画适配时，选择原名候选钩子或逐条自定配置，并用实际世界配置验证精确条目。
- [ ] 真实 Foundry 中确认现用 AA 菜单、已启用适配模块、hook 结果与素材/宏执行，随后才判断运行与语义状态；当前均为 Untested / NOT_EXECUTED。

本次不引入新模块，也没有动画修复或部署。仅调研报告，不改变用户入口、输出格式或操作步骤，未涉及手册生成；未运行全仓测试或 CI。上述待办不构成继续修改的授权。

## 后续版本 / 新候选复查步骤

1. 重新读取安装 manifest，锁定模块与 dnd5e 版本；已有结果只覆盖本报告列出的文件。
2. 检查当前 tag 的 `findAnimation`、dnd5e hooks、`aa.getRequiredData` 和精确匹配实现是否变化，优先复用本报告的正反例。
3. 如提出其他模块适配方案，先定位它如何取原名、何时注册 hook，确认其优先级；不可只依据 manifest 或功能简介。
4. 获得对应修改/世界测试授权后，再用最少样本核对包含匹配、精确匹配、Activity 优先级和 Active Effect；文件静态正确与离线函数通过都不能代替真实播放与语义验收。
