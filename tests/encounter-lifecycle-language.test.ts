import { afterEach, describe, expect, test } from 'bun:test';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { compileEncounterSelection, compileEncounterSelectionSourceAudit, createEncounterAutomationProvider, decodeEncounterAutomation } from '@fvtt-json-generator/intake-ai/encounter-automation';
import { readFixedEncounterConfiguration } from '@fvtt-json-generator/intake-ai/encounter-capabilities';
import { convertMarkdownContentToJson } from '../src/core/workflow/singleFileConversion';
import { renderMonsterIntakeMarkdown } from '@fvtt-json-generator/intake-ai/renderer';
import { buildValidLurkerIr, LURKER_SOURCE } from '../src/core/intake/__tests__/fixtures/lurker';

const samples = [
  { text: 'Connecting with this strike poisons the victim: it is poisoned for one minute. Once the victim finishes each of its turns, it may attempt a Constitution save (DC fourteen); success removes this poisoning.',
    status: 'poisoned', label: 'poisoned', value: 1, unit: 'minute', ability: 'con', dc: 14, optional: true,
    sourceEvidence: { application: 'Connecting with this strike poisons the victim: it is poisoned', duration: 'one minute', repeatSave: 'Constitution save (DC fourteen)', timing: 'Once the victim finishes each of its turns', optionality: 'it may attempt', removal: 'success removes this poisoning' } },
  { text: 'For two rounds, the creature struck becomes frightened. Each time that creature completes a turn, a Wisdom saving throw with difficulty sixteen is mandatory; passing it dispels the fear.',
    status: 'frightened', label: 'frightened', value: 2, unit: 'round', ability: 'wis', dc: 16, optional: false,
    sourceEvidence: { application: 'the creature struck becomes frightened', duration: 'two rounds', repeatSave: 'Wisdom saving throw with difficulty sixteen', timing: 'Each time that creature completes a turn', optionality: 'is mandatory', removal: 'passing it dispels the fear' } },
  { text: '这次攻击打中后，会使被击中的目标中毒，效果维持一分钟。轮到该目标行动并结束其每个回合后，它可选择作一次体质豁免（难度十四）；一旦通过，这次中毒便解除。',
    status: 'poisoned', label: '中毒', value: 1, unit: 'minute', ability: 'con', dc: 14, optional: true,
    sourceEvidence: { application: '这次攻击打中后，会使被击中的目标中毒', duration: '一分钟', repeatSave: '体质豁免（难度十四）', timing: '结束其每个回合后', optionality: '它可选择作一次', removal: '一旦通过，这次中毒便解除' } },
  { text: '目标在被此招命中时陷入恐慌，为期两轮。在受影响者自己的每一回合收尾时，必须作难度为十六的感知豁免；若通过，立刻摆脱此次恐慌。',
    status: 'frightened', label: '恐慌', value: 2, unit: 'round', ability: 'wis', dc: 16, optional: false,
    sourceEvidence: { application: '目标在被此招命中时陷入恐慌', duration: '两轮', repeatSave: '难度为十六的感知豁免', timing: '受影响者自己的每一回合收尾时', optionality: '必须作', removal: '若通过，立刻摆脱此次恐慌' } },
];

async function fixture(sample = samples[0]!) {
  const quote = `Language Strike. ${sample.text}`;
  const source = `${LURKER_SOURCE}\n${quote}`;
  const ir = buildValidLurkerIr();
  ir.source = { sha256: hashSource(source), length: source.length };
  ir.creature.actions = [{ name: 'Language Strike', description: sample.text, activityType: 'attack', attack: { type: 'mwak', toHit: 5, reach: 5 },
    appliedConditions: [{ statuses: [sample.label], duration: `${sample.value} ${sample.unit}` }],
    evidence: [{ start: source.indexOf(quote), end: source.length, quote }] }];
  ir.claims = ir.claims.filter(claim => !claim.path.startsWith('/creature/actions/'));
  const generated = await convertMarkdownContentToJson({ content: renderMonsterIntakeMarkdown(ir), fvttVersion: '14', effectProfile: 'core', translationService: null });
  const request = { source, actors: [{ key: 'creature', source, ir, artifact: generated.rawJson }] };
  const selection: any = { version: 2, name: 'Semantic language', notes: '', manualSteps: [], legendaryRecovery: [], rules: [
    { id: 'language', kind: 'status-lifecycle', actorKey: 'creature', featureName: 'Language Strike', section: 'action', quote,
      gmSteps: ['GM selects the attacked target.'], sourceEvidence: sample.sourceEvidence,
      parameters: { trigger: 'attack-hit', status: sample.status, duration: { value: sample.value, unit: sample.unit },
        repeatSave: { ability: sample.ability, dc: sample.dc, timing: 'target-turn-end', optional: sample.optional } } },
  ] };
  return { request, selection };
}

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe('explicit offline semantic lifecycle source audit', () => {
  test('the default compiler preserves AI-owned lifecycle parameters while explicit source audit reports their disagreement',async()=>{
    const {request,selection}=await fixture();
    const changed=structuredClone(selection);
    changed.rules[0].parameters.duration.value=2;
    changed.rules[0].parameters.repeatSave.dc=15;
    const compiled=compileEncounterSelection(changed,request);
    expect(compiled.selection!.rules[0]!.parameters).toEqual(changed.rules[0].parameters);
    expect(readFixedEncounterConfiguration(compiled.command)!.rules[0]!.parameters).toEqual(changed.rules[0].parameters);
    expect(compiled.rules[0]!.quote).toBe(selection.rules[0].quote);
    expect(()=>compileEncounterSelectionSourceAudit(changed,request)).toThrow();
    expect(decodeEncounterAutomation(compiled,request)).toEqual(compiled);
  });

  test('English and Chinese paraphrases normalize without requiring the historical sentence grammar', async () => {
    for (const sample of samples) {
      const { request, selection } = await fixture(sample);
      const compiled = compileEncounterSelectionSourceAudit(selection, request);
      expect(compiled.selection?.rules[0]?.sourceEvidence).toEqual(sample.sourceEvidence);
      expect(readFixedEncounterConfiguration(compiled.command)?.rules[0]?.parameters).toEqual(selection.rules[0].parameters);
      expect(compiled.command).not.toContain('sourceEvidence');
      expect(decodeEncounterAutomation(compiled, request)).toEqual(compiled);
      const legacy = structuredClone(selection); delete legacy.rules[0].sourceEvidence;
      expect(() => compileEncounterSelectionSourceAudit(legacy, request)).toThrow();
    }
  });

  test('binds registered custom aliases and retains the reviewed mechanism instead of an AI definition', async () => {
    const sample = structuredClone(samples[0]!);
    sample.text = sample.text.replaceAll('poisoned', 'Deep Wound'); sample.label = 'Deep Wound'; sample.status = 'configured.deep-wound';
    sample.sourceEvidence.application = sample.sourceEvidence.application.replaceAll('poisoned', 'Deep Wound');
    const { request, selection } = await fixture(sample);
    const definition = { schemaVersion: 1 as const, id: 'configured.deep-wound', name: '深创 Deep Wound', aliases: ['Deep Wound', '深创'], description: 'Bleeding',
      components: [{ kind: 'builtin-condition' as const, conditionId: 'bleeding' as const, params: { formula: '1d6' } }] };
    const scoped = { ...request, conditionCatalog: [definition] };
    const compiled = compileEncounterSelectionSourceAudit(selection, scoped);
    expect(compiled.selection?.rules[0]?.parameters.definition).toBeTruthy();
    expect(() => compileEncounterSelectionSourceAudit(selection, request)).toThrow('unregistered');
    const wrong = structuredClone(selection); wrong.rules[0].parameters.status = 'blinded';
    expect(() => compileEncounterSelectionSourceAudit(wrong, scoped)).toThrow();
  });

  test('rejects numeric, unit and ability drift within the cited field rather than matching other source numbers', async () => {
    for (const sample of samples) {
      const { request, selection } = await fixture(sample);
      for (const change of [
        (rule: any) => { rule.parameters.duration.value = sample.value + 1; },
        (rule: any) => { rule.parameters.duration.unit = sample.unit === 'minute' ? 'round' : 'minute'; },
        (rule: any) => { rule.parameters.repeatSave.dc = sample.dc + 1; },
        (rule: any) => { rule.parameters.repeatSave.ability = 'str'; },
        (rule: any) => { rule.sourceEvidence.repeatSave = rule.sourceEvidence.duration; },
      ]) {
        const changed = structuredClone(selection); change(changed.rules[0]);
        expect(() => compileEncounterSelectionSourceAudit(changed, request)).toThrow();
      }
    }
    for (const [duration, dc] of [['10 minutes', 'Constitution save (DC 130)'], ['1.5 minutes', 'Constitution save (DC fourteen)'], ['one or two rounds', 'Constitution save (DC fourteen)'], ['-1 minute', 'Constitution save (DC fourteen)'], ['−1 minute', 'Constitution save (DC fourteen)'], ['负一分钟', 'Constitution save (DC fourteen)'], ['one minute', 'Constitution DC -14'], ['one minute', 'Constitution DC 14.5']]) {
      const sample = structuredClone(samples[0]!);
      sample.text = sample.text.replace(sample.sourceEvidence.duration, duration!).replace(sample.sourceEvidence.repeatSave, dc!);
      sample.sourceEvidence.duration = duration!; sample.sourceEvidence.repeatSave = dc!;
      const { request, selection } = await fixture(sample);
      expect(() => compileEncounterSelectionSourceAudit(selection, request)).toThrow();
    }
  });

  test('numeric excerpts accept sentence punctuation, adjacent Chinese units and full-width digits', async () => {
    for (const [duration, dc] of [['1 minute.', 'Constitution saving throw against DC 14.'], ['１分钟', 'DC１４体质豁免'], ['一分钟', '体质豁免，难度为十四。']]) {
      const sample = structuredClone(samples[0]!);
      sample.text = sample.text.replace(sample.sourceEvidence.duration, duration!).replace(sample.sourceEvidence.repeatSave, dc!);
      sample.sourceEvidence.duration = duration!; sample.sourceEvidence.repeatSave = dc!;
      const { request, selection } = await fixture(sample);
      expect(compileEncounterSelectionSourceAudit(selection, request).selection?.rules[0]?.parameters.repeatSave).toMatchObject({dc:14});
    }
  });

  test('rejects absent, cross-feature, incomplete or executable evidence and never falls back', async () => {
    const { request, selection } = await fixture();
    for (const change of [
      (rule: any) => { rule.sourceEvidence.duration = 'not in this feature'; },
      (rule: any) => { rule.sourceEvidence.repeatSave = LURKER_SOURCE.slice(0, 20); },
      (rule: any) => { delete rule.sourceEvidence.timing; },
      (rule: any) => { rule.sourceEvidence.script = 'return 1'; },
      (rule: any) => { rule.sourceEvidence = null; },
      (rule: any) => { rule.parameters.repeatSave.timing = 'source-turn-end'; },
    ]) {
      const changed = structuredClone(selection); change(changed.rules[0]);
      expect(() => compileEncounterSelectionSourceAudit(changed, request)).toThrow();
    }
    const incomplete = structuredClone(selection);
    incomplete.rules[0].quote = samples[0]!.sourceEvidence.application;
    expect(compileEncounterSelectionSourceAudit(incomplete, request).selection?.rules[0]?.quote).toBe(selection.rules[0].quote);
  });

  test('independent review receives every qualifier outside excerpts and can reject semantic disagreement', async () => {
    const sample = structuredClone(samples[0]!);
    sample.text += ' This only works while the victim is in dim light, and taking damage also ends it.';
    const { request, selection } = await fixture(sample);
    const seen: any[] = [];
    const responses: unknown[] = [selection, { verdict: 'needs_review', findings: ['The extra light prerequisite and damage ending require GM adjudication.'] }];
    globalThis.fetch = (async (_url, init) => {
      seen.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(responses.shift()) } }] }));
    }) as typeof fetch;
    const provider = createEncounterAutomationProvider({ baseUrl: 'https://provider.example/v1', apiKey: 'fixture', model: 'fixture', structuredOutput: 'json_schema' });
    const automation = await provider.generate(request);
    const review = await provider.review({ ...request, automation });
    expect(review.verdict).toBe('needs_review');
    const payload = JSON.parse(seen[1].messages[1].content);
    expect(payload.automation.rules[0].quote).toContain('taking damage also ends it');
    expect(payload.automation.rules[0].sourceEvidence).toEqual(sample.sourceEvidence);
    expect(seen[1].messages[0].content).toContain('COMPLETE original feature');
    expect(seen[1].messages[0].content).toContain('permission versus obligation');
    expect(seen[0].response_format.json_schema.schema.properties.rules.items.properties.sourceEvidence).toBeTruthy();
    expect(seen[0].messages[0].content).toContain('compiler does not judge their meaning');
    expect(seen[0].messages[0].content).toContain('source auditing is an explicit offline operation');
  });
});
