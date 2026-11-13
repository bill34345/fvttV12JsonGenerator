import { MODULE_ID } from './runtime.ts';

type Document = Record<string, any>;
type Root = Record<string, any>;
const BRAND_CANONICAL_ID = '9598fd8a1cb033a0';
const values = (collection: any): Document[] => Array.from(collection?.contents ?? collection?.values?.() ?? collection ?? []);
const flags = (document: Document): Document => document.flags?.[MODULE_ID] ?? {};

export function isCastigationItem(item: Document): boolean {
  return item.flags?.fvttJsonGenerator?.bloodHunter2024?.canonicalId === BRAND_CANONICAL_ID;
}

export function hasCastigationTemplate(item: Document): boolean {
  const effect = values(item.effects).find(entry => flags(entry).castigationBrand);
  return Boolean(effect && values(item.system.activities).some(activity => values(activity.effects).some(reference => reference._id === effect.id)));
}

export async function adaptCastigationItem(item: Document, root: Root = globalThis): Promise<Document> {
  const canonical = await root.fromUuid(`Compendium.${MODULE_ID}.features.Item.${BRAND_CANONICAL_ID}`);
  const template = values(canonical.effects).find(effect => flags(effect).castigationBrand)!;
  const sourceActivity = values(canonical.system.activities).find(activity => values(activity.effects).some(reference => reference._id === template.id))!;
  const activity = values(item.system.activities).find(entry => entry.id === sourceActivity.id)!;
  await item.update({
    effects: [...values(item.effects).map(effect => effect.toObject()), template.toObject()],
    [`system.activities.${activity.id}.effects`]: sourceActivity.effects.map((reference: Document) => reference.toObject?.() ?? { ...reference }),
    [`system.activities.${activity.id}.activation.condition`]: sourceActivity.activation.condition,
    [`system.activities.${activity.id}.description.chatFlavor`]: sourceActivity.description.chatFlavor,
  });
  return item.system.activities.get(activity.id);
}

export function prepareCastigationEffect(effect: Document, root: Root = globalThis): void {
  if (!flags(effect).castigationBrand || effect.parent?.documentName !== 'Actor') return;
  const caster = sourceActor(effect, root);
  if (!caster) return;
  const token = caster.getActiveTokens(false, true).find((entry: Document) => entry.parent.id === root.canvas.scene.id);
  effect.updateSource({
    [`flags.${MODULE_ID}.brandCasterUuid`]: caster.uuid,
    [`flags.${MODULE_ID}.brandCasterTokenUuid`]: token?.uuid ?? null,
  });
}

export async function bindCastigationEffect(effect: Document, root: Root = globalThis): Promise<void> {
  if (!flags(effect).castigationBrand || effect.parent?.documentName !== 'Actor') return;
  const caster = sourceActor(effect, root);
  if (!caster) return;
  const previous = caster.getFlag(MODULE_ID, 'castigationTarget');
  if (previous?.effectUuid && previous.effectUuid !== effect.uuid) {
    const oldEffect = root.fromUuidSync(previous.effectUuid, { strict: false });
    if (oldEffect && flags(oldEffect).brandCasterUuid === caster.uuid) await oldEffect.delete();
  }
  await caster.setFlag(MODULE_ID, 'castigationTarget', { effectUuid: effect.uuid, actorUuid: effect.parent.uuid });
}

export async function unbindCastigationEffect(effect: Document, root: Root = globalThis): Promise<void> {
  if (!flags(effect).castigationBrand || effect.parent?.documentName !== 'Actor') return;
  const caster = sourceActor(effect, root);
  if (!caster) return;
  if (caster.getFlag(MODULE_ID, 'castigationTarget')?.effectUuid === effect.uuid) await caster.unsetFlag(MODULE_ID, 'castigationTarget');
}

export async function retaliateCastigation(victim: Document, amount: number, options: Document, root: Root = globalThis): Promise<void> {
  const cardUuid = options.midi?.itemCardUuid;
  const origin = options.origin ?? options.originatingMessage ?? (cardUuid ? root.fromUuidSync(cardUuid, { strict: false }) : undefined);
  const activity = origin?.getAssociatedActivity?.();
  const attacker = activity?.actor ?? activity?.item?.actor;
  if (!(amount > 0) || !attacker || origin.getFlag?.(MODULE_ID, 'castigationRetaliation')) return;
  const brands = values(attacker.effects).filter(effect => flags(effect).castigationBrand && !effect.disabled && effect.active !== false && !effect.duration?.expired);
  if (!brands.length) return;
  const sourceToken = damageSourceToken(origin, attacker, root);
  if (!sourceToken) return;
  const targetUuid = options.midi?.targetUuid;
  const victimToken = (targetUuid ? root.fromUuidSync(targetUuid, { strict: false }) : undefined) ?? victim.getActiveTokens(false, true).find((token: Document) => token.parent.id === sourceToken.parent.id);
  for (const brand of brands) {
    const caster = sourceActor(brand, root);
    if (!caster || !protectsVictim(brand, caster, victim, victimToken, sourceToken, root)) continue;
    const total = Math.max(1, caster.system.abilities.int.mod);
    const roll = await root.cat.utils.rollUtils.damageRoll(String(total), caster, { type: 'psychic', isCritical: false, flavor: '惩戒烙印：心灵反噬 Brand of Castigation' });
    const hpBefore = health(attacker);
    // A standalone application must not reconstruct the original weapon's Midi workflow.
    const cards = await root.MidiQOL.applyTokenDamage([{ damage: roll.total, type: 'psychic' }], roll.total, new Set([sourceToken.object]), null, new Set(), { forceApply: true, updateOptions: { awaitDamageApplication: true } });
    const hpAfter = health(attacker);
    const record = { casterUuid: caster.uuid, brandedActorUuid: attacker.uuid, victimUuid: victim.uuid, originUuid: origin.uuid, effectUuid: brand.uuid, amount: roll.total, type: 'psychic', hpBefore, hpAfter, applicationCards: cards };
    await roll.toMessage({
      type: 'generic', speaker: root.ChatMessage.implementation.getSpeaker({ actor: caster }),
      flavor: `惩戒烙印：心灵反噬 — ${root.foundry.utils.escapeHTML(attacker.name)}伤害${root.foundry.utils.escapeHTML(victim.name)}；基础${roll.total}点心灵，已自动应用`,
      flags: { [MODULE_ID]: { castigationRetaliation: record } },
    });
  }
}

function health(actor: Document): Document {
  const hp = actor.system.attributes.hp;
  return { value: hp.value, temp: hp.temp ?? 0 };
}

function sourceActor(effect: Document, root: Root): Document | undefined {
  if (flags(effect).brandCasterUuid) return root.fromUuidSync(flags(effect).brandCasterUuid, { strict: false });
  const source = effect.getSourceActor?.();
  if (source) return source;
  const origin = effect.origin ? root.fromUuidSync(effect.origin, { strict: false }) : undefined;
  return origin?.actor ?? origin?.parent?.actor;
}

function damageSourceToken(origin: Document, actor: Document, root: Root): Document | undefined {
  const { scene, token } = origin.speaker ?? {};
  const document = scene && token ? root.fromUuidSync(`Scene.${scene}.Token.${token}`, { strict: false }) : undefined;
  return document?.actor?.uuid === actor.uuid ? document : actor.getActiveTokens(false, true).find((entry: Document) => entry.parent.id === root.canvas.scene.id);
}

function protectsVictim(brand: Document, caster: Document, victim: Document, victimToken: Document | undefined, sourceToken: Document, root: Root): boolean {
  if (victim.uuid === caster.uuid) return true;
  const casterUuid = flags(brand).brandCasterTokenUuid;
  const casterToken = (casterUuid ? root.fromUuidSync(casterUuid, { strict: false }) : undefined) ?? caster.getActiveTokens(false, true).find((entry: Document) => entry.parent.id === sourceToken.parent.id);
  if (!casterToken || !victimToken || casterToken.parent.id !== victimToken.parent.id) return false;
  const distance = root.cat.utils.tokenUtils.getDistance(casterToken, victimToken);
  return distance >= 0 && distance <= 10 && root.cat.utils.tokenUtils.canSee(casterToken, victimToken);
}

export function registerCastigationAutomation(root: Root, report: (error: unknown) => void): void {
  root.Hooks.on('dnd5e.preUseActivity', (activity: Document, ...config: any[]) => {
    if (!isCastigationItem(activity.item) || hasCastigationTemplate(activity.item)) return;
    const owned = activity.actor.items.get(activity.item.id);
    void adaptCastigationItem(owned, root).then(updated => updated.use(...config)).catch(report);
    return false;
  });
  root.Hooks.on('preCreateActiveEffect', (effect: Document) => prepareCastigationEffect(effect, root));
  root.Hooks.on('createActiveEffect', (effect: Document, _options: Document, userId: string) => {
    if (userId === root.game.user.id) void bindCastigationEffect(effect, root).catch(report);
  });
  root.Hooks.on('deleteActiveEffect', (effect: Document, _options: Document, userId: string) => {
    if (userId === root.game.user.id) void unbindCastigationEffect(effect, root).catch(report);
  });
  root.Hooks.once('catReady', () => {
    if (typeof root.MidiQOL?.applyTokenDamage !== 'function' || typeof root.cat?.utils?.rollUtils?.damageRoll !== 'function' || typeof root.cat?.utils?.tokenUtils?.canSee !== 'function') return report(new Error('惩戒烙印反噬需要已启用 CAT 与 Midi-QOL 的公开伤害和视距接口。'));
    root.Hooks.on('dnd5e.applyDamage', (victim: Document, amount: number, options: Document) => { void retaliateCastigation(victim, amount, options, root).catch(report); });
  });
}
