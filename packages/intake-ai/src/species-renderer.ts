import * as yaml from 'js-yaml';
import type { SpeciesDiscoveryCandidate, SpeciesIntakeIR } from './species-types';

export function renderSpeciesIntakeMarkdown(source: string, candidate: SpeciesDiscoveryCandidate, ir: SpeciesIntakeIR): string {
  const species = ir.species;
  const frontmatter = yaml.dump({
    layout: 'species',
    'species-schema': 1,
    name: species.name,
    'english-name': species.englishName,
    'display-name': species.displayName,
    identifier: species.identifier,
    rules: species.rules,
    'creature-type': species.creatureType,
    size: species.size,
    movement: species.movement,
    senses: species.senses,
    source: {
      kind: species.source.kind,
      sha256: species.source.sha256,
      length: candidate.quote.length,
      'ir-revision': species.source.irRevision,
    },
    features: species.features.map((feature) => ({
      id: feature.id,
      name: feature.name,
      ...(feature.englishName ? { 'english-name': feature.englishName } : {}),
      parts: feature.parts.map((part) => ({
        id: part.id,
        level: part.level,
        automation: part.automation,
        mechanics: part.mechanics.map((mechanic) => mechanic.kind === 'limited-utility' ? {
          kind: mechanic.kind,
          activation: mechanic.activation,
          uses: mechanic.uses,
          consumption: mechanic.consumption,
          'chat-flavor': mechanic.chatFlavor,
        } : mechanic),
      })),
    })),
  }, { noRefs: true, lineWidth: -1, sortKeys: false });
  const sections = species.features.map((feature) => `<!-- species-feature:${feature.id} -->\n## ${feature.name}${feature.englishName ? `（${feature.englishName}）` : ''}\n\n${feature.description.trim()}`).join('\n\n');
  return `---\n${frontmatter}---\n\n${sections}\n\n<!-- species-raw-source -->\n## 原始资料（Intake 保留）\n\n<!-- species-raw-source-body -->\n${source.slice(candidate.start, candidate.end)}\n`;
}
