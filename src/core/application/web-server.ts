/**
 * Web server composition surface.
 *
 * The Web delivery app owns HTTP, jobs, security, and presentation. Concrete
 * repository adapters are assembled here until their scheduled workspace
 * migrations.
 */
export type {
  ConversionResult,
  EffectProfile,
  FvttTargetVersion,
} from './conversion';
export {
  DEFAULT_VAULT_PATH,
  convertMarkdownContentToJson,
  convertMarkdownPathToOutput,
} from './conversion';
export {
  createDocumentConversionWorkflow,
  documentDoctor,
  runDocumentConversion,
} from './document';
export type {
  DocumentConversionOptions,
  DocumentConversionResult,
  DocumentDoctorReport,
} from './document';
export {
  JsonTranslationSyncWorkflow,
  ObsidianSyncWorkflow,
  canonicalSourcesFromMarkdown,
  convertCanonicalActorCollection,
  convertItemCollectionToJson,
  convertMonsterCollectionToJson,
  detectAutomaticConversionRoute,
  resumeItemIntake,
  resumeMonsterIntake,
  runItemIntake,
  runMonsterIntake,
} from './workflows';
export type {
  AutomaticConversionDetection,
  AutomaticConversionRoute,
} from './workflows';
export type {
  CanonicalActorSource,
  CanonicalActorSourceMetadata,
  CanonicalActorSourceStatus,
  CanonicalActorSourceWarning,
  CanonicalActorCollectionItemResult,
  CanonicalActorCollectionOptions,
  CanonicalActorCollectionOutputFile,
  CanonicalActorCollectionPromotion,
  CanonicalActorCollectionResult,
  CanonicalActorCollectionStatus,
} from './workflows';
export {
  type ImageAssetOptions,
  type ImageTokenCrop,
} from '@fvtt-json-generator/assets-icons/image-assets';
export { hasCompleteNormalizedCropRect } from '@fvtt-json-generator/assets-icons/token-crop';
export { runGoddessFantasyBoardCrawl } from '@fvtt-json-generator/crawl-goddessfantasy/crawl';
export { runRecordsToPlaintext } from '@fvtt-json-generator/crawl-goddessfantasy/records-to-plaintext';
export type { GoddessFantasyCrawlMode } from '@fvtt-json-generator/crawl-goddessfantasy/types';
export { parseIconMode } from '@fvtt-json-generator/assets-icons/icon-workflow';
export type { IconMode } from '@fvtt-json-generator/assets-icons/icon-types';
export { ItemsIngestionWorkflow } from '../ingest/items';
export { PlainTextIngestionWorkflow } from '../ingest/plaintextAdapter';
export {
  loadMonsterIntakeConfig,
  monsterIntakeAuthMode,
  monsterIntakeConfigured,
} from '@fvtt-json-generator/intake-ai/config';
export {
  createItemIntakeProvider,
  createMonsterIntakeProvider,
  type IntakeProviderAuditEvent,
} from '@fvtt-json-generator/intake-ai';
export type {
  IntakeDecision,
  MonsterIntakeAiProvider,
} from '@fvtt-json-generator/intake-ai/types';
export type { ItemIntakeAiProvider } from '@fvtt-json-generator/intake-ai/item-types';
export { buildActorVerificationSummaryFromValues } from '../verification/actorVerification';
export {
  assertEffectProfileForTarget,
  parseFvttTargetVersion,
} from '@fvtt-json-generator/generation/target';
