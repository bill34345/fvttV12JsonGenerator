import type { FvttTargetVersion } from './target';
import { hashManifest } from '@fvtt-json-generator/spell-manifest-contracts/hash-manifest';
import {
  findForbiddenTargetWorldIdentifiers,
  RESOLVER_MODULE_ID,
  validatePortableSpellManifestStructure,
  type PortableSpellManifest,
} from '@fvtt-json-generator/spell-manifest-contracts';

const featureKeys = new WeakMap<object, string>();
const featureActivations=new WeakMap<object,'action'|'bonus'|'reaction'|'legendary'>();
const featureCosts=new WeakMap<object,number>();
const spellRecoveryPeriods = { day: 'day', shortRest: 'sr', longRest: 'lr' } as const;

export const SPELL_MANIFEST_UNSUPPORTED_TARGET = 'SPELL_MANIFEST_UNSUPPORTED_TARGET' as const;

export class ActorSpellManifestError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'ActorSpellManifestError';
  }
}

export function markSpellcastingFeatureItem(item: object, featureItemKey: string, activationType?:string,activationCost?:number): void {
  featureKeys.set(item, featureItemKey);
  if(activationType==='action'||activationType==='bonus'||activationType==='reaction'||activationType==='legendary')featureActivations.set(item,activationType);
  if(activationType==='legendary'&&Number.isSafeInteger(activationCost)&&activationCost!>0)featureCosts.set(item,activationCost!);
}

export function assertNoOrphanedSpellcastingFeatureLinks(actor: Record<string, any>): void {
  const orphan = (Array.isArray(actor.items) ? actor.items : [])
    .find((item: unknown) => Boolean(item && typeof item === 'object' && featureKeys.has(item as object)));
  if (orphan) {
    throw new ActorSpellManifestError(
      'SPELL_FEATURE_LINK_ORPHANED',
      'Generated spellcasting feature linkage requires a portable spell manifest.',
    );
  }
}

export function assertPortableActorHasNoTargetWorldIdentifiers(actor: Record<string, any>): void {
  if (!actor.flags?.[RESOLVER_MODULE_ID]?.spellManifest) return;
  const forbidden = findForbiddenTargetWorldIdentifiers(actor)[0];
  if (forbidden) {
    throw new ActorSpellManifestError(
      'SPELL_ACTOR_FORBIDDEN_TARGET_WORLD_IDENTIFIER',
      `${forbidden.path} contains ${forbidden.match}.`,
    );
  }
}

export function assertSpellManifestTarget(
  manifest: PortableSpellManifest | undefined,
  target: FvttTargetVersion,
): void {
  if (manifest && target !== '14') {
    throw new ActorSpellManifestError(
      SPELL_MANIFEST_UNSUPPORTED_TARGET,
      `Portable spell manifests require Foundry v14; requested v${target}.`,
    );
  }
}

/**
 * Adds the schema-derived portable Actor boundary without resolving destination
 * documents. Feature linkage is source-derived and exact; names and item order
 * never participate in the match.
 */
export function buildActorSpellManifest(
  actor: Record<string, any>,
  manifest: PortableSpellManifest,
  target: FvttTargetVersion,
): void {
  assertSpellManifestTarget(manifest, target);
  const validation = validatePortableSpellManifestStructure(manifest);
  if (!validation.ok) {
    const details = validation.findings.map((finding) => `${finding.code} ${finding.path}`).join('; ');
    throw new ActorSpellManifestError('SPELL_MANIFEST_INVALID', details);
  }
  const validated = validation.value;
  const groupsByFeature = new Map<string, typeof validated.spellcastingGroups>();
  const activeGroups:typeof validated.spellcastingGroups=[];
  const unresolved:Array<{group:unknown;message:string}>=[];
  for (const group of validated.spellcastingGroups) {
    const groups = groupsByFeature.get(group.featureItemKey) ?? [];
    groups.push(group);
    groupsByFeature.set(group.featureItemKey, groups);
  }

  const items = Array.isArray(actor.items) ? actor.items : [];
  const itemsByFeature = new Map<string, any[]>();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const key = featureKeys.get(item);
    if (!key) continue;
    const linked = itemsByFeature.get(key) ?? [];
    linked.push(item);
    itemsByFeature.set(key, linked);
  }

  for (const group of validated.spellcastingGroups) {
    try{
    const linked = itemsByFeature.get(group.featureItemKey) ?? [];
    if (linked.length === 0) {
      throw new ActorSpellManifestError('SPELL_FEATURE_LINK_MISSING', `No generated feature has key ${group.featureItemKey}.`);
    }
    if (linked.length !== 1) {
      throw new ActorSpellManifestError('SPELL_FEATURE_LINK_DUPLICATE', `Feature key ${group.featureItemKey} matched ${linked.length} generated items.`);
    }
    const item = linked[0]!;
    if(group.recharge){
      const uses=item.system?.uses;
      if(String(uses?.max)!=='1'||!uses?.recovery?.some((recovery:any)=>recovery.period==='recharge'&&recovery.type==='recoverAll'&&String(recovery.formula)===String(group.recharge![0])))
        throw new ActorSpellManifestError('SPELL_FEATURE_RECHARGE_CONFLICT','Manifest Recharge must match the same generated feature Item pool.');
    }
    const shared=group.spellRefs.filter(ref=>ref.uses?.shared);
    const single=group.spellRefs.length===1?group.spellRefs[0]:undefined;
    const parentUses=!!single?.uses&&!single.uses.shared&&!!item.system?.uses?.max;
    if(parentUses&&(single!.method!=='innate'||String(item.system.uses.max)!==String(single!.uses!.value)
      ||!item.system.uses.recovery?.some((r:any)=>r.period===spellRecoveryPeriods[single!.uses!.recovery]&&r.type==='recoverAll')))
      throw new ActorSpellManifestError('SPELL_PARENT_POOL_CONFLICT','A single Cast must match its exact generated parent pool.');
    if(shared.length){
      const value=shared[0]!.uses!.value;
      const recovery=shared[0]!.uses!.recovery;
      if(shared.some(ref=>ref.uses!.value!==value||ref.uses!.recovery!==recovery))throw new ActorSpellManifestError('SPELL_SHARED_POOL_CONFLICT','Shared spell pools must agree on count and recovery.');
      const previous=item.system?.uses;
      if(previous?.max&&String(previous.max)!==String(value))throw new ActorSpellManifestError('SPELL_SHARED_POOL_CONFLICT','An existing feature counter cannot be overwritten by a different shared spell pool.');
      item.system??={};
      // schema-derived: itemUses consumes this one feature pool; independent
      // uses remain on their own Cast Activities. No extra placeholder Item.
      item.system.uses={spent:0,max:String(value),recovery:[{period:spellRecoveryPeriods[recovery],type:'recoverAll'}]};
    }
    item.flags = item.flags ?? {};
    // source-derived: this stable project-owned marker preserves the exact
    // structured feature key independently of display names and descriptions.
    item.flags.fvttJsonGenerator = {
      ...(item.flags.fvttJsonGenerator ?? {}),
      spellcastingFeatureKey: group.featureItemKey,
      ...(parentUses?{spellcastingUsesParent:true}:{}),
      ...(featureActivations.has(item)?{spellcastingActivationType:featureActivations.get(item)}:{}),
      ...(featureCosts.has(item)?{spellcastingActivationCost:featureCosts.get(item)}:{}),
    };
    item.flags[RESOLVER_MODULE_ID] = {
      featureItemKey: group.featureItemKey,
      groupId: group.groupId,
    };
    activeGroups.push(group);
    }catch(error){unresolved.push({group,message:error instanceof Error?error.message:String(error)});}
  }

  actor.flags = actor.flags ?? {};
  if(unresolved.length){actor.flags.fvttJsonGenerator??={};const prior=actor.flags.fvttJsonGenerator.candidateReview;actor.flags.fvttJsonGenerator.candidateReview={version:1,findings:[...(prior?.findings??[]),...unresolved.map(entry=>({code:'FIELD_PROJECTION_INCOMPLETE',path:'spellManifest',message:entry.message}))],proposal:{prior:prior?.proposal??null,unresolved}};
    actor.system.details.biography.value+='\n<p>GM 未连接法术组：'+unresolved.map(entry=>entry.message).join('；')+'</p>';
  }
  if(!activeGroups.length)return;
  const retained={...validated,spellcastingGroups:activeGroups};
  actor.flags[RESOLVER_MODULE_ID] = {
    spellManifest: retained,
    spellResolution: {
      status: 'pending',
      manifestHash: hashManifest(retained),
    },
  };
}
