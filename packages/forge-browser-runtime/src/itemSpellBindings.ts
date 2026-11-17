import { chargedSpellNameKey, sourceChargedSpellOptions, type ItemCoreSpellResolver } from '@fvtt-json-generator/intake-ai/item-core';
import type { ItemDiscoveryCandidate, ItemIntakeFinding, ItemIntakeIR, ItemIntakeValidationResult } from '@fvtt-json-generator/intake-ai/item-types';
import type { ItemSpellBinding } from '@fvtt-json-generator/models/action';
import { hashArtifact, type ForgeItemSpellVariant } from '@fvtt-json-generator/forge-gateway-protocol';
import { resolveLockedDnd5eV14SpellByName } from './adapters/v14SpellCatalog';
import type { NativeDocumentProjection } from './nativeTarget';
import { buildItemSpellVariant, itemSpellVariantDamageType } from './itemSpellVariant';

export const ITEM_SPELL_RULES_NOTICE = 'ITEM_SPELL_RULES_NOTICE';

export function itemSpellRulesNotice(spell: ItemSpellBinding): string | undefined {
  if (spell.rules === '2024') return undefined;
  const edition = spell.rules === '2014' ? '2014 规则版本' : '未标明规则版本的资料';
  return `${spell.name} 使用${edition}（${spell.uuid}）。`;
}

export async function readVerifiedItemSpell(
  uuid: string, projection: NativeDocumentProjection | undefined,
): Promise<ItemSpellBinding | undefined> {
  if (!/^(?:Compendium\.[\w-]+\.[\w-]+\.)?Item\.[a-zA-Z0-9]{16}$/u.test(uuid)) return undefined;
  try {
    const spell = await projection?.readItemSpell?.(uuid);
    if (spell?.uuid === uuid && spell.identifier && spell.name
      && Number.isInteger(spell.level) && spell.level >= 0 && spell.level <= 9
      && ['action', 'bonus', 'reaction', 'free'].includes(spell.castingTime?.type)) return spell;
  } catch {
    // A missing, inaccessible or unloaded document remains a review finding.
  }
  return undefined;
}

export function matchesBoundItemSpell(spell: ItemSpellBinding, identifier: string, name: string): boolean {
  const key = chargedSpellNameKey(name);
  return spell.identifier === identifier
    && (key === chargedSpellNameKey(spell.name) || key === chargedSpellNameKey(spell.identifier));
}

export async function readSourceItemSpellBindings(candidate: ItemDiscoveryCandidate, projection: NativeDocumentProjection | undefined) {
  const options = sourceChargedSpellOptions(candidate).filter(option => !option.unreadable);
  const explicitNames = new Set(options.filter(option => option.uuid || option.variant).map(option => chargedSpellNameKey(option.name)));
  const bindings = await readPreferredItemSpellBindings(options
    .filter(option => !explicitNames.has(chargedSpellNameKey(option.name))).map(option => option.name), projection);
  const variants: ForgeItemSpellVariant[] = [];
  const verifiedVariants = new Map<number, ItemSpellBinding>();
  const variantBases = projection?.readItemSpellSource ? await readItemSpellCandidates(new Set(options
    .filter(option => !option.uuid && option.variant).map(option => chargedSpellNameKey(option.name))), projection) : [];
  const findings: ItemIntakeFinding[] = [];
  for (const option of options) {
    if (!option.uuid && !option.variant) continue;
    const uuid = option.uuid;
    const key = chargedSpellNameKey(option.name);
    const damageType = option.variant ? itemSpellVariantDamageType(option.variant) : undefined;
    const draft = !uuid && damageType && projection
      ? await planDamageVariant(variantBases.filter(spell => chargedSpellNameKey(spell.name) === key), candidate, option.name, damageType, projection)
      : undefined;
    const spell = uuid ? await readVerifiedItemSpell(uuid, projection) : draft?.binding;
    let reason: string | undefined;
    if (!uuid && !draft) reason = '当前合集无法生成符合原文的伤害变体，请链接可用的法术文档。';
    else if (!spell || !matchesBoundItemSpell(spell, spell.identifier, option.name)) reason = '链接未读回同名、可用的法术文档。';
    else if (option.variant && (!damageType || !spell.damageTypes.length || spell.damageTypes.some(type => type !== damageType)))
      reason = '链接法术的伤害类型与原文指定的版本不符，或版本说明需要核对。';
    else if (bindings.some(existing => existing.uuid !== spell.uuid && matchesBoundItemSpell(existing, spell.identifier, key))) {
      reason = '同一法术名称的多个版本需要分别标明，无法唯一绑定。';
    }
    if (reason) {
      const path = '/item/abilities/source-binding/' + option.evidence.start;
      findings.push({ id: 'ITEM_SPELL_BINDING_REQUIRED:' + path, code: 'ITEM_SPELL_BINDING_REQUIRED', path,
        message: option.name + '：' + reason, blocking: true, origin: 'semantic', evidence: [option.evidence] });
    } else if (spell) {
      if (option.variant) verifiedVariants.set(option.evidence.start, spell);
      if (!bindings.some(existing => existing.uuid === spell.uuid)) {
        bindings.push(spell);
        if (draft) variants.push(draft.plan);
      }
    }
  }
  return { bindings, findings, variants, verifiedVariants };
}

async function planDamageVariant(
  bases: readonly ItemSpellBinding[], candidate: ItemDiscoveryCandidate, name: string, damageType: string, projection: NativeDocumentProjection,
) {
  const edition = bases[0]?.rules;
  for (const base of bases.filter(spell => spell.rules === edition)) {
    const baseUuid = base.uuid;
    const id = hashArtifact({ source: candidate.quote, baseUuid, damageType }).slice(0, 16);
    try {
      const displayName = name.replace(/(?<=\p{Script=Han})(?=[a-z])/iu, ' ');
      const draft = await buildItemSpellVariant(projection, { id, baseUuid, damageType, name: displayName });
      if (draft) return draft;
    } catch {
      // A compendium with an invalid spell can still have a same-edition alternative.
    }
  }
}

export function itemSpellCatalogHints(bindings: readonly ItemSpellBinding[], variants: ReadonlyMap<number, ItemSpellBinding>) {
  if (!bindings.length) return {};
  const variantUuids = new Set([...variants.values()].map(spell => spell.uuid));
  return { spellCatalog: bindings.map(({ name, identifier, castingTime, level, uuid, damageTypes }) =>
    ({ name, identifier, activation: castingTime.type, level,
      ...(variantUuids.has(uuid) ? { verifiedDamageVariant: damageTypes[0] } : {}) })) };
}

export function reconcileItemSpellVariantFindings(
  candidate: ItemDiscoveryCandidate, ir: ItemIntakeIR, variants: ReadonlyMap<number, ItemSpellBinding>,
): void {
  if (!variants.size || !Array.isArray(ir.uncertainties) || !Array.isArray(ir.item?.abilities)) return;
  const relevant = sourceChargedSpellOptions(candidate).filter(option => option.variant);
  const resolved = relevant.flatMap(option => {
    const binding = variants.get(option.evidence.start);
    if (!binding) return [];
    const cast = ir.item.abilities.find(ability => ability?.kind === 'spell' && ability.consumption === option.cost
      && matchesBoundItemSpell(binding, ability.spell?.identifier, ability.spell?.name ?? ''));
    return cast ? [{ option, cast }] : [];
  });
  for (const uncertainty of ir.uncertainties) {
    if (!uncertainty || !['UNRESOLVED_SPELL_VARIANT', 'UNRESOLVED_DAMAGE_VARIANT'].includes(uncertainty.code)) continue;
    const exactCast = resolved.find(({ cast }) => uncertainty.path === '/item/abilities/' + cast.id
      || uncertainty.path === '/item/abilities/' + ir.item.abilities.indexOf(cast));
    const rowEvidence = Array.isArray(uncertainty.evidence) && uncertainty.evidence.some(ref =>
      typeof ref?.quote === 'string' && resolved.some(({ option }) => ref.quote.includes(option.evidence.quote.trim())
        || (ref.quote.trim().length > 0 && ref.quote.includes(option.name) && ref.quote.includes(option.variant!))));
    if (!exactCast && !(uncertainty.path === '/item/abilities' && rowEvidence && resolved.length === relevant.length)) continue;
    uncertainty.blocking = false;
    uncertainty.code = 'VERIFIED_ITEM_SPELL_VARIANT';
    uncertainty.message = exactCast
      ? `${exactCast.option.name}：已按原文核实专用法术与伤害类型。`
      : '已按原文逐条核实费用表中的专用法术与伤害类型。';
  }
}

export function readUnlistedItemSpellBindings(candidate: ItemDiscoveryCandidate, ir: ItemIntakeIR, projection: NativeDocumentProjection | undefined) {
  const listed = new Set(sourceChargedSpellOptions(candidate).map(option => chargedSpellNameKey(option.name)));
  const names = Array.isArray(ir.item?.abilities) ? ir.item.abilities.flatMap(ability =>
    ability?.kind === 'spell' && typeof ability.spell?.name === 'string' && !listed.has(chargedSpellNameKey(ability.spell.name))
      ? [ability.spell.name] : []) : [];
  return readPreferredItemSpellBindings(names, projection);
}

export function appendItemSpellFindings(
  validation: ItemIntakeValidationResult, bindings: readonly ItemSpellBinding[], problems: readonly ItemIntakeFinding[],
) {
  const notices = bindings.flatMap((spell): ItemIntakeFinding[] => {
    const message = itemSpellRulesNotice(spell);
    const path = '/item/abilities/spell/' + spell.identifier;
    return message ? [{ id: ITEM_SPELL_RULES_NOTICE + ':' + path, code: ITEM_SPELL_RULES_NOTICE,
      path, message, blocking: false, origin: 'semantic' }] : [];
  });
  validation.findings.push(...problems, ...notices);
  validation.blocking.push(...problems);
  validation.warnings.push(...notices);
}

export async function readPreferredItemSpellBindings(names: readonly string[], projection: NativeDocumentProjection | undefined) {
  const keys = new Set(names.filter(name => !resolveLockedDnd5eV14SpellByName(name)).map(chargedSpellNameKey));
  const preferred = new Map<string, ItemSpellBinding>();
  for (const spell of await readItemSpellCandidates(keys, projection)) {
    const key = chargedSpellNameKey(spell.name);
    if (keys.has(key) && !preferred.has(key)) preferred.set(key, spell);
  }
  return [...preferred.values()];
}

async function readItemSpellCandidates(keys: ReadonlySet<string>, projection: NativeDocumentProjection | undefined) {
  if (!keys.size || !projection?.findItemSpellUuids) return [];
  const uuids = await projection.findItemSpellUuids(name => keys.has(chargedSpellNameKey(name)));
  const matches = await Promise.all([...new Set(uuids)].map(uuid => readVerifiedItemSpell(uuid, projection)));
  return matches.filter((match): match is ItemSpellBinding => match !== undefined).sort(compareSpellPriority);
}

function compareSpellPriority(left: ItemSpellBinding, right: ItemSpellBinding): number {
  const edition = (spell: ItemSpellBinding) => spell.rules === '2024' ? 0 : spell.rules === '2014' ? 1 : 2;
  const source = (spell: ItemSpellBinding) => /^Compendium\.dnd-/u.test(spell.uuid) ? 0 : 1;
  return edition(left) - edition(right) || source(left) - source(right) || left.uuid.localeCompare(right.uuid, 'en-US');
}

export function withItemSpellBindings(fallback: ItemCoreSpellResolver, bindings: readonly ItemSpellBinding[] = []): ItemCoreSpellResolver {
  const find = (identifier: string, name: string) => bindings.find(spell =>
    matchesBoundItemSpell(spell, identifier, name)
    || (chargedSpellNameKey(spell.name) === chargedSpellNameKey(name)
      && chargedSpellNameKey(name).replace(/[^a-z\d ]/gu, '').replace(/ +/gu, '-') === identifier));
  return {
    resolveSpell: (identifier, name) => find(identifier, name) ?? fallback.resolveSpell(identifier, name),
    resolveActivation: (identifier, name) => find(identifier, name)?.castingTime.type ?? fallback.resolveActivation(identifier, name),
  };
}

export function itemIntakeSpellUuids(ir: ItemIntakeIR, bindings: readonly ItemSpellBinding[] = []): Map<string, string> {
  const result = new Map<string, string>();
  for (const ability of ir.item.abilities) {
    if (ability.kind !== 'spell') continue;
    const binding = bindings.find(spell => matchesBoundItemSpell(spell, ability.spell.identifier, ability.spell.name));
    if (binding) result.set(ability.id, binding.uuid);
  }
  return result;
}
