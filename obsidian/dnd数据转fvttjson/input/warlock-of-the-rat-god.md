---
名称: 鼠神邪术师 (Warlock of the Rat God)
类型: npc
体型: 小型
生物类型: 怪兽
阵营: 混乱邪恶
能力:
  力量: 7
  敏捷: 14
  体质: 13
  智力: 13
  感知: 11
  魅力: 15
护甲等级: 12
生命值: 27 (6d6 + 6)
速度: 步行 30 尺, 攀爬 30 尺, 游泳 30 尺
熟练加值: 2
挑战等级: 2
经验值: 450
技能:
  欺瞒: 4
  隐匿: 4
感官:
  黑暗视觉: 60
  被动察觉: 10
语言:
  - 通用语
传记: |-
  “倘若我们奉上一切亮晶晶之物，鼠神大人就会降临，并帮助我们！我们会得到食物！我们能吃！很吃个够！吃数不胜数的食物！我们会把这个世界吃干抹净！整片大地！没错！没错！没错！”


  许多鼠怪都崇拜着一个被称为“鼠神Rat God”的邪魔存在。这位“鼠神”对那些最狡猾也最聪明的鼠怪发出耳畔低语，通过签订魔能契约赐予它们力量。而离谱的是，鼠怪们根本对祂一无所知，所以它们创造了不少传说与寓言来证明祂曾创下过伟业。

  护甲等级：12（有法师护甲mage armor时15）
法术清单:
  schemaVersion: 1
  manifestId: intake-55dc6bc354df0709-warlock-of-the-rat-god-innate-spellcasting-448
  sourceSha256: 55dc6bc354df07095308c7c75bf17cf3a09e72c96e8d38141714007c750dcdc0
  rulesPreference: "2024"
  spellcastingGroups:
    - groupId: innate-spellcasting
      featureItemKey: innate-spellcasting
      ability: cha
      saveDc: 12
      attackBonus: 4
      spellRefs:
        - refId: eldritch-blast
          identifier: eldritch blast
          originalName: 魔能爆eldritch blast
          englishName: eldritch blast
          chineseName: 魔能爆
          aliases: []
          method: at-will
          ignoresMaterialComponents: true
          restrictions:
            - kind: other
              text: 2条射线
              value: 2条射线
              evidence:
                - start: 552
                  end: 556
                  quote: 2条射线
          evidence:
            - start: 534
              end: 551
              quote: 魔能爆eldritch blast
        - refId: mage-armor
          identifier: mage armor
          originalName: 法师护甲mage armor
          englishName: mage armor
          chineseName: 法师护甲
          aliases: []
          method: at-will
          ignoresMaterialComponents: true
          restrictions:
            - kind: target
              text: 仅自身
              value: 仅自身
              evidence:
                - start: 573
                  end: 576
                  quote: 仅自身
          evidence:
            - start: 558
              end: 572
              quote: 法师护甲mage armor
        - refId: minor-illusion
          identifier: minor illusion
          originalName: 次级幻象minor illusion
          englishName: minor illusion
          chineseName: 次级幻象
          aliases: []
          method: at-will
          ignoresMaterialComponents: true
          restrictions: []
          evidence:
            - start: 578
              end: 596
              quote: 次级幻象minor illusion
        - refId: thaumaturgy
          identifier: thaumaturgy
          originalName: 奇术thaumaturgy
          englishName: thaumaturgy
          chineseName: 奇术
          aliases: []
          method: at-will
          ignoresMaterialComponents: true
          restrictions: []
          evidence:
            - start: 597
              end: 610
              quote: 奇术thaumaturgy
        - refId: augury
          identifier: augury
          originalName: 卜筮术augury
          englishName: augury
          chineseName: 卜筮术
          aliases: []
          method: innate
          uses:
            value: 1
            recovery: day
            shared: false
          ignoresMaterialComponents: true
          restrictions: []
          evidence:
            - start: 618
              end: 627
              quote: 卜筮术augury
        - refId: burning-hands
          identifier: burning hands
          originalName: 燃烧之手burning hands
          englishName: burning hands
          chineseName: 燃烧之手
          aliases: []
          method: innate
          uses:
            value: 1
            recovery: day
            shared: false
          ignoresMaterialComponents: true
          restrictions: []
          evidence:
            - start: 628
              end: 645
              quote: 燃烧之手burning hands
        - refId: conjure-animals
          identifier: conjure animals
          originalName: 动物咒唤术conjure animals
          englishName: conjure animals
          chineseName: 动物咒唤术
          aliases: []
          method: innate
          uses:
            value: 1
            recovery: day
            shared: false
          ignoresMaterialComponents: true
          restrictions:
            - kind: summoning
              text: 仅限巨鼠Giant Rat
              value: 仅限巨鼠Giant Rat
              evidence:
                - start: 667
                  end: 680
                  quote: 仅限巨鼠Giant Rat
          evidence:
            - start: 646
              end: 666
              quote: 动物咒唤术conjure animals
        - refId: faerie-fire
          identifier: faerie fire
          originalName: 妖火faerie fire
          englishName: faerie fire
          chineseName: 妖火
          aliases: []
          method: innate
          uses:
            value: 1
            recovery: day
            shared: false
          ignoresMaterialComponents: true
          restrictions: []
          evidence:
            - start: 682
              end: 695
              quote: 妖火faerie fire
        - refId: invisibility
          identifier: invisibility
          originalName: 隐形术invisibility
          englishName: invisibility
          chineseName: 隐形术
          aliases: []
          method: innate
          uses:
            value: 1
            recovery: day
            shared: false
          ignoresMaterialComponents: true
          restrictions: []
          evidence:
            - start: 696
              end: 711
              quote: 隐形术invisibility
        - refId: misty-step
          identifier: misty step
          originalName: 迷踪步misty step
          englishName: misty step
          chineseName: 迷踪步
          aliases: []
          method: innate
          uses:
            value: 1
            recovery: day
            shared: false
          ignoresMaterialComponents: true
          restrictions: []
          evidence:
            - start: 712
              end: 725
              quote: 迷踪步misty step
特性:
  - 名称: 天生施法 (Innate Spellcasting)
    类型: utility
    描述: |-
      天生施法Innate Spellcasting。邪术师的天生施法属性为魅力，他可以天生性的施展以下法术（法术豁免DC12，法术攻击命中加值+4），且无需材料成分：

      随意：魔能爆eldritch blast（2条射线），法师护甲mage armor（仅自身），次级幻象minor illusion，奇术thaumaturgy

      每项1/日：卜筮术augury，燃烧之手burning hands，动物咒唤术conjure animals（仅限巨鼠Giant Rat），妖火faerie fire，隐形术invisibility，迷踪步misty step
    spellcastingFeatureKey: innate-spellcasting
  - 名称: 敏锐嗅觉 (Keen Smell)
    类型: utility
    描述: 鼠怪依赖嗅觉所进行的感知（察觉）检定具有优势。
  - 名称: 潜伏者 (Skulker)
    类型: utility
    激活: bonus
    描述: 在每个鼠怪自己的回合中，它都可以用附赠动作执行躲藏动作。
动作:
  - 名称: 啃咬 (Bite)
    类型: attack
    激活: action
    描述: 近战武器攻击：命中+4，触及5尺，单一目标。命中：4（1d4+2）穿刺伤害。
    攻击类型: mwak
    命中: 4
    范围: 触及 5 尺
    伤害:
      - 公式: 1d4 + 2
        类型: piercing
---
