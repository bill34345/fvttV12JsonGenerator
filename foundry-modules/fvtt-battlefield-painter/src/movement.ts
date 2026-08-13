import type {
  MovementBehaviorFactory,
  MovementBehaviorSource,
} from "./scene-plan";

interface MovementActionDescriptor {
  deriveTerrainDifficulty?: (...args: unknown[]) => unknown;
}

interface MovementCostModelInstance {
  validate?: (options?: Record<string, unknown>) => unknown;
  toObject?: () => Record<string, unknown>;
}

interface MovementCostModelConstructor {
  new (
    source?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): MovementCostModelInstance;
}

export interface FoundryConfigurationLike {
  RegionBehavior?: {
    dataModels?: {
      modifyMovementCost?: MovementCostModelConstructor;
    };
  };
  Token?: {
    movement?: {
      actions?: Record<string, MovementActionDescriptor>;
    };
  };
}

const configurableMovementActions = (
  configuration: FoundryConfigurationLike,
): string[] =>
  Object.entries(configuration.Token?.movement?.actions ?? {})
    .filter(([, descriptor]) => !descriptor.deriveTerrainDifficulty)
    .map(([action]) => action);

export const createMovementBehaviorFactory = (
  configuration: FoundryConfigurationLike,
): MovementBehaviorFactory => {
  const Model = configuration.RegionBehavior?.dataModels?.modifyMovementCost;
  if (!Model) {
    throw new Error(
      "Foundry core does not expose the modifyMovementCost Region behavior",
    );
  }

  const actions = configurableMovementActions(configuration);
  if (!actions.length) {
    throw new Error("Foundry core exposes no configurable movement action");
  }

  return (multiplier: number): MovementBehaviorSource => {
    const difficulties = Object.fromEntries(
      actions.map((action) => [action, multiplier]),
    );
    const model = new Model({ difficulties });
    model.validate?.({ strict: true, clean: true });
    const system = model.toObject?.() ?? { difficulties };

    return {
      name: `地形移动消耗 ×${multiplier}`,
      type: "modifyMovementCost",
      system,
    };
  };
};

