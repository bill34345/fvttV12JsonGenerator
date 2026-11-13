export interface LegacyIconIdentity {
  namespace: 'plutonium-cn';
  page: string;
  source: 'BloodHunter2024';
  hash: string;
  book: 'BH2024';
  rules: '2024';
}

export interface LegacyIconEntry {
  page: string;
  urlIdentity: string;
  type: 'class' | 'feat';
  sourceLocator: { group: string; index: number };
  sourceName: string;
  img: string;
  route: 'canonical-item' | 'source-backed-fighting-style-marker' | 'source-presentation-registry';
  canonicalId?: string;
}

export interface LegacyIconIndex {
  schemaVersion: 1;
  moduleId: 'fvtt-blood-hunter-2024';
  version: string;
  sourceSha256: string;
  canonicalLogicalHash: string;
  entries: LegacyIconEntry[];
}

export function legacyIconIdentity(item: Record<string, any>): LegacyIconIdentity | undefined {
  const legacy = item.flags?.['plutonium-cn'];
  const source = item.system?.source;
  if (legacy?.source !== 'BloodHunter2024' || source?.book !== 'BH2024' || source.rules !== '2024' || typeof legacy.hash !== 'string') return;
  const expectedType = ({ 'classes.html': 'class', classFeature: 'feat', 'optionalfeatures.html': 'feat' } as Record<string, string>)[legacy.page];
  if (!expectedType || expectedType !== item.type) return;
  return { namespace: 'plutonium-cn', page: legacy.page, source: legacy.source, hash: legacy.hash, book: source.book, rules: source.rules };
}

export function legacyUrlIdentity(hash: string): string | undefined {
  try { return decodeURIComponent(hash); } catch { return; }
}
