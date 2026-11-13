import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ActorGenerator } from '@fvtt-json-generator/generation/actor';
import { ItemGenerator } from '@fvtt-json-generator/generation/item-generator';
import { adaptParsedActorToCanonical, adaptParsedItemToCanonical } from '@fvtt-json-generator/generation/adapters';
import { verifyGeneratedDocument } from '@fvtt-json-generator/generation/verification';
import { resolveLockedDnd5eV14SpellByName } from '@fvtt-json-generator/generation/v14-spell-catalog';
import type { ParsedNPC } from '../../../config/mapping';
import type { ParsedItem } from '@fvtt-json-generator/models/item';
import { ItemParser } from '@fvtt-json-generator/parser/item-parser';

const spells = [
  { name: 'Mage Hand', identifier: 'mage-hand', level: 0, activation: 'action', _id: 'aaaaaaaaaaaaaaaa' },
  { name: 'Shield', identifier: 'shield', level: 1, activation: 'reaction', _id: 'bbbbbbbbbbbbbbbb' },
  { name: 'Misty Step', identifier: 'misty-step', level: 2, activation: 'bonus', _id: 'cccccccccccccccc' },
  { name: 'Invisibility', identifier: 'invisibility', level: 2, activation: 'action', _id: 'dddddddddddddddd' },
];
let root: string;
let pool: string;
let previousRoot: string | undefined;
beforeEach(() => {
  previousRoot = process.env.FVTT_REFERENCE_CACHE_ROOT;
  root = mkdtempSync(join(tmpdir(), 'fvtt-modern-spell-catalog-'));
  process.env.FVTT_REFERENCE_CACHE_ROOT = root;
  const repo = join(root, 'dnd5e', '6.0.6', 'repo');
  pool = join(repo, 'packs', '_source', 'spells24');
  mkdirSync(pool, { recursive: true });
  writeFileSync(join(repo, 'system.json'), JSON.stringify({ id: 'dnd5e', version: '6.0.6' }));
  for (const spell of spells) writeFileSync(join(pool, `${spell.identifier}.yml`), JSON.stringify({ ...spell, type: 'spell', system: {
    identifier: spell.identifier, level: spell.level, activation: { type: spell.activation }, activities: { primary: { activation: { type: 'action', override: false } } },
  } }));
});
afterEach(() => {
  if (previousRoot === undefined) delete process.env.FVTT_REFERENCE_CACHE_ROOT;
  else process.env.FVTT_REFERENCE_CACHE_ROOT = previousRoot;
  rmSync(root, { recursive: true, force: true });
});
function source(line: string, ability: boolean = true): ParsedNPC {
  return { name: '现代施法者 Modern Caster', type: 'npc', abilities: { cha: 16 }, attributes: ability ? { spellcasting: 'cha' } : {},
    details: {}, traits: {}, skills: {}, saves: [], items: [], spellcasting: [line] };
}
function generate(parsed: ParsedNPC) {
  const actor = new ActorGenerator({ fvttVersion: '14' }).generate(parsed);
  return { actor, feature: actor.items.find((item: any) => item.name === '施法 Spellcasting'), verification: verifyGeneratedDocument({
    canonical: adaptParsedActorToCanonical(parsed), output: actor, target: '14', effectProfile: 'core',
  }) };
}
describe('native6 legacy spellcasting source boundary', () => {
  it.each(spells)('uses the unique 2024 $name reference and its actual level with explicit finite source uses', spell => {
    const { actor, feature, verification } = generate(source(`1/day: ${spell.name}`));
    expect(actor.items.some((item: any) => item.type === 'spell')).toBe(false);
    const cast = Object.values<any>(feature.system.activities)[0];
    expect(cast.spell).toMatchObject({ uuid: `Compendium.dnd5e.spells24.Item.${spell._id}`, level: spell.level, ability: 'cha' });
    expect(cast.activation.type).toBe(spell.activation);
    expect(cast.uses).toEqual({ spent: 0, max: '1', recovery: [{ period: 'day', type: 'recoverAll' }] });
    expect(cast.consumption).toMatchObject({ spellSlot: false, targets: [{ type: 'activityUses', target: '', value: '1' }] });
    expect(feature.system.description.value).toContain(`1/day: ${spell.name}`);
    expect(verification.diagnostics.some(entry => entry.code === 'GEN_V14_SPELLCAST_PENDING')).toBe(false);
  });
  it('uses explicit at-will authority without inventing a finite maximum', () => {
    const { feature } = generate(source('At will: Mage Hand'));
    expect(Object.values<any>(feature.system.activities)[0].uses).toEqual({ spent: 0, max: '', recovery: [] });
  });
  it.each([
    { line: '1/day: Fireball', ability: true, reason: '没有唯一' },
    { line: '1/day: Mage Hand', ability: false, reason: '施法属性' },
    { line: 'Spells: Mage Hand', ability: true, reason: '没有明确随意' },
  ])('retains the complete source and pending finding instead of an invented Spell: %o', ({ line, ability, reason }) => {
    const { actor, feature, verification } = generate(source(line, ability));
    expect(actor.items).toHaveLength(1);
    expect(feature.system.description.value).toContain(line);
    expect(feature.system.activities).toEqual({});
    expect(verification.status).toBe('needs_review');
    expect(verification.diagnostics).toContainEqual(expect.objectContaining({ code: 'GEN_V14_SPELLCAST_PENDING', message: expect.stringContaining(reason) }));
  });
  it('rejects ambiguous names and supplemental consumables as spell identities', () => {
    writeFileSync(join(pool, 'duplicate.yml'), JSON.stringify({ name: 'Mage Hand', type: 'spell', _id: 'dddddddddddddddd', system: { identifier: 'other-mage-hand', level: 0 } }));
    writeFileSync(join(pool, 'berries.yml'), JSON.stringify({ name: 'Magical Berries', type: 'consumable', _id: 'eeeeeeeeeeeeeeee', system: { identifier: 'magical-berries', level: 0 } }));
    expect(resolveLockedDnd5eV14SpellByName('Mage Hand')).toBeUndefined();
    expect(resolveLockedDnd5eV14SpellByName('Magical Berries')).toBeUndefined();
    expect(generate(source('At will: Mage Hand, Magical Berries')).feature.system.activities).toEqual({});
  });
  it('does not turn an ambiguous multi-spell daily allowance into independent pools or overwrite repeated limits', () => {
    const shared = generate(source('3/day: Mage Hand, Shield'));
    expect(shared.feature.system.activities).toEqual({});
    expect(shared.verification.diagnostics.filter(entry => entry.code === 'GEN_V14_SPELLCAST_PENDING')).toHaveLength(2);
    const explicit = generate(source('3/day each: Mage Hand, Shield'));
    expect(Object.values<any>(explicit.feature.system.activities).map(activity => activity.uses.max)).toEqual(['3', '3']);
    const repeated = source('1/day: Mage Hand');
    repeated.spellcasting = ['1/day: Mage Hand', '3/day: Mage Hand'];
    const result = generate(repeated);
    expect(result.feature.system.activities).toEqual({});
    expect(result.feature.system.description.value).toContain('1/day: Mage Hand');
    expect(result.feature.system.description.value).toContain('3/day: Mage Hand');
  });
  it('does not replace a minute casting time with the inherited action of a Summon subactivity', () => {
    writeFileSync(join(pool, 'animate-dead.yml'), JSON.stringify({ name: 'Animate Dead', type: 'spell', _id: 'ffffffffffffffff', system: {
      identifier: 'animate-dead', level: 3, activation: { type: 'minute', value: 1 }, activities: { summon: { activation: { type: 'action', override: false } } },
    } }));
    expect(resolveLockedDnd5eV14SpellByName('Animate Dead')?.activation).toBeUndefined();
    const result = generate(source('1/day: Animate Dead'));
    expect(result.feature.system.activities).toEqual({});
    expect(result.verification.status).toBe('needs_review');
    expect(result.feature.system.description.value).toContain('1/day: Animate Dead');
  });
  it.each([0, 2])('uses the same modern name boundary for an Item without a formal identifier and keeps exact cost %s', async consumption => {
    const parsed: ParsedItem = { name: '隐形护符', englishName: 'Invisibility Charm', type: 'equipment', description: 'Cast Invisibility.',
      structuredActions: { casts: [{ name: '隐形术', englishName: 'Invisibility', type: 'spell', spellName: 'Invisibility',
        useAction: { activation: 'action', consumption, description: 'Cast Invisibility.' } }] } };
    const item = await new ItemGenerator().generate(parsed);
    const cast = Object.values<any>(item.system.activities)[0];
    expect(cast.spell).toMatchObject({ uuid: 'Compendium.dnd5e.spells24.Item.dddddddddddddddd', level: 2 });
    expect(cast.consumption.spellSlot).toBe(false);
    expect(cast.consumption.targets).toEqual(consumption ? [expect.objectContaining({ type: 'itemUses', value: String(consumption) })] : []);
    const verify = verifyGeneratedDocument({ canonical: adaptParsedItemToCanonical(parsed), output: item, target: '14', effectProfile: 'core' });
    expect(verify.status).not.toBe('failed');
    parsed.structuredActions!.casts![0]!.spellName = 'Unknown Old Spell';
    parsed.structuredActions!.casts![0]!.englishName = 'Unknown Old Spell';
    const unknown = await new ItemGenerator().generate(parsed);
    expect(unknown.system.activities).toEqual({});
    expect(verifyGeneratedDocument({ canonical: adaptParsedItemToCanonical(parsed), output: unknown, target: '14', effectProfile: 'core' }).status).toBe('failed');
    parsed.structuredActions!.casts![0]!.spellIdentifier = 'not-a-real-spell';
    await expect(new ItemGenerator().generate(parsed)).rejects.toThrow('Unable to uniquely resolve dnd5e spell "not-a-real-spell" for Item Activity.');
  });
  it.each([0, 2])('keeps the separately parsed English spell identity from a real Chinese Markdown bullet with cost %s', async consumption => {
    const markdown = [
      '---', 'layout: item', '---', '## 隐形护符（Invisibility Charm）', '*奇物，稀有（需同调）*',
      '这件护符具有4发充能，每天黎明恢复所有消耗的充能。',
      `- 消耗${consumption}发充能施展 *隐形术*（*Invisibility*）。`,
    ].join('\n');
    const parsed = new ItemParser().parse(markdown);
    const sourceSpell = (parsed.structuredActions as (typeof parsed.structuredActions & { spells?: unknown[] }) | undefined)?.spells?.[0];
    expect(sourceSpell).toMatchObject({ spellName: '隐形术', englishName: 'Invisibility', useAction: { consumption } });
    const item = await new ItemGenerator().generate(parsed);
    const cast = Object.values<any>(item.system.activities).find(activity => activity.type === 'cast');
    expect(cast.spell).toMatchObject({ uuid: 'Compendium.dnd5e.spells24.Item.dddddddddddddddd', level: 2 });
    expect(cast.consumption.spellSlot).toBe(false);
    expect(cast.consumption.targets).toEqual(consumption ? [expect.objectContaining({ type: 'itemUses', value: String(consumption) })] : []);
    expect(verifyGeneratedDocument({ canonical: adaptParsedItemToCanonical(parsed, { sourceText: markdown }), output: item, target: '14', effectProfile: 'core' }).status).toBe('accepted');
  });
});
