import { buildTranslationCacheKey } from "./cacheKey";
import type {
	TranslationCache,
	TranslationContext,
	TranslationLogger,
	TranslationResult,
	Translator,
} from "./types";
import { TranslationProviderError } from "./types";

interface TranslationServiceOptions {
	translator: Translator;
	cache: TranslationCache;
	providerName: string;
	model: string;
	baseUrl?: string;
	logger?: TranslationLogger;
	defaultSourceLanguage?: string;
	defaultTargetLanguage?: string;
}

const defaultLogger: TranslationLogger = {
	warn: (message, meta) => {
		if (meta) {
			console.warn(message, meta);
			return;
		}
		console.warn(message);
	},
};

export class TranslationService {
	private readonly logger: TranslationLogger;
	private readonly defaultSourceLanguage: string;
	private readonly defaultTargetLanguage: string;

	constructor(private readonly options: TranslationServiceOptions) {
		this.logger = options.logger ?? defaultLogger;
		this.defaultSourceLanguage = options.defaultSourceLanguage ?? "en";
		this.defaultTargetLanguage = options.defaultTargetLanguage ?? "zh-CN";
	}

	public async translate(
		text: string,
		context: TranslationContext = {},
	): Promise<TranslationResult> {
		const normalizedContext: TranslationContext = {
			...context,
			sourceLanguage: context.sourceLanguage ?? this.defaultSourceLanguage,
			targetLanguage: context.targetLanguage ?? this.defaultTargetLanguage,
		};

		const key = buildTranslationCacheKey({
			text,
			context: normalizedContext,
			providerName: this.options.providerName,
			model: this.options.model,
			baseUrl: this.options.baseUrl ?? "openai-compatible",
		});

		const cached = this.options.cache.get(key);
		if (cached !== undefined) {
			return {
				text: cached,
				sourceText: text,
				cached: true,
				warnings: [],
			};
		}

		try {
			const translated = await this.options.translator.translate(
				text,
				normalizedContext,
			);
			this.options.cache.set(key, translated);

			return {
				text: translated,
				sourceText: text,
				cached: false,
				warnings: [],
			};
		} catch (error: unknown) {
			const warning = this.buildWarning(error);
			this.logger.warn("Translation failed, fallback to source text", {
				code: warning.code,
				provider: warning.provider,
				model: warning.model,
				namespace: normalizedContext.namespace,
			});

			return {
				text,
				sourceText: text,
				cached: false,
				warnings: [warning],
			};
		}
	}

	private buildWarning(error: unknown): TranslationResult["warnings"][number] {
		if (error instanceof TranslationProviderError) {
			return {
				code: error.code,
				message: error.message,
				retryable: error.retryable,
				provider: this.options.providerName,
				model: this.options.model,
			};
		}

		return {
			code: "unknown",
			message: error instanceof Error ? error.message : String(error),
			retryable: false,
			provider: this.options.providerName,
			model: this.options.model,
		};
	}
}
