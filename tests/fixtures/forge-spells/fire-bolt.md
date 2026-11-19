---
kind: spell
rules: 2024
name: 火焰箭 Fire Bolt
identifier: fire-bolt
source: SRD 5.2.1
level: 0
school: evo
activation: {type: action}
duration: {units: inst}
range: {units: ft, value: 120}
components: [vocal, somatic]
target: {type: creatureOrObject, count: 1}
activity:
  type: attack
  attack: ranged
  damage:
    - {type: fire, dice: 1d10, scaling: 1}
gm: 命中易燃物件后，由 GM 判定是否起火。
---
对 120 尺内的一个生物或物件进行远程法术攻击。命中造成 1d10 火焰伤害。命中未被穿戴或携带的易燃物件会使它起火。角色在 5、11、17 级时，伤害各增加 1d10。
