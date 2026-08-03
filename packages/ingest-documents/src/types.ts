export type DocumentKind = 'pdf' | 'image';
export type DocumentEngine = 'auto' | 'native' | 'paddleocr';
export type DocumentLanguage = 'auto' | 'en' | 'zh-CN' | 'mixed';
export type ExtractionMethod = 'native-pdf-text' | 'paddleocr' | 'tesseract';
export type CandidateStatus = 'high' | 'medium' | 'needs_review' | 'excluded';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExtractedWord {
  text: string;
  box: BoundingBox;
  confidence?: number;
}

export interface ExtractedTextBlock {
  id: string;
  pageNumber: number;
  text: string;
  boxes: BoundingBox[];
  words?: ExtractedWord[];
  method: ExtractionMethod;
  confidence: number;
  language: Exclude<DocumentLanguage, 'auto'> | 'unknown';
  bbox?: BoundingBox;
}

export interface ExtractedPage {
  pageNumber: number;
  width: number;
  height: number;
  blocks: ExtractedTextBlock[];
  method: ExtractionMethod | 'empty';
  confidence: number;
  warnings: string[];
}

export interface ExtractedDocument {
  schemaVersion: 1;
  sourcePath: string;
  fileName: string;
  kind: DocumentKind;
  pageCount: number;
  pages: ExtractedPage[];
  blocks: ExtractedTextBlock[];
  warnings: string[];
}

export interface DocumentExtractionOptions {
  engine?: DocumentEngine;
  language?: DocumentLanguage;
  pythonPath?: string;
  tesseractPath?: string;
}

export interface DocumentExtractor {
  extract(inputPath: string, options?: DocumentExtractionOptions): Promise<ExtractedDocument>;
}

export interface CandidateSignals {
  name: boolean;
  armorClass: boolean;
  hitPoints: boolean;
  speed: boolean;
  abilities: boolean;
  challenge: boolean;
  sections: number;
}

export interface DocumentCandidate {
  id: string;
  label: string;
  status: CandidateStatus;
  confidence: number;
  pageNumber: number;
  sourceBlockId: string;
  bbox?: BoundingBox;
  language: Exclude<DocumentLanguage, 'auto'> | 'unknown';
  rawMarkdown: string;
  signals: CandidateSignals;
  reason: string;
  sourcePageCount: number;
}

export interface CandidateFilterResult {
  schemaVersion: 1;
  candidates: DocumentCandidate[];
  excludedPages: Array<{ pageNumber: number; reason: string }>;
  warnings: string[];
}

export interface TranslationWarning {
  candidateId: string;
  code: string;
  message: string;
}

export interface TranslatedCandidate {
  candidateId: string;
  status: 'translated' | 'unchanged' | 'needs_review';
  sourceMarkdown: string;
  translatedMarkdown: string;
  warnings: TranslationWarning[];
  protectedTokenCount: number;
}

export interface MarkdownTranslationService {
  translate(
    text: string,
    context?: {
      sourceLanguage?: string;
      targetLanguage?: string;
      namespace?: string;
      metadata?: Record<string, string | number | boolean | null>;
    },
  ): Promise<{ text: string; warnings?: unknown[] } | string>;
}

export interface MarkdownTranslationWorkflowOptions {
  targetLanguage?: string;
  sourceLanguage?: DocumentLanguage;
  service?: MarkdownTranslationService | null;
}

export interface DocumentConversionOptions {
  inputPath: string;
  runRoot?: string;
  outputPath?: string;
  engine?: DocumentEngine;
  language?: DocumentLanguage;
  targetLanguage?: string;
  candidateIds?: string[];
  extractOnly?: boolean;
  fvttVersion?: string;
  effectProfile?: string;
  iconOptions?: unknown;
}

export interface DocumentConversionJsonOptions {
  content: string;
  sourcePath: string;
  outputPath: string;
  fvttVersion?: string;
  effectProfile?: string;
  translationService?: null;
  iconOptions?: unknown;
}

export interface DocumentConversionJsonResult {
  status: 'accepted' | 'needs_review' | 'failed';
  name?: string;
  rawJson?: unknown;
  warnings?: string[];
  diagnostics?: Array<{ code?: string; message?: string; severity?: string }>;
}

export type DocumentIntakeResult =
  | {
      status: 'succeeded' | 'needs_review' | 'partial' | 'failed' | 'dry_run';
      runPath?: string;
      creatures?: Array<{
        id: string;
        label: string;
        status: string;
        markdownPath?: string;
        actorPath?: string;
      }>;
    }
  | undefined;

export interface DocumentConversionDependencies {
  extractor?: DocumentExtractor;
  filter?: DocumentCandidateFilterLike;
  translation?: MarkdownTranslationWorkflowLike;
  translationService?: MarkdownTranslationService | null;
  convertMarkdown?: (
    options: DocumentConversionJsonOptions,
  ) => Promise<DocumentConversionJsonResult>;
  intake?: (input: {
    source: string;
    sourceName: string;
    runRoot: string;
    vaultPath: string;
    fvttVersion?: string;
    effectProfile?: string;
    iconOptions?: unknown;
  }) => Promise<DocumentIntakeResult>;
}

export interface DocumentCandidateFilterLike {
  filter(document: ExtractedDocument): CandidateFilterResult;
}

export interface MarkdownTranslationWorkflowLike {
  translateCandidates(
    candidates: DocumentCandidate[],
    selectedIds: string[],
    options?: MarkdownTranslationWorkflowOptions,
  ): Promise<TranslatedCandidate[]>;
}

export interface DocumentOutputFile {
  path: string;
  fileName: string;
  contentType: string;
  label: string;
  candidateId?: string;
}

export interface DocumentConversionResult {
  schemaVersion: 1;
  status: 'extracted' | 'succeeded' | 'needs_review' | 'partial' | 'failed';
  runId: string;
  runPath: string;
  sourcePath: string;
  rawMarkdownPath: string;
  candidatesPath: string;
  reportPath: string;
  pageCount: number;
  translatedMarkdownPath?: string;
  candidates: DocumentCandidate[];
  selectedCandidateIds: string[];
  translatedCandidates: TranslatedCandidate[];
  outputFiles: DocumentOutputFile[];
  warnings: string[];
  failures: Array<{ candidateId?: string; error: string }>;
  stage: 'extracted' | 'filtered' | 'translated' | 'intake' | 'generated';
}

export interface DocumentDoctorReport {
  pythonCommand: string;
  pythonVersion?: string;
  pdfplumber: boolean;
  paddleocr: boolean;
  tesseract: boolean;
  tesseractLanguages: string[];
  nativePdfReady: boolean;
  pdfRendering: boolean;
  imageOcrReady: boolean;
  warnings: string[];
}
