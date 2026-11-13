export const FORGE_PDF_ENGINE_VERSION = '6.4.299' as const;

export interface PdfBoundingBox { x: number; y: number; width: number; height: number }

/** PDF.js text items are strings placed by a matrix, not individual source glyphs. */
export interface PdfRawTextItem {
  str: string;
  dir: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean;
}

export interface PdfRawTextStyle {
  fontFamily: string;
  ascent: number | null;
  descent: number | null;
  vertical: boolean | null;
}

export interface PdfSourceLine {
  id: string;
  text: string;
  bbox: PdfBoundingBox;
  fontSize: number;
  bold: boolean | null;
  itemIndexes: number[];
  method: 'native-pdf-text';
  language: 'en' | 'zh-CN' | 'mixed' | 'unknown';
  confidence: null;
}

export interface PdfLayoutPage {
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
  warnings: string[];
  lines: PdfSourceLine[];
  rawItems: PdfRawTextItem[];
  rawStyles: Record<string, PdfRawTextStyle>;
}

export interface BrowserPdfSource {
  schemaVersion: 1;
  engine: 'pdfjs';
  engineVersion: typeof FORGE_PDF_ENGINE_VERSION;
  sourceName: string;
  sourceSha256: string;
  pageCount: number;
  pages: PdfLayoutPage[];
}

export interface PdfReaderModelRequest { instruction: string; input: string; schema: Record<string, unknown> }
export interface PdfReaderModelResult { content: string; model?: string; usage?: unknown; elapsedMs?: number }
export interface PdfReaderModel { complete(request: PdfReaderModelRequest): Promise<PdfReaderModelResult> }
export interface PdfReaderOutput { name: string; markdown: string; sourceLineIds: string[]; pageNumbers: number[]; doubts: string[] }
export interface BrowserPdfReading {
  schemaVersion: 1;
  status: 'completed' | 'with_doubts' | 'not_found' | 'failed' | 'cancelled';
  source: BrowserPdfSource;
  sourcePageNumbers: number[];
  requestedMonster: string;
  outputs: PdfReaderOutput[];
  doubts: string[];
  failures: string[];
  calls: Array<Omit<PdfReaderModelResult, 'content'> & { pass: number; phase: 'reconstruct' }>;
  responses: Array<{ pass: number; content: string }>;
}
