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
  JsonTranslationSyncWorkflow,
  ObsidianSyncWorkflow,
  PlainTextActorWorkflow,
  convertItemCollectionToJson,
  convertMonsterCollectionToJson,
  resumeMonsterIntake,
  runMonsterIntake,
} from './workflows';
export {
  type ImageAssetOptions,
  type ImageTokenCrop,
} from '../assets/imageAssets';
export { hasCompleteNormalizedCropRect } from '../assets/tokenCrop';
export { runGoddessFantasyBoardCrawl } from '@fvtt-json-generator/crawl-goddessfantasy/crawl';
export { runRecordsToPlaintext } from '@fvtt-json-generator/crawl-goddessfantasy/records-to-plaintext';
export type { GoddessFantasyCrawlMode } from '@fvtt-json-generator/crawl-goddessfantasy/types';
export { parseIconMode } from '../icons/workflow';
export type { IconMode } from '../icons/types';
export { ItemsIngestionWorkflow } from '../ingest/items';
export { PlainTextIngestionWorkflow } from '../ingest/plaintextAdapter';
export {
  loadMonsterIntakeConfig,
  monsterIntakeConfigured,
} from '@fvtt-json-generator/intake-ai/config';
export {
  OpenAICompatibleMonsterIntakeProvider,
  type IntakeProviderAuditEvent,
} from '@fvtt-json-generator/intake-ai/provider';
export type {
  IntakeDecision,
  MonsterIntakeAiProvider,
} from '@fvtt-json-generator/intake-ai/types';
export { buildActorVerificationSummaryFromValues } from '../verification/actorVerification';
export {
  assertEffectProfileForTarget,
  parseFvttTargetVersion,
} from '@fvtt-json-generator/generation/target';
