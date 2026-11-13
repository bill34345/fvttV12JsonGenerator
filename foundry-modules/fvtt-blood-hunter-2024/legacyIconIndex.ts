import { assertBloodHunterSourceBytes, bloodHunterIcon, type BloodHunterEnrichedSource, type NativeBloodHunterPackage } from '../../packages/blood-hunter-v14/src/index.ts';
import type { LegacyIconEntry, LegacyIconIndex } from './src/legacy-icons.ts';

/** URL identities are generated from locked source records, never Actor names. */
export function buildLegacyIconIndex(raw: Uint8Array, pkg: NativeBloodHunterPackage): LegacyIconIndex {
  assertBloodHunterSourceBytes(raw);
  const source = JSON.parse(new TextDecoder().decode(raw)) as BloodHunterEnrichedSource;
  const documents = [...pkg.classes, ...pkg.subclasses, ...pkg.features];
  const entries: LegacyIconEntry[] = [];
  for (const [group, page] of [['class', 'classes.html'], ['classFeature', 'classFeature'], ['optionalfeature', 'optionalfeatures.html']] as const) {
    for (const [index, entry] of source[group].entries()) {
      const parts = group === 'classFeature' ? [entry.name, entry.className!, entry.classSource!, String(entry.level), entry.source] : [entry.name, entry.source];
      const urlIdentity = parts.map((part) => part.toLowerCase()).join('_');
      const ledger = pkg.coverageLedger.find((row) => row.sourceLocator.group === group && row.sourceLocator.index === index);
      let target = group === 'class' ? pkg.classes[0] : documents.find((item) => item._id === ledger?.canonicalDocumentId);
      let route: LegacyIconEntry['route'] = 'canonical-item';
      if (!target && ledger?.sourceIdentity.normalizedName === 'fighting-style' && ledger.sourceIdentity.level === 2) {
        const markers = documents.filter((item) => (item.flags.fvttJsonGenerator as any)?.bloodHunter2024?.sourceKey === 'BloodHunter2024|synthetic|blood-hunter|fighting-style-eligibility');
        if (markers.length !== 1) throw new Error('Fighting Style source-backed presentation marker is not unique.');
        target = markers[0]; route = 'source-backed-fighting-style-marker';
      }
      if (!target) {
        const owner = documents.find((item) => item._id === ledger?.grant.ownerDocumentId);
        const advancement = (owner?.system.advancement as any)?.[ledger?.advancementId ?? ''];
        if (ledger?.sourceIdentity.normalizedName !== 'weapon-mastery' || advancement?.type !== 'Trait' || advancement.configuration?.mode !== 'mastery') continue;
        route = 'source-presentation-registry';
      }
      entries.push({ page, urlIdentity, type: group === 'class' ? 'class' : 'feat', sourceLocator: { group, index }, sourceName: entry.name, img: target?.img ?? bloodHunterIcon(entry), route, ...(target ? { canonicalId: target._id } : {}) });
    }
  }
  const keys = entries.map((entry) => `${entry.page}|${entry.type}|${entry.urlIdentity}`);
  if (new Set(keys).size !== keys.length) throw new Error('Locked source contains ambiguous legacy icon URL identities.');
  return { schemaVersion: 1, moduleId: 'fvtt-blood-hunter-2024', version: pkg.version, sourceSha256: pkg.sourceSha256!, canonicalLogicalHash: pkg.logicalHash, entries };
}
