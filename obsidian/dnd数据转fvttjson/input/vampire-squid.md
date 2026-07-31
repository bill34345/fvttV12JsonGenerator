---
名称: 绯晶吸血乌贼 (Ruidium Vampire Squid)
类型: npc
体型: 巨型
生物类型: 异怪
阵营: 无阵营
能力:
  力量: 20
  敏捷: 13
  体质: 18
  智力: 5
  感知: 14
  魅力: 8
护甲等级: 16 (天生护甲)
先攻: 5
生命值: 161 (14d12 + 70)
速度: 步行 10 尺, 游泳 50 尺
技能:
  察觉: 6
  隐匿: 5
伤害抗性:
  - 心灵
感官:
  黑暗视觉: 120
  被动察觉: 16
挑战等级: 9
经验值: 5000
熟练加值: 4
背景: |-
  来源原型：Call of the Netherdeep: Additional Netherdeep Monsters，Vampire Squid。
  原作者：Frozenfeet2
  原文：https://www.gmbinder.com/share/-N-lZxHyITwITQjoeP10
  优化方向：吸收用户提供的月蚀吸血乌贼思路，但重新收束为“擒抱—吸血—墨遁”循环；明亮光照、光耀与钝击伤害都是可见反制窗口。
行为机制:
  版本: 1
  机制:
    - ID: squid-light-and-regeneration
      类型: trigger
      名称: 光照与再生抑制
      英文名: Light and Regeneration Suppression
      载体:
        分区: 特性
        名称: 绯晶再生 (Ruidium Regeneration)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      触发:
        事件: turnStart
        频率: oncePerTurn
        条件: 回合开始检查明亮光照、上回合后光耀/钝击伤害与当前生命值
      条件:
        - 明亮光照中承受 5 点光耀伤害且攻击和属性检定劣势
        - 上回合结束后受光耀或钝击，或处于明亮光照时，本回合不再生
        - 只有以 0 HP 开始回合且不能再生时死亡
      状态:
        - ID: squid-regeneration-suppressed
          名称: 绯晶再生被抑制
          英文名: Ruidium Regeneration Suppressed
          目标: self
          状态: []
          变化: []
          持续:
            特殊: 当前回合开始的再生检查
          解除:
            - 完成本回合开始检查后
      操作:
        - ID: mark-squid-regeneration-suppressed
          名称: 标记本回合不再生
          英文名: Mark Regeneration Suppressed
          激活: special
          类型: apply
          状态:
            - squid-regeneration-suppressed
          引用: []
          说明: 满足任一抑制条件时应用，并跳过 10 点恢复。
        - ID: resolve-squid-turn-start
          名称: 结算乌贼回合开始
          英文名: Resolve Squid Turn Start
          激活: special
          类型: manual
          状态: []
          引用: []
          说明: 先结算明亮光照伤害，再判断是否恢复 10 HP 或在 0 HP 死亡。
      GM步骤:
        - 记录自上回合结束后的光耀/钝击伤害，并人工判断光照环境。
        - 严格按伤害、环境、再生、0 HP 的顺序结算。
    - ID: squid-tentacle-capacity
      类型: capacity
      名称: 双触手擒抱容量
      英文名: Two Tentacle Grapple Capacity
      载体:
        分区: 动作
        名称: 触手 (Tentacle)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      条件:
        - 两根长触手各擒抱一个大型或更小目标，并同时使其束缚
      GM步骤:
        - 命中并开始擒抱时占用一个槽位，记录对应目标。
        - 擒抱结束时释放槽位并移除擒抱与束缚。
      容量:
        槽位: 2
        体型限制: 大型或更小
        逃脱DC: 16
        获取: 触手命中且存在空闲槽位时占用。
        释放: 对应擒抱结束时释放并移除关联状态。
    - ID: squid-bite-and-allure
      类型: lifecycle
      名称: 吸血啃咬与血潮魅诱
      英文名: Vampiric Bite and Bloodtide Allure
      载体:
        分区: 动作
        名称: 啃咬 (Bite)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      条件:
        - 啃咬只以被乌贼擒抱的生物为目标
        - 按实际死灵伤害同步降低目标生命上限并治疗乌贼
        - 魅诱目标必须安全接近，受伤后立即重复豁免
      引用:
        - ID: bloodtide-allure
          角色: 魅惑、强制接近与受伤重试
          项目:
            分区: 动作
            名称: 血潮魅诱 (Bloodtide Allure)
      状态:
        - ID: squid-allured
          名称: 血潮魅诱
          英文名: Bloodtide Allure
          目标: selected
          状态:
            - charmed
          变化: []
          持续:
            特殊: 直到目标下一回合结束或受伤后重复 DC 16 感知豁免成功
          解除:
            - 目标下一回合结束
            - 每次受到伤害后立即重复豁免成功
      操作:
        - ID: resolve-squid-bite-drain
          名称: 按实际死灵伤害结算吸血
          英文名: Resolve Actual Necrotic Drain
          激活: special
          类型: manual
          状态: []
          引用: []
          说明: 记录实际死灵伤害；等量降低目标生命上限并治疗乌贼，长休恢复上限。
        - ID: apply-squid-allure
          名称: 应用血潮魅诱
          英文名: Apply Bloodtide Allure
          激活: special
          类型: apply
          状态:
            - squid-allured
          引用:
            - bloodtide-allure
          说明: 初始感知豁免失败时应用；目标回合沿安全路线尽可能靠近。
      GM步骤:
        - 啃咬后读取实际死灵伤害，而不是平均值或公式上限。
        - 分别修改目标生命上限和乌贼当前 HP，并记录长休恢复。
        - 魅诱目标每次受伤立即重复豁免，成功即移除效果。
    - ID: squid-crimson-veil-area
      类型: area
      名称: 绯潮墨遁区域与拖带
      英文名: Crimson Veil Area and Drag
      载体:
        分区: 反应
        名称: 绯潮墨遁 (Crimson Veil Escape)
      表达覆盖: structured
      执行模式: gm-assisted
      规则来源: source-derived
      触发:
        事件: damageTaken
        频率: unlimited
        条件: 乌贼在水下受到伤害且每日次数可用
      条件:
        - 20 尺半径重度遮蔽到乌贼下一回合结束
        - 随后游动至多游泳速度且不引发借机攻击，可拖带一个被擒抱目标
        - 魔法明亮光照覆盖处不再遮蔽
      操作:
        - ID: place-squid-crimson-veil
          名称: 放置绯潮墨雾
          英文名: Place Crimson Veil
          激活: reaction
          类型: template
          状态: []
          引用: []
          说明: 放置 20 尺半径重度遮蔽区域到乌贼下一回合结束。
          模板:
            形状: radius
            尺寸: 20
            单位: ft
        - ID: resolve-squid-veil-move
          名称: 结算墨遁移动与拖带
          英文名: Resolve Veil Move and Drag
          激活: special
          类型: move
          状态: []
          引用: []
          说明: 游动至多 50 尺且不引发借机攻击，可拖带一个已记录的擒抱目标。
      GM步骤:
        - 只在水下受伤且次数可用时触发。
        - 删除或忽略被魔法明亮光照覆盖的遮蔽部分；下一回合结束删除模板。
    - ID: squid-ruidium-corruption
      类型: externalRule
      名称: 绯晶腐化
      英文名: Ruidium Corruption
      载体:
        分区: 特性
        名称: 绯晶腐化 (Ruidium Corruption)
      表达覆盖: structured
      执行模式: external-rule
      规则来源: source-derived
      操作:
        - ID: resolve-squid-corruption
          名称: 结算绯晶腐化
          英文名: Resolve Ruidium Corruption
          激活: special
          类型: manual
          状态: []
          引用: []
          说明: 进行 DC 16 魅力豁免并按外部规则结算。
      GM步骤:
        - 只在啃咬半血前置等源能力明确要求时执行。
        - 失败时查阅外部腐化规则。
      外部规则:
        名称: 绯晶腐化 (Ruidium Corruption)
        DC: 16
        属性: cha
        结果: 失败则受到绯晶腐化；已经腐化则获得 1 级力竭。
---

绯晶吸血乌贼的触手与口器间长有油亮的深红晶脉。它会先拖住两名猎物，再啃咬已经受伤的一人；强光会灼伤它，沉重冲击也能暂时打断晶体驱动的再生。

### 特性

- **水下呼吸 (Water Breathing)**：绯晶吸血乌贼只能在水下呼吸。

- **强光畏缩 (Light Hypersensitivity)**：乌贼在明亮光照中开始其回合时受到 5 点光耀伤害。处于明亮光照中时，它的攻击检定和属性检定具有劣势。

- **绯晶再生 (Ruidium Regeneration)**：若乌贼至少有 1 点生命值，它在每个回合开始时恢复 10 点生命值。若它自上个回合结束后受到过光耀伤害或钝击伤害，或正处于明亮光照中，则该特性在该回合开始时不生效。乌贼只有在以 0 点生命值开始其回合且无法再生时才会死亡。

- **绯晶腐化 (Ruidium Corruption)**：当一个生物因乌贼的能力进行绯晶腐化豁免时，它必须成功通过一次 **DC 16 魅力 (Charisma) 豁免检定**，否则受到绯晶腐化。若它已经受到绯晶腐化，则改为获得 1 级力竭。

### 动作

- **多重攻击 (Multiattack)**：乌贼发动两次**触手 (Tentacle)**攻击。若它正擒抱至少一个生物，则还可以对一个被它擒抱的生物发动一次**啃咬 (Bite)**攻击。

- **触手 (Tentacle)**：近战武器攻击：+9 命中，触及 15 尺，一个目标。
  - **命中**：14（`2d8 + 5`）点钝击伤害。若目标为大型或更小生物，则陷入擒抱 (Grappled) 状态（逃脱 DC 16），并在擒抱期间陷入束缚 (Restrained) 状态。乌贼共有两根长触手，每根可以擒抱一个生物。

- **啃咬 (Bite)**：近战武器攻击：+9 命中，触及 5 尺，一个被乌贼擒抱的目标。
  - **命中**：18（`2d12 + 5`）点穿刺伤害，外加 10（`3d6`）点死灵伤害。目标的生命值上限降低等同于所受死灵伤害的数值，乌贼恢复等同于该死灵伤害的生命值。生命值上限降低持续到目标完成一次长休；若该效果使目标的生命值上限降至 0，目标死亡。
  - 每回合一次，若目标在被命中前的生命值不高于其生命值上限的一半，则目标还必须进行一次绯晶腐化豁免。

- **血潮魅诱 (Bloodtide Allure, 充能 5–6)**：乌贼选择一个它能看见且位于 60 尺内的生物。目标必须成功通过一次 **DC 16 感知 (Wisdom) 豁免检定**，否则陷入魅惑 (Charmed) 状态，直到其下一回合结束。受魅惑时，目标在自己的回合必须尽可能沿安全路线靠近乌贼；目标每次受到伤害后可以立即重复该豁免，成功则结束效果。

### 反应

- **绯潮墨遁 (Crimson Veil Escape, 1/日)**：当乌贼在水下受到伤害时，它释放一团混有绯晶碎屑的暗红墨雾。以它为中心 20 尺半径内的区域陷入重度遮蔽，持续到乌贼下一回合结束。随后乌贼可以游动至多其游泳速度，且此次移动不会引发借机攻击；它可以拖带一个被其擒抱的生物。魔法明亮光照覆盖墨雾的部分不再造成遮蔽。
