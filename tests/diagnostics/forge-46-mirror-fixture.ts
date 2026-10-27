import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

const evidence = process.env.FORGE_46_EVIDENCE_ROOT ?? 'H:/CodexData/visualizations/2026/10/27/01a17bee-ceb9-7eb3-8fce-a8320e15295f/forge-46-remediation';
const outputArg = process.argv.indexOf('--output-subdir');
const outputSubdir = outputArg >= 0 ? process.argv[outputArg + 1] : '';
if (outputArg >= 0 && !/^[a-z0-9-]+$/u.test(outputSubdir ?? '')) throw Error('Expected a folder label after --output-subdir');
const output = resolve(evidence, 'mirror-fixture', outputSubdir ?? '');
const macroArg = process.argv.indexOf('--macro-id');
const macroId = macroArg >= 0 ? process.argv[macroArg + 1] : undefined;
if (macroArg >= 0 && !/^[a-zA-Z0-9]{16}$/u.test(macroId ?? '')) throw Error('Expected the existing Foundry Macro ID after --macro-id');
const frozen = 'H:/CodexData/visualizations/2026/10/27/01a17adc-866c-7053-9668-326e795f4b96/forge-offline-five-20261027/results';
const drafts = 'H:/CodexData/visualizations/2026/10/25/01a1720b-4563-7511-82df-e8cb00ed7e53/forge-regression-recovery/stage2-ui';
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const read = (file: string) => readFileSync(file, 'utf8').replace(/^\uFEFF/u, '');
const readJson = (file: string) => JSON.parse(read(file));
const arg = process.argv.indexOf('--bundle-hash');
const bundleHash = arg >= 0 ? process.argv[arg + 1] : 'PARENT_SET_BUNDLE_SHA256';
if (arg >= 0 && !/^[a-f0-9]{64}$/u.test(bundleHash ?? '')) throw Error('Expected a SHA-256 after --bundle-hash');
mkdirSync(output, {recursive: true});
const cases: Record<string, {source: string; rawReply: string; sourceHash: string; replyKind: string; replyOrigin: string}> = {};
for (const [id, folder] of [['otyugh', 'member-otyugh'], ['mimic', 'member-mimic']] as const) {
  const source = readJson(join(frozen, folder, 'analysis.json')).candidate.quote;
  const replyOrigin = join(frozen, folder, 'raw-answer.txt');
  cases[id] = {source, rawReply: read(replyOrigin), sourceHash: sha(source), replyKind: 'original-first-answer', replyOrigin};
  writeFileSync(join(output, id + '.source.md'), source);
}
const textReplyOrigin = join(evidence, 'frozen-pass-2/mimic/generation.json');
const canonicalSource = readJson(textReplyOrigin).finalSource;
if (typeof canonicalSource !== 'string' || !canonicalSource.trim()) throw Error('The controlled text-format replay requires the actual Mimic finalSource');
const textCase = {...cases.mimic!, rawReply: '```markdown\n' + canonicalSource + '\n```', replyKind: 'synthetic-format-replay', replyOrigin: textReplyOrigin};
cases['mimic-text'] = textCase;
writeFileSync(join(output, 'mimic-text.source.md'), textCase.source);
writeFileSync(join(output, 'mimic-text.reply.md'), textCase.rawReply);
const config = {batch: 'forge46-20261027', origin: 'http://127.0.0.1:30001', world: 'cor-cotn', core: '14.368', system: '5.3.3',
  bundleHash, packageId: 'forge46-20261027-macrofail', packageMacro: {key: 'battle-control', name: 'Forge46 GM manual control'},
  fakeOrigin: 'https://forge46-frozen.invalid', model: 'forge46-frozen', cases,
  drafts: {'restore-v1': readJson(join(drafts, 'v1-record.json')), 'restore-v2': readJson(join(drafts, 'v2-record.json'))}};

// This command is imported and executed through Foundry's ordinary Macro UI.
const body = String.raw`
const cfg = __CONFIG__;
if (location.origin !== cfg.origin || game.world.id !== cfg.world || game.version !== cfg.core || game.system.version !== cfg.system || !game.user.isGM) throw Error('Forge46 fixture target differs');
const own = game.macros.filter(m => m.flags?.forge46Fixture?.batch === cfg.batch);
if (own.length !== 1) throw Error('Expected one imported Forge46 task Macro');
const macro = own[0], key = '__forge46MirrorFixture';
const copy = value => value === undefined ? null : structuredClone(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const hashText = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(n => n.toString(16).padStart(2, '0')).join('');
const hash = value => hashText(JSON.stringify(canonical(value)));
const intake = () => {
  const app = foundry.applications.instances.get('fvtt-json-forge-workspace-actor')?.intake;
  if (!app?.candidateStore?.load || !app.services?.generateBrowserActorIntakeCandidate) throw Error('Open the ordinary Forge Actor workspace first');
  return app;
};
const renderIntake = async current => {
  const owner = foundry.applications.instances.get('fvtt-json-forge-workspace-actor');
  if (owner?.intake === current && owner.rendered) await owner.render(false);
};
const collectionRows = async (collection, exclude = '') => Promise.all(collection.contents.filter(d => d.id !== exclude).sort((a,b) => a.id.localeCompare(b.id)).map(async d => ({id: d.id, name: d.name, hash: await hash(d.toObject())})));
const world = async () => ({world: game.world.id, core: game.version, system: game.system.version, paused: game.paused, worldTime: game.time.worldTime,
  activeScene: game.scenes.active?.id ?? null, viewedScene: canvas.scene?.id ?? null,
  actors: await collectionRows(game.actors), items: await collectionRows(game.items), scenes: await collectionRows(game.scenes), macros: await collectionRows(game.macros, macro.id),
  combats: await collectionRows(game.combats), messages: await collectionRows(game.messages)});
const storeHashes = async store => Object.fromEntries(await Promise.all(Object.entries(await store.load()).map(async ([k,v]) => [k, await hash(v)])));
let servedBundleText;
if (!globalThis[key]) {
  const originalFetch = globalThis.fetch;
  servedBundleText = await (await originalFetch.call(globalThis, 'modules/fvtt-json-forge/scripts/index.js', {cache: 'no-store'})).text();
  const served = await hashText(servedBundleText);
  if (served !== cfg.bundleHash) throw Error('Install the reviewed Forge46 bundle and set its SHA-256 before executing this fixture');
  const saved = macro.flags.forge46Fixture.checkpoint;
  globalThis[key] = {originalFetch, fetchWrapper: null, baseline: saved?.baseline ?? await world(), bindings: [], ledger: saved?.ledger ?? [],
    ownedActors: saved?.ownedActors ?? [], ownedMacros: saved?.ownedMacros ?? [], macroFailure: saved?.macroFailure ?? {armed: false, fired: false},
    originalStoreHashes: saved?.originalStoreHashes ?? null,
    loadedServiceIdentities: saved?.loadedServiceIdentities ?? [],
    snapshots: saved?.snapshots ?? [], generations: saved?.generations ?? [],
    caseKey: saved?.caseKey ?? 'otyugh', mode: 'normal', closed: !!saved,
    note: saved ? 'Reloaded for observation; frozen replies remain closed until explicitly selected.' : 'Private memory recovery store; original user candidate storage is untouched.'};
}
const state = globalThis[key];
const persist = async () => {if (game.macros.has(macro.id)) await macro.update({'flags.forge46Fixture.checkpoint': copy({baseline: state.baseline, ledger: state.ledger,
  ownedActors: state.ownedActors, ownedMacros: state.ownedMacros, macroFailure: state.macroFailure, originalStoreHashes: state.originalStoreHashes,
  loadedServiceIdentities: state.loadedServiceIdentities, snapshots: state.snapshots, generations: state.generations, caseKey: state.caseKey})});};
const log = async (kind, detail = {}) => {state.ledger.push({index: state.ledger.length + 1, kind, caseKey: state.caseKey, mode: state.mode, at: new Date().toISOString(), ...detail}); await persist();};
const checkLoadedServices = async current => {
  const binding = state.bindings.find(row => row.app === current);
  const identity = {at: new Date().toISOString(), helperRevision: 'fetch-this-v2', serviceSource: binding ? 'binding-originals' : 'unwrapped-services', expectedBundleHash: cfg.bundleHash, servedBundleHash: null, status: 'gap', services: []};
  try {
    servedBundleText ??= await (await state.originalFetch.call(globalThis, 'modules/fvtt-json-forge/scripts/index.js', {cache: 'no-store'})).text();
    identity.servedBundleHash = await hashText(servedBundleText);
    for (const name of ['generateBrowserActorIntakeCandidate', 'convertFinalActorSource', 'createAcceptedForgeActor']) {
      const service = binding?.originals[name] ?? current.services[name];
      if (typeof service !== 'function') {identity.services.push({name, status: 'gap', reason: 'service-not-a-function'}); continue;}
      const source = Function.prototype.toString.call(service);
      const nativeOrBound = source.includes('[native code]') || service.name.startsWith('bound ');
      const exactSubstring = !nativeOrBound && servedBundleText.includes(source);
      identity.services.push({name, sha256: await hashText(source), sourceLength: source.length, exactSubstring,
        status: exactSubstring ? 'matched' : 'gap', ...(exactSubstring ? {} : {reason: nativeOrBound ? 'native-or-bound-function' : 'function-not-in-served-bundle'})});
    }
    identity.status = identity.servedBundleHash === cfg.bundleHash && identity.services.every(row => row.status === 'matched') ? 'matched' : 'gap';
  } catch (error) {identity.error = error instanceof Error ? error.message : String(error);}
  finally {servedBundleText = undefined;}
  state.loadedServiceIdentities.push(identity);
  await log('loaded-service-identity', {status: identity.status});
  if (identity.status !== 'matched') ui.notifications.warn('Forge46：页面已加载服务的构建身份尚未证明，缺口已记入取证。');
};
const registerPackageDocuments = async () => {
  for (const [kind, collection, owners, baseline] of [['Actor', game.actors, state.ownedActors, state.baseline.actors], ['Macro', game.macros, state.ownedMacros, state.baseline.macros]]) {
    for (const document of collection.contents) {
      const identity = document.flags?.['fvtt-json-forge']?.encounter;
      if (identity?.packageId !== cfg.packageId || identity.kind !== kind || baseline.some(row => row.id === document.id) || owners.some(row => row.id === document.id)) continue;
      owners.push({id: document.id, uuid: document.uuid, name: document.name, encounter: copy(identity)});
      await log('package-document-observed', {kind, id: document.id, packageId: identity.packageId, key: identity.key});
    }
  }
};
const armMacroFailure = async () => {
  if (state.macroFailure.fired) {await log('macro-failure-already-used'); return;}
  if (!state.originalMacroCreate) {
    state.macroCreateClass = game.macros.documentClass;
    state.originalMacroCreate = state.macroCreateClass.create;
    state.macroCreateWrapper = async function(data, options) {
      if (data?.flags?.['fvtt-json-forge']?.encounter?.packageId === cfg.packageId && state.macroFailure.armed && !state.macroFailure.fired) {
        state.macroFailure = {armed: false, fired: true};
        await log('macro-create-failure-injected', {packageId: cfg.packageId, name: data.name, key: data.flags['fvtt-json-forge'].encounter.key, id: data._id});
        throw Error('FORGE46_MACRO_CREATE_FAILURE');
      }
      return state.originalMacroCreate.call(this, data, options);
    };
  }
  state.macroFailure.armed = true;
  state.macroCreateClass.create = state.macroCreateWrapper;
  await log('macro-create-failure-armed', {packageId: cfg.packageId});
};
const registerActor = async (result, response) => {
  const actor = result?.actor;
  if (!actor || state.baseline.actors.some(row => row.id === actor.id)) return;
  const identity = actor.flags?.['fvtt-json-forge'];
  if (identity?.sourceId !== response?.result?.sourceIdentity?.sourceId || !identity.sourceId) throw Error('Created Actor does not match the task product response');
  if (!state.ownedActors.some(row => row.id === actor.id)) state.ownedActors.push({id: actor.id, uuid: actor.uuid, name: actor.name, sourceId: identity.sourceId});
  await log('actor-created', {id: actor.id, sourceId: identity.sourceId});
};
const bind = async current => {
  const existing = state.bindings.find(row => row.app === current);
  if (existing) {
    if (existing.identityReadRevision !== 'fetch-this-v2') {await checkLoadedServices(current); existing.identityReadRevision = 'fetch-this-v2';}
    await renderIntake(current); return;
  }
  await checkLoadedServices(current);
  const originalStore = current.candidateStore, originalStoreHashes = state.originalStoreHashes ?? await storeHashes(originalStore);
  state.originalStoreHashes ??= originalStoreHashes;
  const originalSession = {api: current.sessionApi, settings: current.settings, raw: current.sessionSettingsRaw, initialized: current.sessionInitialized};
  let fixtureSettings = {providerId: 'custom', protocol: 'openai-chat', authScheme: 'bearer', region: '', reasoning: 'auto', structuredOutput: 'json_object',
    autoCorrect: false, useSeparateReviewModel: false, endpoint: cfg.fakeOrigin + '/v1', model: cfg.model, reviewModel: cfg.model,
    apiKey: 'forge46-fake-key', persistApiKey: false, savedApiKeys: {}};
  current.sessionApi = {readForgeSessionSettings: () => copy(fixtureSettings), saveForgeSessionSettings: value => (fixtureSettings = {...fixtureSettings, ...value}),
    subscribeForgeSessionSettings: () => () => undefined, isForgeSessionConnectionReady: () => !state.closed};
  current.sessionInitialized = false;
  const entries = state.memoryEntries ??= {};
  const memoryStore = state.memoryStore ??= {load: async () => copy(entries), put: async (k,v,guard) => {guard?.(); entries[k] = copy(v);}, clear: async (k,guard) => {guard?.(); delete entries[k];}, reset: async guard => {guard?.(); for (const k of Object.keys(entries)) delete entries[k];}};
  const originals = {}, wrappers = {};
  originals.generateBrowserActorIntakeCandidate = current.services.generateBrowserActorIntakeCandidate;
  wrappers.generateBrowserActorIntakeCandidate = async function(input, analysis, provider, signal) {
    const selected = cfg.cases[state.caseKey];
    if (!selected || input.source !== selected.source) throw Error('Use the selected unchanged source file');
    const reportFailure = state.mode === 'report-failure';
    const observed = reportFailure ? {...input, onStage: stage => {input.onStage?.(stage); if (stage.stage === 'generate' && stage.status === 'completed') throw Error('FORGE46_REPORT_FAILURE');}} : input;
    const result = await originals.generateBrowserActorIntakeCandidate.call(this, observed, analysis, provider, signal);
    state.generations.push({caseKey: state.caseKey, mode: state.mode, result: copy(result)}); await persist(); return result;
  };
  for (const name of ['createAcceptedForgeActor', 'createReviewedForgeActorCandidate']) {
    originals[name] = current.services[name];
    wrappers[name] = async function(input) {const result = await originals[name].call(this, input); await registerActor(result, input.response); return result;};
  }
  for (const name of Object.keys(wrappers)) current.services[name] = wrappers[name];
  current.candidateStore = memoryStore; current.savedCandidates = {}; current.recoveryLoad = undefined;
  state.bindings.push({app: current, originalStore, originalStoreHashes, originalSession, entries, originals, wrappers, identityReadRevision: 'fetch-this-v2'});
  await renderIntake(current);
};
if (!state.fetchWrapper) {
  state.fetchWrapper = async function(input, init = {}) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, location.href);
    if (url.origin === cfg.origin) return state.originalFetch.call(this, input, init);
    if (url.origin !== cfg.fakeOrigin || state.closed) {await log('blocked-external-request', {origin: url.origin, path: url.pathname}); throw Error('Only the task frozen provider is available');}
    if (url.pathname === '/v1/models') {await log('fake-model-list'); return Response.json({data: [{id: cfg.model, object: 'model'}]});}
    if (url.pathname !== '/v1/chat/completions' || typeof init.body !== 'string') throw Error('Use custom provider openai-chat at the task endpoint');
    const body = JSON.parse(init.body), user = body.messages?.filter(m => m.role === 'user');
    if (body.model !== cfg.model || user?.length !== 1 || typeof user[0].content !== 'string') throw Error('Unexpected frozen provider payload');
    const request = JSON.parse(user[0].content);
    let content;
    if (request.probe === true) {await log('fake-probe'); content = '{"ok":true}';}
    else {
      const selected = cfg.cases[state.caseKey];
      if (!selected || request.source !== selected.source || !request.candidate) throw Error('Select single-creature mode and the exact frozen source; discovery/review/repair are not supplied');
      await log(state.mode === 'empty-answer' ? 'fake-empty-extract' : 'fake-extract', {sourceHash: selected.sourceHash, replyKind: selected.replyKind});
      content = state.mode === 'empty-answer' ? '' : selected.rawReply;
    }
    return Response.json({id: 'forge46-frozen', object: 'chat.completion', choices: [{index: 0, message: {role: 'assistant', content}, finish_reason: 'stop'}]});
  };
  globalThis.fetch = state.fetchWrapper;
}
const controls = app => [...app.element.querySelectorAll('button[data-action]')].map(b => ({action: b.dataset.action, text: b.textContent.trim(), disabled: b.disabled, visible: !!b.getClientRects().length}));
const capture = async () => {
  await registerPackageDocuments();
  const app = intake();
  const observation = {at: new Date().toISOString(), caseKey: state.caseKey, mode: state.mode, replyKind: cfg.cases[state.caseKey]?.replyKind ?? 'saved-draft', status: app.status, reviewSource: app.reviewSource ?? null,
    analysisRepresentation: {hasIr: !!app.analysis?.ir, hasSourceText: typeof app.analysis?.sourceText === 'string', hasCanonicalSource: typeof app.analysis?.canonicalSource === 'string'},
    analysis: copy(app.analysis), generation: copy(app.generation), response: copy(app.response), controls: controls(app)};
  state.snapshots.push(observation);
  const nativeActors = Object.fromEntries(state.ownedActors.map(owner => [owner.id, game.actors.get(owner.id)?.toObject() ?? null]));
  const nativeMacros = Object.fromEntries(state.ownedMacros.map(owner => [owner.id, game.macros.get(owner.id)?.toObject() ?? null]));
  const spellImportPhases = Object.fromEntries(state.ownedActors.map(owner => [owner.id, game.actors.get(owner.id)?.flags?.['fvtt-json-forge']?.spellImportPhase ?? null]));
  const bindings = await Promise.all(state.bindings.map(async row => ({originalStoreUnchanged: await hash(await storeHashes(row.originalStore)) === await hash(row.originalStoreHashes),
    originalStoreHashes: row.originalStoreHashes, memoryCandidateKeys: Object.keys(row.entries)})));
  await persist();
  return {batch: cfg.batch, expectedBundleHash: cfg.bundleHash, actualModelHttp: 0, closed: state.closed, note: state.note,
    baseline: state.baseline, currentWorld: await world(), ownedMacro: {id: macro.id, uuid: macro.uuid}, ownedActors: copy(state.ownedActors), nativeActors,
    ownedMacros: copy(state.ownedMacros), nativeMacros, spellImportPhases, macroFailure: copy(state.macroFailure), packageId: cfg.packageId, packageMacro: cfg.packageMacro,
    loadedServiceIdentities: copy(state.loadedServiceIdentities),
    storage: bindings, ledger: copy(state.ledger), generations: copy(state.generations), snapshots: copy(state.snapshots)};
};
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const show = async () => {
  const text = JSON.stringify(await capture(), null, 2);
  new Dialog({title: 'Forge46 · 完整实际结果', content: '<textarea data-forge46-evidence readonly style="width:100%;height:540px;font-family:monospace">' + escape(text) + '</textarea>',
    buttons: {download: {label: '下载取证 JSON', callback: () => foundry.utils.saveDataToFile(text, 'application/json', 'forge46-' + state.caseKey + '-' + Date.now() + '.json')}, close: {label: '关闭'}}}, {width: 1080, height: 680}).render(true);
};
const select = async html => {
  const root = html?.[0] ?? html, selected = root.querySelector('[name="caseKey"]').value;
  const app = intake(); await bind(app);
  if (globalThis.fetch === state.originalFetch) globalThis.fetch = state.fetchWrapper;
  const binding = state.bindings.find(row => row.app === app);
  if (cfg.drafts[selected]) {
    binding.entries.single = copy(cfg.drafts[selected]);
    app.savedCandidates = {}; app.recoveryLoad = undefined; await renderIntake(app);
    state.caseKey = selected; state.mode = 'restore'; state.closed = true;
  } else {
    state.caseKey = {'mimic-report': 'mimic', 'mimic-empty': 'mimic'}[selected] ?? selected;
    if (!cfg.cases[state.caseKey]) throw Error('Unknown task replay');
    state.mode = selected.endsWith('empty') ? 'empty-answer' : selected.endsWith('report') ? 'report-failure' : 'normal'; state.closed = false;
  }
  await log('selected', {selection: selected});
  const source = cfg.cases[state.caseKey]?.source;
  const replayNote = cfg.cases[state.caseKey]?.replyKind === 'synthetic-format-replay' ? '<p>受控文本格式回放：使用既有正式Markdown包围栏，不是真实模型首答。只验证生成、下载和同页保存/恢复，不再创建角色。</p>' : '';
  new Dialog({title: 'Forge46 · 已选择 ' + selected, content: source ? replayNote + '<p>使用正常UI选择“单只生物”，读取对应.source.md后分析和生成。当前工作台使用任务内存连接配置与固定回执；不用修改全局连接设置或读取真实凭据。</p><textarea readonly style="width:100%;height:300px">' + escape(source) + '</textarea>' : '<p>请通过正常UI清空工作区，再点击恢复单条候选。本次只替换该工作台的内存存储，实际用户IndexedDB不变。</p>', buttons: {close: {label: '关闭'}}}, {width: 900}).render(true);
};
const closeNetwork = async () => {state.closed = true; await log('frozen-provider-closed'); await show();};
const restore = async () => {
  state.closed = true;
  for (const binding of state.bindings) {
    for (const [name, original] of Object.entries(binding.originals)) if (binding.app.services[name] === binding.wrappers[name]) binding.app.services[name] = original;
    binding.app.candidateStore = binding.originalStore; binding.app.savedCandidates = {}; binding.app.recoveryLoad = undefined;
    binding.app.sessionApi = binding.originalSession.api; binding.app.settings = binding.originalSession.settings;
    binding.app.sessionSettingsRaw = binding.originalSession.raw; binding.app.sessionInitialized = binding.originalSession.initialized;
    if (binding.app.element?.isConnected) await renderIntake(binding.app);
  }
  if (globalThis.fetch === state.fetchWrapper) globalThis.fetch = state.originalFetch;
  if (state.macroCreateClass && state.macroCreateClass.create === state.macroCreateWrapper) state.macroCreateClass.create = state.originalMacroCreate;
  state.macroFailure.armed = false;
  await log('fixture-bindings-restored'); await show();
};
const finish = async html => {
  await restore();
  if (state.ownedActors.some(owner => game.actors.has(owner.id))) throw Error('Delete only the recorded task Actor IDs through normal tools before finalizing');
  const packageMacros = state.ownedMacros.filter(owner => game.macros.has(owner.id));
  const root = html?.[0] ?? html;
  if (packageMacros.length && root?.querySelector('[name="parentReviewed"]')?.checked !== true) throw Error('Parent must review the captured result and authorize exact package Macro cleanup first');
  for (const owner of packageMacros) {
    const document = game.macros.get(owner.id), identity = document.flags?.['fvtt-json-forge']?.encounter;
    if (state.baseline.macros.some(row => row.id === owner.id) || identity?.packageId !== cfg.packageId || await hash(identity) !== await hash(owner.encounter)) throw Error('Recorded package Macro identity differs: ' + owner.id);
    await document.delete(); await log('package-macro-deleted', {id: owner.id, packageId: cfg.packageId});
  }
  const current = await world();
  for (const name of ['actors', 'items', 'scenes', 'macros', 'combats', 'messages']) if (await hash(current[name]) !== await hash(state.baseline[name])) throw Error('Original world differs: ' + name);
  for (const binding of state.bindings) if (await hash(await storeHashes(binding.originalStore)) !== await hash(binding.originalStoreHashes)) throw Error('Original candidate store differs');
  await log('final-world-and-store-match'); await show(); await macro.delete(); delete globalThis[key];
};
await bind(intake());
await persist();
new Dialog({title: 'Forge46 · 冻结回执控制', content: '<p>正常工作台执行产品操作；本宏提供固定HTTP回执、报告异常和完整观察。当前真实候选存储保持。</p><select name="caseKey"><option value="otyugh">Otyugh正常回放</option><option value="mimic">Mimic正常回放</option><option value="mimic-text">Mimic受控文本格式回放</option><option value="mimic-report">Mimic生成后报告异常</option><option value="mimic-empty">Mimic重新分析空答</option><option value="restore-v1">恢复原正式v1草稿</option><option value="restore-v2">恢复原正式v2草稿</option></select><p><label><input type="checkbox" name="parentReviewed">父代理已审阅取证并授权清理本包已登记宏</label></p>',
  buttons: {select: {label: '选择并准备', callback: select}, macroFailure: {label: '本包下一次宏创建失败', callback: armMacroFailure}, inspect: {label: '查看完整实际结果', callback: show}, closeNetwork: {label: '封闭固定回执', callback: closeNetwork}, restore: {label: '恢复原服务与存储绑定', callback: restore}, finish: {label: '父审后清理本包宏并最终核对', callback: finish}, close: {label: '关闭'}}}, {width: 920}).render(true);
`;

const command = body.replace('__CONFIG__', JSON.stringify(config));
const macro = {...(macroId ? {_id: macroId} : {}), name: 'Forge46 冻结验收控制 20261027', type: 'script', img: 'icons/svg/dice-target.svg', scope: 'global',
  command, flags: {forge46Fixture: {batch: config.batch}}};
writeFileSync(join(output, 'control.mjs'), command);
writeFileSync(join(output, 'task-macro.json'), JSON.stringify(macro, null, 2) + '\n');
const receipt = {status: /^[a-f0-9]{64}$/u.test(bundleHash) ? 'PREPARED_NOT_EXECUTED' : 'NEEDS_PARENT_BUNDLE_HASH',
  output, bundleHash, existingMacroId: macroId ?? null, packageId: config.packageId, packageMacro: config.packageMacro,
  replayCases: Object.entries(cases).map(([id, value]) => ({id, replyKind: value.replyKind, replyOrigin: value.replyOrigin, rawReplySha256: sha(value.rawReply), sourceHash: value.sourceHash})),
  files: ['control.mjs', 'task-macro.json', 'otyugh.source.md', 'mimic.source.md', 'mimic-text.source.md', 'mimic-text.reply.md'].map(name => ({name, sha256: sha(readFileSync(join(output, name)))})),
  note: 'Normal Macro UI import/execution only. Product handlers generate Actor data. Recovery uses a task memory-store adapter; this is not IndexedDB persistence acceptance.'};
writeFileSync(join(output, 'preparation.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
