import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';
import { escapeHtml } from './itemPreview';

type ReadingPane = 'source' | 'preview';
type SourceLanguage = 'zh' | 'en';

const chapters = [
  { key: 'top', label: '概览' },
  { key: 'traits', label: '特性', heading: /^(?:traits|特性)$/iu },
  { key: 'actions', label: '动作', heading: /^(?:actions|动作)$/iu },
  { key: 'bonus', label: '附赠动作', heading: /^(?:bonus actions|附赠动作)$/iu },
  { key: 'reactions', label: '反应', heading: /^(?:reactions|反应)$/iu },
  { key: 'legendary', label: '传奇动作', heading: /^(?:legendary actions|传奇动作)$/iu },
  { key: 'lair', label: '巢穴动作', heading: /^(?:lair actions|巢穴动作)$/iu },
] as const;

type MarkdownConverter = { makeHtml(source: string): string };
type FoundryMarkdown = { Converter: new(options: Record<string, boolean>) => MarkdownConverter };
let markdown: MarkdownConverter | undefined;

const readingTags = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 's', 'del',
  'blockquote', 'ul', 'ol', 'li', 'pre', 'code', 'hr', 'br',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
]);

export function reviewDocument(value: string, showCodeBlocks = true): string {
  const showdown = (globalThis as { showdown?: FoundryMarkdown }).showdown;
  if (!markdown && showdown) {
    markdown = new showdown.Converter({
      tables: true, noHeaderId: true, simpleLineBreaks: true, strikethrough: true,
      disableForced4SpacesIndentedSublists: true, literalMidWordUnderscores: true,
    });
  }
  if (!markdown) {
    const formatted = /^[ \t]*(?:#{1,6}\s|`{3,}|~{3,})|\*\*|__/mu.test(value);
    return showCodeBlocks || !formatted ? plainReviewDocument(value) : '';
  }
  const fragment = parseFragment(markdown.makeHtml(value));
  const prose = fragment.childNodes.map(node => renderReadingNode(node, showCodeBlocks)).join('').trim();
  return prose ? `<div class="forge-reader-prose">${prose}</div>` : '';
}

const documentSourceValues = new WeakMap<HTMLElement, string>();
const leadingFrontmatter = /^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/u;

export function renderDocumentSource(root: HTMLElement, source: string): void {
  const reading = root.querySelector<HTMLElement>('[data-document-source]');
  if (!reading || documentSourceValues.get(reading) === source) return;
  documentSourceValues.set(reading, source);
  reading.hidden = !source.trim();
  if (reading.hidden) {
    reading.replaceChildren();
    return;
  }

  reading.innerHTML = readableSourceDocument(source)
    || '<p class="forge-card-status">规则内容可在右侧预览中查看。</p>';
}

export function readableSourceDocument(source: string): string {
  const body = source.trim().replace(leadingFrontmatter, '').trim();
  if (!body || looksLikeJsonDocument(body)) return '';
  return reviewDocument(body, false);
}

export function closeDocumentSourceEditor(root: HTMLElement): void {
  const editor = root.querySelector<HTMLDetailsElement>('[data-document-source-editor]');
  if (editor) editor.open = false;
}

function looksLikeJsonDocument(body: string): boolean {
  return /^(?:\{\s*"|\[\s*\{)/u.test(body);
}

function readingChapter(title: string): string | undefined {
  const text = title.trim().replace(/[:：]$/u, '').replace(/\s*[(（][A-Za-z ]+[)）]$/u, '');
  return chapters.find(entry => 'heading' in entry && entry.heading.test(text))?.key;
}

function readingText(node: DefaultTreeAdapterTypes.ChildNode): string {
  if (node.nodeName === '#text' && 'value' in node) return node.value;
  return 'childNodes' in node ? node.childNodes.map(readingText).join('') : '';
}

function renderReadingNode(node: DefaultTreeAdapterTypes.ChildNode, showCodeBlocks: boolean): string {
  if (node.nodeName === '#text' && 'value' in node) return escapeHtml(node.value);
  if (!('tagName' in node)) return '';
  const tag = node.tagName;
  if (!showCodeBlocks && tag === 'pre') return '';
  if (['script', 'style', 'iframe', 'object', 'embed', 'template'].includes(tag)) return '';
  if (tag === 'img') return escapeHtml(node.attrs.find(attribute => attribute.name === 'alt')?.value ?? '');
  const body = node.childNodes.map(child => renderReadingNode(child, showCodeBlocks)).join('');
  if (tag === 'a') {
    const href = node.attrs.find(attribute => attribute.name === 'href')?.value ?? '';
    return /^https?:\/\//iu.test(href)
      ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${body}</a>`
      : body;
  }
  if (!readingTags.has(tag)) return body;
  if (tag === 'br' || tag === 'hr') return `<${tag}>`;
  const firstBreak = node.childNodes.findIndex(child => child.nodeName === 'br');
  const heading = tag === 'p' && firstBreak >= 0 ? node.childNodes.slice(0, firstBreak) : node.childNodes;
  const chapter = /^(?:h[1-6]|p)$/u.test(tag) ? readingChapter(heading.map(readingText).join('')) : undefined;
  const anchor = chapter ? ` data-reader-chapter="${chapter}"` : '';
  const firstNumber = tag === 'ol' ? node.attrs.find(attribute => attribute.name === 'start')?.value : undefined;
  const listStart = firstNumber && /^-?\d+$/u.test(firstNumber) ? ` start="${firstNumber}"` : '';
  const html = `<${tag}${anchor}${listStart}>${body}</${tag}>`;
  return tag === 'table' ? `<div class="forge-reader-table">${html}</div>` : html;
}

function plainReviewDocument(value: string): string {
  let chapter: string = 'top';
  let start = 0;
  let offset = 0;
  const blocks: string[] = [];
  const add = (end: number) => blocks.push(`<pre data-reader-chapter="${chapter}">${escapeHtml(value.slice(start, end))}</pre>`);
  for (const line of value.split(/(?<=\n)/u)) {
    const title = line.trim().replace(/^#{1,6}\s+|^\*\*|\*\*$/gu, '');
    const heading = readingChapter(title);
    if (heading) {
      add(offset);
      start = offset;
      chapter = heading;
    }
    offset += line.length;
  }
  add(value.length);
  return blocks.join('');
}

function sourceLanguage(source: string): SourceLanguage {
  const prose = source.replace(/\b\d+d\d+\b/giu, '');
  const han = prose.match(/\p{Script=Han}/gu)?.length ?? 0;
  const words = prose.match(/\b[A-Za-z]{2,}\b/gu)?.length ?? 0;
  return han > 0 && han >= words / 2 ? 'zh' : 'en';
}

type ReaderContent = {
  key: string;
  source: string;
  canonical?: string;
  preview?: string;
  sourceLabel?: string;
  previewLabel?: string;
  readingOnly?: boolean;
};

export class IntakeReviewReader {
  private key?: string;
  private pane: ReadingPane = 'preview';
  private language?: SourceLanguage;
  private markup = '';

  mount(host: HTMLElement | null, content: ReaderContent): void {
    if (!host) return;
    const changed = this.key !== content.key;
    if (changed) {
      this.key = content.key;
      this.pane = content.preview === undefined ? 'source' : 'preview';
      this.language = undefined;
      this.markup = '';
    }
    const originalLanguage = sourceLanguage(content.source);
    const english = originalLanguage === 'en' ? content.source : '';
    const chinese = originalLanguage === 'zh' ? content.source :
      content.canonical && sourceLanguage(content.canonical) === 'zh' ? content.canonical : '';
    const language = this.language ?? (chinese ? 'zh' : originalLanguage);
    const paired = content.preview !== undefined;
    const sourceLabel = escapeHtml(content.sourceLabel ?? '原文');
    const previewLabel = escapeHtml(content.previewLabel ?? '生成预览');
    const renderSource = (source: string) => content.readingOnly
      ? readableSourceDocument(source) || '<p>这份资料没有可直接阅读的规则正文。</p>'
      : reviewDocument(source);
    host.dataset.sourceOnly = String(!paired);
    const markup = `
      <div class="forge-reader-toolbar">
        <div class="forge-reader-source-controls">
          <strong class="forge-reader-source-label-wide">${sourceLabel}</strong>
          ${paired ? `<div class="forge-reader-switch" role="group" aria-label="核对栏">
            <button type="button" data-reader-pane="source">${sourceLabel}</button>
            <button type="button" data-reader-pane="preview">${previewLabel}</button>
          </div>` : ''}
          <div class="forge-reader-languages" role="group" aria-label="原文语言">
            <button type="button" data-reader-language="zh" ${chinese ? '' : 'disabled'}>中文</button>
            <button type="button" data-reader-language="en" ${english ? '' : 'disabled'}>English</button>
          </div>
          <details class="forge-reader-chapter-menu">
            <summary>章节</summary>
            <nav class="forge-reader-chapters" aria-label="全文章节"><button type="button" data-reader-jump="top">全文开头</button></nav>
          </details>
        </div>
        ${paired ? `<strong class="forge-reader-preview-label">${previewLabel}</strong>` : ''}
      </div>
      <div class="forge-reader-columns">
        <section data-reader-column="source" aria-label="${sourceLabel}">
          ${chinese ? `<div class="forge-reader-scroll" data-reader-document="zh" tabindex="0" aria-label="${originalLanguage === 'zh' ? '中文原文' : '中文整理稿'}">
            ${originalLanguage === 'en' ? '<p class="forge-reader-source-label">中文整理稿 · 英文原文可切换查看</p>' : ''}
            ${renderSource(chinese)}</div>` : ''}
          ${english ? `<div class="forge-reader-scroll" data-reader-document="en" tabindex="0" aria-label="英文原文">${renderSource(english)}</div>` : ''}
          ${!chinese && !english ? '<p>没有保存原文。</p>' : ''}
        </section>
        ${paired ? `<section data-reader-column="preview" aria-label="${previewLabel}">
          <div class="forge-reader-scroll" data-reader-document="preview" tabindex="0" aria-label="${previewLabel}">${content.preview}</div>
        </section>` : ''}
      </div>`;
    if (this.markup === markup && host.firstElementChild) return;
    const positions = new Map((changed ? [] : [...host.querySelectorAll<HTMLElement>('[data-reader-document]')])
      .map(element => [element.dataset.readerDocument, element.scrollTop]));
    host.innerHTML = markup;
    this.markup = markup;
    const documents = [...host.querySelectorAll<HTMLElement>('[data-reader-document]')];
    const sync = () => {
      host.dataset.activePane = this.pane;
      const selectedLanguage = this.language ?? language;
      for (const element of documents) {
        element.hidden = element.dataset.readerDocument !== 'preview' && element.dataset.readerDocument !== selectedLanguage;
      }
      for (const element of host.querySelectorAll<HTMLButtonElement>('[data-reader-pane], [data-reader-language]')) {
        element.setAttribute('aria-pressed', String(element.dataset.readerPane === this.pane || element.dataset.readerLanguage === selectedLanguage));
      }
    };
    const anchors = (element: HTMLElement, chapter: string) =>
      element.querySelector<HTMLElement>(`[data-reader-chapter="${chapter}"], [data-section="${chapter}"]`);
    const scrollToChapter = (element: HTMLElement, chapter: string) => {
      if (chapter === 'top') { element.scrollTop = 0; return; }
      const anchor = anchors(element, chapter);
      if (anchor && element.clientHeight) element.scrollTop += anchor.getBoundingClientRect().top - element.getBoundingClientRect().top - 8;
    };
    let pending = new Map<HTMLElement, string>();
    for (const chapter of chapters.slice(1)) {
      if (!documents.some(element => anchors(element, chapter.key))) continue;
      host.querySelector('.forge-reader-chapters')?.insertAdjacentHTML('beforeend',
        `<button type="button" data-reader-jump="${chapter.key}">${chapter.label}</button>`);
    }
    sync();
    for (const element of documents) element.scrollTop = positions.get(element.dataset.readerDocument) ?? 0;
    host.onclick = event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button');
      if (!button) return;
      const { readerPane, readerLanguage, readerJump } = button.dataset;
      if (readerPane) this.pane = readerPane as ReadingPane;
      if (readerLanguage) this.language = readerLanguage as SourceLanguage;
      if (readerJump) {
        pending = new Map(documents.map(element => [element, readerJump]));
        const menu = button.closest('details');
        if (menu) {
          menu.open = false;
          menu.querySelector('summary')?.focus({ preventScroll: true });
        }
      }
      sync();
      for (const [element, chapter] of pending) {
        if (!element.clientHeight) continue;
        scrollToChapter(element, chapter);
        pending.delete(element);
      }
    };
  }
}
