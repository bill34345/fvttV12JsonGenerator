import {
  DocumentConversionWorkflow,
  runDocumentDoctor,
  type DocumentConversionDependencies,
  type DocumentConversionOptions,
  type DocumentConversionResult,
  type DocumentDoctorReport,
} from '@fvtt-json-generator/ingest-documents';
import {
  createMonsterIntakeProvider,
  monsterIntakeConfigured,
} from '@fvtt-json-generator/intake-ai';
import { runMonsterIntake } from './workflows';
import { conversionApplication } from './conversion';
import { createDefaultWorkflowTranslationService } from '../translation/defaultService';

export type {
  DocumentConversionOptions,
  DocumentConversionResult,
  DocumentDoctorReport,
} from '@fvtt-json-generator/ingest-documents';

export function createDocumentConversionWorkflow(
  overrides: DocumentConversionDependencies = {},
): DocumentConversionWorkflow {
  const intake = overrides.intake ?? createConfiguredDocumentIntake();
  const dependencies: DocumentConversionDependencies = {
    translationService: overrides.translationService ?? createDefaultWorkflowTranslationService() ?? null,
    ...(intake ? { intake } : {}),
    ...overrides,
  };
  if (!intake && !overrides.convertMarkdown) {
    // Document OCR output is not promised to match the structured Markdown
    // contract. Without the configured AI Intake, fail closed instead of
    // pretending that the raw OCR can be sent directly to the Actor parser.
    return new DocumentConversionWorkflow(dependencies);
  }
  return new DocumentConversionWorkflow({
    ...dependencies,
    convertMarkdown: overrides.convertMarkdown ?? (async (options) => conversionApplication.convertContent({
      content: options.content,
      sourcePath: options.sourcePath,
      outputPath: options.outputPath,
      fvttVersion: options.fvttVersion as '12' | '13' | '14' | undefined,
      effectProfile: options.effectProfile as 'core' | 'modded-v12' | 'modded-v14' | undefined,
      translationService: null,
      iconOptions: options.iconOptions as never,
    })),
  });
}

export function runDocumentConversion(options: DocumentConversionOptions): Promise<DocumentConversionResult> {
  return createDocumentConversionWorkflow().run(options);
}

export function documentDoctor(): DocumentDoctorReport {
  return runDocumentDoctor();
}

function createConfiguredDocumentIntake(): DocumentConversionDependencies['intake'] {
  if (!monsterIntakeConfigured()) return undefined;
  const provider = createMonsterIntakeProvider();
  return async (input) => runMonsterIntake({
    source: input.source,
    sourceName: input.sourceName,
    runRoot: input.runRoot,
    vaultPath: input.vaultPath,
    fvttVersion: input.fvttVersion === '14' ? '14' : '12',
    effectProfile: input.effectProfile as 'core' | 'modded-v12' | 'modded-v14' | undefined,
    iconOptions: input.iconOptions as never,
  }, provider);
}
