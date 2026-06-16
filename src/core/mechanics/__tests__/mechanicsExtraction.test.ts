import { describe, expect, it } from 'bun:test';
import { extractCompoundRiderMechanics } from '../mechanicsExtraction';

const venomousBiteSource = `
蛇吻每次长休可分别使用以下每种毒液各一次。以下毒液效果的体质豁免 DC 均为 **14**，且**重伤 / 濒血 (Bloodied)** 的目标在进行该豁免时具有劣势 (Disadvantage)。

- **盐水电击 (Brine-shock)**：目标额外受到 \`2d6\` 点毒素伤害 (Poison Damage)，并陷入**中毒 (Poisoned)** 状态，直到其下一回合结束。

- **针刺噬咬 (Needling Bite)**：只能对本回合已被**爪击 (Claw)** 命中的目标使用。该次咬击额外造成 **1 颗伤害骰** 的伤害，且目标开始**流血 (Bleeding) \`1d6\`**。
  - **Bleed（流血）**：目标在其每个回合开始时受到 \`1d6\` 点（由创造流血的特性决定）伤害。

- **吸血噬咬 (Vampiric Bite)**：目标失去 **1 颗未消耗的生命骰 (Hit Die)**。若目标以此方式失去生命骰，则蛇吻获得 **10 点临时生命值 (Temporary Hit Points)**。若此效果使目标的生命骰降为 0，则目标必须立即进行一次对抗**绯晶腐化 (Ruidium Corruption)** 的豁免检定。
`;

describe('compound rider mechanics extraction', () => {
  it('inherits explicit shared Constitution save DC and extracts source-backed rider mechanics', () => {
    const result = extractCompoundRiderMechanics(venomousBiteSource, {
      baseDamage: { formula: '2d6+3', type: 'piercing' },
    });

    expect(result.sharedSave).toEqual(
      expect.objectContaining({
        dc: 14,
        ability: 'con',
      }),
    );
    expect(result.sharedSave?.evidence.text).toContain('体质豁免 DC 均为 **14**');
    expect(result.riders.map((rider) => rider.key)).toEqual([
      'brine-shock',
      'needling-bite',
      'vampiric-bite',
    ]);
    expect(result.riders.map((rider) => rider.save)).toEqual([
      expect.objectContaining({ dc: 14, ability: 'con' }),
      expect.objectContaining({ dc: 14, ability: 'con' }),
      expect.objectContaining({ dc: 14, ability: 'con' }),
    ]);

    expect(result.riders[0]?.damage).toEqual([
      expect.objectContaining({ formula: '2d6', type: 'poison' }),
    ]);
    expect(result.riders[0]?.statuses).toEqual(['poisoned']);

    expect(result.riders[1]?.damage).toEqual([
      expect.objectContaining({ formula: '1d6', type: 'piercing' }),
    ]);
    expect(result.riders[1]?.metadata).toEqual(
      expect.objectContaining({
        bleeding: expect.objectContaining({ formula: '1d6' }),
      }),
    );

    expect(result.riders[2]?.damage).toEqual([]);
    expect(result.riders[2]?.metadata).toEqual(
      expect.objectContaining({
        hitDieLoss: 1,
        grantsTempHp: 10,
        followupSave: 'Ruidium Corruption',
      }),
    );
    expect(result.riders[2]?.outcomes).toContainEqual(
      expect.objectContaining({
        kind: 'hitDiceChange',
        direction: 'lose',
        count: 1,
        pool: 'unspent',
        target: 'failedSaveTarget',
      }),
    );
    expect(result.riders[2]?.outcomes).toContainEqual(
      expect.objectContaining({
        kind: 'tempHp',
        amount: 10,
        target: 'self',
        condition: 'hitDiceChangeApplied',
      }),
    );
    expect(result.riders[2]?.outcomes).toContainEqual(
      expect.objectContaining({
        kind: 'followupSave',
        label: 'Ruidium Corruption',
        trigger: 'targetHitDiceReducedToZero',
        target: 'failedSaveTarget',
      }),
    );
  });

  it('does not invent rider saves when the source has no local or shared save text', () => {
    const result = extractCompoundRiderMechanics(
      '- **针刺噬咬 (Needling Bite)**：目标开始**流血 (Bleeding) `1d6`**。',
      { baseDamage: { formula: '2d6+3', type: 'piercing' } },
    );

    expect(result.sharedSave).toBeUndefined();
    expect(result.riders[0]?.save).toBeUndefined();
  });

  it('extracts hit-dice outcomes from non-Scuttling source text without action-name matching', () => {
    const result = extractCompoundRiderMechanics(
      '- **Ashen Drain (Ashen Drain)**: On a hit, the target loses 2 spent Hit Dice. If this reduces the target to 0 Hit Dice, it must make a Ruidium Corruption saving throw.',
    );

    expect(result.riders[0]?.outcomes).toEqual([
      expect.objectContaining({
        kind: 'hitDiceChange',
        direction: 'lose',
        count: 2,
        pool: 'spent',
        target: 'target',
      }),
      expect.objectContaining({
        kind: 'followupSave',
        label: 'Ruidium Corruption',
        trigger: 'targetHitDiceReducedToZero',
      }),
    ]);
  });

  it('does not create hit-dice outcomes from a name alone', () => {
    const result = extractCompoundRiderMechanics(
      '- **Vampiric Bite (Vampiric Bite)**: The target is watched carefully.',
    );

    expect(result.riders[0]?.outcomes ?? []).toHaveLength(0);
  });

  it('segments arbitrary compound rider bullet headers without named marker tables', () => {
    const result = extractCompoundRiderMechanics(
      `
Each of the following rider effects uses a DC 13 Dexterity saving throw.
- **Cinder Lash (Cinder Lash)**: The target takes \`2d4\` fire damage.
- **Glass Hook (Glass Hook)**: The target takes \`1d8\` piercing damage.
- **Pale Toll (Pale Toll)**: The target loses 1 unspent Hit Die.
`,
      { baseDamage: { formula: '2d6+3', type: 'piercing' } },
    );

    expect(result.riders.map((rider) => rider.key)).toEqual(['cinder-lash', 'glass-hook', 'pale-toll']);
    expect(result.riders.map((rider) => rider.save)).toEqual([
      expect.objectContaining({ dc: 13, ability: 'dex' }),
      expect.objectContaining({ dc: 13, ability: 'dex' }),
      expect.objectContaining({ dc: 13, ability: 'dex' }),
    ]);
  });

  it('parses one additional damage die for any rider name from source text', () => {
    const result = extractCompoundRiderMechanics(
      '- **Ashen Spike (Ashen Spike)**: The strike deals one additional damage die and the target starts **Bleeding (Bleeding) `1d6`**.',
      { baseDamage: { formula: '2d6+3', type: 'piercing' } },
    );

    expect(result.riders[0]?.damage).toEqual([
      expect.objectContaining({ formula: '1d6', type: 'piercing' }),
    ]);
    expect(result.riders[0]?.metadata).toEqual(
      expect.objectContaining({ bleeding: expect.objectContaining({ formula: '1d6' }) }),
    );
  });

  it('does not treat a bleeding die as direct rider damage without extra damage wording', () => {
    const result = extractCompoundRiderMechanics(
      '- **Ashen Wound (Ashen Wound)**: The target starts **Bleeding (Bleeding) `1d6`**.',
      { baseDamage: { formula: '2d6+3', type: 'piercing' } },
    );

    expect(result.riders[0]?.damage).toEqual([]);
    expect(result.riders[0]?.metadata).toEqual(
      expect.objectContaining({ bleeding: expect.objectContaining({ formula: '1d6' }) }),
    );
  });

  it('does not treat a bleed rules definition as direct rider damage', () => {
    const result = extractCompoundRiderMechanics(
      '- **Ashen Wound (Ashen Wound)**: The target starts **Bleeding (Bleeding) `1d6`**.\n  - **Bleed (Bleeding)**: At the start of each of its turns, the target takes `1d6` damage.',
      { baseDamage: { formula: '2d6+3', type: 'piercing' } },
    );

    expect(result.riders[0]?.damage).toEqual([]);
    expect(result.riders[0]?.metadata).toEqual(
      expect.objectContaining({ bleeding: expect.objectContaining({ formula: '1d6' }) }),
    );
  });

  it('does not classify random branch tables as compound riders', () => {
    const result = extractCompoundRiderMechanics(
      `Heavy Hit: If the attack total exceeds the target AC by 5 or more, roll 1d3.
  - **Bleeding Wound (Bleeding Wound)**: the target takes \`1d6\` bludgeoning damage.
  - **Reeling Impact (Reeling Impact)**: the target must succeed on a DC 15 Constitution saving throw or become Dazed.
  - **Push (Push)**: the target is pushed 10 ft.`,
      { baseDamage: { formula: '4d6+5', type: 'bludgeoning' } },
    );

    expect(result.riders).toEqual([]);
  });

  it('emits source-derived hitDiceChange outcomes for hit-dice loss and gain', () => {
    const loss = extractCompoundRiderMechanics(
      '- **Bone Toll (Bone Toll)**: 目标失去 1 颗未消耗的生命骰。',
    );
    const gain = extractCompoundRiderMechanics(
      '- **Ashen Gift (Ashen Gift)**: The target gains 1 unspent Hit Die.',
    );

    expect(loss.riders[0]?.outcomes).toContainEqual(
      expect.objectContaining({
        kind: 'hitDiceChange',
        direction: 'lose',
        count: 1,
        pool: 'unspent',
        target: 'target',
      }),
    );
    expect(gain.riders[0]?.outcomes).toContainEqual(
      expect.objectContaining({
        kind: 'hitDiceChange',
        direction: 'gain',
        count: 1,
        pool: 'unspent',
        target: 'target',
      }),
    );
  });

  it('derives temporary hit point target and condition from source text', () => {
    const targetTempHp = extractCompoundRiderMechanics(
      '- **Shared Vitality (Shared Vitality)**: 目标获得 10 点临时生命值。',
    );
    const conditionalSelfTempHp = extractCompoundRiderMechanics(
      '- **Blood Price (Blood Price)**: The target loses 1 unspent Hit Die. If the target loses a Hit Die this way, it gains 10 temporary hit points.',
    );

    expect(targetTempHp.riders[0]?.outcomes).toContainEqual(
      expect.objectContaining({
        kind: 'tempHp',
        amount: 10,
        target: 'target',
      }),
    );
    expect(targetTempHp.riders[0]?.outcomes.find((outcome) => outcome.kind === 'tempHp')).not.toEqual(
      expect.objectContaining({ condition: 'hitDiceChangeApplied' }),
    );
    expect(conditionalSelfTempHp.riders[0]?.outcomes).toContainEqual(
      expect.objectContaining({
        kind: 'tempHp',
        amount: 10,
        target: 'self',
        condition: 'hitDiceChangeApplied',
      }),
    );
  });
});
