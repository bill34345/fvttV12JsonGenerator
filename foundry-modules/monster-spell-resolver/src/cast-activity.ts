import {
  logicalSpellRefKey,
  hashManagedProjection,
  RESOLVER_MODULE_ID,
  sha256,
  type PortableSpellRef,
  type PortableSpellcastingGroup,
  type PreservedSpellRestriction,
} from '../../../src/core/spell-resolution';

const FOUNDRY_ID = /^[A-Za-z0-9]{16}$/;
const COMPENDIUM_SPELL_UUID = /^Compendium\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.Item\.[A-Za-z0-9]{16}$/;
export const SPELL_RECOVERY_PERIODS = { day: 'day', shortRest: 'sr', longRest: 'lr' } as const;

export interface ResolverGeneratedIdentity {
  manifestId: string;
  groupId: string;
  refId: string;
  featureId: string;
}

export interface ResolverManagedIdentity extends ResolverGeneratedIdentity {
  logicalRefKey: string;
  selectedUuid: string;
  activityId: string;
}

export interface ResolverManagedFlags extends ResolverManagedIdentity {
  managed: true;
  documentType: 'activity' | 'spell';
  transactionId?: string;
  generatedContentHash?: string;
  protected?: true;
}

export interface NativeCastActivitySource {
  _id: string;
  type: 'cast';
  name: string;
  activation?: {type:'action'|'bonus'|'reaction'|'legendary';value:number;override:true};
  description?: {chatFlavor:string};
  consumption: {
    spellSlot: boolean;
    targets: Array<{ type: 'activityUses' | 'itemUses'; value: '1' }>;
  };
  uses?: {
    spent: 0;
    max: string;
    recovery: [{ period: 'day' | 'sr' | 'lr'; type: 'recoverAll' }];
  };
  duration?: {value:string;units:'hour'|'minute'|'day';concentration:false;override:true};
  target?: {
    override: true;
    prompt: false;
    affects: { type: 'self'; choice: false };
  };
  spell: {
    uuid: string;
    ability?: PortableSpellcastingGroup['ability'];
    level?: number;
    challenge: { override: boolean; attack?: string; save?: string };
    properties: string[];
    spellbook: true;
  };
  flags: Record<string, unknown> & {
    [RESOLVER_MODULE_ID]: ResolverManagedFlags;
  };
}

export interface LiteralRestrictionReport {
  manifestId: string;
  groupId: string;
  refId: string;
  kind: PreservedSpellRestriction['kind'];
  text: string;
  value?: string | number | boolean;
  status: 'literal-unsupported';
}

export interface BuildCastActivitySourceInput {
  manifestId: string;
  featureId: string;
  group: PortableSpellcastingGroup;
  ref: PortableSpellRef;
  selectedUuid: string;
  /** Explicit source timing carried by the generated feature, not inferred from a spell name. */
  activationType?: 'action'|'bonus'|'reaction'|'legendary';
  activationCost?: number;
  /** A source-generated single-spell feature owns the daily Item pool. */
  useParentItemPool?: boolean;
}

export interface BuiltCastActivitySource {
  activity: NativeCastActivitySource;
  identity: ResolverManagedIdentity;
  literalRestrictions: LiteralRestrictionReport[];
}

/**
 * Schema-derived Foundry Document IDs. Display names are deliberately absent
 * from the identity tuple so localization and user-facing renames are inert.
 */
export function generatedResolverDocumentId(identity: ResolverGeneratedIdentity, kind: 'activity' | 'spell'): string {
  assertNonEmpty(identity.manifestId, 'manifestId');
  assertNonEmpty(identity.groupId, 'groupId');
  assertNonEmpty(identity.refId, 'refId');
  if (!FOUNDRY_ID.test(identity.featureId)) {
    throw new TypeError('featureId must satisfy Foundry\'s 16-character alphanumeric Document ID contract.');
  }
  return sha256(JSON.stringify([
    'fvtt-json-generator-spell-resolver-v1', kind,
    identity.manifestId, identity.groupId, identity.refId, identity.featureId,
  ])).slice(0, 16);
}

/**
 * Build a raw Cast Activity source for the exact 5.3.3, 6.0.2, and 6.0.5 candidates.
 * challenge attack/save stay strings: 5.3.3 NumberField casts them on the
 * prepared model, while both 6.0.2 and 6.0.5 deterministic FormulaField retain formulas.
 */
export function buildCastActivitySource(input: BuildCastActivitySourceInput): BuiltCastActivitySource {
  if (!input || typeof input !== 'object') throw new TypeError('Cast Activity input is required.');
  assertNonEmpty(input.manifestId, 'manifestId');
  if (!FOUNDRY_ID.test(input.featureId)) throw new TypeError('featureId must satisfy Foundry\'s 16-character alphanumeric Document ID contract.');
  if (!COMPENDIUM_SPELL_UUID.test(input.selectedUuid)) throw new TypeError('selectedUuid must be a Compendium Spell Item UUID.');
  if (!input.group || !input.ref) throw new TypeError('Manifest group and ref are required.');
  if(input.useParentItemPool!==undefined&&typeof input.useParentItemPool!=='boolean')throw new TypeError('Parent Item pool marker must be boolean.');
  assertNonEmpty(input.group.groupId, 'groupId');
  assertNonEmpty(input.ref.refId, 'refId');
  if (input.group.spellRefs.filter((entry) => entry.refId === input.ref.refId).length !== 1) {
    throw new TypeError('refId must identify exactly one ref in the supplied manifest group.');
  }
  if (!['at-will', 'innate', 'prepared'].includes(input.ref.method)) {
    throw new TypeError(`Unsupported Cast method ${input.ref.method}; only source-evidenced at-will, innate, and prepared casting are supported.`);
  }

  const generatedIdentity: ResolverGeneratedIdentity = {
    manifestId: input.manifestId,
    groupId: input.group.groupId,
    refId: input.ref.refId,
    featureId: input.featureId,
  };
  const activityId = generatedResolverDocumentId(generatedIdentity, 'activity');
  const identity: ResolverManagedIdentity = {
    ...generatedIdentity,
    logicalRefKey: logicalSpellRefKey(input.manifestId, input.group.groupId, input.ref.refId),
    selectedUuid: input.selectedUuid,
    activityId,
  };

  const prepared = input.ref.method === 'prepared';
  if (prepared && (!Number.isInteger(input.ref.castingLevel) || input.ref.castingLevel! < 1 || input.ref.castingLevel! > 9)) {
    throw new TypeError('Prepared Cast refs require a source-derived castingLevel from 1 through 9.');
  }
  if (prepared && input.ref.uses !== undefined) {
    throw new TypeError('Prepared Cast refs consume native Actor spell slots and must not declare per-spell uses.');
  }
  const consumption: NativeCastActivitySource['consumption'] = { spellSlot: prepared, targets: [] };
  let uses: NativeCastActivitySource['uses'];
  if(input.group.recharge){
    const pair=input.group.recharge;
    if(pair.length!==2||pair.some(value=>!Number.isInteger(value)||value<1||value>6)||pair[1]!==6||pair[0]>pair[1]||input.ref.method!=='at-will'||input.ref.uses!==undefined)throw new TypeError('Conflicting parent Recharge casting contract.');
    consumption.targets=[{type:'itemUses',value:'1'}];
  }else if (input.ref.uses !== undefined) {
    if (!Number.isSafeInteger(input.ref.uses.value)||input.ref.uses.value<1) {
      throw new TypeError('Native spell uses require a positive source-evidenced integer.');
    }
    if(input.useParentItemPool){
      if(input.group.spellRefs.length!==1||input.ref.uses.shared||input.ref.method!=='innate')throw new TypeError('Single-spell parent uses require one independent daily ref.');
      consumption.targets=[{type:'itemUses',value:'1'}];
    }else if(input.ref.uses.shared){
      const shared=input.group.spellRefs.filter(ref=>ref.uses?.shared);
      if(shared.length<2||shared.some(ref=>ref.uses!.value!==input.ref.uses!.value||ref.uses!.recovery!==input.ref.uses!.recovery))throw new TypeError('Shared Cast refs must identify one consistent source pool.');
      consumption.targets=[{type:'itemUses',value:'1'}];
    }else{
      uses = { spent: 0, max: String(input.ref.uses.value), recovery: [{ period: SPELL_RECOVERY_PERIODS[input.ref.uses.recovery], type: 'recoverAll' }] };
      consumption.targets = [{ type: 'activityUses', value: '1' }];
    }
  } else if (input.ref.method === 'innate') {
    throw new TypeError('Innate Cast refs without an explicit supported use contract fail closed.');
  }
  if(input.useParentItemPool&&input.ref.uses===undefined)throw new TypeError('Parent Item uses require a source daily quota.');

  const selfTarget = input.ref.restrictions.find(isExactSelfTarget);
  const handled=new Set<PreservedSpellRestriction>();
  let duration:NativeCastActivitySource['duration'];
  let castingLevel=input.ref.castingLevel;
  const sourceNotes:PreservedSpellRestriction[]=[];
  const componentNotes:PreservedSpellRestriction[]=[];
  const ignored=new Set(input.ref.ignoresMaterialComponents?['material']:[]);
  for(const restriction of input.ref.restrictions){
    if(restriction.kind!=='casting')continue;
    const text=restriction.text.normalize('NFKC').replace(/[*_]/gu,'').replace(/\s+/gu,' ').trim();
    const level=/^\(?\s*(?:level\s+([1-9])\s+version|([1-9一二三四五六七八九])\s*环\s*版本)\s*\)?$/iu.exec(text);
    if(level){
      const token=level[1]??level[2]!;
      const value=/^[1-9]$/u.test(token)?Number(token):'一二三四五六七八九'.indexOf(token)+1;
      if(restriction.value!==undefined&&restriction.value!==value)throw Error('Source spell casting level value contradicts its full restriction');
      if(castingLevel!==undefined&&castingLevel!==value)throw Error('Conflicting source spell casting levels');
      castingLevel=value;handled.add(restriction);continue;
    }
    if(/^\(?\s*included in AC\s*\)?$/iu.test(text)){
      if(restriction.value!==undefined&&restriction.value!==true)throw Error('Included AC value contradicts its source warning');
      // Informational source accounting, not permission to add an AC effect.
      // Preserve the warning beside the real spell; never apply anything here.
      sourceNotes.push(restriction);handled.add(restriction);continue;
    }
    const timed=/^\(?\s*(?:持续|lasts?(?: for)?|(?:the )?duration\s*(?::|is))\s*(\d+)\s*(小时|hours?|分钟|minutes?|天|days?)\s*\)?$/iu.exec(text);
    if(timed&&Number(timed[1])>0&&(restriction.value===undefined||restriction.value===Number(timed[1]))){
      const units=/小时|hour/iu.test(timed[2]!)?'hour':/分钟|minute/iu.test(timed[2]!)?'minute':'day';
      const next:NonNullable<NativeCastActivitySource['duration']>={value:timed[1]!,units,concentration:false,override:true};
      if(duration&&JSON.stringify(duration)!==JSON.stringify(next))throw Error('Conflicting source spell duration overrides');
      duration=next;handled.add(restriction);
    }else if(/^(?:(?:无需|无须|不需要|不需)\s*(?:任何|所有|全部)?\s*法术成分|(?:without|requires? no|requiring no)\s+(?:any\s+)?spell components?)$/iu.test(text)){
      assertComponentWaiverValue(restriction);
      for(const component of ['vocal','somatic','material'])ignored.add(component);handled.add(restriction);
    }else{
      const components=decodeEnumeratedComponentWaivers(text);
      if(components){
        assertComponentWaiverValue(restriction);
        for(const component of components)ignored.add(component);
        componentNotes.push(restriction);handled.add(restriction);
      }
    }
  }
  const literalRestrictions = input.ref.restrictions
    .filter((restriction) => restriction !== selfTarget&&!handled.has(restriction))
    .map((restriction) => ({
      manifestId: input.manifestId,
      groupId: input.group.groupId,
      refId: input.ref.refId,
      kind: restriction.kind,
      text: restriction.text,
      ...(restriction.value === undefined ? {} : { value: restriction.value }),
      status: 'literal-unsupported' as const,
    }));
  // The AI's explicit ability, DC, uses and timing remain authoritative.
  // An unmapped literal qualifier is reported for GM handling; it does not
  // veto the other structured parameters or the Actor's complete spell list.
  if(input.activationType!==undefined&&!['action','bonus','reaction','legendary'].includes(input.activationType))throw new TypeError('Unsupported source casting activation.');
  const activationCost=input.activationCost??1;
  if(!Number.isSafeInteger(activationCost)||activationCost<1||input.activationType!=='legendary'&&activationCost!==1)throw new TypeError('Unsupported source casting cost.');

  const challenge = {
    override: input.group.attackBonus !== undefined || input.group.saveDc !== undefined,
    ...(input.group.attackBonus === undefined ? {} : { attack: String(input.group.attackBonus) }),
    ...(input.group.saveDc === undefined ? {} : { save: String(input.group.saveDc) }),
  };
  const sourceFlavor=literalRestrictionChatFlavor([...literalRestrictions,...sourceNotes.map(r=>({manifestId:input.manifestId,groupId:input.group.groupId,refId:input.ref.refId,kind:r.kind,text:r.text,status:'literal-unsupported' as const}))])
    +(componentNotes.length?'<p>Component waivers applied from the source:</p>'+restrictionParagraphs(componentNotes):'');
  const activity: NativeCastActivitySource = {
    _id: activityId,
    type: 'cast',
    name: input.ref.chineseName&&input.ref.englishName?`${input.ref.chineseName} ${input.ref.englishName}`:input.ref.englishName ?? input.ref.chineseName ?? input.ref.originalName,
    // 2024 How to Use a Monster: an Actions heading does not shorten a
    // spell's normal casting time. Inherit it, including 1+ minute spells.
    // Explicit bonus/reaction/legendary carriers still supply their timing.
    ...(input.activationType&&input.activationType!=='action'?{activation:{type:input.activationType,value:activationCost,override:true}}:{}),
    ...(sourceFlavor?{description:{chatFlavor:sourceFlavor}}:{}),
    consumption,
    ...(uses === undefined ? {} : { uses }),
    ...(duration?{duration}:{}),
    ...(selfTarget === undefined ? {} : {
      target: { override: true, prompt: false, affects: { type: 'self', choice: false } },
    }),
    spell: {
      uuid: input.selectedUuid,
      ...(input.group.ability === undefined ? {} : { ability: input.group.ability }),
      ...(castingLevel!==undefined ? { level: castingLevel } : {}),
      challenge,
      // Cast spell.properties is the ignored-component set. [] means preserve
      // all source requirements; [material] waives only material components.
      properties: ['vocal','somatic','material'].filter(component=>ignored.has(component)),
      spellbook: true,
    },
    flags: {
      [RESOLVER_MODULE_ID]: {
        managed: true,
        documentType: 'activity',
        ...identity,
      },
    },
  };
  activity.flags[RESOLVER_MODULE_ID].generatedContentHash = computeManagedSourceHash(activity);
  return { activity, identity, literalRestrictions };
}

export function computeManagedSourceHash(source: unknown): string {
  return hashManagedProjection(source);
}

/** Complete inert source notes, shared by the parent and its owned usage
 * Activities. Core Cast does not inherit parent chatFlavor to the Spell. */
export function literalRestrictionChatFlavor(restrictions:ReadonlyArray<{text:string}>):string{
  return restrictions.length?'<p>GM adjudication: the following complete source restrictions are not automatic.</p>'+restrictionParagraphs(restrictions):'';
}

function restrictionParagraphs(restrictions:ReadonlyArray<{text:string}>):string{
  return restrictions.map(rule=>'<p>'+rule.text.replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;').replace(/\r?\n/gu,'<br>')+'</p>').join('');
}

/** Closed decoding of an already declared casting-restriction field. Never
 * inspect an Actor ability body, spell description or external source text.
 * 5.3.3 Cast properties is an ignored-component set: verbal maps to vocal. */
function decodeEnumeratedComponentWaivers(text:string):string[]|undefined{
  const clause=/^(?:without|requires? no|requiring no)\s+(.+?)\s+components?$/iu.exec(text);
  if(!clause)return undefined;
  const list=clause[1]!.toLocaleLowerCase('en-US');
  if(!/^(?:verbal|somatic|material)(?:\s*,\s*(?:verbal|somatic|material))*(?:(?:\s*,\s*|\s+)(?:and|or)\s+(?:verbal|somatic|material))?$/u.test(list))return undefined;
  return [...new Set(list.match(/\b(?:verbal|somatic|material)\b/gu)!.map(component=>component==='verbal'?'vocal':component))];
}

function assertComponentWaiverValue(restriction:PreservedSpellRestriction):void{
  if(restriction.value!==undefined&&restriction.value!==true)throw new TypeError('Source component waiver value contradicts its complete casting restriction.');
}

function isExactSelfTarget(restriction: PreservedSpellRestriction): boolean {
  if (restriction.kind !== 'target') return false;
  const candidates = [restriction.value, restriction.text]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toLocaleLowerCase('en-US').replace(/[\s_-]+/g, ' '));
  return candidates.some((value) => new Set([
    'self', 'self only', 'only self', '自身', '仅自身', '只限自身', '仅限自身',
  ]).has(value));
}

function assertNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} must be a non-empty string.`);
}
