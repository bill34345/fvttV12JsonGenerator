export type ActorResourceSection = '特性' | '动作' | '附赠动作' | '反应' | '传奇动作';
export type ActorResourceActivation = 'special' | 'action' | 'bonus' | 'reaction';
export type ActorResourceRecovery = 'none' | 'lr' | 'sr' | 'day';

export interface ActorResourceItemRef {
  section: ActorResourceSection;
  name: string;
}

export interface ActorResourceOperation {
  id: string;
  name: string;
  englishName?: string;
  activation: ActorResourceActivation;
  mode: 'gain' | 'spend' | 'clear' | 'restoreAll';
  amount?: number;
  condition?: string;
}

export interface ActorResourceTier {
  min: number;
  max: number;
  value: number;
}

export interface ActorResourceDerived {
  id: string;
  type: 'ac';
  tiers: ActorResourceTier[];
}

export interface ActorResourceDefinition {
  id: string;
  name: string;
  englishName?: string;
  carrier: ActorResourceItemRef;
  initial: number;
  max: number;
  recovery: ActorResourceRecovery;
  operations: ActorResourceOperation[];
  derived: ActorResourceDerived[];
}

export interface ActorResourceDamageScaling {
  base: string;
  perStep: string;
  type: string;
}

export interface ActorResourceRangeScaling {
  base: number;
  perStep: number;
}

export interface ActorResourceBinding {
  id: string;
  resourceId: string;
  source: ActorResourceItemRef;
  mode: 'fixed' | 'variable';
  amount?: number;
  min?: number;
  max?: number;
  optional?: boolean;
  supplementalActivity?: {
    name: string;
    englishName?: string;
  };
  scaling?: {
    damage?: ActorResourceDamageScaling;
    range?: ActorResourceRangeScaling;
  };
}

export type ActorResourceMutation =
  | {
      type: 'resource';
      resourceId: string;
      mode: 'spend' | 'gain';
      amount: number;
    }
  | {
      type: 'itemUses';
      target: ActorResourceItemRef;
      mode: 'spend' | 'recover';
      amount: number;
    };

export interface ActorResourceTransition {
  id: string;
  name: string;
  englishName?: string;
  carrier: ActorResourceItemRef;
  activation: ActorResourceActivation;
  condition?: string;
  mutations: ActorResourceMutation[];
}

export interface ActorResourceSemantics {
  resources: ActorResourceDefinition[];
  bindings: ActorResourceBinding[];
  transitions: ActorResourceTransition[];
}
