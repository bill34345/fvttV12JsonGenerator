import type { AbilityKey, CanonicalFeature } from './types';
import type { StagedSharedUsesProposal } from './staged-resource-pools';

/** Shared response shape for individual and whole-form proposal adapters. */
export interface StagedFeatureResponse {
  schemaVersion: 1;
  unitId: string;
  mode: 'native' | 'manual' | 'native-with-gm';
  facts: Partial<Pick<CanonicalFeature, 'activityType' | 'activationType' | 'attack' | 'damage' | 'save' | 'range' | 'aoe' | 'recharge' | 'uses' | 'legendaryCost' | 'spellUseRecords' | 'gmTriggeredSave' | 'nativeFailureStatuses' | 'healing' | 'sourceOperations'>> & {sharedUses?:StagedSharedUsesProposal;spellcastingAbility?:{ability:AbilityKey;quote:string}};
}
