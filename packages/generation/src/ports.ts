export interface TranslationContext {
  sourceLanguage?: string;
  targetLanguage?: string;
  namespace?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface TranslationServicePort {
  translate(
    text: string,
    context?: TranslationContext,
  ): Promise<{ text: string } | string>;
}

/** Reviewed display projection uses the existing translation boundary without scalar fallback semantics. */
export interface ReviewedTranslationServicePort {
  readonly model: string;
  readonly reviewModel: string;
  translate(request: import('@fvtt-json-generator/contracts/localization').LocalizationRequest, signal?: AbortSignal,
    onDraft?: (draft: import('@fvtt-json-generator/contracts/localization').LocalizationDraft) => void,
    repair?: { draft: import('@fvtt-json-generator/contracts/localization').LocalizationDraft; findings: string[] }): Promise<import('@fvtt-json-generator/contracts/localization').LocalizationDraft>;
  review(request: import('@fvtt-json-generator/contracts/localization').LocalizationRequest, draft: import('@fvtt-json-generator/contracts/localization').LocalizationDraft, signal?: AbortSignal): Promise<import('@fvtt-json-generator/contracts/localization').LocalizationReview>;
}

export interface GenerationIconResolver {
  resolveActor(actor: Record<string, any>): void;
  resolveStandaloneItem(item: Record<string, any>): void;
}
