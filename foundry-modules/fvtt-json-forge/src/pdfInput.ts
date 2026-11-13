import { extractBrowserPdfSource } from '@fvtt-json-generator/forge-browser-runtime/pdf-source';
import { readBrowserPdfMonster, renderPdfReadingMarkdown } from '@fvtt-json-generator/forge-browser-runtime/pdf-reader';
import type { BrowserPdfReading, PdfLayoutPage, PdfReaderModel, PdfReaderOutput } from '@fvtt-json-generator/forge-browser-runtime/pdf-types';
import type { BrowserAiProviderOptions } from '@fvtt-json-generator/forge-browser-runtime/ai';
import { requestIntakeProvider } from '@fvtt-json-generator/intake-ai/transport';
import { captureProviderResponse, failureEvidenceRecorder, sanitizeFailureReply } from '@fvtt-json-generator/intake-ai/provider-response-evidence';

export interface ForgePdfInputReceipt {
  version: 1;
  status: BrowserPdfReading['status'];
  sourceName: string;
  sourceSha256: string;
  engine: string;
  engineVersion: string;
  pageCount: number;
  requestedMonster: string;
  source: string;
  sourcePages: PdfLayoutPage[];
  outputs: PdfReaderOutput[];
  doubts: string[];
  failures: string[];
  calls: BrowserPdfReading['calls'];
  responses?: BrowserPdfReading['responses'];
}

export interface ForgePdfInputRequest {
  file: Pick<File, 'name' | 'arrayBuffer'>;
  monster: string;
  pages?: string;
  assetBaseUrl?: string;
}

export async function readForgePdfInput(request: ForgePdfInputRequest, options: BrowserAiProviderOptions,
  signal?: AbortSignal, onProgress?: (message: string) => void): Promise<ForgePdfInputReceipt> {
  const data = new Uint8Array(await request.file.arrayBuffer());
  signal?.throwIfAborted();
  const source = await extractBrowserPdfSource({ name: request.file.name, data }, {
    assetBaseUrl: request.assetBaseUrl ?? new URL('modules/fvtt-json-forge/vendor/pdfjs/', document.baseURI).href,
    signal, onProgress,
  });
  const pages = parsePdfPageSelection(request.pages ?? '', source.pageCount);
  const reading = await readBrowserPdfMonster({ source, monster: request.monster, pages, signal, onProgress },
    { model: createForgePdfReaderModel(options, source.sourceSha256, signal) });
  return createForgePdfInputReceipt(reading, [options.apiKey, options.baseUrl]);
}

export function createForgePdfInputReceipt(reading: BrowserPdfReading, forbidden: readonly string[]): ForgePdfInputReceipt {
  const source = reading.source;
  return {
    version: 1, status: reading.status, sourceName: source.sourceName, sourceSha256: source.sourceSha256,
    engine: source.engine, engineVersion: source.engineVersion, pageCount: source.pageCount,
    requestedMonster: reading.requestedMonster, source: renderPdfReadingMarkdown(reading),
    sourcePages: source.pages.filter(page => reading.sourcePageNumbers.includes(page.pageNumber)),
    outputs: reading.outputs, doubts: reading.doubts, failures: reading.failures, calls: reading.calls,
    responses: reading.responses.map(response => ({ ...response, content: sanitizeFailureReply(response.content, forbidden) })),
  };
}

export function parsePdfPageSelection(value: string, pageCount: number): number[] | undefined {
  if (!value.trim()) return;
  const selected = new Set<number>();
  for (const part of value.split(/[,，]/u)) {
    const match = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/u.exec(part);
    if (!match) throw new TypeError('PDF 页码请填写物理页码，如 258 或 72-73。');
    const start = Number(match[1]), end = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > pageCount) {
      throw new TypeError('PDF 物理页码范围无效。');
    }
    for (let page = start; page <= end; page++) selected.add(page);
  }
  return [...selected].sort((a, b) => a - b);
}

export function createForgePdfReaderModel(options: BrowserAiProviderOptions, sourceHash: string, signal?: AbortSignal): PdfReaderModel {
  let pass = 0;
  return { complete: async request => {
    pass++;
    const started = Date.now();
    const deadline = options.waitPolicy ? undefined : AbortSignal.timeout(options.timeoutMs ?? 600_000);
    const requestSignal = signal && deadline ? AbortSignal.any([signal, deadline]) : signal ?? deadline;
    // JSON-object and prompt-only providers do not receive the native schema.
    const systemPrompt = `${request.instruction}\n\nRequired JSON response schema:\n${JSON.stringify(request.schema)}`;
    const result = await requestIntakeProvider({
      baseUrl: options.baseUrl, apiKey: options.apiKey, model: options.model,
      systemPrompt, userContent: request.input, signal: requestSignal,
      protocol: options.protocol, authScheme: options.authScheme, reasoning: options.reasoning,
      structuredOutput: { mode: options.structuredOutput ?? 'json_object', name: 'forge_pdf_monster_reading', schema: request.schema },
      stream: options.protocol === 'openai-responses', deferContentParsing: true,
      waitPolicy: options.waitPolicy, onActivity: options.onActivity,
      onFailureEvidence: failureEvidenceRecorder(options.responseEvidence,
        { stage: 'extract', sourceHash, model: options.model, attempt: pass }, request, [options.apiKey, options.baseUrl]),
    });
    await captureProviderResponse(options.responseEvidence,
      { stage: 'extract', sourceHash, model: result.model, attempt: pass }, request, result.content, [options.apiKey, options.baseUrl]);
    return { content: result.content, model: result.model, elapsedMs: Date.now() - started };
  } };
}
