import goldenMaster from '../../../../data/golden-master.json';

export interface GenerationResources {
  goldenMaster?: unknown;
  goldenMasterPath?: string | null;
  requiredFiles?: Record<string, string>;
}

export class GenerationResourceError extends Error {
  public readonly code = 'GENERATION_RESOURCE_MISSING';

  public constructor(
    public readonly resource: string,
    public readonly resourcePath: string,
  ) {
    super(`Required generation resource "${resource}" is missing at the configured browser resource boundary.`);
    this.name = 'GenerationResourceError';
  }
}

export function defaultGenerationResources(): GenerationResources {
  return { goldenMaster };
}

export function resolveGenerationResources(
  overrides: GenerationResources | undefined,
): GenerationResources {
  const resources = { ...defaultGenerationResources(), ...overrides };
  if (resources.requiredFiles && Object.keys(resources.requiredFiles).length > 0) {
    const [name, path] = Object.entries(resources.requiredFiles)[0]!;
    throw new GenerationResourceError(name, path);
  }
  return resources;
}

export function loadOptionalGoldenMaster(resources: GenerationResources): unknown | undefined {
  if (resources.goldenMaster !== undefined) return structuredClone(resources.goldenMaster);
  return undefined;
}
