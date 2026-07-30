import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
    super(`Required generation resource "${resource}" is missing at "${resourcePath}".`);
    this.name = 'GenerationResourceError';
  }
}

export function defaultGenerationResources(): GenerationResources {
  return {
    goldenMasterPath: fileURLToPath(
      new URL('../../../data/golden-master.json', import.meta.url),
    ),
  };
}

export function resolveGenerationResources(
  overrides: GenerationResources | undefined,
): GenerationResources {
  const resources = {
    ...defaultGenerationResources(),
    ...overrides,
  };
  for (const [name, path] of Object.entries(resources.requiredFiles ?? {})) {
    if (!existsSync(path)) {
      throw new GenerationResourceError(name, path);
    }
  }
  return resources;
}

export function loadOptionalGoldenMaster(resources: GenerationResources): unknown | undefined {
  if (resources.goldenMaster !== undefined) {
    return structuredClone(resources.goldenMaster);
  }
  const path = resources.goldenMasterPath;
  if (!path || !existsSync(path)) {
    return undefined;
  }
  return JSON.parse(readFileSync(path, 'utf-8'));
}
