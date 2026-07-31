import { describe, expect, it } from 'bun:test';
import type { ActionData as LegacyActionData } from '../action';
import type { ActorBehaviorSemantics as LegacyBehaviorSemantics } from '../behavior';
import type { ParsedItem as LegacyParsedItem } from '../item';
import type { ActorResourceSemantics as LegacyResourceSemantics } from '../resource';
import type { ActionData } from '@fvtt-json-generator/models/action';
import type { ActorBehaviorSemantics } from '@fvtt-json-generator/models/behavior';
import type { ParsedItem } from '@fvtt-json-generator/models/item';
import type { ActorResourceSemantics } from '@fvtt-json-generator/models/resource';

describe('legacy model compatibility adapters', () => {
  it('preserves the action and item type contracts', () => {
    const action: ActionData = { name: 'Strike', type: 'attack' };
    const legacyAction: LegacyActionData = action;
    const item: ParsedItem = { name: 'Blade', type: 'weapon' };
    const legacyItem: LegacyParsedItem = item;
    const behavior: ActorBehaviorSemantics = { schemaVersion: 1, mechanics: [] };
    const legacyBehavior: LegacyBehaviorSemantics = behavior;
    const resources: ActorResourceSemantics = {
      resources: [],
      bindings: [],
      transitions: [],
    };
    const legacyResources: LegacyResourceSemantics = resources;

    expect(legacyAction).toEqual(action);
    expect(legacyItem).toEqual(item);
    expect(legacyBehavior).toEqual(behavior);
    expect(legacyResources).toEqual(resources);
  });
});
