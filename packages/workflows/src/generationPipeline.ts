import type { ParsedNPC } from '@fvtt-json-generator/parser/mapping';
import { adaptParsedActorToCanonical } from '@fvtt-json-generator/generation/adapters';
import { getGenerationProjector } from '@fvtt-json-generator/generation/projectors';
import type {
  CanonicalActorDocument,
  GenerationDiagnostic,
  GenerationVerification,
} from '@fvtt-json-generator/generation/types';
import { verifyGeneratedDocument } from '@fvtt-json-generator/generation/verification';
import type { ActorGeneratorOptions } from '@fvtt-json-generator/generation/actor';
import type { EffectProfile } from '@fvtt-json-generator/generation/effect-profile';
import type { FvttTargetVersion } from '@fvtt-json-generator/generation/target';
import type { ParserRoute } from '@fvtt-json-generator/parser/types';
import {
  createDisabledIconResolutionSession,
  type IconReviewReport,
  type IconWorkflowOptions,
  type IconWorkflowPort,
} from './iconPort';

export interface ActorGenerationPipelineOptions {
  parsed: ParsedNPC;
  sourceText: string;
  sourcePath?: string;
  route: ParserRoute;
  fvttVersion: FvttTargetVersion;
  effectProfile: EffectProfile;
  translationService?: ActorGeneratorOptions['translationService'];
  iconOptions?: IconWorkflowOptions;
  iconWorkflow?: Pick<IconWorkflowPort, 'createResolutionSession'>;
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
  const iconSession = options.iconWorkflow
    ? options.iconWorkflow.createResolutionSession(options.fvttVersion, options.iconOptions)
    : createDisabledIconResolutionSession(options.iconOptions);
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
