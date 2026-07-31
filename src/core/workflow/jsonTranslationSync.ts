import { createDefaultWorkflowTranslationService } from '../translation/defaultService';
import {
  JsonTranslationSyncWorkflow as PackageJsonTranslationSyncWorkflow,
  type JsonTranslationSyncOptions,
  type JsonTranslationSyncResult,
  type WorkflowTranslationService,
} from '@fvtt-json-generator/workflows/json-translation-sync';

export type {
  JsonTranslationSyncOptions,
  JsonTranslationSyncResult,
  WorkflowTranslationService,
} from '@fvtt-json-generator/workflows/json-translation-sync';

export class JsonTranslationSyncWorkflow extends PackageJsonTranslationSyncWorkflow {
  constructor(options: { translationService?: WorkflowTranslationService | null } = {}) {
    super({
      translationService: options.translationService === undefined
        ? createDefaultWorkflowTranslationService()
        : options.translationService,
    });
  }
}
