import { createHash } from 'node:crypto';

// Each target is an existing original-release document. No missing custom helper is recreated.
export const sourceReferenceRepairs = [
  { pack: 'new-icon', oldId: 'AmuFE4xAoWlzjjQU', id: 'YBMBbBku5PW3IuGc', name: '神莓术 Goodberry',
    evidence: 'Original PHB spell-list page labels old Amu as Goodberry; current unique Goodberry is PHB2014.' },
  { pack: 'itempack', oldId: 'Ccz6h13ZVz3TYdBd', id: 'ZkAxGPjHjExOsU0O', name: '附盖提灯 Hooded Lantern',
    evidence: 'Rakdos/Lorehold source equipment explicitly labels old Ccz as one Hooded Lantern; existing PHB2014 target quantity1.' },
  { pack: 'itempack', oldId: 'H3MuYMhHC8ouyp2x', id: '2wRw9Oz58nxMTBMu', name: '灯油 Oil（扁瓶 Flask）',
    evidence: 'Simic source description and hint label old H3 as one Oil Flask; existing PHB2014 target quantity1.' },
  { pack: 'itempack', oldId: '41CD35967DA45554', id: '9n2cDCe8v97dj7sv', name: '锤子 Hammer',
    evidence: 'Lorehold original equipment label specifies a tool Hammer; existing PHB2014 target is a tool, not Light Hammer/Warhammer.' },
  { pack: 'itempack', oldId: 'WyGyl1aVBS3hb7DT', id: '191986051F42D84B', name: '高档服装 Fine Clothes',
    evidence: 'Rewarded original equipment specifies one Fine Clothes; existing PHB2014 canonical target quantity1.' },
  { pack: 'itempack', oldId: 'v6BsK48n582dUdd1', id: '3rOsaVORVaiX0Do7', name: '祭袍 Vestments',
    evidence: 'Baldurs Gate Acolyte original description directly names existing 3r as Vestments while its grant points to missing v6.' },
  { pack: 'racial-traits', oldId: 'JlnMw6egm8IM52KF', id: 'BAX4NWZ6iTLGgf31', name: '石之坚韧(MPMM歌利亚)',
    sourceUuid: 'Actor.KjgPT4UMHpsUWB95.Item.JlnMw6egm8IM52KF', onlyPack: 'races-item', onlyId: 'dI68QjTEhKniIhvL',
    sourceSha256: 'e3e592a9cbbf07552f4799ce5057c1a27f32892af3aa8ae3abdc300cfa262a71',
    evidence: 'Original MPMM Goliath description specifies d12+CON, PB uses/long rest; existing BAX has the identical MPMM rule, unlike the PHB long-rest-once version.' },
] as const;

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function patchSourceEstablishedReferences(pack: string, key: string, document: Record<string, unknown>) {
  const reports: Array<Record<string, unknown>> = [];
  const next = structuredClone(document);
  const visit = (value: unknown, path = ''): void => {
    if (!value || typeof value !== 'object') return;
    for (const [field, child] of Object.entries(value)) {
      const at = path ? `${path}.${field}` : field;
      if (at === '_stats' || at === 'flags.core.sourceId' || at === 'flags.dnd5e.sourceId') continue;
      if (typeof child !== 'string') { visit(child, at); continue; }
      let updated = child;
      for (const repair of sourceReferenceRepairs) {
        if ('sourceUuid' in repair && (pack !== repair.onlyPack || document._id !== repair.onlyId)) continue;
        const prefix = `Compendium.dnd5e_classpack.${repair.pack}`;
        const target = `${prefix}.Item.${repair.id}`;
        const sources = 'sourceUuid' in repair ? [repair.sourceUuid] : [`${prefix}.Item.${repair.oldId}`, `${prefix}.${repair.oldId}`];
        for (const source of sources) {
          if (!updated.includes(source)) continue;
          if ('sourceUuid' in repair && hash(document) !== repair.sourceSha256) throw new Error('MPMM Goliath source hash differs before precise reference repair');
          updated = updated.replaceAll(source, target);
          reports.push({ pack, key, id: document._id, name: document.name ?? null, field: at,
            oldUuid: source, newUuid: target, evidence: repair.evidence });
        }
      }
      if (updated !== child) (value as Record<string, unknown>)[field] = updated;
    }
  };
  visit(next);
  return { document: reports.length ? next : document, reports: reports.map(report => ({ ...report,
    sourceSha256: hash(document), candidateSha256: hash(next) })) };
}
