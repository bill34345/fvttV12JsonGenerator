import { describe, expect, test } from 'bun:test';
import yaml from 'js-yaml';
import { renderMonsterIntakeMarkdown } from '../renderer';
import { validateMonsterIntakeIR } from '../validator';
import { buildRatWarlockIr, RAT_WARLOCK_SOURCE } from './fixtures/rat-warlock';

describe('Rat Warlock spell resolver intake baseline', () => {
  test('preserves the ten source-granted spells from structured Intake IR into deterministic Markdown', () => {
    const ir = buildRatWarlockIr();
    const validation = validateMonsterIntakeIR(RAT_WARLOCK_SOURCE, ir);
    const markdown = renderMonsterIntakeMarkdown(ir);
    const parsed = yaml.load(markdown.slice(4, -4)) as Record<string, any>;
    const manifest = parsed.法术清单;
    const refs = manifest.spellcastingGroups.flatMap((group: { spellRefs: unknown[] }) => group.spellRefs);
    expect(validation.blocking).toEqual([]);
    expect(refs).toHaveLength(10);
    expect(parsed.特性.filter((trait: { 名称: string }) => trait.名称.includes('Innate Spellcasting'))).toHaveLength(1);
    expect(markdown).not.toMatch(/Compendium\.|Item\.[A-Za-z0-9]{16}/);
  });
});
