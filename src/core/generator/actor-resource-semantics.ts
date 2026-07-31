import type {
  ActorResourceBinding,
  ActorResourceDefinition,
  ActorResourceItemRef,
  ActorResourceOperation,
  ActorResourceSemantics,
  ActorResourceTransition,
} from '@fvtt-json-generator/models/resource';
import type { FvttTargetVersion } from '../foundryTarget';
import { createStableDocumentId } from '../utils/stable-id';

const FLAG_SCOPE = 'fvttJsonGenerator';

function bilingualName(name: string, englishName?: string): string {
  return englishName ? `${name} (${englishName})` : name;
}

function itemSection(item: any): string {
  return String(item?.flags?.['tidy5e-sheet']?.section ?? '');
}

function itemKey(ref: ActorResourceItemRef): string {
  return `${ref.section}\u0000${ref.name}`;
}

function findItem(actor: any, ref: ActorResourceItemRef): any {
  const matches = (actor.items ?? []).filter((item: any) =>
    item?.name === ref.name && itemSection(item) === ref.section);
  if (matches.length !== 1) {
    throw new Error(
      `ResourceProjection: expected exactly one Item "${ref.name}" in section "${ref.section}", found ${matches.length}.`,
    );
  }
  return matches[0];
}

function ensureItemId(actorName: string, item: any, ref: ActorResourceItemRef, ids: Map<string, any>): string {
  const expected = createStableDocumentId({
    actor: actorName,
    section: ref.section,
    name: ref.name,
  });
  if (item._id && item._id !== expected) {
    throw new Error(`ResourceProjection: Item "${ref.name}" already has a conflicting _id.`);
  }
  const collision = ids.get(expected);
  if (collision && collision !== item) {
    throw new Error(`ResourceProjection: stable Item ID collision "${expected}".`);
  }
  item._id = expected;
  ids.set(expected, item);
  return expected;
}

function consumptionTarget(target: string, value: string, scaling = false): any {
  return {
    type: 'itemUses',
    target,
    value,
    scaling: { mode: scaling ? 'amount' : '', formula: '' },
  };
}

function utilityActivity(options: {
  id: string;
  name: string;
  activation: string;
  condition?: string;
  targets: any[];
  flags: Record<string, unknown>;
  effects?: Array<{ _id: string }>;
}): any {
  return {
    _id: options.id,
    type: 'utility',
    name: options.name,
    description: { chatFlavor: options.condition ?? '' },
    activation: {
      type: options.activation,
      value: options.activation === 'special' ? null : 1,
      condition: options.condition ?? '',
      override: false,
    },
    consumption: {
      targets: options.targets,
      scaling: { allowed: false, max: '' },
      spellSlot: false,
    },
    duration: {
      units: 'inst',
      concentration: false,
      override: false,
    },
    range: { units: 'self', special: '', override: false },
    target: {
      template: {
        count: '',
        contiguous: false,
        type: '',
        size: '',
        width: '',
        height: '',
        units: '',
      },
      affects: { count: '', type: 'self', choice: false, special: '' },
      prompt: false,
      override: false,
    },
    uses: { spent: 0, recovery: [], max: '' },
    ...(options.effects?.length ? { effects: options.effects } : {}),
    flags: { [FLAG_SCOPE]: options.flags },
  };
}

function operationFormula(operation: ActorResourceOperation): string {
  if (operation.mode === 'gain') {
    return `-min(${operation.amount}, @item.uses.spent)`;
  }
  if (operation.mode === 'spend') return String(operation.amount);
  if (operation.mode === 'clear') return '@item.uses.value';
  return '-@item.uses.spent';
}

function recovery(resource: ActorResourceDefinition): any[] {
  return resource.recovery === 'none'
    ? []
    : [{ period: resource.recovery, type: 'recoverAll' }];
}

function appendOperation(
  actorName: string,
  item: any,
  resource: ActorResourceDefinition,
  operation: ActorResourceOperation,
): void {
  const id = createStableDocumentId({
    actor: actorName,
    resource: resource.id,
    operation: operation.id,
  });
  item.system.activities ??= {};
  if (item.system.activities[id]) {
    throw new Error(`ResourceProjection: Activity ID collision "${id}".`);
  }
  item.system.activities[id] = utilityActivity({
    id,
    name: bilingualName(operation.name, operation.englishName),
    activation: operation.activation,
    condition: operation.condition,
    targets: [consumptionTarget('', operationFormula(operation))],
    flags: {
      resourceOperation: {
        id: operation.id,
        resourceId: resource.id,
        mode: operation.mode,
        amount: operation.amount ?? null,
      },
    },
  });
}

function appendTiers(
  actorName: string,
  item: any,
  resource: ActorResourceDefinition,
  fvttVersion: FvttTargetVersion,
): void {
  item.effects ??= [];
  for (const derived of resource.derived) {
    for (const tier of derived.tiers) {
      const effectId = createStableDocumentId({
        actor: actorName,
        resource: resource.id,
        derived: derived.id,
        tier,
      });
      const effect = {
        _id: effectId,
        name: `${resource.name} ${tier.min}-${tier.max}: AC ${tier.value}`,
        type: 'base',
        system: {},
        changes: [{
          ...(fvttVersion === '14'
            ? {
                key: 'system.attributes.ac.value',
                phase: 'final',
              }
            : {
                key: 'system.attributes.ac.flat',
              }),
          mode: 5,
          value: String(tier.value),
          priority: null,
        }],
        disabled: true,
        duration: {
          startTime: null,
          seconds: null,
          combat: null,
          rounds: null,
          turns: null,
          startRound: null,
          startTurn: null,
        },
        description: `当${resource.name}剩余 ${tier.min}-${tier.max} 层时应用；切换档位时移除旧档位效果。`,
        origin: null,
        tint: '#ffffff',
        transfer: false,
        img: 'icons/svg/shield.svg',
        statuses: [],
        flags: {
          [FLAG_SCOPE]: {
            resourceTier: {
              id: derived.id,
              resourceId: resource.id,
              type: derived.type,
              min: tier.min,
              max: tier.max,
              value: tier.value,
              switching: 'manual',
            },
          },
        },
      };
      item.effects.push(effect);

      const activityId = createStableDocumentId({
        actor: actorName,
        resource: resource.id,
        derived: derived.id,
        tier,
        activity: 'apply',
      });
      item.system.activities[activityId] = utilityActivity({
        id: activityId,
        name: `应用 ${resource.name} ${tier.min}-${tier.max} 档 (Apply ${resource.englishName ?? resource.name} Tier)`,
        activation: 'special',
        condition: `仅当资源剩余 ${tier.min}-${tier.max}；应用前移除其他 ${derived.id} 档位效果。`,
        targets: [],
        effects: [{ _id: effectId }],
        flags: {
          resourceTierControl: {
            derivedId: derived.id,
            resourceId: resource.id,
            min: tier.min,
            max: tier.max,
            value: tier.value,
            switching: 'manual',
          },
        },
      });
    }
  }
}

function firstActivity(item: any, context: string): any {
  const activities = Object.values(item?.system?.activities ?? {}) as any[];
  if (activities.length !== 1) {
    throw new Error(`ResourceProjection: "${context}" must resolve to exactly one source Activity, found ${activities.length}.`);
  }
  return activities[0];
}

function appendFixedBinding(item: any, resourceItemId: string, binding: ActorResourceBinding): void {
  const activity = firstActivity(item, binding.id);
  activity.consumption ??= {
    targets: [],
    scaling: { allowed: false, max: '' },
    spellSlot: false,
  };
  activity.consumption.targets ??= [];
  for (const target of activity.consumption.targets) {
    target.scaling = {
      mode: String(target?.scaling?.mode ?? ''),
      formula: String(target?.scaling?.formula ?? ''),
    };
  }
  activity.consumption.targets.push(consumptionTarget(resourceItemId, String(binding.amount)));
  activity.consumption.spellSlot = false;
  activity.flags ??= {};
  activity.flags[FLAG_SCOPE] ??= {};
  activity.flags[FLAG_SCOPE].resourceConsumption = {
    id: binding.id,
    resourceId: binding.resourceId,
    mode: binding.mode,
    amount: binding.amount,
  };
}

function appendVariableBinding(
  actorName: string,
  item: any,
  resourceItemId: string,
  binding: ActorResourceBinding,
): void {
  const original = firstActivity(item, binding.id);
  const id = createStableDocumentId({
    actor: actorName,
    item: item.name,
    binding: binding.id,
    activity: 'variable',
  });
  const activity = structuredClone(original);
  activity._id = id;
  activity.name = bilingualName(
    binding.supplementalActivity?.name ?? item.name,
    binding.supplementalActivity?.englishName,
  );
  activity.consumption ??= {
    targets: [],
    scaling: { allowed: false, max: '' },
    spellSlot: false,
  };
  activity.consumption.targets ??= [];
  for (const target of activity.consumption.targets) {
    target.scaling = {
      mode: String(target?.scaling?.mode ?? ''),
      formula: String(target?.scaling?.formula ?? ''),
    };
  }
  activity.consumption.targets.push(consumptionTarget(resourceItemId, String(binding.min), true));
  activity.consumption.scaling = {
    allowed: true,
    max: String(binding.max),
  };
  activity.consumption.spellSlot = false;
  activity.flags ??= {};
  activity.flags[FLAG_SCOPE] ??= {};
  activity.flags[FLAG_SCOPE].resourceConsumption = {
    id: binding.id,
    resourceId: binding.resourceId,
    mode: binding.mode,
    min: binding.min,
    max: binding.max,
    optional: binding.optional ?? false,
  };
  if (binding.scaling?.damage) {
    activity.damage ??= { parts: [] };
    activity.damage.parts ??= [];
    activity.damage.parts.push({
      formula: binding.scaling.damage.base,
      types: [binding.scaling.damage.type],
      custom: { enabled: false, formula: '' },
      scaling: {
        mode: 'whole',
        number: 0,
        formula: binding.scaling.damage.perStep,
      },
    });
  }
  if (binding.scaling?.range) {
    activity.target ??= {};
    activity.target.template ??= {};
    activity.target.template.size =
      `${binding.scaling.range.base} + ${binding.scaling.range.perStep} * @scaling`;
    activity.target.template.units = 'ft';
  }
  item.system.activities[id] = activity;
}

function appendTransition(
  actor: any,
  actorName: string,
  transition: ActorResourceTransition,
  resourceItems: Map<string, any>,
  itemIds: Map<string, string>,
): void {
  const host = findItem(actor, transition.carrier);
  const id = createStableDocumentId({
    actor: actorName,
    transition: transition.id,
  });
  const targets = transition.mutations.map((mutation) => {
    if (mutation.type === 'resource') {
      const target = resourceItems.get(mutation.resourceId);
      if (!target?._id) throw new Error(`ResourceProjection: missing resource "${mutation.resourceId}".`);
      const isHost = target._id === host._id;
      if (mutation.mode === 'gain' && !isHost) {
        throw new Error('ResourceProjection: bounded resource gain currently requires the transition host as target.');
      }
      return consumptionTarget(
        isHost ? '' : target._id,
        mutation.mode === 'gain'
          ? `-min(${mutation.amount}, @item.uses.spent)`
          : String(mutation.amount),
      );
    }
    const targetId = itemIds.get(itemKey(mutation.target));
    if (!targetId) throw new Error(`ResourceProjection: missing transition target "${mutation.target.name}".`);
    const isHost = targetId === host._id;
    if (mutation.mode === 'recover' && !isHost) {
      throw new Error('ResourceProjection: bounded item-use recovery currently requires the transition host as target.');
    }
    return consumptionTarget(
      isHost ? '' : targetId,
      mutation.mode === 'recover'
        ? `-min(${mutation.amount}, @item.uses.spent)`
        : String(mutation.amount),
    );
  });
  host.system.activities ??= {};
  host.system.activities[id] = utilityActivity({
    id,
    name: bilingualName(transition.name, transition.englishName),
    activation: transition.activation,
    condition: transition.condition,
    targets,
    flags: {
      resourceTransition: {
        id: transition.id,
        mutations: transition.mutations,
      },
    },
  });
}

export function applyActorResourceSemantics(
  actor: any,
  semantics: ActorResourceSemantics | undefined,
  fvttVersion: FvttTargetVersion = '12',
): void {
  if (!semantics) return;
  const actorName = String(actor?.name ?? '');
  const ids = new Map<string, any>();
  const itemIds = new Map<string, string>();
  const allRefs: ActorResourceItemRef[] = [
    ...semantics.resources.map((resource) => resource.carrier),
    ...semantics.bindings.map((binding) => binding.source),
    ...semantics.transitions.flatMap((transition) => [
      transition.carrier,
      ...transition.mutations
        .filter((mutation) => mutation.type === 'itemUses')
        .map((mutation) => mutation.target),
    ]),
  ];
  for (const ref of allRefs) {
    const item = findItem(actor, ref);
    const itemId = ensureItemId(actorName, item, ref, ids);
    itemIds.set(itemKey(ref), itemId);
  }

  const resourceItems = new Map<string, any>();
  for (const resource of semantics.resources) {
    const item = findItem(actor, resource.carrier);
    resourceItems.set(resource.id, item);
    if (item.system?.uses?.max) {
      throw new Error(
        `ResourceProjection: carrier Item "${resource.carrier.name}" already owns an independent uses pool.`,
      );
    }
    item.system.uses = {
      spent: resource.max - resource.initial,
      max: String(resource.max),
      recovery: recovery(resource),
    };
    item.flags ??= {};
    item.flags[FLAG_SCOPE] ??= {};
    item.flags[FLAG_SCOPE].resource = {
      id: resource.id,
      name: resource.name,
      englishName: resource.englishName ?? null,
      initial: resource.initial,
      max: resource.max,
      recovery: resource.recovery,
      derived: resource.derived,
    };
    for (const operation of resource.operations) {
      appendOperation(actorName, item, resource, operation);
    }
    appendTiers(actorName, item, resource, fvttVersion);
  }

  for (const binding of semantics.bindings) {
    const item = findItem(actor, binding.source);
    const resourceItem = resourceItems.get(binding.resourceId);
    if (!resourceItem?._id) throw new Error(`ResourceProjection: missing resource "${binding.resourceId}".`);
    if (binding.mode === 'fixed') {
      appendFixedBinding(item, resourceItem._id, binding);
    } else {
      appendVariableBinding(actorName, item, resourceItem._id, binding);
    }
  }

  for (const transition of semantics.transitions) {
    appendTransition(actor, actorName, transition, resourceItems, itemIds);
  }
}
