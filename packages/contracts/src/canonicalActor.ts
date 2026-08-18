export type CanonicalActorSourceStatus = 'ok' | 'needs_review' | 'failed' | 'skipped';

export interface CanonicalActorSourceWarning {
  code: string;
  message: string;
  sourceId?: string;
}

export interface CanonicalActorSourceMetadata {
  site?: string;
  boardId?: string;
  topicId?: string;
  entityId?: string;
  title?: string;
  chineseName?: string;
  englishName?: string;
  rawHtmlPath?: string;
  [key: string]: string | undefined;
}

/**
 * Source-faithful, project-standard Actor input shared by source adapters and
 * formal generation workflows. The audit view is optional and never feeds
 * generation back into a plaintext parser.
 */
export interface CanonicalActorSource {
  sourceId: string;
  sourceUrl: string;
  fileName: string;
  markdown: string;
  auditMarkdown?: string;
  imageUrls: string[];
  status: CanonicalActorSourceStatus;
  warnings: CanonicalActorSourceWarning[];
  metadata?: CanonicalActorSourceMetadata;
}
