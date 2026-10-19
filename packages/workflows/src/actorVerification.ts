import {sourceMentionsDisplayName as sourceMentionsItem} from '@fvtt-json-generator/models/display-name';
import { readFileSync } from 'node:fs';
import { extractSourceDerivedAcEffect } from '@fvtt-json-generator/generation/ac-effect-extraction';

// Verification belongs beside the conversion workflow that produces the Actor artifact.

interface BuildActorVerificationSummaryOptions {
  sourcePath: string;
  actorPath: string;
}

interface BuildActorVerificationSummaryFromValuesOptions {
  source: string;
  actor: unknown;
  sourcePath?: string;
  actorPath?: string;
}

interface ActivitySummary {
  type: string;
  range?: unknown;
  damage?: unknown;
}

interface ItemSummary {
  name: string;
  type: string;
  activation: string;
  activityTypes: string[];
  activities: ActivitySummary[];
  effects: EffectSummary[];
}

interface EffectSummary {
  name: string;
  changes: EffectChangeSummary[];
  sourceDerivedAcEffect: boolean;
  sourceText: string;
}

interface EffectChangeSummary {
  key: string;
  mode: unknown;
  value: string;
  priority: unknown;
}

export interface ActorVerificationSummary {
  sourcePath: string;
  actorPath: string;
  actor: {
    name: string;
    type: string;
    creatureType?: unknown;
    swarmSize?: unknown;
    hp?: unknown;
    ac?: unknown;
    cr?: unknown;
    senses: Record<string, unknown>;
  };
  items: ItemSummary[];
  warnings: string[];
  sourceIntegrityErrors: string[];
}

type RecordLike = Record<string, unknown>;

export function buildActorVerificationSummary(
  options: BuildActorVerificationSummaryOptions,
): ActorVerificationSummary {
  const source = readFileSync(options.sourcePath, 'utf-8');
  const actor = JSON.parse(readTextFile(options.actorPath)) as RecordLike;
  return buildActorVerificationSummaryFromValues({
    source,
    actor,
    sourcePath: options.sourcePath,
    actorPath: options.actorPath,
  });
}

export function buildActorVerificationSummaryFromValues(
  options: BuildActorVerificationSummaryFromValuesOptions,
): ActorVerificationSummary {
  const source = options.source;
  const actor = getRecord(options.actor);
  const system = getRecord(actor.system);
  const details = getRecord(system.details);
  const attributes = getRecord(system.attributes);
  const items = Array.isArray(actor.items) ? actor.items.map((item) => summarizeItem(item)) : [];
  const foundryMajor = inferFoundryMajor(actor);

  const warnings: string[] = [];
  for (const item of items) {
    if (!sourceMentionsItem(source, item.name)) {
      warnings.push(`Item name not found in source markdown: ${item.name}`);
    }
    for (const effect of item.effects) {
      if (!effect.sourceDerivedAcEffect) continue;
      const parsed = extractSourceDerivedAcEffect(effect.sourceText);
      if (!parsed) {
        warnings.push(
          `Invalid source-derived AC effect on ${item.name}: sourceText is not an explicit AC clause: ${effect.sourceText}`,
        );
        continue;
      }

      const acChange = effect.changes.find((change) => change.key.startsWith('system.attributes.ac.'));
      const expectedKey = parsed.kind === 'flat'
        ? 'system.attributes.ac.flat'
        : foundryMajor === '14'
          ? 'system.attributes.ac.formula'
          : foundryMajor === '12'
            ? 'system.attributes.ac.bonus'
            : undefined;
      if (expectedKey && acChange?.key !== expectedKey) {
        warnings.push(
          `Source-derived AC effect on ${item.name} has key ${acChange?.key ?? '<missing>'}, expected ${expectedKey} for Foundry v${foundryMajor}`,
        );
      }
      if (acChange?.value !== String(parsed.value)) {
        warnings.push(
          `Source-derived AC effect on ${item.name} has value ${acChange?.value ?? '<missing>'}, expected ${parsed.value} from sourceText: ${effect.sourceText}`,
        );
      }
    }
  }

  if (items.length === 0) {
    warnings.push('Actor has no generated items.');
  }

  return {
    sourcePath: options.sourcePath ?? '<inline-source>',
    actorPath: options.actorPath ?? '<inline-actor>',
    actor: {
      name: String(actor.name ?? ''),
      type: String(actor.type ?? ''),
      creatureType: getRecord(details.type).value,
      ...(getRecord(details.type).swarm?{swarmSize:getRecord(details.type).swarm}:{}),
      hp: attributes.hp,
      ac: attributes.ac,
      cr: details.cr,
      senses: getRecord(attributes.senses),
    },
    items,
    warnings,
    sourceIntegrityErrors: verifySourceIdentityAndRecovery(source, actor),
  };
}

// Read explicit source clauses independently of parser/generator extraction so that
// a dropped field cannot pass verification merely because it also vanished from IR.
function verifySourceIdentityAndRecovery(source: string, actor: RecordLike): string[] {
  const errors: string[] = [];
  const system = getRecord(actor.system);
  const type = getRecord(getRecord(system.details).type);
  const frontmatter = source.match(/^\uFEFF?---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (frontmatter) {
    const header = frontmatter[1] ?? '';
    const member=header.match(/^(?:集群个体体型|swarm_size|swarmSize):\s*["']?([^\r\n"']+?)["']?\s*$/imu)?.[1]?.trim().toLowerCase();
    if(member){
      const sizes:Record<string,string>={tiny:'tiny',微型:'tiny',small:'sm',小型:'sm',medium:'med',中型:'med',large:'lg',大型:'lg',huge:'huge',巨型:'huge',gargantuan:'grg',超巨型:'grg'};
      if(!sizes[member]||type.swarm!==sizes[member])errors.push('SOURCE_SWARM_SIZE_MISMATCH: individual swarm size differs from source.');
    }
    const explicit = header.match(/^(?:creature_type|type):\s*["']?([a-z]+)(?:\s*\(([^)]+)\))?["']?\s*$/im);
    const combined = header.match(/^size:\s*["']?(?:tiny|small|medium|large|huge|gargantuan)\s+([a-z]+)(?:\s*\(([^)]+)\))?["']?\s*$/im);
    const expected = explicit && explicit[1]?.toLowerCase() !== 'npc' ? explicit : combined;
    if (expected) {
      if (type.value !== expected[1]!.toLowerCase()) errors.push('SOURCE_CREATURE_TYPE_MISMATCH: creature type differs from source.');
      if (String(type.subtype ?? '') !== (expected[2]?.trim() ?? '')) errors.push('SOURCE_CREATURE_SUBTYPE_MISMATCH: creature subtype differs from source.');
    }
    const passive = header.match(/^senses:.*?passive\s+Perception\s+(\d+)/im);
    if (passive) {
      const skill = getRecord(getRecord(system.skills).prc);
      const bonuses = getRecord(skill.bonuses);
      const ability = getRecord(getRecord(system.abilities)[String(skill.ability ?? 'wis')]);
      const actorDetails = getRecord(system.details);
      const proficiency = Number(getRecord(system.attributes).prof
        ?? Math.floor((Math.max(Number(actorDetails.cr ?? 0), Number(actorDetails.level ?? 0), 1) + 7) / 4));
      const score = 10 + Math.floor((Number(ability.value ?? 10) - 10) / 2)
        + Number(skill.value ?? 0) * proficiency
        + Number(bonuses.check || 0) + Number(bonuses.passive || 0);
      if (score !== Number(passive[1])) errors.push('SOURCE_PASSIVE_PERCEPTION_MISMATCH: passive Perception differs from source.');
    }
  }
  const items = Array.isArray(actor.items) ? actor.items.map(getRecord) : [];
  const restHeaders = /^[ \t>*#-]*([^\r\n*]+?)\s*\((Recharges?\s+after\s+(?:a\s+)?(Short\s+or\s+Long|Short|Long)\s+Rest)\)\.?[*]*/gim;
  for (const match of source.matchAll(restHeaders)) {
    const name = match[1]!.trim();
    const item = items.find(candidate => String(candidate.name ?? '').split(' (')[0]?.trim() === name);
    const itemSystem = getRecord(item?.system);
    const uses = getRecord(itemSystem.uses);
    const recovery = Array.isArray(uses.recovery) ? uses.recovery.map(getRecord) : [];
    const period = /^short/i.test(match[3]!) ? 'sr' : 'lr';
    const consumes = Object.values(getRecord(itemSystem.activities)).some(activity =>
      (getRecord(getRecord(activity).consumption).targets as unknown[] | undefined)?.some(target =>
        getRecord(target).type === 'itemUses' && String(getRecord(target).value) === '1'));
    if (!item || String(uses.max) !== '1' || !recovery.some(entry => entry.period === period && entry.type === 'recoverAll') || !consumes) {
      errors.push(`SOURCE_REST_RECOVERY_MISMATCH: ${name} must consume one use and recover on ${period}.`);
    }
    const description = String(getRecord(itemSystem.description).value ?? '').replace(/\s+/g, ' ').toLowerCase();
    if (!description.includes(match[2]!.replace(/\s+/g, ' ').toLowerCase())) {
      errors.push(`SOURCE_REST_TEXT_MISSING: ${name} lost its source recovery qualifier.`);
    }
  }
  return errors;
}

function summarizeItem(value: unknown): ItemSummary {
  const item = getRecord(value);
  const system = getRecord(item.system);
  const activities = Object.values(getRecord(system.activities)).map((activity) => {
    const record = getRecord(activity);
    return {
      type: String(record.type ?? ''),
      range: record.range,
      damage: record.damage,
    };
  });
  const effects = Array.isArray(item.effects)
    ? item.effects.map((value) => summarizeEffect(value))
    : [];

  return {
    name: String(item.name ?? ''),
    type: String(item.type ?? ''),
    activation: String(getRecord(system.activation).type ?? ''),
    activityTypes: activities.map((activity) => activity.type).filter(Boolean),
    activities,
    effects,
  };
}

function summarizeEffect(value: unknown): EffectSummary {
  const effect = getRecord(value);
  const generatorFlags = getRecord(getRecord(effect.flags).fvttJsonGenerator);
  return {
    name: String(effect.name ?? ''),
    changes: Array.isArray(effect.changes) ? effect.changes.map((change) => summarizeEffectChange(change)) : [],
    sourceDerivedAcEffect: generatorFlags.sourceDerivedAcEffect === true,
    sourceText: String(generatorFlags.sourceText ?? ''),
  };
}

function summarizeEffectChange(value: unknown): EffectChangeSummary {
  const change = getRecord(value);
  return {
    key: String(change.key ?? ''),
    mode: change.mode,
    value: String(change.value ?? ''),
    priority: change.priority,
  };
}

function inferFoundryMajor(actor: RecordLike): '12' | '14' | undefined {
  const coreVersion = String(getRecord(actor._stats).coreVersion ?? '');
  if (/^14(?:\.|$)/.test(coreVersion)) return '14';
  if (/^12(?:\.|$)/.test(coreVersion)) return '12';
  return undefined;
}


function getRecord(value: unknown): RecordLike {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordLike)
    : {};
}

function readTextFile(path: string): string {
  return readFileSync(path, 'utf-8').replace(/^\uFEFF/, '');
}
