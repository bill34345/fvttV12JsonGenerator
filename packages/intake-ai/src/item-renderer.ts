import * as yaml from 'js-yaml';
import type { ItemDiscoveryCandidate, ItemIntakeIR } from './item-types';

/** Render a reviewable project Item Markdown file without losing source prose. */
export function renderItemIntakeMarkdown(
  source: string,
  candidate: ItemDiscoveryCandidate,
  ir: ItemIntakeIR,
): string {
  const mechanics = {
    schemaVersion: 1,
    ...(ir.item.uses ? {
      uses: {
        max: ir.item.uses.max,
        recovery: ir.item.uses.recovery,
      },
    } : {}),
    abilities: ir.item.abilities.map((ability) => {
      if (ability.kind === 'passive-ac') {
        return { id: ability.id, kind: ability.kind, value: ability.value };
      }
      if (ability.kind === 'light') {
        return {
          id: ability.id,
          kind: ability.kind,
          activation: ability.activation,
          consumption: ability.consumption,
          bright: ability.bright,
          dim: ability.dim,
          extinguish: ability.extinguish,
        };
      }
      return {
        id: ability.id,
        kind: ability.kind,
        activation: ability.activation,
        consumption: ability.consumption,
        spell: ability.spell,
      };
    }),
  };
  const frontmatter = yaml.dump({
    layout: 'item',
    名称: ir.item.name,
    ...(ir.item.englishName ? { 英文名: ir.item.englishName } : {}),
    类型: ir.item.type,
    ...(ir.item.rarity ? { 稀有度: ir.item.rarity } : {}),
    ...(ir.item.attunement === 'required' ? { 'require-attunement': true } : {}),
    'item-mechanics': mechanics,
  }, { noRefs: true, lineWidth: -1 });
  const original = source.slice(candidate.start, candidate.end).trim();
  return `---\n${frontmatter}---\n\n## 原始资料（Intake 保留）\n\n${original}\n`;
}
