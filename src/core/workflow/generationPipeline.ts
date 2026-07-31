import type { ParsedNPC } from '@fvtt-json-generator/parser/mapping';
import { adaptParsedActorToCanonical } from '../generation/adapters';
import { getGenerationProjector } from '../generation/projectors';
import type {
  CanonicalActorDocument,
  GenerationDiagnostic,
  GenerationVerification,
} from '../generation/types';
import { verifyGeneratedDocument } from '../generation/verification';
import type { ActorGeneratorOptions } from '../generator/actor';
import type { EffectProfile } from '../generator/effectProfileApplier';
import type { FvttTargetVersion } from '../foundryTarget';
import type { ParserRoute } from '@fvtt-json-generator/parser/types';
import type { IconReviewReport, IconWorkflowOptions } from '../icons/types';
import { createIconResolutionSession } from '../icons/workflow';

export interface ActorGenerationPipelineOptions {
  parsed: ParsedNPC;
  sourceText: string;
  sourcePath?: string;
  route: ParserRoute;
  fvttVersion: FvttTargetVersion;
  effectProfile: EffectProfile;
  translationService?: ActorGeneratorOptions['translationService'];
  iconOptions?: IconWorkflowOptions;
}

export interface ActorGenerationArtifact {
  actor: any;
  canonical: CanonicalActorDocument;
  verification: GenerationVerification;
  diagnostics: GenerationDiagnostic[];
  iconReview: IconReviewReport | null;
}

export async function generateActorArtifact(
  options: ActorGenerationPipelineOptions,
): Promise<ActorGenerationArtifact> {
  const canonical = adaptParsedActorToCanonical(options.parsed, {
    sourcePath: options.sourcePath,
    sourceText: options.sourceText,
  });
  const projector = getGenerationProjector(options.fvttVersion);
  const iconSession = createIconResolutionSession(options.fvttVersion, options.iconOptions);
  const actor = await projector.project(canonical, {
    targetVersion: options.fvttVersion,
    effectProfile: options.effectProfile,
    route: options.route,
    translationService: options.translationService,
    iconResolver: iconSession.resolver,
  });
  const verification = verifyGeneratedDocument({
    canonical,
    output: actor,
    target: options.fvttVersion,
    effectProfile: options.effectProfile,
  });
  return {
    actor,
    canonical,
    verification,
    diagnostics: verification.diagnostics,
    iconReview: iconSession.report(),
  };
}
