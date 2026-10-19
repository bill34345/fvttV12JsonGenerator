import type { EvidenceRef } from '@fvtt-json-generator/contracts/evidence';

export type SourceOperationAbility = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type NativeFailureStatus = 'dead'|'blinded'|'charmed'|'deafened'|'frightened'|'grappled'|'incapacitated'|'invisible'|'paralyzed'|'petrified'|'poisoned'|'prone'|'restrained'|'stunned'|'unconscious';
export type SourceFeatureCollection='traits'|'actions'|'bonusActions'|'reactions'|'legendaryActions'|'mythicActions';
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
  attack?: { type: 'mwak' | 'rwak' | 'msak' | 'rsak'; toHit: number; reach?: number; range?: number; longRange?: number };
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
