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
export { buildImageAssetOptionsFromCli } from '@fvtt-json-generator/assets-icons/image-options';
export {
  createDocumentConversionWorkflow,
  documentDoctor,
  runDocumentConversion,
} from './document';
export { isDocumentInputPath } from '@fvtt-json-generator/ingest-documents/extractor';
export type {
  DocumentConversionOptions,
  DocumentConversionResult,
  DocumentDoctorReport,
} from './document';
export { parseIconMode } from '@fvtt-json-generator/assets-icons/icon-workflow';
export { ItemsIngestionWorkflow } from '../ingest/items';
export { PlainTextIngestionWorkflow } from '../ingest/plaintextAdapter';
export {
  loadMonsterIntakeConfig,
  monsterIntakeAuthMode,
} from '@fvtt-json-generator/intake-ai/config';
export {
  runMonsterIntakeDoctor,
  type MonsterIntakeDoctorReport,
} from '@fvtt-json-generator/intake-ai/doctor';
export {
  createMonsterIntakeProvider,
  type IntakeProviderAuditEvent,
} from '@fvtt-json-generator/intake-ai';
export {
  assertEffectProfileForTarget,
  parseFvttTargetVersion,
} from '@fvtt-json-generator/generation/target';
