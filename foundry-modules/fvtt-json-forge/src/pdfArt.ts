import { sha256 } from '@fvtt-json-generator/contracts/hash';
import { FORGE_PDF_ENGINE_VERSION } from '@fvtt-json-generator/forge-browser-runtime/pdf-types';
import type { PdfJsArtEngine } from '@fvtt-json-generator/forge-browser-runtime/pdf-source';

export interface ArtRect { x: number; y: number; width: number; height: number }

export interface ArtCandidate { rect: ArtRect; original?: HTMLCanvasElement }

export interface PdfArtPage {
  canvas: HTMLCanvasElement;
  candidates: ArtCandidate[];
}

export async function renderPdfArtPage(file: File, expectedHash: string, pageNumber: number, signal: AbortSignal): Promise<PdfArtPage> {
  const data = new Uint8Array(await file.arrayBuffer());
  signal.throwIfAborted();
  if (sha256(data) !== expectedHash) throw new Error('请选择生成这批生物时使用的同一份 PDF。');
  const base = new URL('modules/fvtt-json-forge/vendor/pdfjs/', document.baseURI);
  const engine: PdfJsArtEngine = await import(new URL('pdf.mjs', base).href);
  if (engine.version !== FORGE_PDF_ENGINE_VERSION) throw new Error('PDF 组件版本不一致。');
  signal.throwIfAborted();
  engine.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.mjs', base).href;
  const loading = engine.getDocument({
    data, cMapUrl: new URL('cmaps/', base).href, cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', base).href, wasmUrl: new URL('wasm/', base).href,
    useWasm: false, useWorkerFetch: true, isImageDecoderSupported: false, maxImageSize: 40_000_000,
  });
  let destruction: Promise<void> | undefined;
  const destroy = () => destruction ??= loading.destroy();
  const abort = () => { void destroy().catch(() => undefined); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    const pdf = await loading.promise;
    signal.throwIfAborted();
    const page = await pdf.getPage(pageNumber);
    const dimensions = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(3, 2400 / Math.max(dimensions.width, dimensions.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const operators = await page.getOperatorList({ annotationMode: 0 });
    const render = page.render({
      canvas, viewport, recordImages: true, annotationMode: 0, background: 'rgba(0,0,0,0)',
    });
    await render.promise;
    signal.throwIfAborted();
    const coordinates: ArrayLike<number> = page.imageCoordinates ?? [];
    const boxes = illustrationRects(coordinates);
    const imageOps = operators.fnArray.flatMap((op, i) =>
      op === engine.OPS.paintImageXObject || op === engine.OPS.paintInlineImageXObject ? [operators.argsArray[i]!] : []);
    // Repeated or grouped inline drawing does not have a reliable one-to-one mapping.
    const canMatch = imageOps.length * 6 === coordinates.length &&
      !operators.fnArray.some(op => op === engine.OPS.paintImageXObjectRepeat || op === engine.OPS.paintInlineImageXObjectGroup);
    return { canvas, candidates: boxes.map(({ rect, index }) => {
      const reference = canMatch ? imageOps[index]?.[0] : undefined;
      const cache = typeof reference === 'string' && (reference.startsWith('g_') ? page.commonObjs : page.objs);
      const decoded = cache ? (cache.has(reference) ? cache.get(reference) : undefined) : reference;
      const original = decoded ? decodedIllustration(decoded, engine.ImageKind, rect, viewport) : undefined;
      return { rect, original };
    }) };
  } finally {
    signal.removeEventListener('abort', abort);
    await destroy();
  }
}

// The locked engine records three transformed corners, in page-relative coordinates.
export function illustrationRects(coordinates: ArrayLike<number>): Array<{rect: ArtRect; index: number}> {
  const result: Array<{rect: ArtRect; index: number}> = [];
  for (let i = 0; i + 5 < coordinates.length; i += 6) {
    const [ax, ay, bx, by, cx, cy] = Array.from({length: 6}, (_, j) => coordinates[i + j]!);
    const xs = [ax!, bx!, cx!, bx! + cx! - ax!], ys = [ay!, by!, cy!, by! + cy! - ay!];
    const x = Math.max(0, Math.min(...xs)), y = Math.max(0, Math.min(...ys));
    const width = Math.min(1, Math.max(...xs)) - x, height = Math.min(1, Math.max(...ys)) - y;
    const isPageEdge = (width > 0.94 && height < 0.065) || (height > 0.94 && width < 0.065);
    if (!isPageEdge && width >= 0.04 && height >= 0.04 && width * height >= 0.006 && width * height < 0.96)
      result.push({ rect: { x, y, width, height }, index: i / 6 });
  }
  return result.sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height).slice(0, 16);
}

function decodedIllustration(decoded: {
  width?: number; height?: number; data?: Uint8Array | null; kind?: number; bitmap?: ImageBitmap;
}, kinds: PdfJsArtEngine['ImageKind'], rect: ArtRect, viewport: {width: number; height: number}): HTMLCanvasElement | undefined {
  const { width, height, data, kind, bitmap } = decoded;
  if (!width || !height || (!data && !bitmap) || width * height > 8_000_000) return;
  const displayedAspect = rect.width * viewport.width / (rect.height * viewport.height);
  if (Math.abs(Math.log(displayedAspect / (width / height))) > 0.08) return;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  // Browser PDF.js can transfer decoded transparent images as an ImageBitmap.
  if (bitmap) {
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas;
  }
  if (!data) return;
  const pixels = context.createImageData(width, height);
  if (kind === kinds.RGBA_32BPP && data.length === pixels.data.length) pixels.data.set(data);
  else if (kind === kinds.RGB_24BPP && data.length === width * height * 3) {
    for (let read = 0, write = 0; read < data.length; read += 3, write += 4) {
      pixels.data[write] = data[read]!;
      pixels.data[write + 1] = data[read + 1]!;
      pixels.data[write + 2] = data[read + 2]!;
      pixels.data[write + 3] = 255;
    }
  } else return;
  context.putImageData(pixels, 0, 0);
  return canvas;
}

export function cropPdfArt(canvas: HTMLCanvasElement, rect: ArtRect): HTMLCanvasElement {
  const result = canvas.ownerDocument.createElement('canvas');
  result.width = Math.max(1, Math.round(rect.width * canvas.width));
  result.height = Math.max(1, Math.round(rect.height * canvas.height));
  result.getContext('2d')!.drawImage(canvas, rect.x * canvas.width, rect.y * canvas.height,
    rect.width * canvas.width, rect.height * canvas.height, 0, 0, result.width, result.height);
  return result;
}
