import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import type { ConfiguredConditionDefinition } from '@fvtt-json-generator/contracts/configured-conditions';
import { compileEncounterSelection, decodeEncounterAutomation, renderEncounterActorSource } from '@fvtt-json-generator/intake-ai/encounter-automation';
import { renderMonsterIntakeMarkdown } from '@fvtt-json-generator/intake-ai/renderer';
import { convertMarkdownContentToJson } from '../src/core/workflow/singleFileConversion';
import { buildForgeActorRequest, convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';
import { buildValidLurkerIr, LURKER_SOURCE } from '../src/core/intake/__tests__/fixtures/lurker';

const quotes = readFileSync(resolve(import.meta.dir, 'fixtures/encounter-configured-frost-mark.txt'), 'utf8').trim().split(/\r?\n/u);
const definition: ConfiguredConditionDefinition = {
  schemaVersion: 1, id: 'configured.frost-mark', name: '霜印 Frost Mark',
  description: 'Movement speed is reduced by 10 feet and Dexterity attacks, checks and saves have disadvantage.',
  aliases: ['Frost Mark', '霜印'],
  components: [{ kind: 'movement-reduction', feet: 10 }, { kind: 'builtin-condition', conditionId: 'clumsy', params: {} }],
};

async function fixture(chinese = false) {
  const quote = quotes[chinese ? 1 : 0]!;
  const source = `${LURKER_SOURCE}\n${quote}`;
  const ir = buildValidLurkerIr();
  const name = chinese ? '霜爪' : 'Frost Claw';
  ir.creature.actions = [{ name, description: quote, activityType: 'attack', attack: { type: 'mwak', toHit: 5, reach: 5 },
    appliedConditions: [{ statuses: [chinese ? '霜印' : 'Frost Mark'], duration: '1 minute' }],
    evidence: [{ start: source.indexOf(quote), end: source.indexOf(quote) + quote.length, quote }] }];
  ir.claims = ir.claims.filter(claim => !claim.path.startsWith('/creature/actions/'));
  const generated = await convertMarkdownContentToJson({ content: renderMonsterIntakeMarkdown(ir), fvttVersion: '14', effectProfile: 'core', translationService: null });
  const request = { source, conditionCatalog: [definition], actors: [{ key: 'creature', source, ir, artifact: generated.rawJson }] };
  const selection = { version: 2, name: 'Frost Mark encounter', notes: '', manualSteps: [], legendaryRecovery: [], rules: [
    { id: 'frost', kind: 'status-lifecycle', actorKey: 'creature', featureName: name, section: 'action', quote,
      gmSteps: ['GM selects the legal target.'],
      parameters: { trigger: 'attack-hit', status: definition.id, duration: { value: 1, unit: 'minute' },
        repeatSave: { ability: 'con', dc: 10, timing: 'target-turn-end', optional: true } } },
  ] };
  return { request, selection, quote };
}

describe('source-scoped configured condition intake', () => {
  test('binds a registered two-mechanism state through English evidence and formal Actor source', async () => {
    const { request, selection, quote } = await fixture();
    const compiled = compileEncounterSelection(selection, request);
    expect(compiled.command).toContain('"status":"configured.frost-mark"');
    expect(compiled.command).toContain('"feet":10');
    expect(compiled.command).toContain('"conditionId":"clumsy"');
    expect(compiled.selection?.rules[0]?.parameters.definition).toEqual(definition);
    expect(decodeEncounterAutomation(compiled, request).command).toBe(compiled.command);
    const source = renderEncounterActorSource(request.actors[0]!.ir,
      compiled.rules.map(rule => ({ ...rule, mechanicId: 'frost-mechanic', capabilityKind: 'status-lifecycle' })), request.source);
    const document = yaml.load(source.slice(4, -4)) as any;
    expect(document.动作[0].描述).toBe(quote);
    expect(document.动作[0].内嵌效果).toBeUndefined();
    expect(document.行为机制.机制.some((mechanic:any) => mechanic.ID === 'encounter-manual-action-1')).toBe(true);
    const response = await convertFinalActorSource(buildForgeActorRequest({ content: source,
      displayName: 'Frost Mark', requestId: 'configured-frost-mark', fvttVersion: '14.364', systemVersion: '5.3.3' }));
    if (!('result' in response)) throw Error('Formal Actor conversion returned no result');
    if (response.result.status === 'failed') throw Error('Formal Actor conversion failed');
    const items = response.result.artifact?.items;
    if (!Array.isArray(items)) throw Error('Formal Actor conversion returned no Items');
    const item = items.find((entry:any) => entry.name === 'Frost Claw') as any;
    expect(item).toBeTruthy();
    expect(item.effects ?? []).toHaveLength(0);
    expect(item.system?.activities && Object.values(item.system.activities).some((activity:any) => activity.type === 'attack')).toBe(true);
  });

  test('recognizes a Chinese alias and refuses missing, ambiguous, changed or qualified states', async () => {
    const { request, selection, quote } = await fixture(true);
    expect(compileEncounterSelection(selection, request).selection?.rules[0]?.parameters.definition).toEqual(definition);
    const unknown = structuredClone(request);
    unknown.conditionCatalog = [];
    expect(() => compileEncounterSelection(selection, unknown)).toThrow('unregistered');
    const ambiguous = structuredClone(request);
    ambiguous.conditionCatalog.push({ ...definition, id: 'configured.ice-mark', name: '冰印 Ice Mark', aliases: ['霜印'] });
    expect(() => compileEncounterSelection(selection, ambiguous)).toThrow();
    const changed = structuredClone(selection) as any;
    changed.rules[0].parameters.definition = { ...definition, components: [{ kind: 'movement-reduction', feet: 15 }] };
    expect(() => compileEncounterSelection(changed, request)).toThrow('snapshot differs');
    const recorded = compileEncounterSelection(selection, request);
    const updatedCatalog = structuredClone(request);
    updatedCatalog.conditionCatalog[0]!.components = [{ kind: 'movement-reduction', feet: 15 }];
    expect(() => decodeEncounterAutomation(recorded, updatedCatalog)).toThrow('snapshot differs');
    const nativeCollision = structuredClone(request);
    nativeCollision.conditionCatalog[0]!.aliases.push('blinded');
    expect(() => compileEncounterSelection(selection, nativeCollision)).toThrow();
    const wrongId = structuredClone(selection);
    wrongId.rules[0]!.parameters.status = 'configured.unregistered';
    expect(() => compileEncounterSelection(wrongId, request)).toThrow('unregistered');
    const qualified = structuredClone(request);
    const changedQuote = quote.replace('持续1分钟', '直到目标受到火焰伤害，最多持续1分钟');
    qualified.source = qualified.source.replace(quote, changedQuote);
    qualified.actors[0]!.source = qualified.source;
    qualified.actors[0]!.ir.creature.actions[0]!.description = changedQuote;
    qualified.actors[0]!.ir.creature.actions[0]!.evidence = [{ start: qualified.source.indexOf(changedQuote), end: qualified.source.length, quote: changedQuote }];
    const changedSelection = structuredClone(selection);
    changedSelection.rules[0]!.quote = changedQuote;
    expect(() => compileEncounterSelection(changedSelection, qualified)).toThrow();
  });
});
