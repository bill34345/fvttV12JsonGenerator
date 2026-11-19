---
kind: spell
rules: 2024
name: 火球术 Fireball
identifier: fireball
source: SRD 5.2.1
level: 3
school: evo
activation: {type: action}
duration: {units: inst}
range: {units: ft, value: 150}
components: [vocal, somatic, material]
materials: {value: 一小团蝙蝠粪和硫磺}
target:
  type: creature
  template: {type: sphere, size: 20}
activity:
  type: save
  save: dex
  onSave: half
  damage:
    - {type: fire, dice: 8d6, scaling: 1}
gm: 由 GM 处理范围内未被穿戴或携带的易燃物。
---
选取 150 尺内一点。以它为中心、半径 20 尺的球形区域内，各生物进行一次敏捷豁免。失败时受到 8d6 火焰伤害，成功则伤害减半。范围内未被穿戴或携带的易燃物开始燃烧。

**使用更高环阶的法术位。** 法术位每比 3 环高一环，伤害增加 1d6。
