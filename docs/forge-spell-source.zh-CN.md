
# Forge 独立法术来源

GM 从物品栏打开 **Forge 物品 → 法术**。选择资料文件，或展开「粘贴或编辑资料」。也可载入疗伤术示例。点击「预览法术」，直接核对施法时间、范围、伤害、豁免、正文和 GM 裁定。点「确认创建法术」后可打开卡片。新卡默认在物品栏 **Forge → Spell**，也可在工作台的「归档位置」另选文件夹。

法术优先使用同名系统法术的图标。也可点击「图库」或上传 12 MB 以下的 PNG、JPEG、WebP。自选图片在确认创建时上传。

## 来源契约

YAML 头用两行 `---` 包围，后面接完整规则正文。一次处理一条法术。名称按来源填写，双语名称采用「中文 English」。`identifier` 使用小写英文字母、数字和连字符。以下示例可直接生成。

```yaml
---
kind: spell
rules: 2024
name: 疗伤术 Cure Wounds
identifier: cure-wounds
source: SRD 5.2.1
level: 1
school: abj
activation: {type: action}
duration: {units: inst}
range: {units: touch}
components: [vocal, somatic]
target: {type: creature, count: 1}
activity:
  type: heal
  healing: {type: healing, dice: 2d8, bonus: '@mod', scaling: 2}
---
你触碰的一个生物恢复 2d8 加上你的施法属性调整值的生命值。

**使用更高环阶的法术位。** 法术位每比 1 环高一环，治疗量增加 2d8。
```

| 字段 | 可填写内容 |
| --- | --- |
| `kind`、`rules`、`level`、`school` | 固定 `spell` 与 `2024`。环阶为 0–9，0 代表戏法。学派为 `abj`、`con`、`div`、`enc`、`evo`、`ill`、`nec`、`trs`。 |
| `source` | 可选的出处。正文保留完整规则，常用 Markdown 标记渲染为 HTML。 |
| `activation` | `action`、`bonus`、`reaction`、`minute`、`hour`。以分钟或小时计时填写正整数 `value`，反应填写 `condition`。 |
| `duration`、`range` | 时长支持 `inst`、`round`、`minute`、`hour`、`day`、`disp`、`dstr`、`perm`、`spec`。距离支持 `self`、`touch`、`ft`、`mi`、`spec`、`any`。按单位填写数值。 |
| `components`、`materials` | 列出 `vocal`、`somatic`、`material`、`ritual`、`concentration`。有材料成分时填写 `materials.value`，可附 `cost`（GP）和 `consumed`。 |
| `target` | `type` 支持 `self`、`creature`、`creatureOrObject`、`willing`、`ally`、`enemy`、`object`、`space`、`any`。可填写 `count`、`special`。范围模板支持锥形 `cone`、立方 `cube`、柱形 `cylinder`、线形 `line`、弥漫 `radius`、球形 `sphere`。填 `template.size`，线形加 `width`，柱形加 `height`，尺寸单位都是英尺。 |
| `gm` | 填写需要人工裁定的规则。输入正文和提示会一起出现在法术说明里，预览标记为「需 GM 核对」。GM 可以核对后直接创建，也可以下载。 |

### Activity

每份来源声明一个活动。所有活动继承法术本体的施法时间、时长、范围和目标。常规带环阶施法使用法术位，戏法不消耗法术位。攻击与豁免 DC 取施法者的法术攻击加值和法术豁免 DC。

| `activity.type` | 需要的信息 |
| --- | --- |
| `attack` | `attack: melee` 或 `ranged`，加 `damage` 列表。 |
| `save` | `save` 为 `str`、`dex`、`con`、`int`、`wis` 或 `cha`，`onSave` 为 `none`、`half` 或 `full`，以及 `damage` 列表。只有豁免无伤害时用 `onSave: none`，省略 `damage` 并填写 `gm`。 |
| `damage` | 有伤害并且没有攻击或豁免时，填写 `damage` 列表。 |
| `heal` | `healing` 一项，类型为 `healing` 或 `temphp`。 |
| `utility` | 只提供原生施法入口并保留规则说明。需填写 `gm`。 |

伤害每项填写确定的伤害类型与 `dice: NdM`，例如 `{type: fire, dice: 8d6, scaling: 1}`。治疗使用同样的骰式。可选 `bonus` 为整数或 `'@mod'`，`scaling` 为每档额外增加的同种骰数。带环法术按高环法术位成长，戏法按角色等级档成长。选择伤害类型、复合公式、额外目标、重复伤害、状态、召唤及其他效果写入完整正文，需人工执行的部分写入 `gm`。

## 交付范围

当前入口提供来源编辑、预览、直接创建并读回世界法术及单个 JSON 下载。结构化输入在本地处理。同一 `identifier` 和预览内容再次确认时复用已核对的卡片。同一标识出现不同内容时会报告冲突，由 GM 决定是否给变体换标识。普通自然语言、AI、PDF、批量、CLI/Web、旧版投影、覆盖世界 Item 和更新已有角色或装备的法术引用均未纳入。当前的字段证据见[本批记录](reviews/2026-11-17-forge-standalone-spell.md)。

样例根据 [Wizards of the Coast SRD 5.2.1](https://www.dndbeyond.com/srd) 改写为中文，依据 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 使用。
