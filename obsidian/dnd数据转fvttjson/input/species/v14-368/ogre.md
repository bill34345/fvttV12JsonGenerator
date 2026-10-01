---
layout: species
species-schema: 1
name: 食人魔
english-name: Ogre
display-name: 食人魔（Ogre）
identifier: ogre
rules: '2024'
creature-type:
  value: giant
  subtype: Ogre
size:
  options:
    - lg
  hint: 大型（约10-12尺）
movement:
  walk: 40
senses:
  darkvision: 60
source:
  kind: private-homebrew
  sha256: 6b2374257353ee7d013d826c31ef57b9aca6c5a15677356a228ed12b1bd76d94
  length: 560
  ir-revision: 1
features:
  - id: giant-weapon-use
    name: 巨武器使用
    parts:
      - id: giant-weapon-use-main
        level: 0
        automation: gm-assisted
        mechanics:
          - kind: gm-assisted
            boundaries:
              - 巨型武器伤害骰调整、投掷伤害骰与射程、力量豁免及推离、对物件或建筑物的双倍伤害均需手动处理；不会自动修改武器、掷骰、伤害、位置或目标状态。“体型不超过你二级”的判定由GM按原文裁定。
  - id: powerful-build
    name: 身强力壮
    english-name: Powerful Build
    parts:
      - id: powerful-build-main
        level: 0
        automation: descriptive
        mechanics:
          - kind: descriptive-passive
  - id: powerful-build-bonus-action-escape
    name: 身强力壮：附赠动作脱困
    parts:
      - id: powerful-build-bonus-action-escape-main
        level: 5
        automation: native
        mechanics:
          - kind: limited-utility
            activation: bonus
            uses:
              max: 2
              recovery: lr
            consumption: 1
            chat-flavor: 若原本解除受擒状态所需要进行的属性检定要求消耗你的动作，你可以消耗一个附赠动作进行尝试。请手动进行原本要求的属性检定；此功能不选择属性或技能，也不自动移除受擒状态。来源中“身强力壮”赋予的该检定优势仍然适用。
  - id: ogre-toughness
    name: 食人魔刚毅
    english-name: Ogre Toughness
    parts:
      - id: ogre-toughness-main
        level: 0
        automation: native
        mechanics:
          - kind: hp-per-level
            value: 3
  - id: ogre-clumsiness
    name: 食人魔笨拙
    parts:
      - id: ogre-clumsiness-ac
        level: 0
        automation: native
        mechanics:
          - kind: ac-bonus
            value: -2
      - id: ogre-clumsiness-standing
        level: 0
        automation: gm-assisted
        mechanics:
          - kind: gm-assisted
            boundaries:
              - 倒地时花费全部速度站起来的移动消耗及倒地状态处理需由玩家或GM手动完成。
---

<!-- species-feature:giant-weapon-use -->
## 巨武器使用

你可以使用比重型还大的巨型武器：
1. 巨型武器可以造成比原本武器大一面骰子的伤害。若武器原本是1d12的骰子伤害，则伤害变成2d8。
2. 你可以投掷任意不带重型或巨型词条的武器，在投掷时从原本的一个骰子拆分成两个更小面的骰子，最终最大值保持一致（eg：战锤1d8 → 投掷战锤2d4），投掷范围20/60。
3. 你的武器或徒手攻击可以让体型不超过你二级的生物进行一次力量豁免，DC=8+你的攻击检定时使用的调整值+熟练加值，失败的生物会被你推离5尺（已记在武器内）。
4. 若你武器或徒手攻击的目标是物件或建筑物，则你可以对其造成双倍伤害。

<!-- species-feature:powerful-build -->
## 身强力壮（Powerful Build）

你为让自己结束受擒状态所进行的属性检定具有优势。

<!-- species-feature:powerful-build-bonus-action-escape -->
## 身强力壮：附赠动作脱困

从第5级开始，若原本解除受擒状态所需要进行的属性检定要求消耗你的动作，取而代之你可以消耗一个附赠动作进行尝试，你可以这么做2次，长休后恢复所有使用次数。

<!-- species-feature:ogre-toughness -->
## 食人魔刚毅（Ogre Toughness）

你的生命值上限加3，且此后每次升级时再加3。

<!-- species-feature:ogre-clumsiness -->
## 食人魔笨拙

你的AC-2，若你倒地，则你需要花费全部速度站起来。

<!-- species-raw-source -->
## 原始资料（Intake 保留）

<!-- species-raw-source-body -->
食人魔Orge
- 生物类型：巨人。
- 体型：大型（约10-12尺）。
- 速度：40尺。
- 巨武器使用。你可以使用比重型还大的巨型武器：
1. 巨型武器可以造成比原本武器大一面骰子的伤害。若武器原本是1d12的骰子伤害，则伤害变成2d8。
2. 你可以投掷任意不带重型或巨型词条的武器，在投掷时从原本的一个骰子拆分成两个更小面的骰子，最终最大值保持一致（eg：战锤1d8 → 投掷战锤2d4），投掷范围20/60。
3. 你的武器或徒手攻击可以让体型不超过你二级的生物进行一次力量豁免，DC=8+你的攻击检定时使用的调整值+熟练加值，失败的生物会被你推离5尺（已记在武器内）。
4. 若你武器或徒手攻击的目标是物件或建筑物，则你可以对其造成双倍伤害。
- 黑暗视觉Darkvision。你拥有60尺黑暗视觉。
- 身强力壮Powerful Build。你为让自己结束受擒状态所进行的属性检定具有优势。从第5级开始，若原本解除受擒状态所需要进行的属性检定要求消耗你的动作，取而代之你可以消耗一个附赠动作进行尝试，你可以这么做2次，长休后恢复所有使用次数。
- 食人魔刚毅Orge Toughness。你的生命值上限加3，且此后每次升级时再加3。
- 食人魔笨拙。你的AC-2，若你倒地，则你需要花费全部速度站起来。
