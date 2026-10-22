import type { EvidenceRef } from '@fvtt-json-generator/contracts/evidence';

export type SourceOperationAbility = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type NativeFailureStatus = 'dead'|'blinded'|'charmed'|'deafened'|'frightened'|'grappled'|'incapacitated'|'invisible'|'paralyzed'|'petrified'|'poisoned'|'prone'|'restrained'|'stunned'|'unconscious';
export type SourceFeatureCollection='traits'|'actions'|'bonusActions'|'reactions'|'legendaryActions'|'mythicActions';
/** A reviewable model proposal, never proof of source correctness or acceptance. */
export interface SourceCandidateReview {
  version: 1;
  findings: Array<{code:string;path:string;message:string}>;
  proposal: unknown;
}
export interface SourceCandidateCounter {name:string;max:number;recovery:string|null}
export interface SourceResourcePool {
  id:string;
  name:string;
  max:number;
  period:'day'|'longRest'|'shortRest'|'dawn';
  members:Array<{collection:SourceFeatureCollection;index:number;featureId:string;cost:1}>;
  evidence:EvidenceRef[];
}

/** Independently clickable operations, never an automatic trigger graph.
 * The complete parent rule remains the GM's authority for timing and targets.
 * Quotes bind individual facts; the program, not the model, assigns offsets. */
export interface SourceOperation {
  id: string;
  name: string;
  type: 'attack' | 'save' | 'damage' | 'heal';
  relationship: 'primary' | 'follow-up' | 'alternative';
  condition?: string;
  sourceText: string;
  evidence?: EvidenceRef;
  /** melee/ranged explicitly retain an unclassified source attack. Their
   * executor is a labelled GM roll, never a native weapon/spell Attack. */
  attack?: { type: 'mwak' | 'rwak' | 'msak' | 'rsak' | 'melee' | 'ranged'; toHit: number; reach?: number; range?: number; longRange?: number };
  /** The printed damage is rolled once. GM applies this source-bound factor;
   * it is not another damage part, formula, effect or automatic HP change. */
  damageAdjustment?: {multiplier:0.5;condition:'source-actor-bloodied';actor:string;quote:string};
  save?: { dc: number; abilities: SourceOperationAbility[]; choice: 'single' | 'target'; outcome: 'none' | 'half' | 'full' };
  damage?: Array<{ formula: string; type: string; types?: string[]; relationship: 'base' | 'additional' | 'conditional' | 'replacement'; condition?: string }>;
  healing?: {formula:string;type:'healing'|'temphp';target:{type:'self'|'creature';count:1;special:string}};
  range?: number;
  aoe?: {shape:'sphere'|'radius'|'cone'|'line'|'cube'|'cylinder'|'rectangle';radius:number;width?:number;height?:number};
  targetSpecial?: string;
  /** Program-derived ordinary failed-save statuses, never AI-authored effects. */
  failureStatuses?:NativeFailureStatus[];
  /** Complete source sentences, independently bound by the program. */
  proof: { attack?: string; save?: string; damage?: string[];healing?:string;range?:string;aoe?:string;target?:string;
    /** Program-bound complete same-source rule that explicitly upgrades this named option. */
    upgrade?:{sourceText:string;quote:string}; };
}
