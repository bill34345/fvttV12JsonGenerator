import { sha256 } from '@fvtt-json-generator/contracts/hash';
import type { ForgeItemResponse } from '@fvtt-json-generator/forge-gateway-protocol';
import { cropPdfArt, renderPdfArtPage, type ArtRect, type PdfArtPage } from './pdfArt';
import type { ForgeItemPdfInputReceipt } from './pdfInput';

export const DEFAULT_ITEM_ICON = 'icons/svg/item-bag.svg';
type IconChoice = { path: string; png?: Uint8Array };

/** Prefer one illustration wholly inside the item's own area, away from other entries. */
export function findItemPdfIllustration(page: ForgeItemPdfInputReceipt['artPages'][number], ids: readonly string[], candidates: readonly {rect: ArtRect}[]): number | undefined {
  const selected = new Set(ids);
  const lines = page.lines.filter(line => selected.has(line.id));
  if (lines.length < 2) return undefined;
  const left = Math.min(...lines.map(line => line.bbox.x)) / page.width;
  const right = Math.max(...lines.map(line => line.bbox.x + line.bbox.width)) / page.width;
  const top = Math.min(...lines.map(line => line.bbox.y)) / page.height;
  const bottom = Math.max(...lines.map(line => line.bbox.y + line.bbox.height)) / page.height;
  const boundary = page.lines.reduce((edge, { id, bbox }) => {
    const y = bbox.y / page.height;
    return !selected.has(id) && y >= bottom && bbox.x / page.width < right
      && (bbox.x + bbox.width) / page.width > left ? Math.min(edge, y) : edge;
  }, bottom + 0.14);
  const matches = candidates.flatMap(({ rect }, index) => {
    const { x, y, width, height } = rect;
    if (width > 0.58 || height > 0.55 || x < left - 0.025 || x + width > right + 0.06
      || y < top - 0.045 || y > bottom + 0.055 || y + height > boundary) return [];
    const includesOtherText = page.lines.some(({ id, bbox }) => !selected.has(id)
      && bbox.x / page.width < x + width && (bbox.x + bbox.width) / page.width > x
      && bbox.y / page.height < y + height && (bbox.y + bbox.height) / page.height > y);
    return includesOtherText ? [] : [index];
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export class ItemIconEditor {
  private choice?: IconChoice;
  private previewUrl?: string;
  private pdf?: { file: File; receipt: ForgeItemPdfInputReceipt };
  private page?: PdfArtPage;
  private pageNumber = 1;
  private controller?: AbortController;
  private panel?: HTMLElement;
  private initialPath = DEFAULT_ITEM_ICON;
  private locked = false;
  private status = '';
  private showingPdf = false;
  busy = false;

  reset(): void {
    this.controller?.abort();
    this.replace(undefined);
    this.pdf = undefined;
    this.page = undefined;
    this.pageNumber = 1;
    this.status = '';
    this.showingPdf = false;
    this.busy = false;
  }

  get selection(): IconChoice {
    return this.choice ?? { path: this.initialPath };
  }

  async preparePdf(file: File, receipt: ForgeItemPdfInputReceipt, signal: AbortSignal): Promise<void> {
    this.pdf = { file, receipt };
    const [page] = receipt.artPages;
    if (!page) return;
    this.pageNumber = page.pageNumber;
    try {
      const art = await renderPdfArtPage(file, receipt.sourceSha256, page.pageNumber, signal);
      signal.throwIfAborted();
      this.page = art;
      const index = receipt.artPages.length === 1 ? findItemPdfIllustration(page, receipt.sourceLineIds, art.candidates) : undefined;
      if (index !== undefined) {
        const { rect, original } = art.candidates[index]!;
        await this.selectImage(original ?? cropPdfArt(art.canvas, rect), signal, '已从 PDF 预选插图。');
      }
    } catch (error) {
      if (!signal.aborted) this.status = `PDF 插图读取失败：${messageOf(error)}`;
    }
  }

  mount(panel: HTMLElement | null, response: ForgeItemResponse | undefined, locked: boolean, foundry: any, changed: () => void): void {
    if (!panel) return;
    const result = response && 'result' in response && response.result.status === 'accepted' ? response.result : undefined;
    panel.hidden = !result;
    if (!result) return;
    this.locked = locked;
    const authoredArt = result.iconReview?.entries.some(entry => entry.itemName === result.itemDocument.name
      && (entry.source === 'existing' || entry.source === 'override') && entry.selectedPath === result.artifact.img);
    this.initialPath = authoredArt ? String(result.artifact.img) : DEFAULT_ITEM_ICON;
    if (panel !== this.panel) {
      this.panel = panel;
      panel.innerHTML = `<h4>物品图标</h4>
        <div class="forge-item-icon-row">
          <img data-icon-image alt="物品图标预览">
          <div class="forge-item-icon-actions">
            <label>上传图片 <input type="file" data-icon-file accept="image/png,image/jpeg,image/webp"></label>
            <button type="button" data-icon-library>从图库选择</button>
            <button type="button" data-icon-pdf>从 PDF 选图</button>
            <button type="button" data-icon-default>使用默认图标</button>
          </div>
        </div>
        <div data-icon-pdf-controls hidden>
          <label>PDF 页码 <input type="number" min="1" data-icon-page-number></label>
          <div data-icon-pdf-choices></div>
          <div class="forge-item-icon-page" data-icon-page></div>
        </div>
        <p data-icon-status role="status" aria-live="polite"></p>`;
    }
    const get = <T extends HTMLElement>(key: string) => panel.querySelector<T>(`[data-icon-${key}]`)!;
    const fileInput = get<HTMLInputElement>('file');
    const Picker = foundry?.applications?.apps?.FilePicker?.implementation;
    const update = () => {
      get<HTMLImageElement>('image').src = this.previewUrl ?? this.selection.path;
      get('status').textContent = this.status;
      get<HTMLButtonElement>('pdf').hidden = !this.pdf;
      get('pdf-controls').hidden = !this.showingPdf;
      for (const control of panel.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button')) control.disabled = this.locked;
      get<HTMLButtonElement>('library').hidden = typeof Picker !== 'function';
    };
    const notifyChange = () => { update(); changed(); };
    const run = async (operation: (signal: AbortSignal) => Promise<void>) => {
      this.controller?.abort();
      const current = this.controller = new AbortController();
      this.busy = true;
      changed();
      try { await operation(current.signal); }
      catch (error) { if (!current.signal.aborted) this.status = messageOf(error); }
      finally { if (this.controller === current) this.busy = false; }
      if (!current.signal.aborted) notifyChange();
    };
    fileInput.onchange = () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file || this.locked) return;
      void run(async signal => {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 12_000_000) {
          throw new Error('请选 12 MB 以下的 PNG、JPEG 或 WebP 图片。');
        }
        const image = await createImageBitmap(file);
        try { await this.selectImage(image, signal, '已选上传图片。'); }
        finally { image.close(); }
      });
    };
    get<HTMLButtonElement>('library').onclick = () => {
      const panelAtOpen = this.panel;
      const previous = this.choice;
      this.controller?.abort();
      const controller = this.controller = new AbortController();
      this.busy = false;
      try {
        const picker = new Picker({ type: 'image', current: this.selection.path, callback: (path: string) => {
          if (controller.signal.aborted || this.panel !== panelAtOpen || this.locked || this.choice !== previous || !path) return;
          this.replace({ path });
          this.status = '已选 Foundry 图库图片。';
          notifyChange();
        } });
        void picker.browse().catch((error: unknown) => {
          if (controller.signal.aborted) return;
          this.status = messageOf(error);
          update();
        });
      } catch (error) { this.status = messageOf(error); update(); }
    };
    get<HTMLButtonElement>('default').onclick = () => {
      this.controller?.abort();
      this.busy = false;
      this.replace({ path: DEFAULT_ITEM_ICON });
      this.status = '已使用默认图标。';
      notifyChange();
    };
    const pageInput = get<HTMLInputElement>('page-number');
    const renderPage = () => {
      const art = this.page;
      const pageBox = get('page');
      const choices = get('pdf-choices');
      choices.replaceChildren();
      pageBox.replaceChildren();
      if (!art) return;
      pageBox.append(art.canvas);
      for (const [index, { rect, original }] of art.candidates.entries()) {
        const button = panel.ownerDocument.createElement('button');
        button.type = 'button';
        button.className = 'forge-item-pdf-candidate';
        button.textContent = String(index + 1);
        button.setAttribute('aria-label', `采用插图 ${index + 1}`);
        button.style.left = `${rect.x * 100}%`;
        button.style.top = `${rect.y * 100}%`;
        button.onclick = () => void run(signal => this.selectImage(original ?? cropPdfArt(art.canvas, rect), signal, '已选 PDF 插图。'));
        pageBox.append(button);
      }
      choices.textContent = '点击编号选图，也可以在页面上拖出裁切框。';
      const point = (event: PointerEvent) => {
        const bounds = art.canvas.getBoundingClientRect();
        return { x: Math.min(1, Math.max(0, (event.clientX - bounds.x) / bounds.width)),
          y: Math.min(1, Math.max(0, (event.clientY - bounds.y) / bounds.height)) };
      };
      const cropBox = panel.ownerDocument.createElement('div');
      cropBox.className = 'forge-item-pdf-crop';
      cropBox.hidden = true;
      pageBox.append(cropBox);
      let start: ReturnType<typeof point> | undefined;
      const region = (from: NonNullable<typeof start>, to: NonNullable<typeof start>) => ({
        x: Math.min(from.x, to.x), y: Math.min(from.y, to.y),
        width: Math.abs(from.x - to.x), height: Math.abs(from.y - to.y),
      });
      art.canvas.onpointerdown = event => {
        if (this.locked || event.button !== 0) return;
        start = point(event);
        art.canvas.setPointerCapture(event.pointerId);
      };
      art.canvas.onpointermove = event => {
        if (!start || this.locked) return;
        const rect = region(start, point(event));
        Object.assign(cropBox.style, { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`,
          width: `${rect.width * 100}%`, height: `${rect.height * 100}%` });
        cropBox.hidden = false;
      };
      art.canvas.onpointercancel = () => { start = undefined; cropBox.hidden = true; };
      art.canvas.onpointerup = event => {
        if (!start || this.locked) return;
        const rect = region(start, point(event));
        start = undefined;
        cropBox.hidden = true;
        if (rect.width >= 0.01 && rect.height >= 0.01) {
          void run(signal => this.selectImage(cropPdfArt(art.canvas, rect), signal, '已采用 PDF 框选区域。'));
        }
      };
    };
    const openPage = (page: number) => {
      const pdf = this.pdf;
      if (!pdf || this.locked) return;
      if (!Number.isInteger(page) || page < 1 || page > pdf.receipt.pageCount) { this.status = 'PDF 页码无效。'; update(); return; }
      this.showingPdf = true;
      pageInput.max = String(pdf.receipt.pageCount);
      pageInput.value = String(page);
      if (this.page && this.pageNumber === page) { renderPage(); update(); return; }
      void run(async signal => {
        const art = await renderPdfArtPage(pdf.file, pdf.receipt.sourceSha256, page, signal);
        signal.throwIfAborted();
        this.page = art;
        this.pageNumber = page;
        renderPage();
      });
    };
    get<HTMLButtonElement>('pdf').onclick = () => {
      if (this.showingPdf) { this.showingPdf = false; update(); }
      else openPage(this.pageNumber);
    };
    pageInput.onchange = () => openPage(Number(pageInput.value));
    if (this.showingPdf && this.page && !get('page').contains(this.page.canvas)) renderPage();
    update();
  }

  private replace(choice?: IconChoice, blob?: Blob): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.choice = choice;
    this.previewUrl = blob ? URL.createObjectURL(blob) : undefined;
  }

  private async selectImage(image: ImageBitmap | HTMLCanvasElement, signal: AbortSignal, status: string): Promise<void> {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 512 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value
      ? resolve(value) : reject(new Error('无法读取物品图标。')), 'image/png'));
    const png = new Uint8Array(await blob.arrayBuffer());
    signal.throwIfAborted();
    this.replace({ path: `fvtt-json-forge/items/${sha256(png)}.png`, png }, blob);
    this.status = status;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
