import { iconWorkflowAdapter } from '../icons/adapter';
import {
  generateActorArtifact as generatePackageActorArtifact,
  type ActorGenerationArtifact,
  type ActorGenerationPipelineOptions,
} from '@fvtt-json-generator/workflows/generation-pipeline';

export type {
  ActorGenerationArtifact,
  ActorGenerationPipelineOptions,
} from '@fvtt-json-generator/workflows/generation-pipeline';

export function generateActorArtifact(
  options: ActorGenerationPipelineOptions,
): Promise<ActorGenerationArtifact> {
  return generatePackageActorArtifact({
    ...options,
    iconWorkflow: options.iconWorkflow ?? iconWorkflowAdapter,
  });
}
