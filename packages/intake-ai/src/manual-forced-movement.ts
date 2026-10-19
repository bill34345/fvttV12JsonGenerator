import type { CanonicalFeature, EvidenceRef, MonsterIntakeIR } from './types';

const SECTIONS = { trait: 'traits', action: 'actions', bonus: 'bonusActions', reaction: 'reactions', legendary: 'legendaryActions' } as const;
const ABILITIES: Record<string, string> = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
const normalize = (value: string): string => value.replace(/\s+/gu, ' ').trim();

export interface ManualForcedMovementRequirement {
  section: keyof typeof SECTIONS;
  featureName: string;
  claimPath: string;
  description: string;
  failure: string;
  quote: string;
}

/** The complete rule body is sufficient. A title/number is presentation, while
 * source bytes, uniqueness, feature scope and every rule clause stay exact. */
export function isCompleteManualMovementQuote(requirement: ManualForcedMovementRequirement, quote: string, source: string): boolean {
  return typeof quote === 'string' && Boolean(quote.trim()) && requirement.quote.includes(quote)
    && normalize(quote).endsWith(normalize(requirement.description))
    && source.indexOf(quote) >= 0 && source.indexOf(quote) === source.lastIndexOf(quote);
}

/** Source-derived: only a complete ordinary failed-save push, with no other
 * branch, is eligible for this handoff. The distance is retained literally;
 * neither a rolled distance nor token movement is automated. Names never
 * determine the save or the consequence. Unsupported prose stays in review. */
export function manualForcedMovementRequirements(ir: MonsterIntakeIR, source: string): ManualForcedMovementRequirement[] {
  const requirements: ManualForcedMovementRequirement[] = [];
  for (const [section, sourceSection] of Object.entries(SECTIONS) as Array<[keyof typeof SECTIONS, typeof SECTIONS[keyof typeof SECTIONS]]>) {
    for (const [index, feature] of ir.creature[sourceSection].entries()) {
      if (feature.activityType !== 'save' || !feature.save || feature.attack || feature.damage?.length || feature.appliedConditions?.length) continue;
      const description = normalize(feature.description);
      const match = /^The (target|creature) must make a (?:(strength|dexterity|constitution|intelligence|wisdom|charisma) saving throw: DC ([1-9]\d?)|DC ([1-9]\d?) (strength|dexterity|constitution|intelligence|wisdom|charisma) saving throw)\. (FAILURE: The (?:target|creature) is pushed [1-9]\d*(?: \([1-9]\d*d[1-9]\d* [x×] [1-9]\d*\))? feet away from (?:the )?([a-z][a-z '-]*)\.)$/iu.exec(description);
      if (!match || ABILITIES[(match[2] ?? match[5])!.toLowerCase()] !== feature.save.ability || Number(match[3] ?? match[4]) !== feature.save.dc) continue;
      // The consequence must refer to the same save recipient, without a
      // success/margin/negation/exception branch hidden outside the match.
      if (!new RegExp(`^FAILURE: The ${match[1]} is pushed `, 'iu').test(match[6]!)) continue;
      const sourceNames = [ir.creature.identity.name, ir.creature.identity.englishName, 'source'].filter((name): name is string => Boolean(name));
      if (!sourceNames.some(name => normalize(name).replace(/^the /iu, '').toLowerCase() === match[7]!.toLowerCase())) continue;
      const claimPath = `/creature/${sourceSection}/${index}`;
      if (!consistentClaims(ir, feature, claimPath)) continue;
      const refs = [...(feature.evidence ?? []), ...ir.claims.filter(claim => claim.path === claimPath).flatMap(claim => claim.evidence)];
      const exact = refs.filter(ref => fullFeatureEvidence(ref, source, feature, description));
      if (exact.length === 0 || new Set(exact.map(ref => `${ref.start}:${ref.end}`)).size !== 1) continue;
      requirements.push({ section, featureName: feature.name, claimPath, description: feature.description, failure: match[6]!, quote: exact[0]!.quote });
    }
  }
  return requirements;
}

function fullFeatureEvidence(ref: EvidenceRef, source: string, feature: CanonicalFeature, description: string): boolean {
  if (!Number.isInteger(ref.start) || !Number.isInteger(ref.end) || ref.start < 0 || ref.end <= ref.start || ref.end > source.length
    || source.slice(ref.start, ref.end) !== ref.quote || source.indexOf(ref.quote) !== ref.start || source.lastIndexOf(ref.quote) !== ref.start) return false;
  const text = normalize(ref.quote);
  if (!text.endsWith(description)) return false;
  const prefix = text.slice(0, text.length - description.length).trim().replace(/^\d+[.)]\s*/u, '');
  return !prefix || [feature.name, feature.englishName].some(name => name && prefix === `${name}.`);
}

function consistentClaims(ir: MonsterIntakeIR, feature: CanonicalFeature, path: string): boolean {
  return ir.claims.filter(claim => claim.path === path || claim.path.startsWith(`${path}/`)).every(claim => {
    if (claim.value === undefined) return true;
    const expected = claim.path === `${path}/save/dc` ? feature.save!.dc
      : claim.path === `${path}/save/ability` ? feature.save!.ability
        : claim.path === `${path}/description` ? feature.description : undefined;
    if (expected !== undefined) return JSON.stringify(claim.value) === JSON.stringify(expected);
    if (claim.path !== path && claim.path !== `${path}/save`) return true;
    const value = claim.value as Record<string, any>;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const save = claim.path === `${path}/save` ? value : value.save;
    return (!save || (save.dc === undefined || save.dc === feature.save!.dc) && (save.ability === undefined || save.ability === feature.save!.ability))
      && (value.description === undefined || normalize(String(value.description)) === normalize(feature.description));
  });
}

/** Both preparation and final verification require the complete source rule on
 * the same Item, not just a manual label or a model's diagnostic. */
export function hasManualForcedMovementMechanic(item: Record<string, any>, requirement: ManualForcedMovementRequirement): boolean {
  const mechanics: any[] = Array.isArray(item.flags?.fvttJsonGenerator?.behaviorMechanics) ? item.flags.fvttJsonGenerator.behaviorMechanics : [];
  const operations = Object.values(item.system?.activities ?? {}) as any[];
  return mechanics.filter(mechanic => mechanic.kind === 'lifecycle' && mechanic.name === requirement.featureName
    && mechanic.coverage === 'literal' && mechanic.executionMode === 'gm-assisted' && mechanic.ruleSource === 'source-derived'
    && mechanic.carrier?.name === item.name
    && mechanic.carrier?.section === ({trait:'特性',action:'动作',bonus:'附赠动作',reaction:'反应',legendary:'传奇动作'} as const)[requirement.section]
    && Array.isArray(mechanic.gmSteps) && mechanic.gmSteps.length >= 2
    && operations.filter(operation => operation.flags?.fvttJsonGenerator?.behaviorOperation?.mechanicId === mechanic.id
      && operation.flags.fvttJsonGenerator.behaviorOperation.kind === 'manual'
      && normalize(String(operation.description?.chatFlavor ?? '')).includes(normalize(requirement.description))).length === 1).length === 1;
}
