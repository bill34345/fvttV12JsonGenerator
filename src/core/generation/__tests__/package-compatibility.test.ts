import { describe, expect, it } from 'bun:test';
import { ActorGenerator as PackageActorGenerator } from '@fvtt-json-generator/generation/actor';
import { ItemGenerator as PackageItemGenerator } from '@fvtt-json-generator/generation/item-generator';
import { getGenerationProjector as packageGetGenerationProjector } from '@fvtt-json-generator/generation/projectors';
import { createStableDocumentId as packageCreateStableDocumentId } from '@fvtt-json-generator/generation/stable-id';
import { ActorGenerator as LegacyActorGenerator } from '../../generator/actor';
import { ItemGenerator as LegacyItemGenerator } from '../../generator/item-generator';
import { getGenerationProjector as legacyGetGenerationProjector } from '../projectors';
import { createStableDocumentId as legacyCreateStableDocumentId } from '../../utils/stable-id';

describe('legacy generation import adapters', () => {
  it('remain linked to the workspace package implementation', () => {
    expect(LegacyActorGenerator).toBe(PackageActorGenerator);
    expect(LegacyItemGenerator).toBe(PackageItemGenerator);
    expect(legacyGetGenerationProjector).toBe(packageGetGenerationProjector);
    expect(legacyCreateStableDocumentId).toBe(packageCreateStableDocumentId);
  });
});
