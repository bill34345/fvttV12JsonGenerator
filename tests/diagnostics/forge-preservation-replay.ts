import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import yaml from 'js-yaml';

const registryPath = process.env.FORGE_PRESERVATION_INPUTS;
const outputDirectory = process.env.FORGE_PRESERVATION_OUTPUT;
if (!registryPath || !outputDirectory) throw Error('Set FORGE_PRESERVATION_INPUTS and a fresh FORGE_PRESERVATION_OUTPUT directory.');
const output = resolve(outputDirectory);
if (existsSync(output)) throw Error('Preserve earlier evidence; select a new output directory.');
mkdirSync(output, {recursive: true});
const originals = new Map<string, string>();
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const text = (path: string) => { const bytes = readFileSync(path); originals.set(path, sha(bytes)); return bytes.toString('utf8').replace(/^\uFEFF/u, ''); };
const json = (path: string): any => JSON.parse(text(path));
const save = (path: string, value: unknown) => writeFileSync(join(output, path), JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});
let networkAttempts = 0;
globalThis.fetch = Object.assign((async () => { networkAttempts++; throw Error('Frozen preservation replay forbids network requests.'); }), {preconnect: () => { throw Error('Frozen tests forbid network preconnect.'); }});
const {OpenAICompatibleMonsterIntakeProvider} = await import('@fvtt-json-generator/intake-ai/provider');
const {analyzeBrowserActorSourceWithAi, analyzeBrowserActorIntakeDraft, generateBrowserActorIntakeCandidate} = await import('@fvtt-json-generator/forge-browser-runtime/ai');
const {buildForgeActorRequest, convertFinalActorSource} = await import('@fvtt-json-generator/forge-browser-runtime');
const {createForgeSourceId} = await import('@fvtt-json-generator/forge-gateway-protocol');
const noCall = async (): Promise<never> => { throw Error('No additional extraction, discovery, repair, review or translation.'); };

interface ReplayCase {
  id: string;
  kind: string;
  expectation: 'priest' | 'ettercap' | 'ghoul' | 'dust' | 'dust-no-ability' | 'resource' | 'rakshasa' | 'mimic' | 'replacement-status' | 'child-save';
  sourcePath?: string;
  replyPath?: string;
  bundlePath?: string;
  analysisPath?: string;
  generationPath?: string;
  variant?: 'replacement-status' | 'child-save';
}
function load(entry: ReplayCase): {source: string; reply?: string; ir?: any; canonical?: string} {
  if (entry.generationPath) {
    const generated = json(entry.generationPath), canonical = generated.finalSource ?? generated.markdown;
    assert.equal(typeof canonical, 'string');
    const parsed = yaml.load(canonical.replace(/^---\s*\r?\n/u, '').replace(/\r?\n---\s*$/u, '')) as any;
    const sentence = 'Derived audit control: after the hit, DC 15 Constitution save.';
    const feature = parsed.动作[0];
    feature.描述 += '\n' + sentence;
    feature.子活动 = [...feature.子活动 ?? [], {名称:'Derived follow-up Save', 类型:'save', 触发:'special', DC:15, 属性:'体质', 描述:sentence}];
    return {source: sentence, canonical: '---\n' + yaml.dump(parsed, {lineWidth: -1}) + '---\n'};
  }
  if (entry.bundlePath) {
    const frozen = json(entry.bundlePath);
    return {source:frozen.capture.source, reply:frozen.evidence[0].content};
  }
  if (entry.replyPath && entry.sourcePath) return {source:text(entry.sourcePath), reply:text(entry.replyPath)};
  assert(entry.analysisPath);
  const frozen = json(entry.analysisPath);
  let source = frozen.rawSource ?? frozen.candidate.quote;
  const ir = structuredClone(frozen.ir);
  if (entry.variant === 'replacement-status') {
    const feature = ir.creature.actions.find((feature: any) => feature.englishName === 'Bite' || feature.name === 'Bite');
    const primary = feature.sourceOperations.find((op: any) => op.type === 'attack');
    const replacement = feature.sourceOperations.find((op: any) => op.damage?.some((part: any) => part.relationship === 'replacement'));
    assert(primary && replacement);
    const sentence = 'Only the replacement damage makes the target Prone.';
    source += '\n' + sentence;
    feature.description += '\n' + sentence;
    primary.appliedConditions = [];
    replacement.sourceText = (replacement.sourceText ?? '') + '\n' + sentence;
    replacement.appliedConditions = [{statuses:['prone'], condition:sentence}];
  }
  return {source, ir};
}
const activities = (item: any): any[] => Object.values(item.system?.activities ?? {});
const feature = (actor: any, englishName: string) => {
  const matches = actor.items.filter((entry: any) => entry.name === englishName || entry.name.endsWith(' ' + englishName) || entry.name.startsWith(englishName + ' '));
  assert.equal(matches.length, 1, 'Expected one feature ' + englishName); return matches[0];
};
const manifest = (actor: any) => actor.flags?.['fvtt-json-generator-spell-resolver']?.spellManifest;
const formula = (part: any) => part.custom?.enabled ? part.custom.formula.replace(/\s/gu, '')
  : (part.number ? `${part.number}d${part.denomination}` : '') + (part.bonus ? (/^[+-]/u.test(String(part.bonus)) ? '' : '+') + part.bonus : '');
function statusLinks(item: any, status: string): any[] {
  const ids = new Set(item.effects.filter((effect: any) => effect.statuses?.includes(status)).map((effect: any) => effect._id));
  assert(ids.size, `Missing ${status} template on ${item.name}`);
  return activities(item).filter(activity => activity.effects?.some((reference: any) => ids.has(reference._id)));
}
function check(entry: ReplayCase, actor: any): void {
  assert(actor && Array.isArray(actor.items), 'No Actor artifact');
  if (entry.expectation === 'priest') {
    const groups = manifest(actor)?.spellcastingGroups;
    assert.equal(groups?.length, 2); assert.equal(groups.flatMap((group: any) => group.spellRefs).length, 7);
    assert(groups.every((group: any) => group.ability === 'wis'));
    const refs = groups.flatMap((group: any) => group.spellRefs);
    assert.deepEqual(refs.map((ref: any) => ref.englishName).sort(), ['Light','Thaumanturgy','Spirit Guardians','Bless','Dispel Magic','Healing Word','Lesser Restoration'].sort());
    const guardian = refs.find((ref: any) => ref.englishName === 'Spirit Guardians');
    assert.deepEqual(guardian.uses, {value:1,recovery:'day',shared:false});
    const shared = groups.find((group: any) => group.spellRefs.some((ref: any) => ref.englishName === 'Bless'));
    assert.equal(shared.spellRefs.length, 4);
    assert(shared.spellRefs.every((ref: any) => ref.uses.value === 3 && ref.uses.recovery === 'day' && ref.uses.shared === true));
    assert.equal(String(feature(actor, 'Divine Aid').system.uses.max), '3');
  }
  if (entry.expectation === 'ettercap') {
    assert.equal(feature(actor, 'Reel').effects.length, 0);
    assert(statusLinks(feature(actor, 'Bite'), 'poisoned').every(activity => activity.type === 'damage'));
    assert(statusLinks(feature(actor, 'Web Strand'), 'restrained').every(activity => activity.type === 'save'));
  }
  if (entry.expectation === 'ghoul') {
    const claw = feature(actor, 'Claw'), list = activities(claw);
    assert(list.some(activity => activity.roll?.formula === '1d20+4'));
    assert(list.some(activity => activity.damage?.parts?.some((part: any) => formula(part) === '1d4+2')));
    assert(list.some(activity => activity.type === 'save' && activity.save.dc.formula === '10' && activity.save.ability.includes('con')));
    for (const status of ['paralyzed', 'incapacitated']) {
      const links = statusLinks(claw, status); assert.equal(links.length, 1); assert.equal(links[0].type, 'save');
      assert(links[0].effects.every((reference: any) => reference.onSave === false));
    }
  }
  if (entry.expectation === 'dust' || entry.expectation === 'dust-no-ability') {
    const groups = manifest(actor)?.spellcastingGroups;
    assert.equal(groups?.length, 1); assert.equal(groups[0].spellRefs.length, 1);
    assert.equal(groups[0].spellRefs[0].englishName, 'Sleep');
    assert.equal(groups[0].spellRefs[0].uses.value, 1);
    assert.equal(groups[0].ability, entry.expectation === 'dust-no-ability' ? undefined : 'cha');
    assert.equal(statusLinks(feature(actor, 'Blinding Breath'), 'blinded').length, 1);
  }
  if (entry.expectation === 'resource') {
    const first = feature(actor, 'Force Pulse'), second = feature(actor, 'Soul Mark');
    assert.equal(String(first.system.uses.max), '3'); assert(first.system.uses.recovery.some((recovery: any) => recovery.period === 'day'));
    for (const item of [first, second]) {
      const consuming = activities(item).filter(activity => activity.consumption?.targets?.some((target: any) => target.type === 'itemUses' && target.target === first._id && String(target.value) === '1'));
      assert.equal(consuming.length, 1, item.name + ' must consume exactly once');
      if (item === second) assert.equal(consuming[0].type, 'attack');
    }
    assert(!second.system.uses?.max, 'Do not create a second independent use pool');
  }
  if (entry.expectation === 'rakshasa') {
    const command = feature(actor, 'Baleful Command');
    for (const status of ['frightened', 'incapacitated']) {
      const linked = statusLinks(command, status); assert.equal(linked.length, 1); assert.equal(linked[0].type, 'save');
      assert.equal(linked[0].save.dc.formula, '18'); assert(linked[0].save.ability.includes('wis'));
    }
  }
  if (entry.expectation === 'mimic') {
    const bite = feature(actor, 'Bite'); assert.equal(bite.effects.length, 0);
    assert(activities(bite).some(activity => activity.flags?.fvttJsonGenerator?.sourceOperation?.damageMode === 'ordinary'));
    assert(activities(bite).some(activity => activity.flags?.fvttJsonGenerator?.sourceOperation?.damageMode === 'alternative'));
  }
  if (entry.expectation === 'replacement-status') {
    const bite = feature(actor, 'Bite'), linked = statusLinks(bite, 'prone'); assert.equal(linked.length, 1);
    assert.notEqual(linked[0].flags?.fvttJsonGenerator?.sourceOperation?.damageMode, 'ordinary');
    assert.equal(linked[0].type, 'damage');
  }
  if (entry.expectation === 'child-save') {
    assert(actor.items.flatMap(activities).some((activity: any) => activity.type === 'save' && activity.save.dc.formula === '15' && activity.save.ability.includes('con')));
  }
}

const selected = process.env.FORGE_PRESERVATION_CASES?.split(',');
const registry = json(registryPath) as {cases: ReplayCase[]};
const results: any[] = [];
for (const entry of registry.cases.filter(entry => !selected || selected.includes(entry.id))) {
  assert(/^[a-z0-9-]+$/u.test(entry.id)); mkdirSync(join(output, entry.id));
  let frozenResponseReads = 0;
  try {
    if (process.env.FORGE_PRESERVATION_VERIFY_EXISTING) {
      const artifactPath = join(process.env.FORGE_PRESERVATION_VERIFY_EXISTING, entry.id, 'actor.json');
      const actor = json(artifactPath); check(entry, actor);
      results.push({id:entry.id, kind:entry.kind, passed:true, verificationOnly:true, artifactPath, artifactSha256:sha(readFileSync(artifactPath)), frozenResponseReads:0, realModelRequests:0});
      console.log(JSON.stringify(results.at(-1))); continue;
    }
    const loaded = load(entry);
    const sourceId = createForgeSourceId(() => {const h = sha('preservation-fix:' + entry.id); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;});
    const input = {source:loaded.source, sourceName:entry.id, sourceScope:'single' as const, sourceId, requestId:entry.id, fvttVersion:'14.368', systemVersion:'5.3.3', autoCorrect:false};
    let actor: any, findings: any;
    if (loaded.canonical) {
      const response = await convertFinalActorSource(buildForgeActorRequest({displayName:entry.id,content:loaded.canonical, sourceId, requestId:entry.id, fvttVersion:input.fvttVersion, systemVersion:input.systemVersion}));
      save(entry.id + '/response.json', response);
      assert('result' in response); actor = response.result.artifact; findings = response.result.diagnostics;
      writeFileSync(join(output,entry.id,'generated-source.md'), loaded.canonical, {flag:'wx'});
    } else {
      const provider = new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key', reviewModel:'disabled', apiKey:'frozen-only', baseUrl:'https://offline.invalid', model:'saved-answer', maxAttempts:1, timeoutMs:60000, repairTimeoutMs:60000,
        httpClient:async () => {frozenResponseReads++; assert(loaded.reply && frozenResponseReads === 1); return Response.json({choices:[{message:{content:loaded.reply}}]});}});
      const allowed = {providerName:provider.providerName, extractionModel:provider.extractionModel, reviewModel:'disabled', discover:noCall, extract:provider.extract.bind(provider), extractAnswer:provider.extractAnswer.bind(provider), review:noCall, repair:noCall};
      const analysis = loaded.ir ? analyzeBrowserActorIntakeDraft(input, loaded.ir, allowed) : await analyzeBrowserActorSourceWithAi(input, allowed);
      const generated = await generateBrowserActorIntakeCandidate(input, analysis, {...allowed, extract:noCall, extractAnswer:noCall});
      save(entry.id+'/analysis.json', analysis); save(entry.id+'/generation.json', generated);
      if (generated.finalSource) writeFileSync(join(output,entry.id,'generated-source.md'), generated.finalSource, {flag:'wx'});
      actor = generated.candidateResponse && 'result' in generated.candidateResponse ? generated.candidateResponse.result.artifact : undefined;
      findings = generated.findings;
    }
    if (actor) save(entry.id+'/actor.json', actor);
    check(entry, actor);
    results.push({id:entry.id, kind:entry.kind, passed:true, frozenResponseReads, realModelRequests:0, sourceSha256:sha(loaded.source), items:actor.items.length, findings});
  } catch (error) {
    results.push({id:entry.id, kind:entry.kind, passed:false, frozenResponseReads, realModelRequests:0, error:error instanceof Error ? error.message : String(error)});
  }
  console.log(JSON.stringify(results.at(-1), (key, value) => key === 'findings' ? undefined : value));
}
const changedOriginals = [...originals].filter(([path, hash]) => sha(readFileSync(path)) !== hash).map(([path]) => path);
save('summary.json', {networkAttempts, realModelRequests:0, changedOriginals, originals:[...originals].map(([path, sha256]) => ({path,sha256})), results});
if (networkAttempts || changedOriginals.length || !results.length || results.some(result => !result.passed)) process.exitCode = 1;
