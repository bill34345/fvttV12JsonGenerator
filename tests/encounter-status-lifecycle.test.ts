import { describe, expect, test } from 'bun:test';
import yaml from 'js-yaml';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { decodeStatusLifecycleParameters, type StatusLifecycleParameters } from '@fvtt-json-generator/contracts/status-lifecycle';
import { compileEncounterSelectionSourceAudit, decodeEncounterAutomation, renderEncounterActorSource } from '@fvtt-json-generator/intake-ai/encounter-automation';
import { renderMonsterIntakeMarkdown } from '@fvtt-json-generator/intake-ai/renderer';
import { convertMarkdownContentToJson } from '../src/core/workflow/singleFileConversion';
import { buildForgeActorRequest, convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';
import { prepareForgeEncounter } from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import { serializeForgeEncounterPackage } from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import { buildValidLurkerIr, LURKER_SOURCE } from '../src/core/intake/__tests__/fixtures/lurker';
import nativeConditions from '../foundry-modules/fvtt-json-forge/tests/fixtures/native-conditions-5.3.3.json';

const cases = [
  { status: 'blinded', ability: 'con', abilityName: 'Constitution', dc: 14, duration: { value: 1, unit: 'minute' }, optional: true },
  { status: 'frightened', ability: 'wis', abilityName: 'Wisdom', dc: 16, duration: { value: 2, unit: 'round' }, optional: false },
  { status: 'poisoned', ability: 'str', abilityName: 'Strength', dc: 11, duration: { value: 3, unit: 'minute' }, optional: true },
  { status: 'paralyzed', ability: 'cha', abilityName: 'Charisma', dc: 19, duration: { value: 4, unit: 'round' }, optional: false },
] as const;

async function fixture(entry: { status: string; ability: string; abilityName: string; dc: number; duration: { value: number; unit: 'minute' | 'round' }; optional: boolean } = cases[0]) {
  const ir = buildValidLurkerIr();
  const unit = entry.duration.unit === 'minute' ? 'minutes' : 'rounds';
  const quote = `Venom Strike. Melee Weapon Attack: +5 to hit. Hit: The target is ${entry.status} for ${entry.duration.value} ${unit}. At the end of each of its turns, the target ${entry.optional ? 'can' : 'must'} make a DC ${entry.dc} ${entry.abilityName} saving throw, ending the effect on a success.`;
  const source = `${LURKER_SOURCE}\n${quote}`;
  ir.source = { sha256: hashSource(source), length: source.length };
  const start = source.indexOf(quote);
  ir.creature.actions = [{ name: 'Venom Strike', description: quote, activityType: 'attack',
    attack: { type: 'mwak', toHit: 5, reach: 5 },
    appliedConditions: [{ statuses: [entry.status], duration: `${entry.duration.value} ${unit}` }],
    evidence: [{ start, end: start + quote.length, quote }] }];
  ir.claims = ir.claims.filter(claim => !claim.path.startsWith('/creature/actions/'));
  const generated = await convertMarkdownContentToJson({ content: renderMonsterIntakeMarkdown(ir), fvttVersion: '14', effectProfile: 'core', translationService: null });
  const request = { source, actors: [{ key: 'creature', source, ir, artifact: generated.rawJson }] };
  const selection = { version: 2, name: 'Native lifecycle', notes: '', manualSteps: [], legendaryRecovery: [], rules: [
    { id: 'condition', kind: 'status-lifecycle', actorKey: 'creature', featureName: 'Venom Strike', section: 'action', quote,
      gmSteps: ['GM selects the legal target.'],
      parameters: { trigger: 'attack-hit', status: entry.status, duration: entry.duration,
        repeatSave: { ability: entry.ability, dc: entry.dc, timing: 'target-turn-end', optional: entry.optional } } },
  ] };
  return { request, selection, quote };
}

describe('explicit offline native status lifecycle audit', () => {
  test('all fourteen pinned native conditions compile and formally project without duplicate embedded effects', async () => {
    for (const condition of nativeConditions.conditions) {
      const { request, selection, quote } = await fixture({ ...cases[0], status: condition.id });
      const compiled = compileEncounterSelectionSourceAudit(selection, request);
      expect(compiled.command).toContain(`"status":"${condition.id}"`);
      const source = renderEncounterActorSource(request.actors[0]!.ir,
        compiled.rules.map(rule => ({ ...rule, mechanicId: 'lifecycle-condition', capabilityKind: 'status-lifecycle' })), request.source);
      const response = await convertFinalActorSource(buildForgeActorRequest({ content: source,
        displayName: condition.id, requestId: `lifecycle-${condition.id}`, fvttVersion: '14.364', systemVersion: '5.3.3' }));
      if (!('result' in response)) throw Error('Formal conversion returned no result');
      if (response.result.status === 'failed') throw Error('Formal conversion failed');
      expect(response.result.status).toBe('needs_review');
      const items = response.result.artifact?.items;
      if (!Array.isArray(items)) throw Error('Formal conversion returned no Items');
      const item = items.find((entry: any) => entry.name === 'Venom Strike') as any;
      expect(item).toBeTruthy();
      expect(item.effects).toHaveLength(1);
      expect(item.effects[0].flags.fvttJsonGenerator.conditionLifecycle).toMatchObject({ version: 1, mode: 'gm', statuses: [condition.id] });
      expect((yaml.load(source.slice(4, -4)) as any).动作[0].描述).toBe(quote);
    }
  });

  test('accepts four native statuses with source-explicit repeat saves and suppresses embedded auto effects in final source', async () => {
    for (const entry of cases) {
      const { request, selection, quote } = await fixture(entry);
      const compiled = compileEncounterSelectionSourceAudit(selection, request);
      expect(compiled.command).toContain('"kind":"status-lifecycle"');
      const source = renderEncounterActorSource(request.actors[0]!.ir,
        compiled.rules.map(rule => ({ ...rule, mechanicId: 'lifecycle-condition', capabilityKind: 'status-lifecycle' })), request.source);
      const document = yaml.load(source.slice(4, -4)) as any;
      expect(document.动作[0].描述).toBe(quote);
      expect(document.动作[0].内嵌效果).toBeUndefined();
      expect(document.动作[0].失败效果).toBeUndefined();
      expect(document.行为机制.机制.some((mechanic:any) => mechanic.ID === 'encounter-manual-action-1')).toBe(true);
      if (entry === cases[0]) {
        const response = await convertFinalActorSource(buildForgeActorRequest({ content: source,
          displayName: 'Native lifecycle', requestId: 'native-lifecycle', fvttVersion: '14.364', systemVersion: '5.3.3' }));
        if (!('result' in response)) throw Error('Formal Actor conversion returned no result');
        if (response.result.status === 'failed') throw Error('Formal Actor conversion failed');
        expect(response.result.status).toBe('needs_review');
        const items = response.result.artifact?.items;
        if (!Array.isArray(items)) throw Error('Formal Actor conversion returned no Items');
        const item = items.find((entry:any) => entry.name === 'Venom Strike') as any;
        expect(item).toBeTruthy();
        expect(item.effects).toHaveLength(1);
        expect(item.effects[0].flags.fvttJsonGenerator.conditionLifecycle).toMatchObject({ version: 1, mode: 'gm', statuses: [entry.status] });
        const bundle:any = { schema: 'fvtt-json-forge-encounter', version: 1, id: 'native-lifecycle-test',
          label: 'Native lifecycle', target: { foundry: '14.364', system: 'dnd5e', systemVersion: '5.3.3', effectProfile: 'core' },
          primaryActorKey: 'creature', actors: [{ key: 'creature', label: 'Source creature', source, sourceHash: hashSource(source) }],
          macros: [{ key: 'control', name: compiled.name, command: compiled.command, commandHash: hashSource(compiled.command),
            bindings: { creature: 'creature' }, covers: [{ actorKey: 'creature', mechanicId: 'lifecycle-condition' },
              { actorKey: 'creature', mechanicId: 'encounter-manual-action-1' }], notes: '' }], assets: [] };
        const prepared = await prepareForgeEncounter(serializeForgeEncounterPackage(bundle));
        expect(prepared.actors[0]?.status).toBe('needs_review');
        expect(prepared.requirements.map(requirement => requirement.mechanicId)).toContain('encounter-manual-action-1');
      }
    }
  });

  test('new Chinese condition names retain exact source binding and reject a different selected condition', async () => {
    const names = [['restrained', '束缚'], ['grappled', '受擒'], ['stunned', '震慑'], ['charmed', '魅惑'],
      ['deafened', '耳聋'], ['incapacitated', '失能'], ['invisible', '隐形'], ['petrified', '石化'], ['prone', '倒地'], ['unconscious', '昏迷']];
    for (const [status, label] of names) {
      const { request, selection } = await fixture({ ...cases[0], status: status! });
      const quote = `毒刺。近战武器攻击，命中时，目标陷入${label}状态，持续1分钟。目标在其每个回合结束时可以进行一次DC14体质豁免，成功则结束该效果。`;
      const source = `${LURKER_SOURCE}\n${quote}`;
      const feature = request.actors[0]!.ir.creature.actions[0]!;
      feature.name = '毒刺'; feature.description = quote;
      feature.appliedConditions = [{ statuses: [label!], duration: '1分钟' }];
      feature.evidence = [{ start: source.indexOf(quote), end: source.length, quote }];
      request.source = source; request.actors[0]!.source = source;
      request.actors[0]!.ir.source = { sha256: hashSource(source), length: source.length };
      request.actors[0]!.artifact = (await convertMarkdownContentToJson({ content: renderMonsterIntakeMarkdown(request.actors[0]!.ir),
        fvttVersion: '14', effectProfile: 'core', translationService: null })).rawJson;
      selection.rules[0]!.featureName = '毒刺'; selection.rules[0]!.quote = quote;
      expect(compileEncounterSelectionSourceAudit(selection, request).command).toContain(`"status":"${status}"`);
      selection.rules[0]!.parameters.status = 'blinded';
      expect(() => compileEncounterSelectionSourceAudit(selection, request)).toThrow();
    }
  });

  test('rejects unsafe contract objects and out-of-range numeric fields', () => {
    const valid: StatusLifecycleParameters = { trigger: 'attack-hit', status: 'blinded', duration: { value: 1, unit: 'minute' },
      repeatSave: { ability: 'con', dc: 14, timing: 'target-turn-end', optional: true } };
    expect(decodeStatusLifecycleParameters(valid)).toEqual(valid);
    for (const changed of [
      { ...valid, script: 'alert(1)' }, { ...valid, status: 'custom' },
      ...['exhaustion', 'exhaustion-1', 'dead', 'burning', 'fvtt-custom-conditions.dazed'].map(status => ({ ...valid, status })),
      { ...valid, duration: { value: 61, unit: 'minute' } },
      { ...valid, duration: { value: 101, unit: 'round' } },
      { ...valid, duration: { value: 1.5, unit: 'round' } },
      { ...valid, repeatSave: { ...valid.repeatSave, dc: 0 } },
      { ...valid, repeatSave: { ...valid.repeatSave, dc: 31 } },
      { ...valid, repeatSave: { ...valid.repeatSave, timing: 'source-turn-end' } },
    ]) expect(() => decodeStatusLifecycleParameters(changed)).toThrow();
    const getter = { ...valid };
    Object.defineProperty(getter, 'status', { enumerable: true, get() { throw Error('executed getter'); } });
    expect(() => decodeStatusLifecycleParameters(getter)).toThrow('unsupported fields');
    expect(() => decodeStatusLifecycleParameters(Object.assign(Object.create({}), valid))).toThrow('plain data');
    expect(() => decodeStatusLifecycleParameters({ ...valid, [Symbol('code')]: 'never' })).toThrow('unsupported fields');
  });

  test('accepts a Chinese source label and explicit Chinese lifecycle wording', async () => {
    const { request, selection } = await fixture();
    const quote = '毒刺。近战武器攻击，命中时，目标陷入中毒状态，持续1分钟。目标在其每个回合结束时可以进行一次DC14体质豁免，成功则结束该效果。';
    const source = `${LURKER_SOURCE}\n${quote}`;
    const feature = request.actors[0]!.ir.creature.actions[0]!;
    feature.name = '毒刺'; feature.description = quote;
    feature.appliedConditions = [{ statuses: ['中毒'], duration: '1分钟' }];
    feature.evidence = [{ start: source.indexOf(quote), end: source.length, quote }];
    request.source = source; request.actors[0]!.source = source;
    request.actors[0]!.ir.source = { sha256: hashSource(source), length: source.length };
    request.actors[0]!.artifact = (await convertMarkdownContentToJson({ content: renderMonsterIntakeMarkdown(request.actors[0]!.ir),
      fvttVersion: '14', effectProfile: 'core', translationService: null })).rawJson;
    selection.rules[0]!.featureName = '毒刺'; selection.rules[0]!.quote = quote;
    selection.rules[0]!.parameters.status = 'poisoned';
    expect(compileEncounterSelectionSourceAudit(selection, request).command).toContain('"status":"poisoned"');
    const withDamage = quote.replace('命中时，', '命中时，造成8（1d6+5）点挥砍伤害，');
    const damagedSource = `${LURKER_SOURCE}\n${withDamage}`;
    feature.description = withDamage;
    feature.damage = [{ formula: '1d6+5', type: 'slashing', relationship: 'base' }];
    feature.evidence = [{ start: damagedSource.indexOf(withDamage), end: damagedSource.length, quote: withDamage }];
    request.source = damagedSource; request.actors[0]!.source = damagedSource;
    request.actors[0]!.ir.source = { sha256: hashSource(damagedSource), length: damagedSource.length };
    request.actors[0]!.artifact = (await convertMarkdownContentToJson({ content: renderMonsterIntakeMarkdown(request.actors[0]!.ir),
      fvttVersion: '14', effectProfile: 'core', translationService: null })).rawJson;
    selection.rules[0]!.quote = withDamage;
    expect(compileEncounterSelectionSourceAudit(selection, request).command).toContain('"status":"poisoned"');
  });

  test('binds quoted native hit damage before the target status in inline and separate sentences', async () => {
    const { request, selection, quote: original } = await fixture();
    for (const hit of [
      'Hit: 8 (1d6 + 5) Slashing damage, and the target is blinded for 1 minutes.',
      'Hit: 8 (1d6 + 5) Slashing damage. The target is blinded for 1 minutes.',
    ]) {
      const local = structuredClone(request);
      const quote = original.replace('Hit: The target is blinded for 1 minutes.', hit);
      const source = `${LURKER_SOURCE}\n${quote}`;
      const feature = local.actors[0]!.ir.creature.actions[0]!;
      feature.description = quote;
      feature.damage = [{ formula: '1d6+5', type: 'slashing', relationship: 'base' }];
      feature.evidence = [{ start: source.indexOf(quote), end: source.length, quote }];
      local.source = source; local.actors[0]!.source = source;
      local.actors[0]!.ir.source = { sha256: hashSource(source), length: source.length };
      local.actors[0]!.artifact = (await convertMarkdownContentToJson({ content: renderMonsterIntakeMarkdown(local.actors[0]!.ir),
        fvttVersion: '14', effectProfile: 'core', translationService: null })).rawJson;
      const selected = structuredClone(selection); selected.rules[0]!.quote = quote;
      expect(compileEncounterSelectionSourceAudit(selected, local).command).toContain('"status":"blinded"');
      for (const damage of [
        [{ formula: '1d6+4', type: 'slashing', relationship: 'base' }],
        [{ formula: '1d6+5', type: 'fire', relationship: 'base' }],
      ]) {
        const mismatch = structuredClone(local);
        mismatch.actors[0]!.ir.creature.actions[0]!.damage = damage as any;
        expect(() => compileEncounterSelectionSourceAudit(selected, mismatch)).toThrow('quoted native damage');
      }
    }
  });

  test('expands a unique body or rule-only quote to full exact source evidence for review and roundtrip', async () => {
    const { request, selection, quote } = await fixture();
    const full = `${quote}\n`;
    const source = `${LURKER_SOURCE}\n${full}`;
    const feature = request.actors[0]!.ir.creature.actions[0]!;
    feature.description = quote.slice('Venom Strike. '.length);
    feature.evidence = [{ start: source.indexOf(full), end: source.length, quote: full }];
    request.source = source; request.actors[0]!.source = source;
    request.actors[0]!.ir.source = { sha256: hashSource(source), length: source.length };
    for (const proposed of [feature.description, quote.slice(quote.indexOf('Hit:'))]) {
      const selected = structuredClone(selection);
      selected.rules[0]!.quote = proposed;
      const result = compileEncounterSelectionSourceAudit(selected, request);
      expect(result.selection?.rules[0]?.quote).toBe(full);
      expect(result.rules[0]?.quote).toBe(full);
      expect(decodeEncounterAutomation(result, request).selection?.rules[0]?.quote).toBe(full);
    }
  });

  test('an omitted qualifier, ambiguous compatible spans or another feature cannot be hidden by expansion', async () => {
    const { request, selection, quote } = await fixture();
    const additional = ' The effect also ends when the target takes damage.';
    const full = `${quote}${additional}`;
    const source = `${LURKER_SOURCE}\n${full}`;
    const feature = request.actors[0]!.ir.creature.actions[0]!;
    feature.evidence = [{ start: source.indexOf(full), end: source.length, quote: full }];
    request.source = source; request.actors[0]!.source = source;
    request.actors[0]!.ir.source = { sha256: hashSource(source), length: source.length };
    const selected = structuredClone(selection);
    selected.rules[0]!.quote = quote.slice(quote.indexOf('Hit:'), quote.indexOf('At the end'));
    expect(() => compileEncounterSelectionSourceAudit(selected, request)).toThrow();
    const bright = `${quote.replace('the target can make', 'the target can make, only while in bright light,')}\n`;
    const brightSource = `${LURKER_SOURCE}\n${bright}`;
    feature.evidence = [{ start: brightSource.indexOf(bright), end: brightSource.length, quote: bright }];
    request.source = brightSource; request.actors[0]!.source = brightSource;
    request.actors[0]!.ir.source = { sha256: hashSource(brightSource), length: brightSource.length };
    expect(() => compileEncounterSelectionSourceAudit(selected, request)).toThrow();

    const ambiguous = structuredClone(request);
    const prefix = 'Prelude. ';
    const suffix = ' Trailer.';
    ambiguous.source = `${LURKER_SOURCE}\n${prefix}${quote}${suffix}`;
    ambiguous.actors[0]!.source = ambiguous.source;
    ambiguous.actors[0]!.ir.source = { sha256: hashSource(ambiguous.source), length: ambiguous.source.length };
    const at = ambiguous.source.indexOf(quote);
    ambiguous.actors[0]!.ir.creature.actions[0]!.evidence = [
      { start: at - prefix.length, end: at + quote.length, quote: `${prefix}${quote}` },
      { start: at, end: at + quote.length + suffix.length, quote: `${quote}${suffix}` },
    ];
    const fullSelection = structuredClone(selection); fullSelection.rules[0]!.quote = quote;
    expect(() => compileEncounterSelectionSourceAudit(fullSelection, ambiguous)).toThrow('no unique complete source evidence span');

    const overlap = structuredClone(request);
    overlap.actors[0]!.ir.creature.actions[0]!.description = bright.trim();
    overlap.actors[0]!.ir.creature.actions.push({ name: 'Other Action', description: 'other', activityType: 'utility',
      evidence: [{ start: 0, end: 1, quote: overlap.source.slice(0, 1) }] });
    const other = overlap.actors[0]!.ir.creature.actions.at(-1)!;
    const fullRef = overlap.actors[0]!.ir.creature.actions[0]!.evidence![0]!;
    other.evidence = [{ start: fullRef.start + 1, end: fullRef.end, quote: overlap.source.slice(fullRef.start + 1, fullRef.end) }];
    const overlapSelection = structuredClone(selection);
    overlapSelection.rules[0]!.quote = selected.rules[0]!.quote;
    expect(() => compileEncounterSelectionSourceAudit(overlapSelection, overlap)).toThrow('overlaps another source feature');
  });

  test('separate valid same-feature evidence cannot hide a lifecycle qualifier', async () => {
    const { request, selection, quote } = await fixture();
    const qualifier = 'The effect also ends when the target takes damage.';
    const source = `${LURKER_SOURCE}\n${quote}\n${qualifier}`;
    const start = source.indexOf(quote);
    const qualifierStart = source.indexOf(qualifier);
    const first = { start, end: start + quote.length, quote };
    const second = { start: qualifierStart, end: qualifierStart + qualifier.length, quote: qualifier };
    request.source = source; request.actors[0]!.source = source;
    request.actors[0]!.ir.source = { sha256: hashSource(source), length: source.length };
    const feature = request.actors[0]!.ir.creature.actions[0]!;
    const selected = structuredClone(selection);
    selected.rules[0]!.quote = quote.slice(quote.indexOf('Hit:'), quote.indexOf('At the end'));
    feature.evidence = [first, second];
    expect(() => compileEncounterSelectionSourceAudit(selected, request)).toThrow('no unique complete source evidence span');
    feature.evidence = [first];
    request.actors[0]!.ir.claims.push({ path: '/creature/actions/0', valueKind: 'explicit', confidence: 'high', evidence: [second] });
    expect(() => compileEncounterSelectionSourceAudit(selected, request)).toThrow('no unique complete source evidence span');
    request.actors[0]!.ir.claims.pop();
    feature.evidence = [first, { ...second, start: second.start + 1 }];
    expect(compileEncounterSelectionSourceAudit(selected, request).selection?.rules[0]?.quote).toBe(quote);
  });

  test('rejects changed source facts, conditional application and non-Attack carriers', async () => {
    const { request, selection, quote } = await fixture();
    const changed = (patch: (rule:any) => void) => { const copy = structuredClone(selection); patch(copy.rules[0]); return copy; };
    for (const patch of [
      (rule:any) => { rule.parameters.status = 'poisoned'; },
      (rule:any) => { rule.parameters.duration.value = 2; },
      (rule:any) => { rule.parameters.repeatSave.dc = 15; },
      (rule:any) => { rule.parameters.repeatSave.ability = 'wis'; },
      (rule:any) => { rule.parameters.repeatSave.optional = false; },
    ]) expect(() => compileEncounterSelectionSourceAudit(changed(patch), request)).toThrow();
    const utility = structuredClone(request);
    const item = (utility.actors[0]!.artifact as any).items.find((candidate:any) => candidate.name === 'Venom Strike');
    item.system.activities = { only: { type: 'utility' } };
    expect(() => compileEncounterSelectionSourceAudit(selection, utility)).toThrow('native Attack Activity');
    for (const wording of [
      quote.replace('Hit:', 'Miss:'),
      quote.replace('Hit: The target is blinded', 'Hit: If the target fails a save, the target is blinded'),
      quote.replace('Hit: The target is blinded', 'Hit: The target is not blinded'),
      quote.replace('for 1 minutes', 'for 1 minutes or for 2 rounds'),
      quote.replace('At the end of each of its turns', 'If another creature enters the area, it is blinded. At the end of each of its turns'),
      quote.replace('At the end of each of its turns', 'At the end of each of the source’s turns'),
      quote.replace('DC 14 Constitution', 'Constitution'),
      quote.replace('Hit: The target is blinded for 1 minutes.', 'Hit: The target makes a DC 14 Constitution saving throw and is blinded for 1 minutes.').replace('DC 14 Constitution saving throw, ending', 'saving throw, ending'),
      quote.replace('ending the effect on a success', 'with no effect on a success'),
    ]) {
      const local = structuredClone(request);
      const at = local.source.length + 1;
      local.source += `\n${wording}`;
      local.actors[0]!.source = local.source;
      local.actors[0]!.ir.source = { sha256: hashSource(local.source), length: local.source.length };
      local.actors[0]!.ir.creature.actions[0]!.description = wording;
      local.actors[0]!.ir.creature.actions[0]!.evidence = [{ start: at, end: at + wording.length, quote: wording }];
      const selected = structuredClone(selection);
      selected.rules[0]!.quote = wording;
      expect(() => compileEncounterSelectionSourceAudit(selected, local)).toThrow();
    }
  });

  test('rejects extra endings, qualified saves, wrong subject, negated success, and ambiguous ability', async () => {
    const { request, selection, quote } = await fixture();
    const nearMisses = [
      `${quote} The effect also ends when the target takes damage.`,
      quote.replace('the target can make a DC', 'the target can make, only while in bright light, a DC'),
      quote.replace('The target is blinded', 'The attacker is blinded'),
      quote.replace('ending the effect on a success', 'never ending the effect on a success'),
      quote.replace('Constitution saving throw', 'Constitution or Wisdom saving throw'),
    ];
    for (const wording of nearMisses) {
      const local = structuredClone(request);
      const start = local.source.length + 1;
      local.source += `\n${wording}`;
      local.actors[0]!.source = local.source;
      local.actors[0]!.ir.source = { sha256: hashSource(local.source), length: local.source.length };
      local.actors[0]!.ir.creature.actions[0]!.description = wording;
      local.actors[0]!.ir.creature.actions[0]!.evidence = [{ start, end: start + wording.length, quote: wording }];
      const selected = structuredClone(selection);
      selected.rules[0]!.quote = wording;
      expect(() => compileEncounterSelectionSourceAudit(selected, local)).toThrow();
    }
  });
});
