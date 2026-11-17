import { sha256 } from '@fvtt-json-generator/contracts';
import type { ItemIntakeAbility, ItemIntakeIR } from '@fvtt-json-generator/intake-ai/item-types';

type QuotedAbility<T = ItemIntakeAbility> = T extends ItemIntakeAbility
  ? Omit<T, 'evidence'> & { quote: string } : never;

export function itemFixture(
  name: string,
  type: string,
  rules: string[],
  options: { abilities?: QuotedAbility[];
    pool?: NonNullable<ItemIntakeIR['item']['uses']> & { quote: string }; manual?: string } = {},
) {
  const source = [`## ${name}`, `*${type}, Rare*`, ...rules].join('\n\n');
  const evidence = (quote: string) => {
    const start = source.indexOf(quote);
    if (start < 0) throw new Error(`Missing fixture quote: ${quote}`);
    return { start, end: start + quote.length, quote };
  };
  const candidate = { id: 'item', label: name, ...evidence(source) };
  const abilities = (options.abilities ?? []).map(({ quote, ...ability }) => ({ ...ability, evidence: [evidence(quote)] }));
  const claims: ItemIntakeIR['claims'] = [
    { path: '/item/name', valueKind: 'explicit', value: name, evidence: [evidence(name)] },
    { path: '/item/type', valueKind: 'explicit', value: type, evidence: [evidence(type)] },
    ...abilities.map((ability) => ({ path: `/item/abilities/${ability.id}`, valueKind: 'explicit' as const, evidence: ability.evidence })),
  ];
  const pool = options.pool;
  if (pool) claims.push({ path: '/item/uses/max', valueKind: 'explicit', value: pool.max, evidence: [evidence(pool.quote)] });
  const ir: ItemIntakeIR = {
    schemaVersion: 1,
    source: { sha256: sha256(source), length: source.length },
    item: { name, type, abilities, ...(pool ? { uses: { max: pool.max, recovery: pool.recovery } } : {}) },
    claims,
    coverage: [{ ...evidence(source), classification: 'mechanical', claimPaths: claims.map(({ path }) => path) }],
    uncertainties: options.manual ? [{
      id: 'last-charge-requires-gm', path: '/item/abilities/fireball', code: 'LAST_CHARGE_REQUIRES_GM',
      message: 'Resolve the last-charge roll and possible destruction manually.', blocking: false, evidence: [evidence(options.manual)],
    }] : [],
  };
  return { source, candidate, ir };
}

export function fireballWandItem() {
  // 2024 Wand of Fireballs source facts in dnd5e 6.0.6, dmgWandOfFirebal.
  const rule = 'While holding it, you can expend no more than 3 charges to cast Fireball (save DC 15) from it. For 1 charge, you cast the level 3 version of the spell. You can increase the spell’s level by 1 for each additional charge you expend.';
  const pool = 'This wand has 7 charges. The wand regains 1d6 + 1 expended charges daily at dawn.';
  const manual = 'If you expend the wand’s last charge, roll 1d20. On a 1, the wand crumbles into ashes and is destroyed.';
  return itemFixture('Wand of Fireballs', 'Wand', [pool, rule, manual], {
    pool: { max: 7, recovery: [{ period: 'dawn', type: 'formula', formula: '1d6 + 1' }], quote: pool },
    abilities: [{ id: 'fireball', kind: 'spell', activation: 'action', consumption: 1, level: 3,
      saveDc: 15, maxCharges: 3, spell: { name: 'Fireball', identifier: 'fireball' }, quote: rule }],
    manual,
  });
}

export function splitPoolRingItem() {
  const pool = '这枚戒指有 3 次共享充能。黎明时恢复所有已消耗的充能。';
  const separate = '使用一个动作施放 2 环隐形术 Invisibility。这项特性有独立的 1 次使用次数，完成长休时恢复这次使用次数。';
  const shared = '作为一个附赠动作，消耗 1 次共享充能施放 2 环魔法飞弹 Magic Missile。';
  const atWill = '使用一个动作随意施放法师之手 Mage Hand，不消耗戒指充能或独立次数。';
  return itemFixture('星印戒指 Starseal Ring', '戒指（Ring）', [pool, separate, shared, atWill], {
    pool: { max: 3, recovery: [{ period: 'dawn', type: 'recoverAll' }], quote: pool },
    abilities: [
      { id: 'invisibility', kind: 'spell', activation: 'action', consumption: 1, level: 2,
        activityUses: { max: 1, recovery: [{ period: 'lr', type: 'recoverAll' }] },
        spell: { identifier: 'invisibility', name: 'Invisibility' }, quote: separate },
      { id: 'magic-missile', kind: 'spell', activation: 'bonus', activationOverride: true, consumption: 1, level: 2,
        spell: { identifier: 'magic-missile', name: 'Magic Missile' }, quote: shared },
      { id: 'mage-hand', kind: 'spell', activation: 'action', consumption: 0,
        spell: { identifier: 'mage-hand', name: 'Mage Hand' }, quote: atWill },
    ],
  });
}
