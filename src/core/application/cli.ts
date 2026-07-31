/**
 * CLI composition surface.
 *
 * The delivery app owns argument parsing and presentation. Concrete repository
 * adapters are assembled here until their scheduled workspace migrations.
 */
export type { EffectProfile } from './conversion';
export { convertMarkdownContentToJson } from './conversion';
export {
  ItemTextWorkflow,
  JsonTranslationSyncWorkflow,
  ObsidianSyncWorkflow,
  PlainTextActorWorkflow,
  resumeMonsterIntake,
  runMonsterIntake,
} from './workflows';
export { buildImageAssetOptionsFromCli } from '../assets/imageAssetOptions';
export { parseIconMode } from '../icons/workflow';
export { ItemsIngestionWorkflow } from '../ingest/items';
export { PlainTextIngestionWorkflow } from '../ingest/plaintextAdapter';
export { loadMonsterIntakeConfig } from '@fvtt-json-generator/intake-ai/config';
export {
  OpenAICompatibleMonsterIntakeProvider,
  type IntakeProviderAuditEvent,
} from '@fvtt-json-generator/intake-ai/provider';
export {
  assertEffectProfileForTarget,
  parseFvttTargetVersion,
} from '@fvtt-json-generator/generation/target';
