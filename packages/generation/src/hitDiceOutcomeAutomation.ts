import type { ExtractedRider, HitDiceOutcome } from './mechanicsExtraction';

export interface HitDiceOutcomeActivityIds {
  primaryActivityId: string;
  loseHitDieActivityId?: string;
  tempHpActivityId?: string;
  followupSaveActivityId?: string;
}

export interface HitDiceOutcomeAutomationSpec extends HitDiceOutcomeActivityIds {
  mode: 'hit-dice-outcome';
  hitDiceChange?: Extract<HitDiceOutcome, { kind: 'hitDiceChange' }>;
  tempHp?: Extract<HitDiceOutcome, { kind: 'tempHp' }>;
  followupSave?: Extract<HitDiceOutcome, { kind: 'followupSave' }>;
}

export function buildHitDiceOutcomeAutomationSpec(
  rider: Pick<ExtractedRider, 'key' | 'outcomes'>,
  activityIds: HitDiceOutcomeActivityIds,
): HitDiceOutcomeAutomationSpec {
  const hitDiceChange = rider.outcomes.find((outcome) => outcome.kind === 'hitDiceChange') as
    | Extract<HitDiceOutcome, { kind: 'hitDiceChange' }>
    | undefined;
  const tempHp = rider.outcomes.find((outcome) => outcome.kind === 'tempHp') as
    | Extract<HitDiceOutcome, { kind: 'tempHp' }>
    | undefined;
  const followupSave = rider.outcomes.find((outcome) => outcome.kind === 'followupSave') as
    | Extract<HitDiceOutcome, { kind: 'followupSave' }>
    | undefined;
  return {
    mode: 'hit-dice-outcome',
    primaryActivityId: activityIds.primaryActivityId,
    ...(activityIds.loseHitDieActivityId !== undefined
      ? { loseHitDieActivityId: activityIds.loseHitDieActivityId }
      : {}),
    ...(activityIds.tempHpActivityId !== undefined
      ? { tempHpActivityId: activityIds.tempHpActivityId }
      : {}),
    ...(activityIds.followupSaveActivityId !== undefined
      ? { followupSaveActivityId: activityIds.followupSaveActivityId }
      : {}),
    ...(hitDiceChange ? { hitDiceChange: projectHitDiceOutcome(hitDiceChange) } : {}),
    ...(tempHp ? { tempHp: projectHitDiceOutcome(tempHp) } : {}),
    ...(followupSave ? { followupSave: projectHitDiceOutcome(followupSave) } : {}),
  };
}

function projectHitDiceOutcome<T extends HitDiceOutcome>(outcome: T): T {
  const evidence = outcome.evidence === undefined
    ? {}
    : {
        evidence: {
          text: outcome.evidence.text,
          startOffset: outcome.evidence.startOffset,
          endOffset: outcome.evidence.endOffset,
          kind: outcome.evidence.kind,
        },
      };
  switch (outcome.kind) {
    case 'hitDiceChange':
      return {
        kind: outcome.kind,
        direction: outcome.direction,
        count: outcome.count,
        pool: outcome.pool,
        target: outcome.target,
        ...evidence,
      } as T;
    case 'tempHp':
      return {
        kind: outcome.kind,
        amount: outcome.amount,
        target: outcome.target,
        ...(outcome.condition !== undefined ? { condition: outcome.condition } : {}),
        ...evidence,
      } as T;
    case 'followupSave':
      return {
        kind: outcome.kind,
        label: outcome.label,
        trigger: outcome.trigger,
        target: outcome.target,
        ...evidence,
      } as T;
  }
}

export function buildHitDiceOutcomeMacroCommand(spec: HitDiceOutcomeAutomationSpec): string {
  const payload = JSON.stringify(spec);
  return `
const hitDiceOutcomeSpec = ${payload};
const midi = globalThis.MidiQOL ?? (typeof MidiQOL !== "undefined" ? MidiQOL : undefined);
const scopeData = typeof scope !== "undefined" ? scope : {};
const macroArgs = typeof args !== "undefined" ? args : [];
const workflow = scopeData.workflow ?? macroArgs?.[0]?.workflow ?? midi?.Workflow?.getWorkflow?.(scopeData.workflowId);
const item = scopeData.activity?.item ?? scopeData.item ?? workflow?.item;
const activities = item?.system?.activities;
const notifyManual = async (message) => {
  ui.notifications?.info?.(message);
  if (globalThis.ChatMessage?.create) {
    await ChatMessage.create({ content: message, speaker: ChatMessage.getSpeaker?.({ actor: item?.actor }) });
  }
};
if (!workflow) {
  await notifyManual("GM must manually apply hit dice outcome; no midi-qol workflow was available.");
  return;
}
const firstFrom = (collection) => collection?.first?.() ?? [...(collection ?? [])][0];
const targetToken =
  firstFrom(workflow?.failedSaves) ??
  firstFrom(workflow?.failedSaveTargets) ??
  firstFrom(workflow?.hitTargets) ??
  firstFrom(workflow?.targets);
const targetActor = targetToken?.actor ?? targetToken;
const safeHitDiceUpdate = async (actor, change) => {
  if (!actor || !change?.count) return { ok: false, reason: "No target actor." };
  return {
    ok: false,
    reason: "GM must manually apply hit dice change. No versioned safe hit dice update path is configured.",
  };
};
const hitDieResult = await safeHitDiceUpdate(targetActor, hitDiceOutcomeSpec.hitDiceChange);
if (!hitDieResult.ok) {
  await notifyManual(hitDieResult.reason ?? "GM must manually apply hit dice change.");
  return;
}
const useActivity = async (activityId, trigger) => {
  const activity = activities?.get?.(activityId) ?? activities?.[activityId] ?? item?.activities?.get?.(activityId);
  if (activity?.use) await activity.use({}, {}, { configureDialog: false, workflow, trigger });
};
if (hitDiceOutcomeSpec.tempHpActivityId) {
  await useActivity(hitDiceOutcomeSpec.tempHpActivityId, "hit-dice-outcome-temp-hp");
}
if (hitDiceOutcomeSpec.followupSaveActivityId && hitDieResult.remaining === 0) {
  await useActivity(hitDiceOutcomeSpec.followupSaveActivityId, "hit-dice-outcome-followup-save");
}
`.trim();
}
