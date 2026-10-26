/** Forge AI content review is temporarily unavailable by user decision.
 * This is not a provider preference or a caller-overridable default. Historical
 * opinions remain readable; extraction, local checks and GM approval continue. */
export const FORGE_AI_REVIEW_DISABLED_MESSAGE = 'AI 内容复核已暂时关闭。请由 GM 核对完整来源、程序检查结果和候选后确认。';

export function assertForgeAiReviewAvailable(): void {
  throw new TypeError(FORGE_AI_REVIEW_DISABLED_MESSAGE);
}

export async function rejectForgeAiReview(): Promise<never> {
  throw new TypeError(FORGE_AI_REVIEW_DISABLED_MESSAGE);
}
