import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  defaultPaddleOcrScriptPath,
  defaultPdfScriptPath,
  defaultPdfRenderScriptPath,
  listTesseractLanguages,
  resolvePythonCommand,
  resolveTesseractCommand,
  runDocumentDoctor,
  runJsonScript,
  runCommand,
} from './doctor';
import type {
  DocumentEngine,
  DocumentExtractionOptions,
  DocumentExtractor,
  DocumentKind,
  DocumentLanguage,
  ExtractedDocument,
  ExtractedPage,
  ExtractedTextBlock,
  BoundingBox,
} from './types';

export function documentKindForPath(inputPath: string): DocumentKind {
  const extension = extname(inputPath).toLowerCase();
  if (extension === '.pdf') return 'pdf';
  if (extension === '.png' || extension === '.jpg' || extension === '.jpeg' || extension === '.webp') return 'image';
  throw new Error(`不支持的文档格式：${extension || '(无扩展名)'}。支持 PDF、PNG、JPG、JPEG、WebP。`);
}

export function isDocumentInputPath(inputPath: string): boolean {
  try {
    documentKindForPath(inputPath);
    return true;
  } catch {
    return false;
  }
}

export class NativePdfDocumentExtractor implements DocumentExtractor {
  async extract(inputPath: string, options: DocumentExtractionOptions = {}): Promise<ExtractedDocument> {
    if (documentKindForPath(inputPath) !== 'pdf') throw new Error('native engine 只处理 PDF 的内嵌文字层。');
    const scriptPath = defaultPdfScriptPath();
    if (!existsSync(scriptPath)) throw new Error(`找不到 PDF 提取脚本：${scriptPath}`);
    const parsed = runJsonScript(resolvePythonCommand(options.pythonPath), scriptPath, [inputPath]);
    return normalizeExtractedDocument(parsed, inputPath, 'pdf');
  }
}

export class PaddleOcrDocumentExtractor implements DocumentExtractor {
  async extract(inputPath: string, options: DocumentExtractionOptions = {}): Promise<ExtractedDocument> {
    if (documentKindForPath(inputPath) !== 'image') throw new Error('PaddleOCR 图片引擎只处理图片输入。');
    const scriptPath = defaultPaddleOcrScriptPath();
    if (!existsSync(scriptPath)) throw new Error(`找不到 PaddleOCR 脚本：${scriptPath}`);
    const doctor = runDocumentDoctor({ pythonPath: options.pythonPath, tesseractPath: options.tesseractPath });
    if (!doctor.paddleocr) {
      throw new Error(`PaddleOCR 不可用。请运行 document:doctor 检查本地环境；当前 Python=${doctor.pythonCommand}。`);
    }
    const parsed = runJsonScript(
      resolvePythonCommand(options.pythonPath),
      scriptPath,
      [inputPath, options.language ?? 'auto'],
      300_000,
    );
    const normalized = normalizeExtractedDocument(parsed, inputPath, 'image');
    return mergeEnglishPunctuationHints(normalized, inputPath, options);
  }
}

export class TesseractDocumentExtractor implements DocumentExtractor {
  async extract(inputPath: string, options: DocumentExtractionOptions = {}): Promise<ExtractedDocument> {
    if (documentKindForPath(inputPath) !== 'image') throw new Error('Tesseract 图片引擎只处理图片输入。');
    const command = resolveTesseractCommand(options.tesseractPath);
    const language = options.language ?? 'auto';
    const languages = listTesseractLanguages(command);
    const requested = language === 'en' ? ['eng'] : language === 'zh-CN' ? ['chi_sim'] : ['eng', 'chi_sim'];
    const missing = requested.filter((item) => !languages.includes(item));
    if (missing.length > 0) {
      throw new Error(`本地 Tesseract 缺少语言模型：${missing.join(', ')}。中文或混排图片请安装 PaddleOCR，或补齐 chi_sim。`);
    }
    const result = runCommand(command, [inputPath, 'stdout', '--psm', '6', '-l', requested.join('+'), 'tsv'], 300_000);
    if (!result.ok) throw new Error(`Tesseract OCR 失败：${result.error}`);
    return tesseractDocument(result.stdout, inputPath, language);
  }
}

export class AutoDocumentExtractor implements DocumentExtractor {
  private readonly native = new NativePdfDocumentExtractor();
  private readonly paddle = new PaddleOcrDocumentExtractor();
  private readonly tesseract = new TesseractDocumentExtractor();

  async extract(inputPath: string, options: DocumentExtractionOptions = {}): Promise<ExtractedDocument> {
    const kind = documentKindForPath(inputPath);
    if (kind === 'pdf') {
      if (options.engine === 'paddleocr') return this.extractPdfWithOcr(inputPath, options);
      const native = await this.native.extract(inputPath, options);
      const pagesNeedingOcr = native.pages.filter(isPdfPageLikelyNeedsOcr);
      if (pagesNeedingOcr.length === 0) return native;
      return this.mergePdfOcrFallback(native, inputPath, options, pagesNeedingOcr.map((page) => page.pageNumber));
    }
    const doctor = runDocumentDoctor({ pythonPath: options.pythonPath, tesseractPath: options.tesseractPath });
    if (doctor.paddleocr) return this.paddle.extract(inputPath, options);
    if (doctor.tesseract && (options.language === 'en' || doctor.tesseractLanguages.includes('chi_sim'))) {
      const extracted = await this.tesseract.extract(inputPath, options);
      extracted.warnings.push('PaddleOCR 未安装，本次 auto 模式使用 Tesseract 兼容后端；正式中英混排建议安装 PaddleOCR。');
      return extracted;
    }
    throw new Error(`图片 OCR 不可用：优先安装本地 PaddleOCR；document:doctor 报告为 ${doctor.warnings.join(' ')}`);
  }

  private async extractPdfWithOcr(inputPath: string, options: DocumentExtractionOptions): Promise<ExtractedDocument> {
    const native = await this.native.extract(inputPath, options);
    const pageNumbers = native.pages.map((page) => page.pageNumber);
    return this.mergePdfOcrFallback(native, inputPath, options, pageNumbers);
  }

  private async mergePdfOcrFallback(
    native: ExtractedDocument,
    inputPath: string,
    options: DocumentExtractionOptions,
    pageNumbers: number[],
  ): Promise<ExtractedDocument> {
    const doctor = runDocumentDoctor({ pythonPath: options.pythonPath, tesseractPath: options.tesseractPath });
    if (!doctor.pdfRendering) {
      throw new Error('PDF 页面需要 OCR，但本地 Python 缺少 pypdfium2 页面渲染能力；请运行 document:doctor 检查。');
    }
    if (!doctor.paddleocr) {
      throw new Error('PDF 页面需要 OCR，但 PaddleOCR 不可用；请运行 document:doctor 检查本地环境。');
    }

    const scratch = mkdtempSync(join(tmpdir(), 'fvtt-document-pdf-'));
    try {
      const ocrPages: ExtractedPage[] = [];
      for (const pageNumber of pageNumbers) {
        const imagePath = join(scratch, `page-${pageNumber}.png`);
        renderPdfPage(inputPath, pageNumber, imagePath, options.pythonPath);
        const pageDocument = await this.paddle.extract(imagePath, {
          ...options,
          language: options.language ?? 'auto',
        });
        const page = pageDocument.pages[0];
        if (!page) continue;
        ocrPages.push({
          ...page,
          pageNumber,
          blocks: page.blocks.map((block, index) => ({
            ...block,
            id: `p${pageNumber}-ocr-block${index + 1}`,
            pageNumber,
          })),
          warnings: [...page.warnings, `第 ${pageNumber} 页使用 PaddleOCR 页面兜底。`],
        });
      }
      const byPage = new Map(ocrPages.map((page) => [page.pageNumber, page]));
      const pages = native.pages.map((page) => byPage.get(page.pageNumber) ?? page);
      const blocks = pages.flatMap((page) => page.blocks);
      return {
        ...native,
        pages,
        blocks,
        warnings: [...native.warnings, `以下 PDF 页面没有可靠文字层，已使用 PaddleOCR 兜底：${pageNumbers.join(', ')}。`],
      };
    } finally {
      rmSync(scratch, { recursive: true });
    }
  }
}

export function createDefaultDocumentExtractor(): DocumentExtractor {
  return new AutoDocumentExtractor();
}

export function isPdfPageLikelyNeedsOcr(page: ExtractedPage): boolean {
  const text = page.blocks.map((block) => block.text).join('\n').trim();
  if (!text) return true;
  if (page.method === 'empty' || page.warnings.length > 0) return true;
  if (text.length < 120) return true;
  const useful = (text.match(/[A-Za-z\u3400-\u9fff\d]/gu) ?? []).length;
  return useful / text.length < 0.18;
}

function renderPdfPage(inputPath: string, pageNumber: number, outputPath: string, pythonPath?: string): void {
  const scriptPath = defaultPdfRenderScriptPath();
  if (!existsSync(scriptPath)) throw new Error(`找不到 PDF 页面渲染脚本：${scriptPath}`);
  const result = runCommand(
    resolvePythonCommand(pythonPath),
    [scriptPath, inputPath, String(pageNumber), outputPath],
    120_000,
  );
  if (!result.ok || !existsSync(outputPath)) {
    throw new Error(`PDF 第 ${pageNumber} 页渲染失败：${result.ok ? '没有生成 PNG' : result.error}`);
  }
}

function normalizeExtractedDocument(value: unknown, inputPath: string, kind: DocumentKind): ExtractedDocument {
  if (!value || typeof value !== 'object') throw new Error('本地文档处理程序返回了无效 JSON。');
  const raw = value as Partial<ExtractedDocument>;
  const pages = Array.isArray(raw.pages) ? raw.pages.map((page) => normalizePage(page)) : [];
  const blocks = pages.flatMap((page) => page.blocks);
  return {
    schemaVersion: 1,
    sourcePath: inputPath,
    fileName: basename(inputPath),
    kind,
    pageCount: pages.length,
    pages,
    blocks,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map(String) : [],
  };
}

function normalizePage(value: unknown): ExtractedPage {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<ExtractedPage>;
  const blocks = Array.isArray(raw.blocks) ? raw.blocks.map((block) => normalizeBlock(block)) : [];
  return {
    pageNumber: numberOr(raw.pageNumber, 1),
    width: numberOr(raw.width, 0),
    height: numberOr(raw.height, 0),
    blocks,
    method: raw.method === 'native-pdf-text' || raw.method === 'paddleocr' || raw.method === 'tesseract' ? raw.method : 'empty',
    confidence: numberOr(raw.confidence, blocks.length > 0 ? Math.max(...blocks.map((block) => block.confidence)) : 0),
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map(String) : [],
  };
}

function normalizeBlock(value: unknown): ExtractedTextBlock {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<ExtractedTextBlock>;
  const boxes = Array.isArray(raw.boxes) ? raw.boxes.map(normalizeBox) : [];
  return {
    id: String(raw.id ?? 'block-1'),
    pageNumber: numberOr(raw.pageNumber, 1),
    text: cleanOcrText(String(raw.text ?? '')),
    boxes,
    ...(Array.isArray(raw.words) ? { words: raw.words } : {}),
    method: raw.method === 'native-pdf-text' || raw.method === 'paddleocr' || raw.method === 'tesseract' ? raw.method : 'native-pdf-text',
    confidence: numberOr(raw.confidence, 0),
    language: raw.language === 'en' || raw.language === 'zh-CN' || raw.language === 'mixed' || raw.language === 'unknown' ? raw.language : 'unknown',
    ...(raw.bbox ? { bbox: normalizeBox(raw.bbox) } : boxes.length > 0 ? { bbox: boundingBox(boxes) } : {}),
  };
}

/**
 * PaddleOCR is the primary recognizer, but its mixed-language model can lose
 * punctuation inside an English proper name. Tesseract is used only as a
 * conservative hint source: a token is replaced when both recognizers agree
 * on the letters and the hint only adds an apostrophe. It never becomes the
 * primary OCR result and it cannot replace mechanical values.
 */
function mergeEnglishPunctuationHints(
  document: ExtractedDocument,
  inputPath: string,
  options: DocumentExtractionOptions,
): ExtractedDocument {
  const hint = runCommand(
    resolveTesseractCommand(options.tesseractPath),
    [inputPath, 'stdout', '--psm', '6', '-l', 'eng'],
    30_000,
  );
  if (!hint.ok) return document;
  const byLetters = englishHintMap(hint.stdout);
  if (byLetters.size === 0) return document;
  for (const page of document.pages) {
    for (const block of page.blocks) {
      block.text = cleanOcrText(replaceEnglishHints(block.text, byLetters));
      if (block.words) {
        for (const word of block.words) word.text = cleanOcrText(replaceEnglishHints(word.text, byLetters));
      }
    }
  }
  return document;
}

function replaceEnglishHints(text: string, hints: Map<string, string>): string {
  return text.replace(/[A-Za-z][A-Za-z'’]*/g, (value) => {
    if (value.includes("'") || value.includes('’')) return value;
    const normalized = normalizeEnglishLetters(value);
    const exact = hints.get(normalized);
    if (exact) return exact;
    if (normalized.length < 6) return value;
    for (const [key, replacement] of hints) {
      if (Math.abs(key.length - normalized.length) <= 1 && levenshteinAtMostOne(key, normalized)) {
        return replacement;
      }
    }
    return value;
  });
}

function englishHintMap(text: string): Map<string, string> {
  const tokens = [...text.matchAll(/[A-Za-z][A-Za-z'’-]*/g)]
    .map((match) => match[0]!.replace(/’/g, "'"));
  const result = new Map<string, string>();
  const add = (value: string) => {
    const key = normalizeEnglishLetters(value);
    if (key.length >= 6 && !result.has(key)) result.set(key, value);
  };
  for (let index = 0; index < tokens.length; index += 1) {
    add(tokens[index]!);
    if (index + 1 < tokens.length) add(`${tokens[index]} ${tokens[index + 1]}`);
  }
  return result;
}

function normalizeEnglishLetters(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

function levenshteinAtMostOne(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let edits = 0;
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  return edits + (left.length - leftIndex) + (right.length - rightIndex) <= 1;
}

export function cleanOcrText(text: string): string {
  return text
    .replace(/([\u3400-\u9fff])['’]([\u3400-\u9fff])/gu, '$1$2')
    .replace(/([\u3400-\u9fff])\((?=[\u3400-\u9fff])/gu, '$1（')
    .replace(/([\u3400-\u9fff])\)(?=[A-Za-z\u3400-\u9fff])/gu, '$1）')
    .replace(/[A-Za-z][A-Za-z'’\u2011-]*/gu, (value) => {
      const normalized = normalizeEnglishLetters(value);
      return COMMON_DND_OCR_TERMS.get(normalized) ?? value;
    });
}

// These are mechanical stat-block labels, not translated prose. Keep the map
// deliberately small and conservative: it repairs a high-frequency OCR typo
// without guessing at names, rules text, or numerical values.
const COMMON_DND_OCR_TERMS = new Map<string, string>([
  ['multiatiack', 'Multiattack'],
]);

function tesseractDocument(tsv: string, inputPath: string, language: DocumentLanguage): ExtractedDocument {
  const words: Array<{ text: string; box: BoundingBox; confidence: number }> = [];
  for (const line of tsv.split(/\r?\n/).slice(1)) {
    const fields = line.split('\t');
    if (fields.length < 12) continue;
    const text = fields[11]?.trim();
    const confidence = Number(fields[10]);
    if (!text || !Number.isFinite(confidence) || confidence < 0) continue;
    words.push({
      text,
      box: {
        x: Number(fields[6]) || 0,
        y: Number(fields[7]) || 0,
        width: Number(fields[8]) || 0,
        height: Number(fields[9]) || 0,
      },
      confidence: confidence / 100,
    });
  }
  const text = words.map((word) => word.text).join(' ');
  const block: ExtractedTextBlock = {
    id: 'p1-block1',
    pageNumber: 1,
    text,
    boxes: words.map((word) => word.box),
    words,
    method: 'tesseract',
    confidence: words.length > 0 ? words.reduce((sum, word) => sum + word.confidence, 0) / words.length : 0,
    language: language === 'auto' ? 'mixed' : language,
  };
  block.bbox = boundingBox(block.boxes);
  const page: ExtractedPage = {
    pageNumber: 1,
    width: block.bbox?.x + block.bbox.width || 0,
    height: block.bbox?.y + block.bbox.height || 0,
    blocks: [block],
    method: 'tesseract',
    confidence: block.confidence,
    warnings: [],
  };
  return {
    schemaVersion: 1,
    sourcePath: inputPath,
    fileName: basename(inputPath),
    kind: 'image',
    pageCount: 1,
    pages: [page],
    blocks: [block],
    warnings: [],
  };
}

function normalizeBox(value: unknown): BoundingBox {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<BoundingBox>;
  return {
    x: numberOr(raw.x, 0),
    y: numberOr(raw.y, 0),
    width: numberOr(raw.width, 0),
    height: numberOr(raw.height, 0),
  };
}

function boundingBox(boxes: BoundingBox[]): BoundingBox {
  if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  const x2 = Math.max(...boxes.map((box) => box.x + box.width));
  const y2 = Math.max(...boxes.map((box) => box.y + box.height));
  return { x, y, width: x2 - x, height: y2 - y };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
