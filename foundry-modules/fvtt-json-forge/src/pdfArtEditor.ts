import { TOKEN_CROP_PRESETS } from '@fvtt-json-generator/assets-icons/token-crop-candidates';
import { FORGE_ENCOUNTER_PACKAGE_MAX_ASSET_BYTES, hashEncounterBytes,
  type ForgeEncounterPackageAsset, type TokenFraming } from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import { cropPdfArt, renderPdfArtPage, type ArtRect, type PdfArtPage } from './pdfArt';

export interface PdfArtDraft {
  page: number;
  rect: ArtRect;
  framing: TokenFraming;
}

const APERTURE = 2 / 3;
const MIN_SCALE = 0.05;
const MAX_SCALE = 8;

export function frameToken(width: number, height: number, preset: keyof typeof TOKEN_CROP_PRESETS): TokenFraming {
  const crop = TOKEN_CROP_PRESETS[preset];
  const size = 'fit' in crop ? Math.max(width, height) : Math.min(crop.width * width, crop.height * height);
  const scale = APERTURE * Math.max(width, height) / size;
  return constrainFraming(width, height, {
    x: (0.5 - crop.left - crop.width / 2) * width / Math.max(width, height) * scale,
    y: (0.5 - crop.top - crop.height / 2) * height / Math.max(width, height) * scale,
    scale,
  });
}

export function constrainFraming(width: number, height: number, framing: TokenFraming): TokenFraming {
  const scale = clamp(framing.scale, MIN_SCALE, MAX_SCALE);
  const longest = Math.max(width, height);
  const xLimit = width / longest * scale / 2;
  const yLimit = height / longest * scale / 2;
  return { x: clamp(framing.x, -xLimit, xLimit), y: clamp(framing.y, -yLimit, yLimit), scale };
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(upper, Math.max(lower, value));
}

function paintToken(canvas: HTMLCanvasElement, portrait: CanvasImageSource, width: number, height: number, framing: TokenFraming): void {
  const context = canvas.getContext('2d')!;
  const size = canvas.width;
  context.clearRect(0, 0, size, size);
  const factor = size * framing.scale / Math.max(width, height);
  context.save();
  context.beginPath();
  context.arc(size / 2, size / 2, size * APERTURE / 2, 0, Math.PI * 2);
  context.clip();
  context.drawImage(portrait, size * (0.5 + framing.x) - width * factor / 2,
    size * (0.5 + framing.y) - height * factor / 2, width * factor, height * factor);
  context.restore();
}

interface RingFrame { frame: { x: number; y: number; w: number; h: number }; rotated?: boolean; trimmed?: boolean }
interface NativeRingData {
  ringName?: string;
  bkgName?: string;
  maskName?: string;
  colorBand?: { startRadius: number; endRadius: number };
  defaultRingColorLittleEndian?: number | null;
  defaultBackgroundColorLittleEndian?: number | null;
}

type RingPreview = HTMLCanvasElement;

export async function loadNativeRingPreview(config: {
  spritesheet: string;
  ringClass: { getRingDataBySize(size: number): NativeRingData };
}, gridSize: number): Promise<RingPreview> {
  const url = new URL(config.spritesheet, document.baseURI);
  const response = await fetch(url);
  if (!response.ok) throw new Error('原生圆环素材读取失败。');
  const atlas = await response.json() as { frames: Record<string, RingFrame>; meta: { image: string } };
  const data = config.ringClass.getRingDataBySize(gridSize);
  const ring = data.ringName && atlas.frames[data.ringName];
  const background = data.bkgName ? atlas.frames[data.bkgName] : undefined;
  const mask = data.maskName ? atlas.frames[data.maskName] : undefined;
  if (!ring || [ring, background, mask].some(frame => frame?.rotated || frame?.trimmed))
    throw new Error('当前圆环样式无法预览。');
  const image = new Image();
  image.src = new URL(atlas.meta.image, url).href;
  await image.decode();
  return composeRingPreview(image, ring, background, mask, data);
}

function composeRingPreview(image: HTMLImageElement, ring: RingFrame, background: RingFrame | undefined,
  mask: RingFrame | undefined, data: NativeRingData): RingPreview {
  const size = 512;
  const preview = document.createElement('canvas');
  preview.width = preview.height = size;
  const context = preview.getContext('2d', { willReadFrequently: true })!;
  const read = (frame: RingFrame) => {
    const { x, y, w, h } = frame.frame;
    context.clearRect(0, 0, size, size);
    context.drawImage(image, x, y, w, h, 0, 0, size, size);
    return context.getImageData(0, 0, size, size);
  };
  const bkgPixels = background && read(background);
  const maskPixels = mask && read(mask).data;
  const ringPixels = read(ring);
  const pixels = ringPixels.data;
  const ringTint = colorChannels(data.defaultRingColorLittleEndian);
  const bkgTint = colorChannels(data.defaultBackgroundColorLittleEndian);
  // The atlas contains a color band or a mask. Foundry recolors it in its shader;
  // drawing the raw atlas instead exposes placeholder pixels in the preview.
  for (let i = 0; i < pixels.length; i += 4) {
    const maskAlpha = (maskPixels?.[i + 3] ?? 0) / 255;
    const ringAlpha = pixels[i + 3]! / 255;
    const alpha = maskAlpha + ringAlpha * (1 - maskAlpha);
    const radius = data.colorBand && !maskPixels ? Math.hypot(
      (i / 4 % size + 0.5) * 2 / size - 1, (Math.floor(i / 4 / size) + 0.5) * 2 / size - 1,
    ) : 0;
    const recolor = data.colorBand && !maskPixels && radius >= data.colorBand.startRadius && radius < data.colorBand.endRadius;
    const red = pixels[i]!;
    for (let channel = 0; channel < 3; channel++) {
      const color = recolor ? red * ringTint[channel]! : pixels[i + channel]!;
      if (maskAlpha > 0) {
        const tint = maskPixels![i]! * ringTint[channel]!;
        pixels[i + channel] = (tint * maskAlpha + color * ringAlpha * (1 - maskAlpha)) / alpha;
      } else pixels[i + channel] = color;
      if (bkgPixels && bkgTint[channel] !== 1) {
        const bg = bkgPixels.data[i + channel]! / 255;
        const value = bkgTint[channel]!;
        bkgPixels.data[i + channel] = (bg < 0.5 ? 2 * bg * value : 1 - 2 * (1 - bg) * (1 - value)) * 255;
      }
    }
    pixels[i + 3] = alpha * 255;
  }
  context.clearRect(0, 0, size, size);
  if (!bkgPixels) context.putImageData(ringPixels, 0, 0);
  else {
    const overlay = document.createElement('canvas');
    overlay.width = overlay.height = size;
    overlay.getContext('2d')!.putImageData(ringPixels, 0, 0);
    context.putImageData(bkgPixels, 0, 0);
    context.drawImage(overlay, 0, 0);
  }
  return preview;
}

function colorChannels(littleEndian: number | null | undefined): number[] {
  const value = littleEndian ?? 0xffffff;
  return [value & 255, (value >> 8) & 255, (value >> 16) & 255].map(channel => channel / 255);
}

async function encodeCanvas(canvas: HTMLCanvasElement, preferLossless = false): Promise<Blob> {
  const encode = (type: string) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, 0.94));
  const lossless = preferLossless ? await encode('image/png') : null;
  if (lossless?.size && lossless.size <= FORGE_ENCOUNTER_PACKAGE_MAX_ASSET_BYTES) return lossless;
  const blob = await encode('image/webp');
  if (!blob?.size) throw new Error('无法导出图片。');
  if (blob.size > FORGE_ENCOUNTER_PACKAGE_MAX_ASSET_BYTES) throw new Error('图片超出 4 MiB，请缩小 PDF 选区。');
  return blob;
}

async function assetFromBlob(blob: Blob, role: string, actorKey: string, fields: ForgeEncounterPackageAsset['targets'][number]['fields'],
  tokenFraming?: TokenFraming): Promise<ForgeEncounterPackageAsset> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const hash = hashEncounterBytes(bytes);
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16384) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 16384)));
  const png = blob.type === 'image/png';
  return { key: `pdf-${role}-${hash.slice(0, 24)}`, fileName: `${role}.${png ? 'png' : 'webp'}`,
    mime: png ? 'image/png' : 'image/webp', sha256: hash, base64: btoa(chunks.join('')), targets: [{ actorKey, fields }],
    ...(tokenFraming ? { tokenFraming } : {}) };
}

export class PdfArtEditor {
  private page?: PdfArtPage;
  private pageNumber?: number;
  private portrait?: HTMLCanvasElement;
  private draft?: PdfArtDraft;
  private active?: AbortController;
  private ring?: RingPreview;
  private unmount?: AbortController;
  private editing = false;

  close(): void {
    this.active?.abort();
    this.unmount?.abort();
    this.page = undefined;
    this.pageNumber = undefined;
    this.portrait = undefined;
    this.draft = undefined;
    this.ring = undefined;
    this.editing = false;
  }

  mount(root: HTMLElement, options: {
    file: () => File | undefined;
    replaceFile: (file: File) => void;
    hash: string;
    pageCount: number;
    initialPage: number;
    actorKey: string;
    currentAssets: readonly ForgeEncounterPackageAsset[];
    pending: boolean;
    change: () => void;
    ring: () => Promise<RingPreview>;
    apply: (assets: ForgeEncounterPackageAsset[]) => Promise<void>;
  }): void {
    this.unmount?.abort();
    this.active?.abort();
    this.active = undefined;
    const view = this.unmount = new AbortController();
    const get = <T extends HTMLElement>(key: string) => root.querySelector<T>(`[data-art-${key}]`)!;
    const pageInput = get<HTMLInputElement>('number');
    const pageBox = get('page');
    const choices = get('choices');
    const status = get('status');
    const editor = get('editor');
    const portrait = get<HTMLCanvasElement>('portrait');
    const token = get<HTMLCanvasElement>('token');
    const zoom = get<HTMLInputElement>('zoom');
    const preset = get<HTMLSelectElement>('preset');
    const adopt = get<HTMLButtonElement>('apply');
    const adjustButton = get<HTMLButtonElement>('adjust');
    const portraitOnly = get<HTMLButtonElement>('portrait-only');
    const skip = get<HTMLButtonElement>('clear');
    const controls = get('controls');
    const decision = get('decision');
    const ringStatus = get('ring-status');
    const doc = root.ownerDocument;
    const layer = doc.createElement('canvas');
    layer.width = layer.height = 512;
    let rendering = false;
    let saving = false;
    let pending = options.pending;
    const savedPortrait = options.currentAssets.find(asset => asset.targets.some(target => target.fields.includes('img')));
    const savedToken = options.currentAssets.find(asset => asset.tokenFraming);

    const showDecision = () => {
      decision.textContent = pending ? '请确认是否采用当前 Token。'
        : savedToken ? '已采用此 Token。'
        : savedPortrait ? '已选择只用角色图。'
        : '已跳过配图。';
      adopt.disabled = saving || !pending && !!savedToken;
      adjustButton.disabled = saving;
      portraitOnly.disabled = saving || !pending && !!savedPortrait && !savedToken;
      skip.disabled = saving || !pending && !savedPortrait && !savedToken;
      controls.inert = saving;
    };
    const markPending = () => {
      if (pending) return;
      pending = true;
      showDecision();
      options.change();
    };
    const setEditing = (editing: boolean) => {
      this.editing = editing;
      controls.hidden = !editing;
      adjustButton.textContent = editing ? '收起构图' : '调整构图';
      adjustButton.setAttribute('aria-expanded', String(editing));
      token.toggleAttribute('data-editing', editing);
      token.tabIndex = editing ? 0 : -1;
      token.setAttribute('aria-label', editing ? 'Token 构图。拖动图片，或按方向键移动。' : 'Token 预览');
    };
    setEditing(this.editing);

    const paint = () => {
      if (!this.portrait || !this.draft || view.signal.aborted) return;
      const { width, height } = this.portrait;
      const context = token.getContext('2d')!;
      paintToken(layer, this.portrait, width, height, this.draft.framing);
      context.clearRect(0, 0, token.width, token.height);
      if (this.ring) context.drawImage(this.ring, 0, 0, token.width, token.height);
      context.drawImage(layer, 0, 0, token.width, token.height);
      zoom.value = String(Math.round(this.draft.framing.scale * 100));
    };
    const showPortrait = () => {
      if (!this.portrait || !this.draft || view.signal.aborted) return;
      const { width, height } = this.portrait;
      const scale = Math.min(1, 420 / Math.max(width, height));
      portrait.width = Math.max(1, Math.round(width * scale));
      portrait.height = Math.max(1, Math.round(height * scale));
      portrait.getContext('2d')!.drawImage(this.portrait, 0, 0, portrait.width, portrait.height);
      editor.hidden = false;
      showDecision();
      paint();
    };
    const select = (rect: ArtRect, original?: HTMLCanvasElement) => {
      if (!this.page || rendering || saving) return;
      this.portrait = original ?? cropPdfArt(this.page.canvas, rect);
      const initial = this.portrait.height > this.portrait.width * 1.35 ? 'upper' : 'full';
      this.draft = { page: this.pageNumber!, rect, framing: frameToken(this.portrait.width, this.portrait.height, initial) };
      preset.value = initial;
      status.textContent = original ? '已选 PDF 内嵌原图。' : '已选 PDF 页面区域。';
      markPending();
      showPortrait();
    };
    const displayPage = () => {
      if (!this.page) return;
      const page = this.page;
      const overlay = doc.createElement('span');
      overlay.className = 'forge-pdf-art-box';
      overlay.hidden = true;
      pageBox.replaceChildren(page.canvas, overlay);
      const position = (event: PointerEvent) => {
        const bounds = page.canvas.getBoundingClientRect();
        return { x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
          y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1) };
      };
      let anchor: ReturnType<typeof position> | undefined;
      let selected: ArtRect | undefined;
      page.canvas.onpointerdown = event => {
        if (event.button !== 0 || rendering || saving) return;
        anchor = position(event);
        selected = undefined;
        page.canvas.setPointerCapture(event.pointerId);
      };
      page.canvas.onpointermove = event => {
        if (!anchor) return;
        const end = position(event);
        selected = { x: Math.min(anchor.x, end.x), y: Math.min(anchor.y, end.y),
          width: Math.abs(anchor.x - end.x), height: Math.abs(anchor.y - end.y) };
        overlay.hidden = false;
        Object.assign(overlay.style, { left: `${selected.x * 100}%`, top: `${selected.y * 100}%`,
          width: `${selected.width * 100}%`, height: `${selected.height * 100}%` });
      };
      page.canvas.onpointerup = () => {
        anchor = undefined;
        if (selected && selected.width >= 0.01 && selected.height >= 0.01) {
          choices.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', 'false'));
          select(selected);
        } else overlay.hidden = true;
      };
      page.canvas.onpointercancel = () => { anchor = undefined; overlay.hidden = true; };
      choices.replaceChildren(...page.candidates.map(({rect, original}, index) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.setAttribute('aria-label', `选取插图 ${index + 1}`);
        button.setAttribute('aria-pressed', 'false');
        const thumb = doc.createElement('canvas');
        thumb.width = 112; thumb.height = 80;
        const src = original ?? cropPdfArt(page.canvas, rect);
        const ratio = Math.min(thumb.width / src.width, thumb.height / src.height);
        thumb.getContext('2d')!.drawImage(src, (thumb.width - src.width * ratio) / 2,
          (thumb.height - src.height * ratio) / 2, src.width * ratio, src.height * ratio);
        button.append(thumb);
        button.onclick = () => {
          for (const prior of choices.querySelectorAll('button')) prior.setAttribute('aria-pressed', String(prior === button));
          overlay.hidden = true;
          select(rect, original);
        };
        return button;
      }));
      status.textContent = page.candidates.length
        ? '选择一张插图，或在 PDF 页面上拖动框选。' : '这页没有找到单独的图片。可在页面上框选插图，或查看其他页。';
    };
    const readPage = async () => {
      const file = options.file();
      const pageNumber = pageInput.valueAsNumber;
      if (saving) return;
      if (!file) { status.textContent = '请重新选择原来的 PDF。'; return; }
      if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > options.pageCount) {
        status.textContent = `请输入 1–${options.pageCount} 之间的 PDF 页码。`; return;
      }
      this.active?.abort();
      const controller = this.active = new AbortController();
      rendering = true;
      status.textContent = `正在读取 PDF 第 ${pageNumber} 页…`;
      try {
        const page = await renderPdfArtPage(file, options.hash, pageNumber, controller.signal);
        if (controller.signal.aborted || view.signal.aborted) return;
        this.page = page;
        this.pageNumber = pageNumber;
        displayPage();
      } catch (error) {
        if (!controller.signal.aborted && !view.signal.aborted) status.textContent = `无法读取插图：${String((error as Error).message)}`;
      } finally {
        if (controller === this.active) { rendering = false; this.active = undefined; }
      }
    };
    const adjust = (next: TokenFraming) => {
      if (!this.draft || !this.portrait || saving) return;
      const frame = constrainFraming(this.portrait.width, this.portrait.height, next);
      const { x, y, scale } = this.draft.framing;
      if (x === frame.x && y === frame.y && scale === frame.scale) return;
      this.draft.framing = frame;
      paint();
      markPending();
    };
    let drag: { x: number; y: number; frame: TokenFraming } | undefined;
    token.onpointerdown = event => {
      if (!this.editing || !this.draft || saving || event.button !== 0) return;
      drag = { x: event.clientX, y: event.clientY, frame: { ...this.draft.framing } };
      token.setPointerCapture(event.pointerId);
    };
    token.onpointermove = event => {
      if (!drag) return;
      const size = token.getBoundingClientRect().width;
      adjust({ ...drag.frame, x: drag.frame.x + (event.clientX - drag.x) / size,
        y: drag.frame.y + (event.clientY - drag.y) / size });
    };
    token.onpointerup = token.onpointercancel = () => { drag = undefined; };
    token.onkeydown = event => {
      if (!this.editing || !this.draft || !(event.key in offsets)) return;
      event.preventDefault();
      const [x, y] = offsets[event.key]!;
      const step = event.shiftKey ? 0.05 : 0.01;
      const frame = this.draft.framing;
      adjust({ ...frame, x: frame.x + x * step, y: frame.y + y * step });
    };
    zoom.oninput = () => {
      if (!this.draft) return;
      const scale = Number(zoom.value) / 100, old = this.draft.framing, ratio = scale / old.scale;
      adjust({ x: old.x * ratio, y: old.y * ratio, scale });
    };
    const reset = () => {
      if (!this.portrait) return;
      adjust(frameToken(this.portrait.width, this.portrait.height, preset.value as keyof typeof TOKEN_CROP_PRESETS));
    };
    preset.onchange = reset;
    get<HTMLButtonElement>('reset').onclick = reset;
    get<HTMLButtonElement>('load').onclick = () => { void readPage(); };
    get<HTMLInputElement>('file').onchange = event => {
      const file = (event.currentTarget as HTMLInputElement).files?.[0];
      if (file) { options.replaceFile(file); void readPage(); }
    };
    adjustButton.onclick = () => {
      drag = undefined;
      setEditing(!this.editing);
      if (this.editing) token.focus();
    };
    const commit = async (choice: 'token' | 'portrait' | 'skip') => {
      if (!this.portrait || !this.draft || saving) return;
      const selected = this.portrait, framing = { ...this.draft.framing };
      const wasEditing = this.editing;
      markPending();
      saving = true;
      showDecision();
      decision.textContent = '正在保存配图选择…';
      try {
        const assets: ForgeEncounterPackageAsset[] = [];
        if (choice !== 'skip') {
          const portraitBlob = await encodeCanvas(selected, true);
          assets.push(await assetFromBlob(portraitBlob, 'portrait', options.actorKey, ['img']));
        }
        if (choice === 'token') {
          const tokenBlob = await encodeCanvas(layer);
          assets.push(await assetFromBlob(tokenBlob, 'token', options.actorKey,
            ['prototypeToken.texture.src', 'prototypeToken.ring.subject.texture'], framing));
        }
        if (!view.signal.aborted) {
          setEditing(false);
          await options.apply(assets);
        }
      } catch (error) {
        if (!view.signal.aborted) {
          setEditing(wasEditing);
          saving = false;
          showDecision();
          decision.textContent = `无法保存配图选择：${(error as Error).message}`;
          decision.focus();
        }
      } finally { saving = false; }
    };
    adopt.onclick = () => commit('token');
    portraitOnly.onclick = () => commit('portrait');
    skip.onclick = () => commit('skip');
    pageInput.value = String(this.pageNumber ?? this.draft?.page ?? options.initialPage);
    pageInput.max = String(options.pageCount);
    const open = () => {
      if (!root.hasAttribute('open')) return;
      if (!this.page && options.file() && !rendering) void readPage();
      if (!this.ring) void options.ring().then(ring => {
        if (!view.signal.aborted) { this.ring = ring; ringStatus.textContent = ''; paint(); }
      }).catch(() => {
        if (!view.signal.aborted) ringStatus.textContent = '当前世界的原生圆环暂时无法预览；导入后由 Foundry 显示。';
      });
    };
    root.ontoggle = open;
    if (this.page) displayPage();
    if (this.portrait) showPortrait();
    else {
      if (savedPortrait) {
        const image = doc.createElement('img');
        image.src = `data:${savedPortrait.mime};base64,${savedPortrait.base64}`;
        void image.decode().then(() => {
          if (view.signal.aborted || this.portrait) return;
          const canvas = doc.createElement('canvas');
          canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
          canvas.getContext('2d')!.drawImage(image, 0, 0);
          this.portrait = canvas;
          const initial = canvas.height > canvas.width * 1.35 ? 'upper' : 'full';
          preset.value = initial;
          this.draft = { page: options.initialPage, rect: { x: 0, y: 0, width: 1, height: 1 },
            framing: savedToken?.tokenFraming ?? frameToken(canvas.width, canvas.height, initial) };
          showPortrait();
        }).catch(() => { if (!view.signal.aborted) status.textContent = '已保存的角色图无法预览，请重新从 PDF 选图。'; });
      }
    }
    open();
  }
}

const offsets: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};
