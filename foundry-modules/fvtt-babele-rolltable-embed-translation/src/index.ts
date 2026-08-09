export const MODULE_ID = 'fvtt-babele-rolltable-embed-translation' as const;

export interface RollTableResultData {
  _id?: string;
  range?: [number, number] | number[];
  type?: string;
  name?: string | null;
  description?: string | null;
  documentUuid?: string | null;
  drawn?: boolean;
  [key: string]: unknown;
}

interface TranslationFacade {
  init?: () => Promise<boolean> | boolean;
  rollbackDocument?: (documentType: string, data: Record<string, unknown>, options?: Record<string, unknown>) => Record<string, unknown> | null;
  translatedCompendiumFor?: (pack: string) => {
    translate?: (data: Record<string, unknown>) => Record<string, unknown>;
    translationsFor?: (data: Record<string, unknown>) => Record<string, unknown>;
  } | null;
}

interface FoundryDocumentLike {
  documentName?: string;
  name?: string | null;
  pack?: string | null;
  compendium?: { collection?: string | null } | null;
  isOwner?: boolean;
  toObject?: () => Record<string, unknown>;
  toAnchor?: (options?: Record<string, unknown>) => HTMLAnchorElement;
  results?: { toObject?: () => RollTableResultData[] };
}

interface TextEditorImplementation {
  enrichHTML?: (value: string, options?: Record<string, unknown>) => Promise<string> | string;
  createAnchor?: (options: Record<string, unknown>) => HTMLAnchorElement;
}

interface TranslationResultEntry {
  [key: string]: unknown;
}

interface WrapperRuntime {
  register?: (moduleId: string, target: string, wrapper: (...args: any[]) => unknown, type: string) => void;
}

/**
 * Match results using the same identity contract as Babele's TableResult map:
 * `_id` is authoritative when present, while range is the compatibility
 * fallback used by translation files such as Wild Magic Surge.
 */
export function alignTranslatedResults(
  sourceResults: readonly RollTableResultData[],
  translatedResults: readonly RollTableResultData[],
): RollTableResultData[] {
  const byId = new Map<string, RollTableResultData>();
  const byRange = new Map<string, RollTableResultData>();

  for (const result of translatedResults) {
    if (result._id) byId.set(result._id, result);
    const rangeKey = resultRangeKey(result);
    if (rangeKey) byRange.set(rangeKey, result);
  }

  return [...sourceResults]
    .sort(compareResultRanges)
    .map((source) => {
      const byIdentity = source._id ? byId.get(source._id) : undefined;
      return byIdentity ?? byRange.get(resultRangeKey(source) ?? '') ?? source;
    });
}

export function resultRangeKey(result: Pick<RollTableResultData, 'range'>): string | null {
  if (!Array.isArray(result.range) || result.range.length < 2) return null;
  const [low, high] = result.range;
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  return `${low}-${high}`;
}

export function compareResultRanges(left: Pick<RollTableResultData, 'range'>, right: Pick<RollTableResultData, 'range'>): number {
  return Number(left.range?.[0] ?? 0) - Number(right.range?.[0] ?? 0);
}

/**
 * Apply one Babele translation-file result value to a native TableResult.
 *
 * The dnd-players-handbook translation files use scalar strings for result
 * descriptions. Babele's default RollTable mapping routes that scalar to the
 * TableResult `description` field, while object payloads are accepted for
 * future/third-party mappings without discarding the native identity fields.
 */
export function applyResultTranslation(
  source: RollTableResultData,
  translation: unknown,
): RollTableResultData {
  if (typeof translation === 'string') {
    return {...source, description: translation};
  }

  if (translation && typeof translation === 'object' && !Array.isArray(translation)) {
    return {...source, ...(translation as TranslationResultEntry)};
  }

  return source;
}

/**
 * Translate embedded result payloads by the same `_id`-then-range identity
 * contract used by the RollTable mapping. The returned rows are in Foundry's
 * native range order, so they can be applied to the rendered table by index.
 */
export function translateResultEntries(
  sourceResults: readonly RollTableResultData[],
  translations: Record<string, unknown> | null | undefined,
): RollTableResultData[] {
  const entryMap = translations && typeof translations === 'object' ? translations : {};

  return [...sourceResults]
    .sort(compareResultRanges)
    .map((source) => {
      const byId = source._id && Object.prototype.hasOwnProperty.call(entryMap, source._id)
        ? entryMap[source._id]
        : undefined;
      const byRangeKey = resultRangeKey(source);
      const byRange = byRangeKey && Object.prototype.hasOwnProperty.call(entryMap, byRangeKey)
        ? entryMap[byRangeKey]
        : undefined;
      const translation = typeof byId !== 'undefined' ? byId : byRange;
      return applyResultTranslation(source, translation);
    });
}

function textEditorImplementation(): TextEditorImplementation | null {
  const foundryApi = (globalThis as {
    foundry?: {applications?: {ux?: {TextEditor?: {implementation?: TextEditorImplementation}}}};
  }).foundry;
  const namespaced = foundryApi?.applications?.ux?.TextEditor?.implementation;
  if (namespaced) return namespaced;

  // Foundry v12/v13 compatibility fallback. This branch is intentionally
  // unreachable on the locked v14 target, so it does not trigger the v14
  // deprecation warning during normal operation.
  return (globalThis as {TextEditor?: {implementation?: TextEditorImplementation}}).TextEditor?.implementation ?? null;
}

async function translateTableData(table: FoundryDocumentLike): Promise<Record<string, unknown> | null> {
  const runtimeGame = (globalThis as { game?: { babele?: TranslationFacade } }).game;
  const babele = runtimeGame?.babele;
  if (!babele) return null;

  if (babele.init && !(await babele.init())) return null;

  const pack = table.pack ?? table.compendium?.collection ?? null;
  if (!pack || !table.toObject || !babele.translatedCompendiumFor) return null;

  const compendium = babele.translatedCompendiumFor(pack);
  if (!compendium?.translate) return null;

  const materialized = table.toObject();
  const source = babele.rollbackDocument
    ? babele.rollbackDocument(table.documentName ?? 'RollTable', materialized, { pack })
    : materialized;
  if (!source) return null;

  const translated = compendium.translate(source);
  const sourceResults = Array.isArray(source.results) ? source.results as RollTableResultData[] : [];
  const translationEntry = compendium.translationsFor?.(source) ?? {};
  const translatedResultEntries = translationEntry.results && typeof translationEntry.results === 'object'
    && !Array.isArray(translationEntry.results)
    ? translationEntry.results as Record<string, unknown>
    : null;
  const nativeTranslatedResults = translated && Array.isArray(translated.results)
    ? translated.results as RollTableResultData[]
    : [];

  if (!translated || translated === source) {
    if (!translatedResultEntries || sourceResults.length === 0) return null;
    return {
      ...source,
      results: translateResultEntries(sourceResults, translatedResultEntries),
    };
  }

  if (sourceResults.length === 0 || !translatedResultEntries) return translated;

  const orderedSource = [...sourceResults].sort(compareResultRanges);
  const alignedNative = alignTranslatedResults(sourceResults, nativeTranslatedResults);
  const manualResults = translateResultEntries(sourceResults, translatedResultEntries);
  return {
    ...translated,
    results: orderedSource.map((sourceResult, index) => ({
      ...(alignedNative[index] ?? sourceResult),
      ...manualResults[index],
    })),
  };
}

async function enrichDescription(table: FoundryDocumentLike, description: unknown, options: Record<string, unknown>): Promise<string> {
  if (typeof description !== 'string' || description.length === 0) return '';
  const enrichHTML = textEditorImplementation()?.enrichHTML;
  if (!enrichHTML) return description;
  const enriched = await enrichHTML(description, {
    ...options,
    relativeTo: table,
    secrets: options.secrets ?? table.isOwner,
  });
  return typeof enriched === 'string' ? enriched : String(enriched ?? '');
}

async function documentAnchor(table: FoundryDocumentLike, result: RollTableResultData): Promise<HTMLAnchorElement | null> {
  const uuid = typeof result.documentUuid === 'string' ? result.documentUuid : '';
  const foundryApi = (globalThis as { foundry?: { utils?: { fromUuid?: (uuid: string, options?: Record<string, unknown>) => Promise<FoundryDocumentLike | null> | FoundryDocumentLike | null } } }).foundry;
  const document = uuid && foundryApi?.utils?.fromUuid
    ? await foundryApi.utils.fromUuid(uuid, { relative: table })
    : null;

  if (document?.toAnchor) {
    let name = result.name || null;
    const babele = (globalThis as {game?: {babele?: TranslationFacade}}).game?.babele;
    const pack = document.pack ?? document.compendium?.collection ?? null;
    if (babele?.translatedCompendiumFor && pack && document.toObject) {
      const compendium = babele.translatedCompendiumFor(pack);
      const materialized = document.toObject();
      const source = babele.rollbackDocument
        ? babele.rollbackDocument(document.documentName ?? 'RollTable', materialized, {pack})
        : materialized;
      const translated = source && compendium?.translate ? compendium.translate(source) : null;
      const translatedName = typeof translated?.name === 'string' && translated.name.length > 0
        ? translated.name
        : null;
      name = translatedName ?? name ?? document.name ?? null;
    }
    return document.toAnchor({ name: name || undefined }) as HTMLAnchorElement;
  }

  return textEditorImplementation()?.createAnchor?.({
    attrs: { draggable: 'true' },
    classes: ['content-link', 'broken'],
    dataset: { link: '', uuid },
    name: result.name ?? 'Unknown',
    icon: 'fa-solid fa-link-slash',
  }) ?? null;
}

async function replaceResultCell(
  table: FoundryDocumentLike,
  cell: HTMLElement,
  result: RollTableResultData,
  options: Record<string, unknown>,
): Promise<void> {
  cell.replaceChildren();

  if (result.type === 'text') {
    if (result.name) {
      const heading = document.createElement('h4');
      heading.dataset.noToc = '';
      heading.textContent = result.name;
      cell.append(heading);
    }
  } else {
    const anchor = await documentAnchor(table, result);
    if (anchor) cell.append(anchor);
  }

  const description = await enrichDescription(table, result.description, options);
  if (description) cell.insertAdjacentHTML('beforeend', description);
}

async function renderTranslatedEmbed(
  table: FoundryDocumentLike,
  embed: HTMLElement,
  sourceResults: readonly RollTableResultData[],
  translatedResults: readonly RollTableResultData[],
  options: Record<string, unknown>,
): Promise<HTMLElement> {
  const aligned = alignTranslatedResults(sourceResults, translatedResults);
  const domRows = Array.from(embed.querySelectorAll('tbody > tr')) as HTMLElement[];
  if (domRows.length !== aligned.length) return embed;

  for (const [index, result] of aligned.entries()) {
    const cells = Array.from(domRows[index]?.querySelectorAll(':scope > td') ?? []) as HTMLElement[];
    const cell = cells?.[1];
    if (cell) await replaceResultCell(table, cell, result, options);
  }
  return embed;
}

export async function buildEmbedWrapper(
  table: FoundryDocumentLike,
  wrapped: (config: Record<string, unknown>, options?: Record<string, unknown>) => Promise<HTMLElement>,
  config: Record<string, unknown>,
  options: Record<string, unknown> = {},
): Promise<HTMLElement> {
  const embed = await wrapped(config, options);
  try {
    const translatedTable = await translateTableData(table);
    const sourceResults = table.results?.toObject?.() ?? [];
    const translatedResults = Array.isArray(translatedTable?.results)
      ? translatedTable.results as RollTableResultData[]
      : [];
    if (translatedResults.length === 0 || sourceResults.length === 0) return embed;
    return await renderTranslatedEmbed(table, embed, sourceResults, translatedResults, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[${MODULE_ID}] failed to translate embedded RollTable; keeping native output`, message);
    return embed;
  }
}

export function registerRollTableEmbedWrapper(): void {
  const runtime = (globalThis as { libWrapper?: WrapperRuntime }).libWrapper;
  if (!runtime?.register) {
    console.warn(`[${MODULE_ID}] libWrapper is unavailable; embedded RollTable translation is disabled.`);
    return;
  }

  runtime.register(
    MODULE_ID,
    'RollTable.prototype._buildEmbedHTML',
    async function (this: FoundryDocumentLike, wrapped: (config: Record<string, unknown>, options?: Record<string, unknown>) => Promise<HTMLElement>, config: Record<string, unknown>, options: Record<string, unknown> = {}) {
      return buildEmbedWrapper(this, wrapped, config, options);
    },
    'WRAPPER',
  );
}

const hooks = (globalThis as { Hooks?: { once?: (event: string, callback: () => void) => void } }).Hooks;
hooks?.once?.('init', registerRollTableEmbedWrapper);
