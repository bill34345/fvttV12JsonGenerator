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

export interface GenerationIconResolver {
  resolveActor(actor: Record<string, any>): void;
  resolveStandaloneItem(item: Record<string, any>): void;
}
