import { afterEach, describe, expect, test } from 'bun:test';
import { buildForgeActorRequest, convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';
import {
  buildEncounterMacroCommand,
  compileEncounterSelection,
  createEncounterAutomationProvider,
  EncounterAutomationSelectionNeedsReviewError,
  decodeEncounterAutomation,
  renderEncounterActorSource,
  type EncounterAutomationIR,
  type EncounterAutomationRequest,
} from '../packages/intake-ai/src/encounter-automation';
import { RAT_WARLOCK_SOURCE, buildRatWarlockIr } from '../src/core/intake/__tests__/fixtures/rat-warlock';
import { createEncounterIntakeProviders } from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {renderMonsterFeatureName} from '@fvtt-json-generator/intake-ai/renderer';

const originalFetch = globalThis.fetch;

afterEach(() => { globalThis.fetch = originalFetch; });

function request(): EncounterAutomationRequest {
  const ir = buildRatWarlockIr();
  const quote = '啃咬Bite。近战武器攻击：命中+4，触及5尺，单一目标。命中：4（1d4+2）穿刺伤害。';
  const start = RAT_WARLOCK_SOURCE.indexOf(quote);
  ir.creature.actions[0]!.evidence = [{ start, end: start + quote.length, quote }];
  return {
    source: RAT_WARLOCK_SOURCE,
    actors: [{ key: 'rat', ir, source: RAT_WARLOCK_SOURCE, artifact: {items:[{name:renderMonsterFeatureName(ir.creature.actions[0]!),system:{activities:{attack:{type:'attack',attack:{}}}}}]} }],
  };
}

function automation(input = request()): EncounterAutomationIR {
  const feature = input.actors[0]!.ir.creature.actions[0]!;
  const quote = '啃咬Bite。近战武器攻击：命中+4，触及5尺，单一目标。命中：4（1d4+2）穿刺伤害。';
  return compileEncounterSelection({
    version: 2,
    name: '鼠神邪术师战斗辅助',
    notes: '仅处理来源明确的 GM 辅助步骤。',
    rules: [{
      id:'rat-manual',kind:'gm-manual',parameters:{},actorKey: 'rat', featureName: feature.name, section: 'action', quote,
      gmSteps: ['GM 按该来源动作与已选中指示物的 actor 核对后处理。','特殊后果不自动执行，由 GM 手动追踪并结束。'],
    }],
    legendaryRecovery:[],
    manualSteps: ['未涵盖的目标选择仍由 GM 决定。'],
  },input);
}

function installFakeTransport(payloads: unknown[], seen: Array<{ url: string; body: any }> = []): void {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) });
    const payload = payloads.shift();
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), { status: 200 });
  }) as typeof fetch;
}

describe('encounter automation Intake', () => {
  test('rejects tampering, unknown carriers, missing evidence, duplicate rules, missing bindings, and disallowed command operations', () => {
    const input = request();
    const valid = automation(input);
    const invalids: Array<[string, unknown]> = [
      ['extra key', { ...valid, extra: true }],
      ['unknown carrier', { ...valid, rules: [{ ...valid.rules[0]!, featureName: '不存在动作' }] }],
      ['source mismatch', { ...valid, rules: [{ ...valid.rules[0]!, quote: '不存在的原文' }] }],
      ['real quote for another carrier', { ...valid, rules: [{
        ...valid.rules[0]!, quote: '敏锐嗅觉Keen Smell。鼠怪依赖嗅觉所进行的感知（察觉）检定具有优势。',
      }] }],
      ['duplicate rule', { ...valid, rules: [valid.rules[0], structuredClone(valid.rules[0]!)] }],
      ['missing binding', { ...valid, command: 'return { showPanel() {} };' }],
      ['network call', { ...valid, command: 'const rat = forgeEncounter.actors.rat; await fetch("https://example.invalid"); return { showPanel() {} };' }],
      ['hard-coded UUID', { ...valid, command: 'const rat = forgeEncounter.actors.rat; const id = "Actor.abc123"; return { showPanel() {} };' }],
      ['prototype key', JSON.parse('{"version":1,"name":"x","command":"const rat = forgeEncounter.actors.rat; return { showPanel() {} };","notes":"","rules":[{"actorKey":"rat","featureName":"啃咬","section":"action","quote":"近战武器攻击：命中+4，触及5尺，单一目标。命中：4（1d4+2）穿刺伤害。","gmSteps":["GM处理"]}],"manualSteps":[],"__proto__":{}}')],
    ];
    for (const [label, value] of invalids) expect(() => decodeEncounterAutomation(value, input), label).toThrow();
    expect(()=>decodeEncounterAutomation({ ...valid, rules: [] }, input)).toThrow();
    const empty=compileEncounterSelection({...valid.selection!,rules:[]},input);
    expect(decodeEncounterAutomation(empty,input).rules).toEqual([]);
    expect(renderEncounterActorSource(input.actors[0]!.ir, [])).not.toContain('行为机制:');
  });

  test('keeps generated command text inert, sends JSON Schema through the shared transport, and uses a separate review call', async () => {
    const input = request();
    const marker = '__encounterAutomationMustRemainInert';
    const generated = {version:2,name:'固定控制入口',notes:'无额外自动机制',rules:[],legendaryRecovery:[],manualSteps:[]};
    const seen: Array<{ url: string; body: any }> = [];
    installFakeTransport([generated, { verdict: 'accepted', findings: [] }], seen);
    const provider = createEncounterAutomationProvider({
      baseUrl: 'https://provider.example/v1', apiKey: 'test-key', model: 'gpt-test', reviewModel: 'gpt-review',
      protocol: 'openai-chat', structuredOutput: 'json_schema', reasoning: 'max', timeoutMs: 1_000,
    });
    const result = await provider.generate(input);
    expect(result.command).not.toContain(marker);
    expect(result.command).toContain('startEncounterAutomation');
    expect((globalThis as Record<string, unknown>)[marker]).toBeUndefined();
    expect(seen[0]!.url).toBe('https://provider.example/v1/chat/completions');
    expect(seen[0]!.body.model).toBe('gpt-test');
    expect(seen[0]!.body.reasoning_effort).toBe('max');
    const compact=JSON.parse(seen[0]!.body.messages[1].content);
    expect(compact.actors[0].artifact).toBeUndefined();
    expect(compact.actors[0].ir).toBeUndefined();
    expect(compact.actors[0].source).toBeUndefined();
    expect(compact.source).toBe(input.source);
    expect(compact.actors[0].features[0].ref).toBeTruthy();
    expect(seen[0]!.body.messages[0].content).toContain('Never write executable code');
    expect(seen[0]!.body.messages[0].content).toContain('save-summon');
    expect(seen[0]!.body.response_format.json_schema.schema.required).toEqual([
      'version', 'rules', 'legendaryRecovery', 'unresolved',
    ]);

    await expect(provider.review({ ...input, automation: result })).resolves.toEqual({ verdict: 'accepted', findings: [] });
    expect(seen[1]!.body.model).toBe('gpt-review');
    expect(seen).toHaveLength(2);
  });

  test('Forge automation self-check ignores an old reviewer model without skipping the request', async () => {
    const input = request();
    const seen: Array<{ url: string; body: any }> = [];
    installFakeTransport([{ verdict: 'needs_review', findings: ['A source limit is missing.'] }], seen);
    const { automationProvider } = createEncounterIntakeProviders({
      baseUrl: 'https://provider.example/v1', apiKey: 'test-key', model: 'generator',
      reviewModel: 'old-reviewer', protocol: 'openai-chat', structuredOutput: 'json_object',
    });
    const review = await automationProvider.review({ ...input, automation: automation(input) });
    expect(review).toEqual({ verdict: 'needs_review', findings: ['A source limit is missing.'] });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.body.model).toBe('generator');
    expect(seen[0]!.body.messages[0].content).toContain('Forge self-check with the selected generation model');
  });

  test('the AI provider rejects a returned executable command even when legacy manual packages can carry reviewed scripts',async()=>{
    installFakeTransport([automation(request()),automation(request())]);
    const provider=createEncounterAutomationProvider({baseUrl:'https://provider.example/v1',apiKey:'test-key',model:'test',structuredOutput:'json_object'});
    await expect(provider.generate(request())).rejects.toBeInstanceOf(EncounterAutomationSelectionNeedsReviewError);
  });

  test('configured-condition review sends only the review response contract with capability reference data', async () => {
    const input = request();
    input.conditionCatalog = [{ schemaVersion: 1, id: 'configured.frostbite', name: '霜蚀 Frostbite',
      description: '移动速度降低10尺，并陷入耳聋。', aliases: ['Frostbite', '霜蚀'],
      components: [{ kind: 'movement-reduction', feet: 10 }, { kind: 'native-condition', status: 'deafened' }] }];
    const seen: Array<{ url: string; body: any }> = [];
    installFakeTransport([{ verdict: 'accepted', findings: [] }], seen);
    const provider = createEncounterAutomationProvider({ baseUrl: 'https://provider.example/v1', apiKey: 'test-key', model: 'test', structuredOutput: 'json_schema' });
    await expect(provider.review({ ...input, automation: automation(input) })).resolves.toEqual({ verdict: 'accepted', findings: [] });
    const prompt = seen[0]!.body.messages[0].content;
    expect(prompt).toContain('"verdict"');
    expect(prompt).toContain('status-lifecycle');
    expect(prompt).toContain('configured.frostbite');
    expect(prompt).not.toContain('Return data only:');
    expect(prompt).not.toContain('Return trigger, status, duration and repeatSave only');
    expect(seen[0]!.body.response_format.json_schema.schema.required).toEqual(['verdict', 'findings']);
    expect(JSON.parse(seen[0]!.body.messages[1].content).configuredConditions).toEqual(input.conditionCatalog.map(({schemaVersion:_,...definition})=>definition));
  });

  test('an accepted review with generation or extra keys still fails closed', async () => {
    const input = request();
    const provider = createEncounterAutomationProvider({ baseUrl: 'https://provider.example/v1', apiKey: 'test-key', model: 'test', structuredOutput: 'json_object' });
    for (const invalid of [{ verdict: 'accepted', findings: [], version: 2 }, { version: 2, name: 'Control', rules: [], manualSteps: [], legendaryRecovery: [] }]) {
      const seen: Array<{ url: string; body: any }> = [];
      installFakeTransport([invalid], seen);
      await expect(provider.review({ ...input, automation: automation(input) })).rejects.toThrow('$review must contain exactly the supported keys.');
      expect(seen).toHaveLength(1);
    }
  });

  test('one structural compiler failure gets one data-only correction with unchanged actor evidence',async()=>{
    const input=request();
    const feature=input.actors[0]!.ir.creature.actions[0]!;
    const proposed={version:2,name:'Reviewed control',notes:'',manualSteps:[],legendaryRecovery:[],rules:[
      {id:'manual',kind:'gm-manual',actorKey:'rat',featureName:feature.name,section:'action',
        quote:feature.evidence![0]!.quote,gmSteps:['Read source.'],parameters:{}}]};
    const corrected={...proposed,rules:[]};
    const seen:Array<{url:string;body:any}>=[];
    installFakeTransport([proposed,corrected],seen);
    const provider=createEncounterAutomationProvider({baseUrl:'https://provider.example/v1',apiKey:'test-key',model:'test',structuredOutput:'json_object'});
    const result=await provider.generate(input);
    expect(result.selection?.rules).toEqual([]);
    expect(seen).toHaveLength(2);
    const first=JSON.parse(seen[0]!.body.messages[1].content);
    const second=JSON.parse(seen[1]!.body.messages[1].content);
    expect(second.source).toBe(first.source);
    expect(second.actors).toEqual(first.actors);
    expect(second.prior).toEqual({version:3,rules:[{featureRef:'feature-1-action-1',kind:'gm-manual',parameters:{},gmSteps:proposed.rules[0]!.gmSteps}],legendaryRecovery:[],unresolved:[]});
    expect(second.findings).toHaveLength(1);
    expect(second.findings[0]).toContain('closed-data compilation');
  });

  test('second data failure is typed, and executable fields never enter correction prior or output',async()=>{
    const input=request();
    const malicious={version:2,name:'Unsafe',notes:'',manualSteps:[],legendaryRecovery:[],rules:[],command:'return eval("code")'};
    const seen:Array<{url:string;body:any}>=[];
    installFakeTransport([malicious,malicious],seen);
    const provider=createEncounterAutomationProvider({baseUrl:'https://provider.example/v1',apiKey:'test-key',model:'test',structuredOutput:'json_object'});
    let caught:unknown;
    try{await provider.generate(input);}catch(error){caught=error;}
    expect(caught).toBeInstanceOf(EncounterAutomationSelectionNeedsReviewError);
    expect((caught as EncounterAutomationSelectionNeedsReviewError).findings).toHaveLength(1);
    expect(seen).toHaveLength(2);
    const retry=JSON.parse(seen[1]!.body.messages[1].content);
    expect(retry.prior).toBeUndefined();
    expect(JSON.stringify(retry)).not.toContain('return eval');
  });

  test('transport errors do not enter the compiler correction path',async()=>{
    let calls=0;
    globalThis.fetch=(async()=>{calls++;return new Response('bad request',{status:400});}) as unknown as typeof fetch;
    const provider=createEncounterAutomationProvider({baseUrl:'https://provider.example/v1',apiKey:'test-key',model:'test',structuredOutput:'json_object'});
    await expect(provider.generate(request())).rejects.toThrow();
    expect(calls).toBe(1);
  });

  test('rejects an invalid independent review response and cancelled provider work without starting a request', async () => {
    const input = request();
    installFakeTransport([{ verdict: 'accepted', findings: [42] }]);
    const provider = createEncounterAutomationProvider({ baseUrl: 'https://provider.example/v1', apiKey: 'test-key', model: 'gpt-test' });
    await expect(provider.review({ ...input, automation: automation(input) })).rejects.toThrow();

    let calls = 0;
    globalThis.fetch = (async () => { calls += 1; throw new Error('should not send'); }) as unknown as typeof fetch;
    const controller = new AbortController();
    controller.abort();
    const cancelled = createEncounterAutomationProvider({ baseUrl: 'http://127.0.0.1:8787/v1', apiKey: 'local', model: 'gpt-test' }, controller.signal);
    await expect(cancelled.generate(input)).rejects.toThrow(/abort/u);
    expect(calls).toBe(0);
  });

  test('renders supported literal GM-assisted lifecycle mechanics and projects their shape through the browser runtime public entrypoint', async () => {
    const input = request();
    const value = automation(input);
    const source = renderEncounterActorSource(input.actors[0]!.ir, [{ ...value.rules[0]!, mechanicId: 'rule-1' }]);
    expect(source).toContain('行为机制:');
    expect(source).toContain('表达覆盖: literal');
    expect(source).toContain('执行模式: gm-assisted');
    expect(source).toContain('规则来源: source-derived');
    expect(source).toContain('说明: 啃咬Bite。近战武器攻击');
    const command = buildEncounterMacroCommand(value);
    expect(command).toBe(value.command);
    expect(command).toContain("game.modules.get('fvtt-json-forge').api.startEncounterAutomation(forgeEncounter,");
    expect(command).not.toContain('globalThis.forgeEncounter');
    expect(command).not.toContain('registeredHooks');

    const response = await convertFinalActorSource(buildForgeActorRequest({
      content: source, displayName: 'Rat', requestId: 'encounter-automation-shape', fvttVersion: '14.364', systemVersion: '5.3.3',
    }));
    expect('result' in response).toBeTrue();
    if (!('result' in response)) throw new Error('Expected a browser runtime result.');
    expect(response.result.status,JSON.stringify(response.result.diagnostics)).toBe('needs_review');
    if (!('artifact' in response.result)) throw new Error('Expected formal artifact for review.');
    const carrier = (response.result.artifact!.items as any[]).find((item) => item.name === '啃咬 Bite');
    expect(carrier.flags.fvttJsonGenerator.behaviorMechanics).toEqual([expect.objectContaining({
      id: 'rule-1', kind: 'lifecycle', coverage: 'literal', executionMode: 'gm-assisted', ruleSource: 'source-derived',
    })]);
  });

  test('the fixed selection command uses imported lexical bindings and awaits its module API', async () => {
    const input = request();
    const command = buildEncounterMacroCommand(automation(input));
    const prefix = 'const forgeEncounter = Object.freeze({ ...{"actors":{"rat":"Actor.0123456789abcdef"},"bindingKeys":{"rat":"rat"},"covers":[],"packageHash":"package-hash","packageId":"rat-encounter"}, actors: Object.freeze({"rat":"Actor.0123456789abcdef"}) });\n';
    const scope = globalThis as Record<string, unknown>;
    const saved = { game: scope.game, canvas: scope.canvas, Hooks: scope.Hooks, forgeEncounter: scope.forgeEncounter };
    const released: Array<[string, number]> = [];
    let releaseStart: (()=>void)|undefined;
    const startGate=new Promise<void>(resolve=>{releaseStart=resolve;});
    const companion={showPanel(){},history:[]};
    try {
      scope.forgeEncounter = undefined;
      const starts:any[]=[];
      scope.game = { user: { isGM: true }, version: '14.364', system: { id: 'dnd5e', version: '5.3.3' },
        modules:new Map([['fvtt-json-forge',{api:{startEncounterAutomation:async(binding:unknown,configuration:unknown)=>{
          starts.push({binding,configuration});await startGate;return companion;
        }}}]]) };
      scope.canvas = { scene: {}, tokens: { controlled: [] } };
      scope.Hooks = { on: () => 1, once: () => 2, off: (name: string, id: number) => { released.push([name, id]); } };
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (body: string) => () => Promise<any>;
      const start = new AsyncFunction(`${prefix}${command}`);
      let settled=false;
      const pending=start().then(value=>{settled=true;return value;});
      await Promise.resolve();
      expect(starts).toHaveLength(1);
      expect(settled).toBe(false);
      expect(starts[0].binding.actors).toEqual({rat:'Actor.0123456789abcdef'});
      expect(starts[0].configuration.rules[0].kind).toBe('gm-manual');
      releaseStart!();
      expect(await pending).toBe(companion);
      expect(released).toEqual([]);
    } finally {
      scope.game = saved.game;
      scope.canvas = saved.canvas;
      scope.Hooks = saved.Hooks;
      scope.forgeEncounter = saved.forgeEncounter;
    }
  });

  test('the explicitly reviewed legacy wrapper serializes starts and releases a failed start for an explicit retry', async () => {
    const input = request();
    // Historical manually reviewed imports have no AI selection. Their wrapper
    // lifecycle remains a separate compatibility boundary from AI compilation.
    const {selection:_,...legacyAutomation}=automation(input);
    const prefix = 'const forgeEncounter = Object.freeze({ ...{"actors":{"rat":"Actor.0123456789abcdef"},"bindingKeys":{"rat":"rat"},"covers":[],"packageHash":"package-hash","packageId":"rat-encounter"}, actors: Object.freeze({"rat":"Actor.0123456789abcdef"}) });\n';
    const scope = globalThis as Record<string, any>;
    const saved = { game: scope.game, canvas: scope.canvas, Hooks: scope.Hooks };
    let releaseFirstStart: (() => void) | undefined;
    const firstStartGate = new Promise<void>((resolve) => { releaseFirstStart = resolve; });
    const hookCalls: string[] = [];
    try {
      scope.game = { user: { isGM: true }, version: '14.364', system: { id: 'dnd5e', version: '5.3.3' } };
      scope.canvas = { scene: {}, tokens: { controlled: [] } };
      scope.Hooks = {
        on: (name: string) => { hookCalls.push(`on:${name}`); return hookCalls.length; },
        once: (name: string) => { hookCalls.push(`once:${name}`); return hookCalls.length; },
        off: (name: string, id: number) => { hookCalls.push(`off:${name}:${id}`); },
      };
      scope.__encounterStarts = 0;
      scope.__encounterStartGate = firstStartGate;
      const command = buildEncounterMacroCommand({
        ...legacyAutomation,
        command: `const rat = forgeEncounter.actors.rat;
globalThis.__encounterStarts += 1;
Hooks.on('encounter-test', () => rat);
await globalThis.__encounterStartGate;
return { showPanel() {}, history: [] };`,
      });
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (body: string) => () => Promise<any>;
      const start = new AsyncFunction(`${prefix}${command}`);
      const first = start();
      await Promise.resolve();
      const second = start();
      expect(scope.__encounterStarts).toBe(1);
      expect(hookCalls).toEqual(['on:encounter-test']);
      releaseFirstStart!();
      const [firstRuntime, secondRuntime] = await Promise.all([first, second]);
      expect(firstRuntime).toBe(secondRuntime);
      expect(scope.__encounterStarts).toBe(1);
      await firstRuntime.stop();
      expect(hookCalls).toEqual(['on:encounter-test', 'off:encounter-test:1']);

      scope.__encounterFailOnce = true;
      let releaseFailure: (() => void) | undefined;
      scope.__encounterFailureGate = new Promise<void>((resolve) => { releaseFailure = resolve; });
      const failedCommand = buildEncounterMacroCommand({
        ...legacyAutomation,
        command: `const rat = forgeEncounter.actors.rat;
Hooks.on('encounter-failure', () => rat);
await globalThis.__encounterFailureGate;
if (globalThis.__encounterFailOnce) { globalThis.__encounterFailOnce = false; throw new Error('planned start failure'); }
return { showPanel() {}, history: [] };`,
      });
      const failedStart = new AsyncFunction(`${prefix}${failedCommand}`);
      const failedFirst = failedStart();
      await Promise.resolve();
      const failedSecond = failedStart();
      releaseFailure!();
      await expect(Promise.all([failedFirst, failedSecond])).rejects.toThrow('planned start failure');
      expect(scope.game.forgeEncounterRuntimeStarts.has('rat-encounter')).toBeFalse();
      const retried = await failedStart();
      expect(retried.packageHash).toBe('package-hash');
      await retried.stop();

      scope.__encounterPanelStarts = 0;
      scope.__encounterPanelFails = true;
      let releasePanelFailure: (() => void) | undefined;
      scope.__encounterPanelFailureGate = new Promise<void>((resolve) => { releasePanelFailure = resolve; });
      const panelFailureCommand = buildEncounterMacroCommand({
        ...legacyAutomation,
        command: `const rat = forgeEncounter.actors.rat;
globalThis.__encounterPanelStarts += 1;
Hooks.on('encounter-panel-failure', () => rat);
return { async showPanel() {
  await globalThis.__encounterPanelFailureGate;
  if (globalThis.__encounterPanelFails) { globalThis.__encounterPanelFails = false; throw new Error('planned panel failure'); }
}, history: [] };`,
      });
      const panelFailureStart = new AsyncFunction(`${prefix}${panelFailureCommand}`);
      const panelFirst = panelFailureStart();
      await Promise.resolve();
      const panelSecond = panelFailureStart();
      expect(scope.__encounterPanelStarts).toBe(1);
      expect(hookCalls.filter((entry) => entry === 'on:encounter-panel-failure')).toHaveLength(1);
      releasePanelFailure!();
      await expect(Promise.all([panelFirst, panelSecond])).rejects.toThrow('planned panel failure');
      expect(scope.game.forgeEncounterRuntimes.has('rat-encounter')).toBeFalse();
      expect(scope.game.forgeEncounterRuntimeStarts.has('rat-encounter')).toBeFalse();
      expect(hookCalls.some((entry) => entry.startsWith('off:encounter-panel-failure:'))).toBeTrue();
      const recoveredAfterPanelFailure = await panelFailureStart();
      expect(scope.__encounterPanelStarts).toBe(2);
      await recoveredAfterPanelFailure.stop();
    } finally {
      scope.game = saved.game;
      scope.canvas = saved.canvas;
      scope.Hooks = saved.Hooks;
      delete scope.__encounterStarts;
      delete scope.__encounterStartGate;
      delete scope.__encounterFailOnce;
      delete scope.__encounterFailureGate;
      delete scope.__encounterPanelStarts;
      delete scope.__encounterPanelFails;
      delete scope.__encounterPanelFailureGate;
    }
  });
});
