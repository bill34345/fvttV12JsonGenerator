import type { ParsedNPC } from '@fvtt-json-generator/parser/mapping';

export interface ImageTokenCrop {
  left: number;
  top: number;
  width: number;
  height: number;
  fit?: 'cover' | 'contain';
}

export type ImageAssetMode = 'none' | 'ssh';
export type ImageAssetStage =
  | 'config'
  | 'download'
  | 'actor'
  | 'token'
  | 'upload'
  | 'verify';

export interface ImageAssetWarning {
  stage: ImageAssetStage;
  sourceUrl?: string;
  displayName?: string;
  message: string;
}

export interface ImageFetchResult {
  buffer: Buffer;
  contentType?: string;
}

export interface PublicImageExpectation {
  width?: number;
  height?: number;
  format?: string;
}

export interface ImageAssetUploader {
  ensureDir(remotePath: string): Promise<void>;
  uploadFile(localPath: string, remotePath: string): Promise<void>;
}

export interface ImageAssetOptions {
  mode: ImageAssetMode;
  localRoot?: string;
  sshTarget?: string;
  remoteRoot?: string;
  publicBaseUrl?: string;
  allowHttp?: boolean;
  actorDir?: string;
  tokenDir?: string;
  tokenFramePath?: string;
  tokenSize?: number;
  tokenFormat?: 'webp';
  tokenCropOverrides?: Record<string, ImageTokenCrop>;
  fetchImage?: (url: string) => Promise<ImageFetchResult>;
  uploader?: ImageAssetUploader;
  verifyPublicImage?: (
    url: string,
    expected?: PublicImageExpectation,
  ) => Promise<boolean>;
}

export interface ImageAssetContext {
  slug: string;
  displayName: string;
  localRoot?: string;
}

export interface ImageAssetResult {
  actorUrl?: string;
  tokenUrl?: string;
  localActorPath?: string;
  localTokenPath?: string;
  warnings: ImageAssetWarning[];
}

export interface ImageAssetProcessorPort {
  process(
    parsed: ParsedNPC,
    options: ImageAssetOptions,
    context: ImageAssetContext,
  ): Promise<ImageAssetResult>;
}

export interface ItemAiNormalizerPort {
  normalizeItem(bodyText: string): Promise<string>;
}

export interface IngestedTextFile {
  fileName: string;
  sections: object;
  rawNotes: string[];
}

export interface PlainTextIngestionResultPort {
  sourcePath: string;
  emitDir: string;
  dryRun: boolean;
  usedAi: boolean;
  files: IngestedTextFile[];
}

export interface PlainTextIngestionPort {
  ingest(options: {
    sourcePath: string;
    emitDir: string;
    dryRun?: boolean;
    enableAiNormalize?: boolean;
  }): Promise<PlainTextIngestionResultPort>;
}

export interface ItemIngestionResultPort {
  sourcePath: string;
  emitDir: string;
  dryRun: boolean;
  files: Array<{ fileName: string; content: string }>;
}

export interface ItemIngestionPort {
  ingest(options: {
    sourcePath: string;
    emitDir: string;
    dryRun?: boolean;
  }): Promise<ItemIngestionResultPort>;
}

export interface MonsterCollectionBlockPort {
  rawBlock: string;
  chineseName: string;
  englishName: string;
}

export interface ParsedMonsterBlockPort {
  fileName: string;
  markdown: string;
}

export interface ItemCollectionBlockPort {
  rawBlock: string;
  heading: string;
  chineseName: string;
  englishName: string;
  stageName?: string;
  itemType?: string;
  rarity?: string;
  requireAttunement?: boolean;
}

export interface CollectionIngestionPort {
  splitMonsterCollection(content: string): MonsterCollectionBlockPort[];
  parseMonsterBlock(rawBlock: string): ParsedMonsterBlockPort;
  splitItemCollection(content: string): ItemCollectionBlockPort[];
}
