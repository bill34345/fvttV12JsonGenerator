export const NEXT_MIDI_VERSION = '14.6.0-beta.4338eeab.local.10' as const;
export const LEGACY_MIDI_VERSION = '14.0.11' as const;

export function hasNativeMessageData(message: any): boolean {
  const system = message?.system?.toObject?.() ?? message?.system;
  return Boolean(system && typeof system === 'object' && ('activity' in system || 'item' in system));
}

/** Read identities; never populate legacy flags or infer missing native fields. */
export function dnd5eMessageData(message: any, native6 = false): any {
  const model = message?.system;
  const system = model?.toObject?.() ?? model;
  const canonical = native6 || hasNativeMessageData(message);
  if (!canonical) return message?.flags?.dnd5e;
  const midiType = message?.flags?.['midi-qol']?.type;
  const attackRoles = Array.isArray(message?.rolls)
    ? message.rolls.filter((r: any) => r?.options?.['midi-qol']?.rollType === 'attack').length : 0;
  const rollType = ['attack', 'damage'].includes(message?.type) ? message.type
    : [3, 4].includes(midiType) && attackRoles === 1 ? 'attack' : undefined;
  const origin = system?.origin;
  return {
    activity: system?.activity,
    item: system?.item,
    originatingMessage: typeof origin === 'object' && origin !== null ? origin.id ?? origin._id : origin,
    targets: Array.isArray(system?.targets) ? system.targets.map((target: any) => ({
      ...target, uuid: typeof target.actor === 'string' ? target.actor : target.actor?.uuid,
    })) : undefined,
    messageType: message?.type,
    roll: { type: rollType },
  };
}

export function isReviewedMidiVersion(version: unknown): boolean {
  return version === LEGACY_MIDI_VERSION || version === NEXT_MIDI_VERSION;
}

export function originatingMessageData(id: string, native6 = false): any {
  return native6 ? { system: { origin: id } } : { flags: { dnd5e: { originatingMessage: id } } };
}
