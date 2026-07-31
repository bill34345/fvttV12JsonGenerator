---
名称: 深海之眼 (Eye of the Deep)
类型: npc
体型: 中型
生物类型: 异怪
阵营: 守序邪恶
能力:
  力量: 16
  敏捷: 8
  体质: 14
  智力: 16
  感知: 14
  魅力: 9
护甲等级: 15 (天生护甲)
生命值: 91 (14d8 + 28)
速度: 步行 0 尺, 游泳 20 尺
豁免熟练:
  智力: 6
  魅力: 2
技能:
  察觉: 6
伤害抗性:
  - 寒冷
状态免疫:
  - 倒地
感官:
  黑暗视觉: 120
  被动察觉: 16
语言:
  - 深潜语
语言备注: 心灵感应 120 尺
挑战等级: 6
经验值: 2300
熟练加值: 3
背景: |-
  来源：Call of the Netherdeep: Additional Netherdeep Monsters
  作者：Frozenfeet2
  原文：https://www.gmbinder.com/share/-N-lZxHyITwITQjoeP10
  优化方向：保留双螯与两种眼光，让眼光分配更清楚，并加入玩家可主动瞄准眼梗的反制窗口。
行为机制:
  版本: 1
  机制:
    - ID: eye-eyestalk-disable
      类型: trigger
      名称: 瞄准眼梗并禁用射线
      英文名: Target Eyestalk and Disable Ray
      载体:
        分区: 特性
        名称: 暴露眼梗 (Exposed Eyestalks)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      触发:
        事件: attackHit
        频率: unlimited
        条件: 攻击者事先声明瞄准、攻击有劣势且 -5，命中不造成伤害
      条件:
        - 命中后选择麻痹射线或寒冷射线禁用到深海之眼下一回合结束
        - 两种射线同回合不能选择同一目标
      引用:
        - ID: paralyzing-ray
          角色: 可被禁用的射线
          项目:
            分区: 动作
            名称: 麻痹射线 (Paralyzing Ray)
        - ID: cold-ray
          角色: 可被禁用的射线
          项目:
            分区: 动作
            名称: 寒冷射线 (Cold Ray)
      状态:
        - ID: eye-ray-disabled
          名称: 指定射线暂时禁用
          英文名: Selected Ray Disabled
          目标: self
          状态: []
          变化: []
          持续:
            特殊: 直到深海之眼下一回合结束
          解除:
            - 深海之眼下一回合结束
      操作:
        - ID: mark-eye-ray-disabled
          名称: 标记指定射线禁用
          英文名: Mark Selected Ray Disabled
          激活: special
          类型: apply
          状态:
            - eye-ray-disabled
          引用:
            - paralyzing-ray
            - cold-ray
          说明: 记录被选中的射线名称；标记存在时不得使用该射线。
      GM步骤:
        - 瞄准命中时取消本次攻击伤害。
        - 在标记说明中记录具体射线，并在下一回合结束移除。
    - ID: eye-pincer-capacity
      类型: capacity
      名称: 双螯擒抱容量
      英文名: Twin Pincer Grapple Capacity
      载体:
        分区: 动作
        名称: 螯钳 (Pincer)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      条件:
        - 每只螯钳独立擒抱一个中型或更小生物
      GM步骤:
        - 每次擒抱开始占用一个槽位，并记录左螯或右螯。
        - 对应擒抱结束时释放该槽位。
      容量:
        槽位: 2
        体型限制: 中型或更小
        逃脱DC: 14
        获取: 螯钳命中且存在空闲螯钳时开始擒抱。
        释放: 目标逃脱或擒抱结束时释放对应螯钳。
    - ID: eye-ray-and-reel-lifecycle
      类型: lifecycle
      名称: 麻痹射线、拖拽与退避
      英文名: Paralyzing Ray, Reel, and Retreat
      载体:
        分区: 动作
        名称: 麻痹射线 (Paralyzing Ray)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      触发:
        事件: saveFailure
        频率: unlimited
      引用:
        - ID: pincer-reel
          角色: 拉近全部擒抱目标并拖带
          项目:
            分区: 附赠动作
            名称: 钳索拖拽 (Pincer Reel)
        - ID: crabwise-retreat
          角色: 目标成功通过射线豁免后的反应
          项目:
            分区: 反应
            名称: 蟹行退避 (Crabwise Retreat)
      状态:
        - ID: eye-paralyzed
          名称: 麻痹射线
          英文名: Paralyzing Ray
          目标: selected
          状态:
            - paralyzed
          变化: []
          持续:
            轮: 10
            特殊: 每回合结束重复 DC 14 体质豁免
          解除:
            - 回合结束重复豁免成功
      操作:
        - ID: apply-eye-paralysis
          名称: 应用麻痹射线
          英文名: Apply Paralyzing Ray
          激活: special
          类型: apply
          状态:
            - eye-paralyzed
          引用: []
          说明: 仅对初始体质豁免失败目标应用。
        - ID: resolve-eye-reel
          名称: 结算钳索拖拽
          英文名: Resolve Pincer Reel
          激活: bonus
          类型: move
          状态: []
          引用:
            - pincer-reel
          说明: 将所有被擒抱目标拉近最多 10 尺，深海之眼再游动 10 尺并拖带。
        - ID: resolve-eye-retreat
          名称: 结算蟹行退避
          英文名: Resolve Crabwise Retreat
          激活: reaction
          类型: move
          状态: []
          引用:
            - crabwise-retreat
          说明: 仅当一个生物成功通过射线豁免时移动 10 尺，且只不引发该生物的借机攻击。
      GM步骤:
        - 对麻痹目标在每回合结束重复豁免并在成功时移除效果。
        - 拖拽时移动所有已记录的擒抱目标；退避只豁免触发生物的借机攻击。
---

深海之眼又被称为“海洋眼魔”。它会用螯钳固定前排，再把不同眼光分配给不同猎物；勇敢的攻击者也可以放弃伤害，冒险击伤一根眼梗。

### 特性

- **两栖 (Amphibious)**：深海之眼可以在空气和水中呼吸。

- **暴露眼梗 (Exposed Eyestalks)**：攻击者在对深海之眼进行近战或远程武器攻击前，可以声明瞄准其一根眼梗。该次攻击检定具有劣势，且额外承受 -5 命中罚值。若攻击命中，则不造成伤害，但攻击者选择**麻痹射线 (Paralyzing Ray)**或**寒冷射线 (Cold Ray)**；深海之眼直到其下一回合结束前不能使用被选中的眼光。

### 动作

- **多重攻击 (Multiattack)**：深海之眼发动两次**螯钳 (Pincer)**攻击，并分别使用一次可用的**麻痹射线 (Paralyzing Ray)**与**寒冷射线 (Cold Ray)**。它不能在同一回合以两种眼光选择同一目标。

- **螯钳 (Pincer)**：近战武器攻击：+6 命中，触及 5 尺，一个目标。
  - **命中**：7（`1d8 + 3`）点穿刺伤害。若目标为中型或更小生物，且该螯钳没有擒抱其他目标，则目标被擒抱 (Grappled，逃脱 DC 14)。深海之眼共有两只螯钳，每只可以擒抱一个生物。

- **麻痹射线 (Paralyzing Ray)**：深海之眼选择一个它能看见且位于 120 尺内的生物。目标必须成功通过一次 **DC 14 体质 (Constitution) 豁免检定**，否则陷入麻痹 (Paralyzed) 状态，持续 1 分钟。目标可以在其每个回合结束时重复该豁免，成功则结束此效果。

- **寒冷射线 (Cold Ray)**：深海之眼选择一个它能看见且位于 120 尺内的生物。目标必须进行一次 **DC 14 敏捷 (Dexterity) 豁免检定**。
  - **豁免失败**：受到 27（`5d10`）点寒冷伤害。
  - **豁免成功**：受到一半伤害。

### 附赠动作

- **钳索拖拽 (Pincer Reel)**：深海之眼将每个被其擒抱的生物向自己拉近最多 10 尺，然后可以游动至多 10 尺；被擒抱的生物会随它移动。

### 反应

- **蟹行退避 (Crabwise Retreat)**：当一个生物成功通过深海之眼一种眼光的豁免时，深海之眼可以游动至多 10 尺，且此次移动不会引发该生物的借机攻击。
