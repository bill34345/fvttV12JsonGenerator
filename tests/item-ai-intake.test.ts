import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertMarkdownContentToJson } from '@fvtt-json-generator/workflows/single-file-conversion';
import { ItemParser } from '@fvtt-json-generator/parser/item-parser';
import { ActivityGenerator } from '@fvtt-json-generator/generation/activity';
import { adaptParsedItemToCanonical } from '@fvtt-json-generator/generation/adapters';
import { verifyGeneratedDocument } from '@fvtt-json-generator/generation/verification';
import { resolveLockedDnd5eV14Spell } from '@fvtt-json-generator/generation/v14-spell-catalog';
import { runItemIntake } from '@fvtt-json-generator/intake-ai/item-orchestrator';
import { renderItemIntakeMarkdown } from '@fvtt-json-generator/intake-ai/item-renderer';
import { validateItemIntakeIR } from '@fvtt-json-generator/intake-ai/item-validator';
import type { ItemIntakeAiProvider } from '@fvtt-json-generator/intake-ai/item-types';
import {
  buildJewelOfThreePrayersIr,
  jewelCandidate,
  JEWEL_OF_THREE_PRAYERS_SOURCE,
} from '../src/core/intake/__tests__/fixtures/jewel-of-three-prayers';

describe('AI Item Intake V14 mechanics', () => {
  test('resolves a formal spell only when its identifier and English name agree in the locked 5.3.3 catalog', () => {
    expect(resolveLockedDnd5eV14Spell('INVISIBILITY', 'inVisibility')).toEqual({
      identifier: 'invisibility',
      name: 'Invisibility',
      uuid: 'Compendium.dnd5e.spells.Item.1N8dDMMgZ1h1YJ3B',
    });
    expect(resolveLockedDnd5eV14Spell('invisibility', 'Fireball')).toBeUndefined();
  });

  test('renders the raw Jewel TXT to accepted V14 JSON with exact AC, light, uses, and cast semantics', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-item-intake-'));
    try {
      const candidate = jewelCandidate();
      const ir = buildJewelOfThreePrayersIr();
      expect(validateItemIntakeIR(JEWEL_OF_THREE_PRAYERS_SOURCE, ir, candidate).blocking).toEqual([]);
      const markdown = renderItemIntakeMarkdown(JEWEL_OF_THREE_PRAYERS_SOURCE, candidate, ir);
      expect(markdown).toContain('item-mechanics:');
      // The Intake contract owns mechanics, but source prose (including the
      // Dormant state) remains intact for a human reviewer and future stage
      // expansion instead of being silently flattened away.
      expect(markdown).toContain('Dormant');
      expect(markdown).toContain('**3** 发充能');
      const outputPath = join(root, 'jewel.json');
      const result = await convertMarkdownContentToJson({
        content: markdown,
        sourcePath: join(root, 'jewel.md'),
        outputPath,
        fvttVersion: '14',
        effectProfile: 'core',
      });
      expect(result.status).toBe('accepted');
      expect(existsSync(outputPath)).toBe(true);
      const item = JSON.parse(readFileSync(outputPath, 'utf-8')) as any;
      expect(item.system.uses).toEqual({ max: '3', spent: 0, recovery: [{ period: 'dawn', type: 'recoverAll' }] });
      const ac = item.effects.find((effect: any) => effect.transfer === true);
      expect(ac.type).toBe('base');
      expect(ac.changes).toBeUndefined();
      expect(ac.system.changes).toEqual([{ key: 'system.attributes.ac.formula', type: 'add', value: '+1', phase: 'initial', priority: null }]);
      const lightEffect = item.effects.find((effect: any) => effect.transfer === false);
      expect(lightEffect.system.changes).toEqual(expect.arrayContaining([
        { key: 'token.light.bright', type: 'override', value: 15, phase: 'initial', priority: null },
        { key: 'token.light.dim', type: 'override', value: 30, phase: 'initial', priority: null },
      ]));
      const activities = Object.values(item.system.activities) as any[];
      const light = activities.find((activity) => activity.effects?.some((reference: any) => reference._id === lightEffect._id));
      expect(light).toEqual(expect.objectContaining({ type: 'utility', activation: expect.objectContaining({ type: 'action' }) }));
      expect(light.consumption).toEqual(expect.objectContaining({ targets: [], spellSlot: false }));
      const invisibility = activities.find((activity) => activity.type === 'cast');
      expect(invisibility).toEqual(expect.objectContaining({
        spell: { uuid: 'Compendium.dnd5e.spells.Item.1N8dDMMgZ1h1YJ3B' },
        activation: expect.objectContaining({ type: 'action' }),
      }));
      expect(invisibility.consumption).toEqual(expect.objectContaining({ spellSlot: false }));
      expect(invisibility.consumption.targets).toEqual([{ type: 'itemUses', target: '', value: '1', scaling: { mode: '', formula: '' } }]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('formal orchestration writes Markdown, accepted JSON, reports, and audit-ready bundle only after review accepts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-item-intake-run-'));
    const candidate = jewelCandidate();
    const provider: ItemIntakeAiProvider = {
      providerName: 'fake-item-intake', extractionModel: 'fake', reviewModel: 'fake',
      discover: async () => ({ schemaVersion: 1, candidates: [candidate] }),
      extract: async () => buildJewelOfThreePrayersIr(),
      review: async () => ({ schemaVersion: 1, verdict: 'accepted', findings: [] }),
      repair: async () => buildJewelOfThreePrayersIr(),
    };
    try {
      const result = await runItemIntake({
        source: JEWEL_OF_THREE_PRAYERS_SOURCE,
        sourceName: 'jewel.txt',
        runRoot: join(root, 'runs'),
        vaultPath: join(root, 'vault'),
        fvttVersion: '14',
        effectProfile: 'core',
      }, provider);
      expect(result.status).toBe('succeeded');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.status).toBe('accepted');
      expect(existsSync(join(result.runPath, 'source.txt'))).toBe(true);
      expect(existsSync(join(result.runPath, 'discovery.json'))).toBe(true);
      expect(existsSync(join(result.items[0]!.bundlePath, 'intake-ir.json'))).toBe(true);
      expect(existsSync(join(result.items[0]!.bundlePath, 'standard.md'))).toBe(true);
      expect(existsSync(join(result.items[0]!.bundlePath, 'deterministic-report.json'))).toBe(true);
      expect(existsSync(result.items[0]!.markdownPath!)).toBe(true);
      expect(existsSync(result.items[0]!.itemPath!)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('canonicalizes bounded UTF-16 and whitespace-only evidence drift before validation', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-item-intake-normalize-'));
    const drifted = structuredClone(buildJewelOfThreePrayersIr());
    drifted.source.length += 2;
    const shifted = (ref: { start: number; end: number; quote: string }) => ({
      ...ref,
      start: ref.start + 1,
      end: ref.end + 1,
    });
    drifted.item.stages = drifted.item.stages?.map((stage) => ({ ...stage, evidence: stage.evidence.map(shifted) }));
    drifted.item.abilities = drifted.item.abilities.map((ability) => ({
      ...ability,
      evidence: ability.evidence.map((ref) => ({ ...shifted(ref), ...(ability.id === 'ac-bonus' ? { quote: `${ref.quote}\r` } : {}) })),
    })) as typeof drifted.item.abilities;
    drifted.claims = drifted.claims.map((claim) => ({ ...claim, evidence: claim.evidence.map(shifted) }));
    drifted.coverage = drifted.coverage.map((entry) => ({ ...entry, ...shifted(entry) }));
    try {
      const candidate = jewelCandidate();
      const provider: ItemIntakeAiProvider = {
        providerName: 'fake-item-intake-normalize', extractionModel: 'fake', reviewModel: 'fake',
        discover: async () => ({ schemaVersion: 1, candidates: [candidate] }),
        extract: async () => drifted,
        review: async () => ({ schemaVersion: 1, verdict: 'accepted', findings: [] }),
        repair: async () => drifted,
      };
      const result = await runItemIntake({
        source: JEWEL_OF_THREE_PRAYERS_SOURCE,
        sourceName: 'jewel-drifted.txt',
        runRoot: join(root, 'runs'),
        vaultPath: join(root, 'vault'),
        fvttVersion: '14',
        effectProfile: 'core',
      }, provider);
      expect(result.status).toBe('succeeded');
      const normalized = JSON.parse(readFileSync(join(result.items[0]!.bundlePath, 'intake-ir.json'), 'utf8')) as any;
      expect(normalized.source.length).toBe(JEWEL_OF_THREE_PRAYERS_SOURCE.length);
      expect(normalized.item.abilities[0].evidence[0].quote).toBe(JEWEL_OF_THREE_PRAYERS_SOURCE.slice(104, 115));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('does not turn decorative shine, AC totals, gems, no-action extinguishing, or an unknown spell into supported mechanics', () => {
    const parserSource = [
      '---',
      'layout: item',
      '名称: 反例护符',
      '类型: 饰物',
      '---',
      '黄金圆盘闪闪发光。AC 为 15。它有三颗宝石。熄灭无需动作。',
    ].join('\n');
    const parsed = new ItemParser().parse(parserSource);
    expect(parsed.uses).toBeUndefined();
    expect(parsed.structuredActions).toBeUndefined();

    const boldChargeSource = [
      '---', 'layout: item', '名称: 粗体充能物品', '类型: 奇物', '---',
      '这件饰物具有 **3** 发充能，并且在每天黎明恢复所有被消耗的充能。',
    ].join('\n');
    expect(new ItemParser().parse(boldChargeSource).uses).toEqual({
      max: '3', spent: 0, recovery: [{ period: 'dawn', type: 'recoverAll' }],
    });

    const ir = buildJewelOfThreePrayersIr();
    const spell = ir.item.abilities.find((ability) => ability.kind === 'spell');
    if (spell?.kind === 'spell') spell.spell.identifier = 'not-a-real-spell';
    const validation = validateItemIntakeIR(JEWEL_OF_THREE_PRAYERS_SOURCE, ir, jewelCandidate());
    expect(validation.blocking.map((finding) => finding.code)).toContain('UNRESOLVED_SPELL');
    expect(() => new ActivityGenerator({ fvttVersion: '14' }).generate({
      name: 'Unknown Spell', type: 'spell', spellName: 'Unknown Spell', spellIdentifier: 'not-a-real-spell',
      useAction: { activation: 'action', consumption: 1 },
    })).toThrow(/Unable to uniquely resolve/);
  });

  test('verifier rejects a mutated V14 light, AC, and spell projection instead of accepting any Effect or Activity', async () => {
    const candidate = jewelCandidate();
    const markdown = renderItemIntakeMarkdown(JEWEL_OF_THREE_PRAYERS_SOURCE, candidate, buildJewelOfThreePrayersIr());
    const parsed = new ItemParser().parse(markdown);
    const generated = await convertMarkdownContentToJson({ content: markdown, fvttVersion: '14', effectProfile: 'core' });
    const item = structuredClone(generated.rawJson) as any;
    const activities = Object.values(item.system.activities) as any[];
    const light = activities.find((activity) => activity.type === 'utility');
    light.consumption.targets = [{ type: 'itemUses', target: '', value: '1' }];
    item.effects.find((effect: any) => effect.transfer === true).system.changes[0].value = '+2';
    activities.find((activity) => activity.type === 'cast').consumption.spellSlot = true;
    const verification = verifyGeneratedDocument({
      canonical: adaptParsedItemToCanonical(parsed), output: item, target: '14', effectProfile: 'core',
    });
    expect(verification.status).toBe('failed');
    expect(verification.diagnostics.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      'GEN_ITEM_AC_EFFECT_MISMATCH',
      'GEN_ITEM_LIGHT_ACTIVITY_MISMATCH',
      'GEN_ITEM_SPELL_ACTIVITY_MISMATCH',
    ]));
  });
});
