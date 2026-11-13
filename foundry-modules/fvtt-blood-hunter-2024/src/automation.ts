import { legacyIconIdentity, legacyUrlIdentity, type LegacyIconIdentity, type LegacyIconIndex } from './legacy-icons.ts';
import { chooseCurses, validateCurseSelection, type CurseSelection } from './curse-specialist.ts';
import { applyMarkedDamage, registerMarkedAutomation } from './marked-curse.ts';
import { registerCastigationAutomation } from './castigation.ts';
export type { CurseChoice, CurseSelection } from './curse-specialist.ts';

const MODULE_ID = 'fvtt-blood-hunter-2024';
const DAWN_MACRO = 'riteOfTheDawn';
const DAWN_RESISTANCE_ACTIVITY = '96f94dd2358a38f2';
const DAWN_UNDEAD_ACTIVITY = '16e87ec8645abaa6';
type Document = Record<string, any>;
type Root = Record<string, any>;

interface CanonicalPresentationUpdate {
  itemId: string;
  canonicalId: string;
  before: { name: string; img: string };
  after: { name: string; img: string };
}
interface LegacyPresentationUpdate {
  mode: 'legacy-icon-only';
  itemId: string;
  currentName: string;
  identity: LegacyIconIdentity;
  sourceLocator: { group: string; index: number };
  route: string;
  canonicalId?: string;
  before: { img: string };
  after: { img: string };
}
export type FeaturePresentationUpdate = CanonicalPresentationUpdate | LegacyPresentationUpdate;

const values = (collection: any): Document[] => Array.from(collection?.contents ?? collection?.values?.() ?? collection ?? []);
const flags = (document: Document): Document => document.flags?.[MODULE_ID] ?? {};
const sourceName = (document: Document): string => document.flags?.fvttJsonGenerator?.bloodHunter2024?.sourceIdentity?.normalizedName ?? '';
const automation = (item: Document): string => flags(item).automation ?? ({ 'rite-of-the-dawn': 'rite-of-the-dawn', 'curse-specialist': 'curse-specialist' }[sourceName(item)] ?? '');
const isRite = (effect: Document): boolean => effect.flags?.fvttJsonGenerator?.bloodHunterRite === true;
const isDawn = (effect: Document): boolean => !effect.disabled && (flags(effect).rite === 'dawn' || isRite(effect) && effect.flags.fvttJsonGenerator.riteName === '破晓血仪');
const identifier = (item: Document): string => item.system?.identifier ?? '';
const dawnUpdates = new Map<string, Promise<void>>();

export function previewFeaturePresentation(actor: Document, documents: Document[], legacyIndex?: LegacyIconIndex): FeaturePresentationUpdate[] {
  return values(actor.items).flatMap((item): FeaturePresentationUpdate[] => {
    const canonicalId = item.flags?.fvttJsonGenerator?.bloodHunter2024?.canonicalId;
    if (!canonicalId) {
      const identity = legacyIconIdentity(item);
      if (!identity || !legacyIndex) return [];
      const urlIdentity = legacyUrlIdentity(identity.hash);
      const matches = legacyIndex.entries.filter((entry) => entry.page === identity.page && entry.type === item.type && entry.urlIdentity === urlIdentity);
      if (matches.length > 1) throw new Error('旧版来源图标身份不唯一，停止更新。');
      const entry = matches[0];
      if (!entry || entry.img === item.img) return [];
      return [{ mode: 'legacy-icon-only', itemId: item.id, currentName: item.name, identity, sourceLocator: entry.sourceLocator, route: entry.route, ...(entry.canonicalId ? { canonicalId: entry.canonicalId } : {}), before: { img: item.img }, after: { img: entry.img } }];
    }
    const canonical = documents.find((document) => document._id === canonicalId);
    if (!canonical || canonical.type !== item.type || canonical.name === item.name && canonical.img === item.img) return [];
    return [{ itemId: item.id, canonicalId, before: { name: item.name, img: item.img }, after: { name: canonical.name, img: canonical.img } }];
  });
}

export async function refreshFeaturePresentation(actor: Document, approved: FeaturePresentationUpdate[], documents: Document[], root: Root = globalThis, legacyIndex?: LegacyIconIndex): Promise<void> {
  if (!root.game.user.isGM) throw new Error('特性图标更新仅允许 GM 明确选择角色后执行。');
  const current = previewFeaturePresentation(actor, documents, legacyIndex);
  if (!approved.every((update) => current.some((candidate) => JSON.stringify(candidate) === JSON.stringify(update)))) throw new Error('角色图标或名称已变化；请重新预览差异。');
  if (approved.length) await actor.updateEmbeddedDocuments('Item', approved.map((update) => ({ _id: update.itemId, ...update.after })));
}

/** dnd5e has no separate sheathed state: equipped is the player's held-weapon toggle. */
export function dawnWeaponHeld(weapon: Document): boolean {
  return weapon.type === 'weapon' && weapon.system?.equipped === true;
}

export function syncDawnWeapon(weapon: Document): Promise<void> {
  // Replacing a rite emits deletion and application hooks in the same operation.
  const pending = (dawnUpdates.get(weapon.uuid) ?? Promise.resolve()).then(() => synchronizeDawnWeapon(weapon));
  dawnUpdates.set(weapon.uuid, pending);
  return pending.finally(() => { if (dawnUpdates.get(weapon.uuid) === pending) dawnUpdates.delete(weapon.uuid); });
}

async function synchronizeDawnWeapon(weapon: Document): Promise<void> {
  const actor = weapon.actor;
  if (!actor) return;
  const enchantment = values(weapon.effects).find(isDawn);
  const linked = values(actor.effects).filter((effect) => flags(effect).dawnWeaponUuid === weapon.uuid);
  if (!enchantment) {
    if (linked.length) await actor.deleteEmbeddedDocuments('ActiveEffect', linked.map((effect) => effect.id));
    return;
  }
  const data = {
    name: '破晓血仪：黯蚀抗性 Rite of the Dawn: Necrotic Resistance',
    img: 'icons/magic/air/weather-clouds-sunlight.webp',
    type: 'base', origin: enchantment.uuid, disabled: !dawnWeaponHeld(weapon), transfer: false,
    system: { changes: [{ key: 'system.traits.dr.value', mode: 2, value: 'necrotic', priority: 20 }] },
    flags: {
      [MODULE_ID]: { dawnWeaponUuid: weapon.uuid, dawnEnchantmentUuid: enchantment.uuid },
      cat: { macros: { roll: [{ source: MODULE_ID, rules: 'all', identifier: DAWN_MACRO }] } },
    },
  };
  if (!linked.length) await actor.createEmbeddedDocuments('ActiveEffect', [data]);
  else {
    const first = linked[0]!;
    if (first.disabled !== data.disabled || flags(first).dawnEnchantmentUuid !== enchantment.uuid) await first.update(data);
    if (linked.length > 1) await actor.deleteEmbeddedDocuments('ActiveEffect', linked.slice(1).map((effect) => effect.id));
  }
}

export function dawnDamageBonus({ document, workflow }: { document: Document; workflow: Document }, root: Root = globalThis): any {
  const weapon = workflow.item;
  if (!weapon || weapon.uuid !== flags(document).dawnWeaponUuid || !dawnWeaponHeld(weapon) || document.disabled) return;
  if (!workflow.activity?.hasAttack || !workflow.activity?.hasDamage || !values(weapon.effects).some((effect) => isDawn(effect) && effect.uuid === flags(document).dawnEnchantmentUuid)) return;
  const targets = values(workflow.hitTargets).filter((token) => token.actor?.system?.details?.type?.value === 'undead');
  if (!targets.length) return;
  const bonus = new root.cat.lib.DamageBonus(document, {
    formula: '@scale.blood-hunter.hemocraft', type: ['radiant'], optional: false, allowCritical: true,
    identifier: `${MODULE_ID}.${DAWN_MACRO}.${weapon.uuid}`,
  });
  bonus.targets = targets.map((token) => token.document);
  return bonus;
}

export function learnedCurseActivities(actor: Document): Array<{ item: Document; activity: Document }> {
  return values(actor.items).filter((item) => identifier(item).startsWith('blood-curse-'))
    .flatMap((item) => values(item.system.activities)
      .filter((activity) => ['bonus', 'reaction'].includes(activity.activation?.type))
      .map((activity) => ({ item, activity })));
}

export async function useCurseSpecialist(activity: Document, selection?: CurseSelection, root: Root = globalThis): Promise<Document[]> {
  const actor = activity.actor ?? activity.item.actor;
  if (automation(activity.item) !== 'curse-specialist' || !actor?.isOwner) throw new Error('需要拥有诅咒专家 Curse Specialist 的角色。');
  if (typeof root.MidiQOL?.completeActivityUse !== 'function') throw new Error('双血咒需要已启用 MIDI-QOL 的 completeActivityUse API。');
  const choices = learnedCurseActivities(actor);
  if (!choices.length) throw new Error('角色尚未学会可施放的血咒。');
  const selected = selection ?? await chooseCurses(choices, root);
  if (!selected) return [];
  const activities = validateCurseSelection(selected, choices).map((entry) => entry.activity);
  for (const uuid of new Set(selected.curses.flatMap((curse) => curse.targetUuids))) {
    const token = root.fromUuidSync(uuid)?.object;
    if (!token || !root.MidiQOL.isTargetable(token)) throw new Error('所选血咒目标不在当前已渲染场景或不是有效目标；请重新选择。');
  }
  const used = selected.action === 'bonus' ? root.MidiQOL.hasUsedBonusAction : root.MidiQOL.hasUsedReaction;
  if (actor.inCombat && used?.(actor)) throw new Error(selected.action === 'bonus' ? '本回合已使用附赠动作。' : '当前反应已使用。');
  const results: Document[] = [];
  for (let index = 0; index < selected.curses.length; index++) {
    const source = activities[index]!;
    // Clone the DataModel, not the owned Item: resource providers and triggered
    // amplification keep their normal Item UUIDs and costs.
    const item = source.item.clone({
      [`system.activities.${source.id}.activation`]: { ...source.activation, type: index === 0 ? selected.action : 'special', value: index === 0 ? 1 : null, override: true },
    }, { keepId: true });
    const child = item.system.activities.get(source.id);
    prepareCurseConsumption(child);
    const result = await root.MidiQOL.completeActivityUse(child, {
      consume: { action: index === 0 },
      midiOptions: {
        targetUuids: selected.curses[index]!.targetUuids,
        ignoreUserTargets: true,
        proceedChecks: index === 0 ? {} : { checkReaction: false, checkBonusAction: false },
        workflowOptions: { targetConfirmation: 'none', notReaction: index !== 0 || selected.action !== 'reaction', notBonusAction: index !== 0 || selected.action !== 'bonus' },
      },
    }, { configure: true });
    if (!result || result.aborted) break;
    results.push(result);
  }
  return results;
}

function prepareCurseConsumption(activity: Document): void {
  if (!identifier(activity.item).startsWith('blood-curse-')) return;
  const actor = activity.actor ?? activity.item.actor;
  const items = values(actor?.items);
  const pool = items.find((item) => identifier(item) === 'blood-maledict' || sourceName(item) === 'hemocraft');
  if (!pool) return;
  const targets = values(activity.consumption?.targets);
  const updated = targets.map((target) => {
    const data = target.toObject?.() ?? { ...target };
    if (target.type !== 'itemUses' || !target.target || items.some((item) => item.id === target.target)) return { ...data, target: target.target };
    const canonicalId = pool.flags?.fvttJsonGenerator?.bloodHunter2024?.canonicalId;
    return { ...data, target: target.target === 'blood-maledict' || canonicalId && target.target === canonicalId ? pool.id : target.target };
  });
  if (!updated.some((target, index) => target.target !== targets[index]!.target)) return;
  activity.item.updateSource({ [`system.activities.${activity.id}.consumption.targets`]: updated });
  // updateSource recreates the Item's Activity models; native use still holds this earlier model until its next stage.
  for (const [index, target] of targets.entries()) target.target = updated[index]!.target;
}

export function registerBloodHunterAutomation(root: Root = globalThis): void {
  const hooks = root.Hooks;
  if (!hooks?.on) return;
  const report = (error: unknown) => { root.console?.error?.(MODULE_ID, error); root.ui?.notifications?.error?.(error instanceof Error ? error.message : String(error)); };
  const local = (userId?: string) => !userId || userId === root.game.user.id;
  const sync = (weapon: Document) => syncDawnWeapon(weapon).catch(report);
  registerMarkedAutomation(root, report);
  registerCastigationAutomation(root, report);
  hooks.on('midi-qol.preTargeting', ({ activity }: Document) => prepareCurseConsumption(activity));
  hooks.once('catReady', () => {
    if (typeof root.cat?.api?.registerFnMacro !== 'function' || typeof root.cat?.lib?.DamageBonus !== 'function') return report(new Error('破晓附伤需要 CPR 2.1.7／CAT 0.1.7 或兼容新版的公开 API。'));
    root.cat.api.registerFnMacro({ source: MODULE_ID, identifier: DAWN_MACRO, rules: 'all', documents: ['activeeffect'], roll: [{ pass: 'actorOptionalBonusDamage', priority: 250, macro: (args: any) => dawnDamageBonus(args, root) }] });
  });
  hooks.once('init', () => {
    const module = root.game.modules.get(MODULE_ID);
    const presentation = async () => {
      const [contract, identity, index] = await Promise.all(['migration-contract', 'identity-manifest', 'legacy-icon-index'].map(async (name) => {
        const response = await root.fetch(`modules/${MODULE_ID}/data/${name}.json`, { cache: 'no-store' });
        if (!response.ok) throw new Error('无法读取本模块特性显示来源。');
        return response.json();
      }));
      if (index.schemaVersion !== 1 || index.moduleId !== MODULE_ID || index.version !== module.version || index.sourceSha256 !== identity.sourceSha256 || index.canonicalLogicalHash !== contract.logicalHash || index.canonicalLogicalHash !== identity.logicalHash) throw new Error('旧版图标索引与已安装模块来源身份不一致。');
      return { documents: contract.documents, index: index as LegacyIconIndex };
    };
    module.api = {
      syncDawnWeapon, dawnDamageBonus: (args: any) => dawnDamageBonus(args, root), learnedCurseActivities,
      applyMarkedDamage: (args: any) => applyMarkedDamage(args, root),
      useCurseSpecialist: (activity: Document, selection?: CurseSelection) => useCurseSpecialist(activity, selection, root),
      previewFeaturePresentation: async (actor: Document) => { const data = await presentation(); return previewFeaturePresentation(actor, data.documents, data.index); },
      refreshFeaturePresentation: async (actor: Document, approved: FeaturePresentationUpdate[]) => { const data = await presentation(); return refreshFeaturePresentation(actor, approved, data.documents, root, data.index); },
    };
  });
  hooks.on('dnd5e.applyEnchantment', async (weapon: Document, current: Document) => {
    if (!isRite(current) || !weapon.isOwner) return;
    const conflicts = values(weapon.effects).filter((effect) => effect.id !== current.id && isRite(effect));
    if (conflicts.length) await weapon.deleteEmbeddedDocuments('ActiveEffect', conflicts.map((effect) => effect.id));
    await sync(weapon);
  });
  hooks.on('updateItem', (item: Document, _changes: unknown, _options: unknown, userId: string) => { if (local(userId) && item.type === 'weapon') return sync(item); });
  hooks.on('deleteItem', (item: Document, _options: unknown, userId: string) => {
    if (!local(userId) || item.type !== 'weapon' || !item.actor) return;
    const ids = values(item.actor.effects).filter((effect) => flags(effect).dawnWeaponUuid === item.uuid).map((effect) => effect.id);
    if (ids.length) return item.actor.deleteEmbeddedDocuments('ActiveEffect', ids).catch(report);
  });
  for (const event of ['updateActiveEffect', 'deleteActiveEffect']) hooks.on(event, (effect: Document, ...args: any[]) => {
    const userId = args.at(-1);
    if (local(userId) && effect.parent?.type === 'weapon' && isRite(effect)) return sync(effect.parent);
  });
  hooks.on('dnd5e.restCompleted', async (actor: Document) => {
    if (!actor.isOwner) return;
    for (const item of values(actor.items)) {
      if (item.type !== 'weapon') continue;
      const ids = values(item.effects).filter(isRite).map((effect) => effect.id);
      if (ids.length) await item.deleteEmbeddedDocuments('ActiveEffect', ids);
      await sync(item);
    }
  });
  hooks.on('dnd5e.preUseActivity', (activity: Document) => {
    prepareCurseConsumption(activity);
    if (automation(activity.item) === 'curse-specialist') { void useCurseSpecialist(activity, undefined, root).catch(report); return false; }
    if (automation(activity.item) !== 'rite-of-the-dawn') return;
    if (activity.id === DAWN_RESISTANCE_ACTIVITY || activity.id === DAWN_UNDEAD_ACTIVITY) {
      root.ui?.notifications?.info?.('此效果由实际破晓武器自动结算，无需单独使用。');
      return false;
    }
  });
}
