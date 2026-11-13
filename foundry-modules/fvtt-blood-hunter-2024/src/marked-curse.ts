const MODULE_ID = 'fvtt-blood-hunter-2024';
export const MARKED_MACRO = 'bloodCurseOfTheMarked';
type Document = Record<string, any>;
type Root = Record<string, any>;
type MarkedScope = 'source-only' | 'all-attackers';

const values = (collection: any): Document[] => Array.from(collection?.contents ?? collection?.values?.() ?? collection ?? []);
const MANUAL_MARKED_MACRO = '[postActiveEffects]ActivityMacro-6f6ad7b229d76963';
const appliedMarkedDamage = new WeakMap<object, Set<string>>();

export function prepareMarkedActivity(activity: Document): void {
  const item = activity.item;
  if (item.system?.identifier !== 'blood-curse-of-the-marked' || !values(item.effects).some(markedScope)) return;
  const macros = String(item.flags?.['midi-qol']?.onUseMacroName ?? '').split(',');
  if (!macros.includes(MANUAL_MARKED_MACRO)) return;
  // dnd5e.preUseActivity receives the usage Item clone, not the persisted owned Item.
  item.updateSource({
    'flags.midi-qol.onUseMacroName': macros.filter((macro) => macro !== MANUAL_MARKED_MACRO).join(','),
    'system.activities.6f6ad7b229d76963.macroData.command': '',
  });
}

export function markedScope(effect: Document): MarkedScope | undefined {
  const scope = effect.flags?.[MODULE_ID]?.markedScope ?? values(effect.system?.changes ?? effect.changes)
    .find((change) => change.key === 'flags.fvttJsonGenerator.bloodCurseMark')?.value;
  return scope === 'source-only' || scope === 'all-attackers' ? scope : undefined;
}

export function prepareMarkedEffect(effect: Document): void {
  const scope = markedScope(effect);
  if (!scope || effect.parent?.documentName !== 'Actor') return;
  effect.updateSource({
    'duration.expiry': 'sourceStart',
    [`flags.${MODULE_ID}.markedScope`]: scope,
    'flags.cat.macros.roll': [
      ...values(effect.flags?.cat?.macros?.roll).filter((macro) => macro.source !== MODULE_ID || macro.identifier !== MARKED_MACRO),
      { source: MODULE_ID, rules: 'all', identifier: MARKED_MACRO },
    ],
  });
}

export async function applyMarkedDamage({ document, workflow, targetToken, sourceToken, ditem }: Document, root: Root = globalThis): Promise<void> {
  const scope = markedScope(document);
  const target = targetToken ?? sourceToken;
  if (!scope || document.disabled || document.active === false || document.duration?.expired || !target || target.actor?.uuid !== document.parent?.uuid) return;
  const key = `${document.uuid}:${target.uuid}`;
  if (appliedMarkedDamage.get(ditem)?.has(key)) return;
  if (workflow.activity?.hasAttack && ![...values(workflow.hitTargets), ...values(workflow.hitTargetsEC)].some((token) => (token.document?.uuid ?? token.uuid) === target.uuid)) return;
  if (!(Number(ditem?.totalDamage) > 0)) return;
  const damage = values(ditem.damageDetail).filter((part) => Number(part.value) > 0 && !part.active?.immunity && !part.active?.absorption && !part.active?.type?.absorption && part.active?.multiplier !== 0 && root.CONFIG.DND5E.damageTypes[part.type]);
  if (!damage.length) return;
  const caster = document.getSourceActor?.() ?? sourceActor(document, root);
  if (!caster || scope === 'source-only' && caster.uuid !== workflow.actor?.uuid) return;
  const card = workflow.itemCardUuid ? root.fromUuidSync(workflow.itemCardUuid) : undefined;
  const evidence = root.cat.utils.workflowUtils.getWorkflowProperty(workflow, 'bloodHunterMarked') ?? card?.getFlag(MODULE_ID, 'markedDamage') ?? [];
  let record = evidence.find((entry: Document) => entry.effectUuid === document.uuid && entry.targetUuid === target.uuid);
  let roll: Document | undefined;
  if (!record) {
    const rites = activeRiteTypes(caster);
    const matching = rites.filter((type) => damage.some((part) => part.type === type));
    if (scope === 'source-only' && !matching.length || !rites.length) return;
    const options = matching.length ? matching : rites;
    const type = options.length === 1 ? options[0]! : await chooseRiteType(options, root);
    if (!type) return;
    roll = await root.cat.utils.rollUtils.damageRoll('@scale.blood-hunter.hemocraft', caster, {
      type, isCritical: Boolean(workflow.isCritical && workflow.activity?.hasAttack),
      flavor: '印记血咒 Blood Curse of the Marked',
    });
    record = { effectUuid: document.uuid, casterUuid: caster.uuid, targetUuid: target.uuid, scope, type, formula: roll!.formula, total: roll!.total, multiplier: damageTraitMultiplier(target.actor, type, root), isCritical: Boolean(roll!.options?.isCritical) };
    const records = [...evidence, record];
    root.cat.utils.workflowUtils.setWorkflowProperty(workflow, 'bloodHunterMarked', records);
    // Midi can restore the workflow on another client. Save only Marked's rolls on the attack card.
    if (card?.isOwner) await card.setFlag(MODULE_ID, 'markedDamage', records);
  }
  // Midi rebuilds the damage item and repeats these hooks when the original card's Apply button is clicked.
  const multiplier = damageTraitMultiplier(target.actor, record.type, root);
  root.cat.utils.workflowUtils.modifyDamageAppliedFlat(ditem, record.total, { type: record.type, multiplier });
  const applied = appliedMarkedDamage.get(ditem) ?? new Set<string>();
  applied.add(key);
  appliedMarkedDamage.set(ditem, applied);
  if (roll) await roll.toMessage({
    type: 'generic',
    flavor: `印记血咒 Blood Curse of the Marked — ${root.foundry.utils.escapeHTML(target.name)}；随原行动卡一并应用伤害`,
    speaker: root.ChatMessage.implementation.getSpeaker({ actor: caster }),
    flags: { [MODULE_ID]: { markedDamage: record } },
  });
}

function sourceActor(effect: Document, root: Root): Document | undefined {
  const origin = root.fromUuidSync(effect.system?.origin?.actor ?? effect.origin, { strict: false });
  return origin?.documentName === 'Actor' ? origin : origin?.actor ?? origin?.parent?.actor;
}

function activeRiteTypes(caster: Document): string[] {
  const types = new Set<string>();
  for (const item of values(caster.items)) {
    if (item.type !== 'weapon') continue;
    for (const effect of values(item.effects)) {
      if (effect.disabled || effect.active === false || effect.isAppliedEnchantment === false || effect.type !== 'enchantment' || effect.flags?.fvttJsonGenerator?.bloodHunterRite !== true) continue;
      for (const change of values(effect.system?.changes ?? effect.changes)) {
        if (change.key !== 'system.damage.parts') continue;
        const parts = typeof change.value === 'string' ? JSON.parse(change.value) : change.value;
        for (const part of parts) if (typeof part[1] === 'string') types.add(part[1]);
      }
    }
  }
  return [...types];
}

function damageTraitMultiplier(actor: Document, type: string, root: Root): number {
  const config = root.MidiQOL.configSettings();
  let multiplier = 1;
  for (const [trait, key] of [['di', 'damageImmunityMultiplier'], ['dr', 'damageResistanceMultiplier'], ['dv', 'damageVulnerabilityMultiplier']] as const) {
    if (root.cat.utils.actorUtils.checkTrait(actor, trait, type)) multiplier *= Number(config[key]);
  }
  return multiplier;
}

async function chooseRiteType(types: string[], root: Root): Promise<string | undefined> {
  return root.foundry.applications.api.DialogV2.wait({
    window: { title: '印记血咒：选择血仪伤害' },
    content: '<p>当前有多种已激活的血仪，请选择这次印记附伤的类型。</p>',
    buttons: types.map((type) => ({ action: type, label: root.game.i18n.localize(root.CONFIG.DND5E.damageTypes[type]?.label ?? type), callback: () => type })),
    rejectClose: false,
  });
}

export function registerMarkedAutomation(root: Root, report: (error: unknown) => void): void {
  root.Hooks.on('preCreateActiveEffect', (effect: Document) => prepareMarkedEffect(effect));
  root.Hooks.on('dnd5e.preUseActivity', (activity: Document) => prepareMarkedActivity(activity));
  root.Hooks.once('catReady', () => {
    if (typeof root.cat?.api?.registerFnMacro !== 'function' || typeof root.cat?.utils?.rollUtils?.damageRoll !== 'function' || typeof root.cat?.utils?.workflowUtils?.modifyDamageAppliedFlat !== 'function') return report(new Error('印记血咒附伤需要已启用 CAT 的公开伤害接口。'));
    root.cat.api.registerFnMacro({
      source: MODULE_ID, identifier: MARKED_MACRO, rules: 'all', documents: ['activeeffect'],
      roll: [{ pass: 'targetDamageComplete', priority: 250, macro: (args: Document) => applyMarkedDamage(args, root) }],
    });
    // Legacy applied marks have no CAT registration. Adapt only the target of this damage event, without editing it.
    root.Hooks.on('midi-qol.preTargetDamageApplication', async (token: Document, { workflow, ditem }: Document) => {
      for (const effect of values(token.actor?.effects)) {
        if (!markedScope(effect) || values(effect.flags?.cat?.macros?.roll).some((macro) => macro.source === MODULE_ID && macro.identifier === MARKED_MACRO)) continue;
        await applyMarkedDamage({ document: effect, workflow, ditem, targetToken: token.document }, root);
      }
    });
  });
}
