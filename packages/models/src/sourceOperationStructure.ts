/** Closed execution contract only. This module never interprets source prose. */
const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const DAMAGE_TYPES = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
const STATUSES = ['dead', 'blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious'];
type Data = Record<string, unknown>;
const object = (value: unknown): value is Data => !!value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const integer = (value: unknown, minimum = Number.MIN_SAFE_INTEGER): value is number => Number.isSafeInteger(value) && (value as number) >= minimum;
const distance = (value: unknown, minimum = 0): boolean => typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= Number.MAX_SAFE_INTEGER;
const member = (value: unknown, choices: readonly string[]): boolean => typeof value === 'string' && choices.includes(value);
function dice(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 200 || !/^\s*\d+(?:d\d+)?(?:\s*[+-]\s*\d+(?:d\d+)?)*\s*$/iu.test(value)) return false;
  return (value.match(/\d+(?:d\d+)?/giu) ?? []).every(term => term.toLowerCase().split('d')
    .every((part, index, parts) => Number.isSafeInteger(Number(part)) && Number(part) >= (parts.length === 2 ? 1 : 0)));
}

/** Validate the supported SourceOperation shapes without re-reading their text.
 * Strings in sourceText/proof/condition are inert provenance, never commands. */
export function sourceOperationStructureErrors(value: unknown): string[] {
  const errors: string[] = [];
  if (!Array.isArray(value) || value.length === 0 || value.length > 128) return ['operations'];
  const ids = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = String(index), fail = (field: string) => errors.push(`${path}/${field}`);
    const shape = (entry: unknown, fields: string[], field: string): entry is Data => {
      if (!object(entry)) { fail(field); return false; }
      for (const key of Object.keys(entry)) if (!fields.includes(key)) fail(`${field}/${key}`);
      return true;
    };
    if (!shape(entry, ['id', 'name', 'type', 'relationship', 'condition', 'sourceText', 'evidence', 'attack', 'save', 'damage', 'healing', 'damageAdjustment', 'range', 'aoe', 'targetSpecial', 'failureStatuses', 'proof'], 'shape')) continue;
    const op = entry;
    if (typeof op.id !== 'string' || !/^[-a-zA-Z0-9]{1,64}$/u.test(op.id) || ids.has(op.id)) fail('id');
    else ids.add(op.id);
    if (!text(op.name) || op.name.length > 160) fail('name');
    if (!text(op.sourceText)) fail('sourceText');
    if (!member(op.type, ['attack', 'save', 'damage', 'heal'])) fail('type');
    if (!member(op.relationship, ['primary', 'follow-up', 'alternative'])) fail('relationship');
    for (const key of ['condition', 'targetSpecial']) if (op[key] !== undefined && !text(op[key])) fail(key);
    if (op.evidence !== undefined && shape(op.evidence, ['start', 'end', 'quote'], 'evidence')) {
      const ref = op.evidence;
      if (!integer(ref.start, 0) || !integer(ref.end, 0) || ref.end <= ref.start || typeof ref.quote !== 'string' || ref.end - ref.start !== ref.quote.length) fail('evidence');
    }
    if (shape(op.proof, ['attack', 'save', 'damage', 'healing', 'range', 'aoe', 'target', 'upgrade'], 'proof')) {
      for (const key of ['attack', 'save', 'healing', 'range', 'aoe', 'target']) if (op.proof[key] !== undefined && !text(op.proof[key])) fail(`proof/${key}`);
      if (op.proof.damage !== undefined && (!Array.isArray(op.proof.damage) || op.proof.damage.length > 12 || op.proof.damage.some(q => !text(q)))) fail('proof/damage');
      if (op.proof.upgrade !== undefined && shape(op.proof.upgrade, ['sourceText', 'quote'], 'proof/upgrade')) {
        if (!text(op.proof.upgrade.sourceText) || !text(op.proof.upgrade.quote)) fail('proof/upgrade');
        // The native upgrade target displays the first damage proof. A lone
        // upgrade object cannot supply that required projection input.
        if (!Array.isArray(op.proof.damage) || !op.proof.damage.length) fail('proof/upgrade/damage');
      }
      if (Array.isArray(op.proof.damage) && (!Array.isArray(op.damage) || op.damage.length !== op.proof.damage.length)) fail('proof/damage');
    }
    if (op.attack !== undefined && shape(op.attack, ['type', 'toHit', 'reach', 'range', 'longRange'], 'attack')) {
      const attack = op.attack;
      if (!member(attack.type, ['mwak', 'rwak', 'msak', 'rsak', 'melee', 'ranged']) || !integer(attack.toHit)) fail('attack');
      for (const key of ['reach', 'range', 'longRange']) if (attack[key] !== undefined && !distance(attack[key])) fail(`attack/${key}`);
      if (attack.longRange !== undefined && (attack.range === undefined || (attack.longRange as number) < (attack.range as number))) fail('attack/longRange');
      if (member(attack.type, ['melee', 'ranged']) && (op.aoe !== undefined || op.range !== undefined || op.failureStatuses !== undefined)) fail('attack/neutral-combination');
    }
    if (op.save !== undefined && shape(op.save, ['dc', 'abilities', 'choice', 'outcome'], 'save')) {
      const save = op.save;
      if (!integer(save.dc, 1)) fail('save/dc');
      if (!Array.isArray(save.abilities) || !save.abilities.length || save.abilities.some(a => !member(a, ABILITIES)) || new Set(save.abilities).size !== save.abilities.length) fail('save/abilities');
      if (!member(save.choice, ['single', 'target']) || Array.isArray(save.abilities) && (save.choice === 'single' ? save.abilities.length !== 1 : save.abilities.length !== 2)) fail('save/choice');
      if (!member(save.outcome, ['none', 'half', 'full'])) fail('save/outcome');
    }
    if (op.damage !== undefined) {
      if (!Array.isArray(op.damage) || !op.damage.length || op.damage.length > 12) fail('damage');
      else for (const [partIndex, part] of op.damage.entries()) {
        const at = `damage/${partIndex}`;
        if (!shape(part, ['formula', 'type', 'types', 'relationship', 'condition'], at)) continue;
        if (!dice(part.formula)) fail(`${at}/formula`);
        if (!member(part.type, DAMAGE_TYPES)) fail(`${at}/type`);
        if (!member(part.relationship, ['base', 'additional', 'conditional', 'replacement'])) fail(`${at}/relationship`);
        if (part.condition !== undefined && !text(part.condition)) fail(`${at}/condition`);
        // Attack/Save activities roll every attached part together. A gated
        // or replacement roll is supported only as its own GM Damage button.
        if ((op.type === 'attack' || op.type === 'save')
          && (part.relationship === 'conditional' || part.relationship === 'replacement' || part.condition !== undefined)) fail(`${at}/independent-damage-required`);
        if (part.types !== undefined && (!Array.isArray(part.types) || part.types.length < 2 || part.types.some(t => !member(t, DAMAGE_TYPES)) || new Set(part.types).size !== part.types.length || !part.types.includes(part.type))) fail(`${at}/types`);
      }
    }
    if (op.healing !== undefined && shape(op.healing, ['formula', 'type', 'target'], 'healing')) {
      if (!dice(op.healing.formula) || !member(op.healing.type, ['healing', 'temphp'])) fail('healing');
      if (shape(op.healing.target, ['type', 'count', 'special'], 'healing/target') && (!member(op.healing.target.type, ['self', 'creature']) || op.healing.target.count !== 1 || typeof op.healing.target.special !== 'string')) fail('healing/target');
    }
    if (op.damageAdjustment !== undefined && shape(op.damageAdjustment, ['multiplier', 'condition', 'actor', 'quote'], 'damageAdjustment')) {
      const adjustment = op.damageAdjustment;
      if (adjustment.multiplier !== 0.5 || adjustment.condition !== 'source-actor-bloodied' || !text(adjustment.actor) || !text(adjustment.quote) || op.type !== 'attack' || !Array.isArray(op.damage) || !op.damage.length) fail('damageAdjustment');
    }
    if (op.range !== undefined && !distance(op.range)) fail('range');
    if (op.aoe !== undefined && shape(op.aoe, ['shape', 'radius', 'width', 'height'], 'aoe')) {
      if (!member(op.aoe.shape, ['sphere', 'radius', 'cone', 'line', 'cube', 'cylinder', 'rectangle']) || !distance(op.aoe.radius) || op.aoe.radius === 0) fail('aoe');
      for (const key of ['width', 'height']) if (op.aoe[key] !== undefined && (!distance(op.aoe[key]) || op.aoe[key] === 0)) fail(`aoe/${key}`);
    }
    if (op.failureStatuses !== undefined && (!Array.isArray(op.failureStatuses) || op.failureStatuses.some(s => !member(s, STATUSES)) || new Set(op.failureStatuses).size !== op.failureStatuses.length || op.type !== 'save')) fail('failureStatuses');
    if (op.type === 'attack' && (op.attack === undefined || op.save !== undefined || op.healing !== undefined)
      || op.type === 'save' && (op.save === undefined || op.attack !== undefined || op.healing !== undefined)
      || op.type === 'damage' && (op.damage === undefined || op.attack !== undefined || op.save !== undefined || op.healing !== undefined)
      || op.type === 'heal' && (op.healing === undefined || op.attack !== undefined || op.save !== undefined || op.damage !== undefined || op.failureStatuses !== undefined || op.damageAdjustment !== undefined)) fail('combination');
  }
  return [...new Set(errors)];
}
