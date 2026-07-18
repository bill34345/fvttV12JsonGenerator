---
名称: Portable Caster
类型: npc
法术清单:
  schemaVersion: 1
  manifestId: portable-caster-spells
  sourceSha256: '0000000000000000000000000000000000000000000000000000000000000000'
  rulesPreference: '2024'
  spellcastingGroups:
    - groupId: innate-wisdom
      featureItemKey: innate-wisdom-feature
      ability: wis
      saveDc: 13
      spellRefs:
        - refId: mage-armor
          identifier: mage-armor
          originalName: Mage Armor
          englishName: Mage Armor
          aliases: []
          method: innate
          restrictions: []
          evidence:
            - start: 0
              end: 10
              quote: Mage Armor
特性:
  - 名称: Arcane Ward
    类型: utility
    描述: This similarly shaped trait is not spellcasting.
  - 名称: Innate Magic
    类型: utility
    spellcastingFeatureKey: innate-wisdom-feature
    描述: The caster invokes its explicitly granted magic.
---
