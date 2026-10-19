/** Authored text and program-owned annotations remain separate across the
 * canonical Markdown boundary. Neither part grants executable mechanics. */
export interface SourceTextPresentation {
  version: 1;
  sourceText: string;
  programNotes: string[];
}

export function decodeSourceTextPresentation(value: unknown): SourceTextPresentation {
  const entry = value as Partial<SourceTextPresentation> | null;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)
    || Object.keys(entry).some(key => !['version','sourceText','programNotes'].includes(key))
    || entry.version !== 1 || typeof entry.sourceText !== 'string'
    || !Array.isArray(entry.programNotes) || entry.programNotes.length > 16
    || entry.programNotes.some(note => typeof note !== 'string' || !note.trim())) {
    throw new TypeError('InvalidSourceTextPresentation');
  }
  return {version:1, sourceText:entry.sourceText, programNotes:[...entry.programNotes]};
}

export function composeSourceTextPresentation(value: SourceTextPresentation): string {
  return [value.sourceText, ...value.programNotes].filter(text => text.length > 0).join('\n\n');
}

/** Canonical Markdown keeps the source once, in its ordinary biography field.
 * UTF-16 length is a program-owned boundary, not a model-generated offset. */
export function sourceTextPresentationBoundary(value: SourceTextPresentation) {
  return {version:1 as const, sourceLength:value.sourceText.length, programNotes:[...value.programNotes]};
}

export function decodeSourceTextPresentationBoundary(value: unknown, display: string): SourceTextPresentation {
  const entry = value as Record<string, unknown> | null;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)
    || Object.keys(entry).some(key => !['version','sourceLength','programNotes'].includes(key))
    || !Number.isSafeInteger(entry.sourceLength) || (entry.sourceLength as number) < 0 || (entry.sourceLength as number) > display.length) {
    throw new TypeError('InvalidSourceTextPresentationBoundary');
  }
  const presentation = decodeSourceTextPresentation({version:entry.version,
    sourceText:display.slice(0, entry.sourceLength as number), programNotes:entry.programNotes});
  if (composeSourceTextPresentation(presentation) !== display) throw new TypeError('InvalidSourceTextPresentationBoundary');
  return presentation;
}
