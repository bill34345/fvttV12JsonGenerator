import type {
  ActorBehaviorMechanic,
  ActorBehaviorOperation,
  ActorBehaviorSemantics,
  ActorBehaviorState,
} from '@fvtt-json-generator/models/behavior';
import type { ActorResourceItemRef } from '@fvtt-json-generator/models/resource';
import type { FvttTargetVersion } from './target';
import { createStableDocumentId } from './stableId';

const FLAG_SCOPE = 'fvttJsonGenerator';

function bilingualName(name: string, englishName?: string): string {
  return englishName ? `${name} (${englishName})` : name;
}

function itemSection(item: any): string {
  return String(item?.flags?.['tidy5e-sheet']?.section ?? '');
}

function sectionMatches(actual: string, expected: string): boolean {
  if (actual === expected) return true;
  return expected === '传奇动作' && actual === 'Legendary Actions';
}

function findItem(actor: any, ref: ActorResourceItemRef): any {
  const matches = (actor.items ?? []).filter((item: any) =>
    item?.name === ref.name && sectionMatches(itemSection(item), ref.section));
  if (matches.length !== 1) {
    throw new Error(
      `BehaviorProjection: expected exactly one Item "${ref.name}" in section "${ref.section}", found ${matches.length}.`,
    );
  }
  return matches[0];
}

function ensureItemId(actorName: string, item: any, ref: ActorResourceItemRef): string {
  const expected = createStableDocumentId({
    actor: actorName,
    section: ref.section,
    name: ref.name,
  });
  if (item._id && item._id !== expected) {
    throw new Error(`BehaviorProjection: Item "${ref.name}" already has a conflicting _id.`);
  }
  item._id = expected;
  return expected;
}

function activityTarget(
  operation: ActorBehaviorOperation,
  stateTarget?: ActorBehaviorState['target'],
): any {
  const template = operation.template;
  const selectedTarget = stateTarget === 'selected';
  return {
    template: {
      count: '',
      contiguous: false,
      type: template?.shape ?? '',
      size: template ? String(template.size) : '',
      width: template?.width === undefined ? '' : String(template.width),
      height: '',
      units: template?.units ?? '',
    },
    affects: {
      count: '',
      type: template || selectedTarget ? 'creature' : 'self',
      choice: false,
      special: '',
    },
    prompt: Boolean(template || selectedTarget),
    override: false,
  };
}

function activationValue(activation: ActorBehaviorOperation['activation']): number | null {
  return activation === 'special' ? null : 1;
}

function utilityActivity(options: {
  id: string;
  name: string;
  operation: ActorBehaviorOperation;
  description: string;
  effects: Array<{ _id: string }>;
  flags: Record<string, unknown>;
  consumptionTargets?: any[];
  stateTarget?: ActorBehaviorState['target'];
}): any {
  return {
    _id: options.id,
    type: 'utility',
    name: options.name,
    description: { chatFlavor: options.description },
    activation: {
      type: options.operation.activation,
      value: activationValue(options.operation.activation),
      condition: options.description,
      override: false,
    },
    consumption: {
      targets: options.consumptionTargets ?? [],
      scaling: { allowed: false, max: '' },
      spellSlot: false,
    },
    duration: { units: 'inst', concentration: false, override: false },
    range: { units: 'self', special: '', override: false },
    target: activityTarget(options.operation, options.stateTarget),
    uses: { spent: 0, recovery: [], max: '' },
    ...(options.effects.length ? { effects: options.effects } : {}),
    flags: { [FLAG_SCOPE]: options.flags },
  };
}

function effectChange(change: ActorBehaviorState['changes'][number], target: FvttTargetVersion): any {
  if (target === '14' && change.key === 'system.attributes.ac.flat') {
    return {
      key: 'system.attributes.ac.value',
      mode: change.mode,
      value: change.value,
      priority: null,
      phase: 'final',
    };
  }
  if (target !== '14' && change.key === 'system.attributes.ac.value') {
    return {
      key: 'system.attributes.ac.flat',
      mode: change.mode,
      value: change.value,
      priority: null,
    };
  }
  return {
    key: change.key,
    mode: change.mode,
    value: change.value,
    priority: null,
    ...(target === '14' && change.phase ? { phase: change.phase } : {}),
  };
}

function stateEffect(
  actorName: string,
  mechanic: ActorBehaviorMechanic,
  state: ActorBehaviorState,
  target: FvttTargetVersion,
): any {
  const id = createStableDocumentId({ actor: actorName, behavior: mechanic.id, state: state.id });
  return {
    _id: id,
    name: bilingualName(state.name, state.englishName),
    type: 'base',
    system: {},
    changes: state.changes.map((change) => effectChange(change, target)),
    disabled: true,
    duration: {
      startTime: null,
      seconds: state.duration?.seconds ?? null,
      combat: null,
      rounds: state.duration?.rounds ?? null,
      turns: state.duration?.turns ?? null,
      startRound: null,
      startTurn: null,
    },
    description: [
      ...state.removal.map((entry) => `解除：${entry}`),
      ...(state.duration?.special ? [`持续：${state.duration.special}`] : []),
    ].join('\n'),
    origin: null,
    tint: '#ffffff',
    transfer: false,
    img: 'icons/svg/aura.svg',
    statuses: state.statuses,
    flags: {
      [FLAG_SCOPE]: {
        behaviorState: {
          mechanicId: mechanic.id,
          stateId: state.id,
          target: state.target,
          removal: state.removal,
          duration: state.duration ?? null,
        },
      },
    },
  };
}

function mechanicDescription(mechanic: ActorBehaviorMechanic, operation: ActorBehaviorOperation): string {
  const lines = [
    `执行模式：${mechanic.executionMode}`,
    ...(mechanic.trigger
      ? [`触发：${mechanic.trigger.event} / ${mechanic.trigger.frequency}${mechanic.trigger.condition ? ` / ${mechanic.trigger.condition}` : ''}`]
      : []),
    ...mechanic.conditions.map((entry) => `条件：${entry}`),
    `操作：${operation.description}`,
    ...mechanic.gmSteps.map((entry, index) => `GM ${index + 1}：${entry}`),
    ...(mechanic.externalRule
      ? [
          `外部规则：${mechanic.externalRule.name}`,
          ...(mechanic.externalRule.dc
            ? [`豁免：DC ${mechanic.externalRule.dc} ${mechanic.externalRule.ability ?? ''}`]
            : []),
          `结果：${mechanic.externalRule.result}`,
        ]
      : []),
  ];
  return lines.join('\n');
}

function appendMechanic(
  actor: any,
  actorName: string,
  mechanic: ActorBehaviorMechanic,
  target: FvttTargetVersion,
): void {
  const carrier = findItem(actor, mechanic.carrier);
  ensureItemId(actorName, carrier, mechanic.carrier);
  const resolvedReferences = mechanic.references.map((reference) => {
    const item = findItem(actor, reference.item);
    return {
      id: reference.id,
      role: reference.role,
      itemId: ensureItemId(actorName, item, reference.item),
      item: reference.item,
    };
  });
  carrier.flags ??= {};
  carrier.flags[FLAG_SCOPE] ??= {};
  carrier.flags[FLAG_SCOPE].behaviorMechanics ??= [];
  carrier.flags[FLAG_SCOPE].behaviorMechanics.push({
    schemaVersion: 1,
    id: mechanic.id,
    kind: mechanic.kind,
    name: mechanic.name,
    englishName: mechanic.englishName ?? null,
    coverage: mechanic.coverage,
    executionMode: mechanic.executionMode,
    ruleSource: mechanic.ruleSource,
    trigger: mechanic.trigger ?? null,
    conditions: mechanic.conditions,
    references: resolvedReferences,
    gmSteps: mechanic.gmSteps,
    capacity: mechanic.capacity ?? null,
    choicePool: mechanic.choicePool ?? null,
    externalRule: mechanic.externalRule ?? null,
  });

  carrier.effects ??= [];
  carrier.system.activities ??= {};
  const effectIds = new Map<string, string>();
  for (const state of mechanic.states) {
    const effect = stateEffect(actorName, mechanic, state, target);
    if (carrier.effects.some((entry: any) => entry._id === effect._id)) {
      throw new Error(`BehaviorProjection: duplicate Effect ID "${effect._id}".`);
    }
    carrier.effects.push(effect);
    effectIds.set(state.id, effect._id);
  }

  for (const operation of mechanic.operations) {
    const id = createStableDocumentId({ actor: actorName, behavior: mechanic.id, operation: operation.id });
    if (carrier.system.activities[id]) {
      throw new Error(`BehaviorProjection: duplicate Activity ID "${id}".`);
    }
    const effects = operation.kind === 'apply'
      ? operation.stateIds.map((stateId) => ({ _id: effectIds.get(stateId)! }))
      : [];
    const stateTargets = new Set(operation.stateIds.map((stateId) => {
      const state = mechanic.states.find((entry) => entry.id === stateId);
      if (!state) {
        throw new Error(`BehaviorProjection: operation "${operation.id}" references unknown state "${stateId}".`);
      }
      return state.target;
    }));
    if (stateTargets.size > 1) {
      throw new Error(
        `BehaviorProjection: operation "${operation.id}" mixes self and selected state targets.`,
      );
    }
    carrier.system.activities[id] = utilityActivity({
      id,
      name: bilingualName(operation.name, operation.englishName),
      operation,
      description: mechanicDescription(mechanic, operation),
      effects,
      stateTarget: stateTargets.values().next().value,
      flags: {
        behaviorOperation: {
          schemaVersion: 1,
          mechanicId: mechanic.id,
          operationId: operation.id,
          kind: operation.kind,
          executionMode: mechanic.executionMode,
          stateIds: operation.stateIds,
          references: resolvedReferences.filter((entry) => operation.referenceIds.includes(entry.id)),
        },
      },
    });
  }
}

function behaviorAuxiliaryItem(
  actorName: string,
  mechanic: ActorBehaviorMechanic,
  kind: 'capacity' | 'choicePool',
): any {
  const id = createStableDocumentId({ actor: actorName, behavior: mechanic.id, auxiliary: kind });
  const maximum = kind === 'capacity' ? mechanic.capacity!.slots : mechanic.choicePool!.choose;
  const item = {
    _id: id,
    name: kind === 'capacity'
      ? `容量：${bilingualName(mechanic.name, mechanic.englishName)}`
      : `选择池：${bilingualName(mechanic.name, mechanic.englishName)}`,
    type: 'feat',
    img: kind === 'capacity' ? 'icons/svg/anchor.svg' : 'icons/svg/dice-target.svg',
    system: {
      description: {
        value: kind === 'capacity'
          ? `${mechanic.capacity!.acquire}\n${mechanic.capacity!.release}`
          : mechanic.choicePool!.options.map((option) =>
            `${bilingualName(option.name, option.englishName)}：${option.description}`).join('\n'),
        chat: '',
      },
      source: '',
      uses: { spent: 0, max: String(maximum), recovery: [] },
      type: { value: 'monster', subtype: '' },
      properties: [],
      activities: {},
      identifier: mechanic.id,
    },
    effects: [],
    flags: {
      [FLAG_SCOPE]: {
        behaviorAuxiliary: {
          schemaVersion: 1,
          mechanicId: mechanic.id,
          kind,
          maximum,
          executionMode: mechanic.executionMode,
        },
      },
      'tidy5e-sheet': { section: '特性' },
    },
  };
  return item;
}

function appendCapacityAuxiliary(actor: any, actorName: string, mechanic: ActorBehaviorMechanic): void {
  const item = behaviorAuxiliaryItem(actorName, mechanic, 'capacity');
  const acquire: ActorBehaviorOperation = {
    id: `${mechanic.id}-acquire`,
    name: `占用 ${mechanic.name}槽位`,
    englishName: mechanic.englishName ? `Acquire ${mechanic.englishName} Slot` : undefined,
    activation: 'special',
    kind: 'consume',
    stateIds: [],
    referenceIds: [],
    description: mechanic.capacity!.acquire,
  };
  const release: ActorBehaviorOperation = {
    id: `${mechanic.id}-release`,
    name: `释放 ${mechanic.name}槽位`,
    englishName: mechanic.englishName ? `Release ${mechanic.englishName} Slot` : undefined,
    activation: 'special',
    kind: 'reset',
    stateIds: [],
    referenceIds: [],
    description: mechanic.capacity!.release,
  };
  for (const [operation, value] of [[acquire, '1'], [release, '-min(1, @item.uses.spent)']] as const) {
    const activityId = createStableDocumentId({
      actor: actorName,
      behavior: mechanic.id,
      operation: operation.id,
    });
    item.system.activities[activityId] = utilityActivity({
      id: activityId,
      name: bilingualName(operation.name, operation.englishName),
      operation,
      description: mechanicDescription(mechanic, operation),
      effects: [],
      flags: {
        behaviorCapacityOperation: {
          mechanicId: mechanic.id,
          operation: operation.kind,
        },
      },
      consumptionTargets: [{
        type: 'itemUses',
        target: '',
        value,
        scaling: { mode: '', formula: '' },
      }],
    });
  }
  actor.items.push(item);
}

function appendChoicePoolAuxiliary(
  actor: any,
  actorName: string,
  mechanic: ActorBehaviorMechanic,
  target: FvttTargetVersion,
): void {
  const item = behaviorAuxiliaryItem(actorName, mechanic, 'choicePool');
  for (const option of mechanic.choicePool!.options) {
    const effect = stateEffect(actorName, mechanic, {
      id: `choice-${option.id}`,
      name: `已选择：${option.name}`,
      englishName: option.englishName ? `Selected: ${option.englishName}` : undefined,
      target: 'self',
      statuses: [],
      changes: [],
      removal: [`在 ${mechanic.choicePool!.reset} 重置或消费该选择时移除`],
    }, target);
    item.effects.push(effect);
    const operation: ActorBehaviorOperation = {
      id: `choose-${option.id}`,
      name: `选择 ${option.name}`,
      englishName: option.englishName ? `Choose ${option.englishName}` : undefined,
      activation: 'special',
      kind: 'choose',
      stateIds: [],
      referenceIds: [],
      description: option.description,
    };
    const activityId = createStableDocumentId({
      actor: actorName,
      behavior: mechanic.id,
      operation: operation.id,
    });
    item.system.activities[activityId] = utilityActivity({
      id: activityId,
      name: bilingualName(operation.name, operation.englishName),
      operation,
      description: mechanicDescription(mechanic, operation),
      effects: [{ _id: effect._id }],
      flags: {
        behaviorChoiceOperation: {
          mechanicId: mechanic.id,
          optionId: option.id,
          distinct: mechanic.choicePool!.distinct,
        },
      },
      consumptionTargets: [{
        type: 'itemUses',
        target: '',
        value: '1',
        scaling: { mode: '', formula: '' },
      }],
    });
  }
  const resetOperation: ActorBehaviorOperation = {
    id: `${mechanic.id}-reset`,
    name: `重置 ${mechanic.name}`,
    englishName: mechanic.englishName ? `Reset ${mechanic.englishName}` : undefined,
    activation: 'special',
    kind: 'reset',
    stateIds: [],
    referenceIds: [],
    description: `在 ${mechanic.choicePool!.reset} 恢复全部 ${mechanic.choicePool!.choose} 个选择，并移除旧选择标记。`,
  };
  const resetId = createStableDocumentId({
    actor: actorName,
    behavior: mechanic.id,
    operation: resetOperation.id,
  });
  item.system.activities[resetId] = utilityActivity({
    id: resetId,
    name: bilingualName(resetOperation.name, resetOperation.englishName),
    operation: resetOperation,
    description: mechanicDescription(mechanic, resetOperation),
    effects: [],
    flags: {
      behaviorChoiceOperation: {
        mechanicId: mechanic.id,
        operation: 'reset',
      },
    },
    consumptionTargets: [{
      type: 'itemUses',
      target: '',
      value: '-@item.uses.spent',
      scaling: { mode: '', formula: '' },
    }],
  });
  actor.items.push(item);
}

export function applyActorBehaviorSemantics(
  actor: any,
  semantics: ActorBehaviorSemantics | undefined,
  target: FvttTargetVersion,
): void {
  if (!semantics) return;
  const actorName = String(actor?.name ?? '');
  for (const mechanic of semantics.mechanics) {
    appendMechanic(actor, actorName, mechanic, target);
  }
  for (const mechanic of semantics.mechanics) {
    if (mechanic.capacity) appendCapacityAuxiliary(actor, actorName, mechanic);
    if (mechanic.choicePool) appendChoicePoolAuxiliary(actor, actorName, mechanic, target);
  }
}
