const HTML_TAG_PATTERN = /<\/?[A-Za-z][^>]*>/u;

/**
 * Foundry dnd5e stores rich Item descriptions as HTML. Preserve an existing
 * HTML payload byte-for-byte; otherwise render the bounded Markdown emitted by
 * the strict Item parser into safe block and inline HTML.
 */
export function renderFoundryItemDescriptionHtml(value: string): string {
  if (!value.trim() || isFoundryHtmlDescription(value)) return value;

  const output: string[] = [];
  let listType: 'ul' | 'ol' | undefined;
  let listItems: string[] = [];

  const flushList = () => {
    if (!listType || listItems.length === 0) return;
    output.push(`<${listType}>${listItems.map((item) => `<li>${item}</li>`).join('')}</${listType}>`);
    listType = undefined;
    listItems = [];
  };

  for (const rawLine of value.replace(/\r\n?/gu, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/u);
    if (heading?.[1] && heading[2]) {
      flushList();
      const level = heading[1].length;
      output.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^[-+*]\s+(.+)$/u);
    if (unordered?.[1]) {
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }
      listItems.push(renderInlineMarkdown(unordered[1]));
      continue;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/u);
    if (ordered?.[1]) {
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
      }
      listItems.push(renderInlineMarkdown(ordered[1]));
      continue;
    }

    flushList();
    output.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }

  flushList();
  return output.join('');
}

export function isFoundryHtmlDescription(value: string): boolean {
  return !value.trim() || HTML_TAG_PATTERN.test(value);
}

function renderInlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/gu, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>')
    .replace(/__([^_]+)__/gu, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/gu, '<em>$1</em>');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}
