import type { RulePresentationPlan } from '@fvtt-json-generator/generation/rule-presentation';

export const FACT_NOTES_TEMPLATE_VERSION = 'forge-notes-facts-v1';
export interface EncounterFactActor { key?: string; artifact: any; rulePresentation?: RulePresentationPlan }
export interface EncounterNotePart { source: string; fixedZh?: string }

// Complete tool-authored instructions, not partial rule fragments or creature names.
const FIXED_INSTRUCTIONS: Readonly<Record<string, string>> = {
  'Use the native activities. The GM resolves manual consequences from each Item’s complete rule.':
    '使用原生能力活动。需手动处理的结果，由 GM 按各物品的完整规则裁定。',
  'GM resolves each complete manual rule from its bound Item; native activities remain usable and special consequences are not automatic.':
    'GM 按所绑定物品的完整规则处理每项手动规则；原生能力活动仍可使用，特殊结果不会自动执行。',
  'Use the native saving throws. The GM resolves the push from each Item’s complete rule; token movement is manual.':
    '使用原生豁免。GM 按各物品的完整规则处理推离；棋子由 GM 手动移动。',
  'GM resolves the complete failed-save push from the bound Item; no automatic token movement.':
    'GM 按所绑定物品的完整规则处理豁免失败后的推离；棋子不会自动移动。',
};

/** Keep every line. Only a complete known instruction or a uniquely agreed fixed
 * source block may be assembled locally. All other prose retains its own slot. */
export function encounterFactNoteParts(notes: string, actors: readonly EncounterFactActor[]): EncounterNotePart[] {
  const blocks = actors.flatMap(actor => actor.rulePresentation?.blocks ?? []);
  const parts: EncounterNotePart[] = [];
  let prose: string[] = [];
  const flush = () => {
    if (prose.length) parts.push({ source: prose.join('\n') });
    prose = [];
  };
  for (const source of notes.split(/\r?\n/u)) {
    const instruction = FIXED_INSTRUCTIONS[source.trim()];
    const matches = blocks.filter(block => block.source.trim() && block.source.trim() === source.trim());
    const choices = new Set(matches.map(block => block.zh));
    const fixedZh = instruction ?? (choices.size === 1 ? [...choices][0] : undefined);
    if (fixedZh === undefined) { prose.push(source); continue; }
    flush();
    parts.push({ source, fixedZh });
  }
  flush();
  return parts;
}
