import { CF_KEY, CF_PREFIX, CF_MACRO_NAME, CF_ACTIVITY_ID, CF_EXPECTED_VERSION, makeCfItemData, assertCfActivity } from './cf-fixture.mjs';
import { beginCfCast, currentCastLink, assertKnownSceneDocuments } from './cf-state.mjs';

// Called from an imported Foundry Script Macro. No prototypes, settings, workflow results,
// database files, server processes, or pre-existing campaign objects are modified.
export async function runCfHarness() {
  const g = globalThis;
  if (!g.game?.user?.isGM || g.location.origin !== 'http://127.0.0.1:30002'
      || g.game.world.id !== 'cor-cotn' || g.game.release.version !== '14.368'
      || g.game.system.version !== '6.0.2' || !g.game.modules.get('midi-qol')?.active
      || ![CF_EXPECTED_VERSION, '14.6.0-beta.4338eeab.local.2', '14.6.0-beta.4338eeab.local.3', '14.6.0-beta.4338eeab.local.5', '14.6.0-beta.4338eeab.local.6', '14.6.0-beta.4338eeab.local.7'].includes(g.game.modules.get('midi-qol')?.version)) {
    throw new Error('C/F identity gate failed; require ServerNext 30002 / cor-cotn / 14.368 / 6.0.2 / GM.');
  }
  // Server package metadata may remain cached during a browser-only update. Require
  // the actual executing methods to match the verified candidate bundle byte for byte.
  const build = __CF_BUILD__;
  if (build.candidateVersion !== CF_EXPECTED_VERSION) throw new Error('Fixture build version mismatch.');
  const loadedMethods = {};
  for (const [name, expected] of Object.entries(build.methods)) {
    const method = g.MidiQOL.Workflow.prototype[name];
    if (typeof method !== 'function') throw new Error(`Missing runtime Workflow.${name}`);
    const bytes = new TextEncoder().encode(Function.prototype.toString.call(method));
    const actual = Array.from(new Uint8Array(await g.crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    if (actual !== expected) throw new Error(`Loaded Workflow.${name} does not match ${CF_EXPECTED_VERSION}; reload this test tab.`);
    loadedMethods[name] = actual;
  }
  const loadedAccessors = {};
  if (!build.accessors?.item || !build.accessors?.activity) throw new Error('Missing candidate item/activity getter fingerprints.');
  for (const [name, expected] of Object.entries(build.accessors)) {
    const getter = Object.getOwnPropertyDescriptor(g.MidiQOL.Workflow.prototype, name)?.get;
    if (typeof getter !== 'function') throw new Error(`Missing runtime Workflow getter ${name}`);
    const bytes = new TextEncoder().encode(Function.prototype.toString.call(getter));
    const actual = Array.from(new Uint8Array(await g.crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    if (actual !== expected) throw new Error(`Loaded Workflow getter ${name} does not match ${CF_EXPECTED_VERSION}; reload this test tab.`);
    loadedAccessors[name] = actual;
  }
  const damageEntry = g.MidiQOL.ChatClasses?.DamageApplicationElementMidi?.prototype.buildTargetListEntry;
  if (typeof damageEntry !== 'function' || !build.components?.damageTargetEntry) throw new Error('Missing damage-target component fingerprint.');
  const entryBytes = new TextEncoder().encode(Function.prototype.toString.call(damageEntry));
  const entryHash = Array.from(new Uint8Array(await g.crypto.subtle.digest('SHA-256', entryBytes)), b => b.toString(16).padStart(2, '0')).join('');
  if (entryHash !== build.components.damageTargetEntry) throw new Error(`Loaded damage target renderer does not match ${CF_EXPECTED_VERSION}; reload this test tab.`);
  const enchantmentClone = g.CONFIG.ActiveEffect.documentClass.prototype.clone;
  if (typeof enchantmentClone !== 'function' || !build.components?.enchantmentClone) throw new Error('Missing enchantment-clone fingerprint.');
  const cloneBytes = new TextEncoder().encode(Function.prototype.toString.call(enchantmentClone));
  const cloneHash = Array.from(new Uint8Array(await g.crypto.subtle.digest('SHA-256', cloneBytes)), b => b.toString(16).padStart(2, '0')).join('');
  if (cloneHash !== build.components.enchantmentClone) throw new Error(`Loaded enchantment clone does not match ${CF_EXPECTED_VERSION}; reload this test tab.`);
  const activeEffectInitializeSource = g.CONFIG.ActiveEffect.documentClass.prototype._initializeSource;
  if (typeof activeEffectInitializeSource !== 'function' || !build.components?.activeEffectInitializeSource) {
    throw new Error('Missing runtime ActiveEffect._initializeSource fingerprint.');
  }
  const initializeSourceBytes = new TextEncoder().encode(Function.prototype.toString.call(activeEffectInitializeSource));
  const initializeSourceHash = Array.from(new Uint8Array(await g.crypto.subtle.digest('SHA-256', initializeSourceBytes)), b => b.toString(16).padStart(2, '0')).join('');
  if (initializeSourceHash !== build.components.activeEffectInitializeSource) {
    throw new Error(`Loaded ActiveEffect._initializeSource does not match ${CF_EXPECTED_VERSION}; reload this test tab.`);
  }
  const clientBuild = { ...build, loadedMethods, loadedAccessors, loadedComponents: { damageTargetEntry: entryHash,
    enchantmentClone: cloneHash, activeEffectInitializeSource: initializeSourceHash }, advertisedVersion: g.game.modules.get('midi-qol').version };
  const macros = g.game.macros.filter(m => m.name === CF_MACRO_NAME);
  if (macros.length !== 1) throw new Error(`Require exactly one imported macro named ${CF_MACRO_NAME}`);
  const macro = macros[0];
  const state = g.foundry.utils.deepClone(macro.getFlag('world', CF_KEY) ?? {
    owner: g.game.user.id, started: Date.now(), events: [], snapshots: [], casts: 0,
    originalScene: g.canvas.scene?.id ?? null, originalTargets: Array.from(g.game.user.targets, t => t.id),
  });
  if (state.owner !== g.game.user.id) throw new Error('Fixture belongs to another GM session.');
  const save = async () => macro.setFlag('world', CF_KEY, state);
  const own = doc => doc?.getFlag('world', CF_KEY) === macro.id;
  const actor = () => g.game.actors.get(state.actorId);
  const scene = () => g.game.scenes.get(state.sceneId);
  const item = () => actor()?.items.get(state.itemId);
  const activity = () => item()?.system.activities.get(CF_ACTIVITY_ID);
  const ts = g.MidiQOL.apps.TroubleShooter;
  const cutError = error => ({ message: String(error?.message ?? error), stack: String(error?.stack ?? '').split('\n').slice(0, 12) });
  const escape = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const label = doc => ({ uuid: doc.uuid, name: doc.name });
  const briefEffect = effect => ({ ...label(effect), type: effect.type, systemModel: effect.system?.constructor?.name,
    systemType: effect.system?.type ?? null, origin: effect.origin, systemOrigin: effect.system?.origin,
    duration: effect.toObject().duration, flags: effect.toObject().flags });
  const regions = () => [...(scene()?.regions ?? []), ...(scene()?.templates ?? [])]
    .filter((doc, index, all) => all.findIndex(d => d.id === doc.id) === index);
  const documentKey = doc => `${doc.constructor.documentName}:${doc.id}`;
  const embeddedDocuments = () => Object.keys(scene()?.constructor.metadata.embedded ?? {})
    .flatMap(type => Array.from(scene().getEmbeddedCollection(type).values()));
  const selectedEffects = () => Array.from(actor()?.effects ?? []).filter(effect =>
    effect.name === `${item()?.name} ${g.game.i18n.localize('midi-qol.MeasuredTemplate')}`);

  function schemaEvidence() {
    const models = {};
    for (const type of ['base', 'condition', 'enchantment']) {
      const model = g.CONFIG.ActiveEffect.dataModels[type];
      const field = model?.schema?.fields?.type;
      models[type] = { class: model?.name, fields: Object.keys(model?.schema?.fields ?? {}),
        systemType: field ? { required: field.required, initial: typeof field.initial === 'function' ? '<function>' : field.initial ?? null } : null };
    }
    const cases = [
      ['document-base-only', { type: 'base' }],
      ['document-base-empty-system', { type: 'base', system: {} }],
      ['document-base-changes', { type: 'base', system: { changes: [] } }],
      ['local2-shaped', { type: 'base', system: { type: 'base', changes: [] } }],
      ['fresh-id-base-control', { _id: g.foundry.utils.randomID(), type: 'base', system: { changes: [] } }],
      ['condition-missing-type-control', { type: 'condition', system: {} }],
    ];
    const probes = cases.map(([name, data]) => {
      try {
        const effect = new g.CONFIG.ActiveEffect.documentClass({ name: `${CF_PREFIX}-probe`, ...data }, { parent: actor() });
        return { name, ok: true, documentType: effect.type, systemModel: effect.system.constructor.name, system: effect.toObject().system };
      } catch (error) { return { name, ok: false, error: cutError(error) }; }
    });
    return { models, probes,
      statusesWithoutId: Object.values(g.CONFIG.statusEffects).filter(e => e._id === undefined).map(e => ({ id: e.id, name: e.name })),
      note: 'Constructor-only diagnostic; no effect persisted. These probes are NOT workflow acceptance.' };
  }

  async function inspect() {
    const current = activity();
    const effects = selectedEffects();
    const allRegions = regions();
    const snapshot = {
      cast: state.casts, time: new Date().toISOString(), identity: { origin: g.location.origin, world: g.game.world.id,
        foundry: g.game.release.version, system: g.game.system.version, midi: g.game.modules.get('midi-qol').version, clientBuild },
      actor: actor() ? label(actor()) : null, targetActor: state.targetActorId ? g.game.actors.get(state.targetActorId)?.uuid : null,
      scene: scene() ? label(scene()) : null, tokens: scene()?.tokens.map(label) ?? [],
      item: item() ? label(item()) : null,
      activity: current ? { uuid: current.uuid, type: current.type, runtimeClass: current.constructor.name, duration: current.toObject().duration,
        effectiveDuration: current.duration, range: current.range, target: current.target } : null,
      sourcePrecheck: current ? assertCfActivity(current) : false,
      effects: effects.map(briefEffect),
      regions: allRegions.map(doc => ({ ...label(doc), dependentOn: doc.getFlag('dnd5e', 'dependentOn') ?? null })),
      linked: currentCastLink(state, effects.map(briefEffect), allRegions.map(doc => ({ uuid: doc.uuid, dependentOn: doc.getFlag('dnd5e', 'dependentOn') }))),
      midiSettings: { autoRemoveTemplate: g.MidiQOL.configSettings().autoRemoveTemplate,
        autoRemoveInstantaneousTemplate: g.MidiQOL.configSettings().autoRemoveInstantaneousTemplate },
      newMidiErrors: ts.errors.filter(e => e.timestamp >= state.started).map(e => ({ timestamp: e.timestamp, message: e.message, error: e.error })),
    };
    state.snapshots.push(snapshot);
    await save();
    return snapshot;
  }

  async function prepare() {
    if (state.sceneId || state.actorId) throw new Error('Existing fixture detected. Inspect or clean it instead of creating duplicates.');
    if (!g.game.modules.get('dae')?.active || !g.MidiQOL.configSettings().autoRemoveTemplate) {
      throw new Error('DAE must be active and autoRemoveTemplate=true. No world setting was changed.');
    }
    const flags = { world: { [CF_KEY]: macro.id } };
    const caster = await g.Actor.create({ name: `${CF_PREFIX}-Caster`, type: 'npc', img: 'icons/svg/mage-shield.svg', flags,
      prototypeToken: { actorLink: true, disposition: 1, texture: { src: 'icons/svg/mage-shield.svg' } },
      system: { attributes: { hp: { value: 20, max: 20 }, ac: { calc: 'flat', flat: 10 }, spellcasting: 'int' } } });
    state.actorId = caster.id; await save();
    const target = await g.Actor.create({ name: `${CF_PREFIX}-Target`, type: 'npc', img: 'icons/svg/target.svg', flags,
      prototypeToken: { actorLink: true, disposition: -1, texture: { src: 'icons/svg/target.svg' } },
      system: { attributes: { hp: { value: 20, max: 20 }, ac: { calc: 'flat', flat: 10 } } } });
    state.targetActorId = target.id; await save();
    const itemData = makeCfItemData(); itemData.flags = flags;
    const [created] = await caster.createEmbeddedDocuments('Item', [itemData]);
    state.itemId = created.id; await save();
    assertCfActivity(created.system.activities.get(CF_ACTIVITY_ID));
    if (created.system.activities.get(CF_ACTIVITY_ID).constructor.name !== 'MidiUtilityActivity') {
      throw new Error('Expected MidiUtilityActivity; changing global replaceDefaultActivities is not allowed.');
    }
    state.schema = schemaEvidence(); await save();
    const temporaryScene = await g.Scene.create({ name: `${CF_PREFIX}-Scene`, width: 1600, height: 1200,
      padding: 0.1, grid: { type: 1, size: 100, distance: 5, units: 'ft' }, tokenVision: false,
      fog: { exploration: false }, flags, navigation: false });
    state.sceneId = temporaryScene.id; await save();
    const casterToken = await caster.getTokenDocument({ x: 250, y: 500, name: `${CF_PREFIX}-Caster`, actorLink: true, flags });
    const targetToken = await target.getTokenDocument({ x: 850, y: 500, name: `${CF_PREFIX}-Target`, actorLink: true, flags });
    const tokens = await temporaryScene.createEmbeddedDocuments('Token', [casterToken.toObject(), targetToken.toObject()]);
    state.casterTokenId = tokens[0].id; state.targetTokenId = tokens[1].id; await save();
    state.sceneDocumentKeys = embeddedDocuments().map(documentKey); await save();
    await temporaryScene.view(); // Client-local view only: never activate a scene for other users.
    g.canvas.tokens.get(state.casterTokenId)?.control({ releaseOthers: true });
    g.canvas.tokens.setTargets([state.targetTokenId], { mode: 'replace' });
    return await inspect();
  }

  async function cast() {
    if (!own(actor()) || !own(scene()) || !own(item()) || g.canvas.scene.id !== state.sceneId) throw new Error('Fixture identity/scene gate failed.');
    assertCfActivity(activity());
    if (!g.MidiQOL.configSettings().autoRemoveTemplate || !g.game.modules.get('dae')?.active) throw new Error('Cleanup prerequisites changed.');
    if (actor().effects.some(e => e.statuses.has('concentrating'))) throw new Error('Concentration would bypass ordinary cleanup.');
    beginCfCast(state, selectedEffects(), regions()); await save();
    g.canvas.tokens.setTargets([state.targetTokenId], { mode: 'replace' });
    const hooks = [];
    const on = (name, fn) => hooks.push([name, g.Hooks.on(name, fn)]);
    on('preCreateActiveEffect', (doc, data) => {
      if (doc.parent?.id === state.actorId) state.events.push({ cast: state.casts, event: 'preCreateActiveEffect', inputId: data._id, preparedId: doc.id, inputType: data.type,
        inputSystem: data.system, preparedType: doc.type, model: doc.system?.constructor.name, name: data.name });
    });
    on('createActiveEffect', doc => {
      if (doc.parent?.id === state.actorId && doc.name === `${item().name} ${g.game.i18n.localize('midi-qol.MeasuredTemplate')}`) {
        state.castEvidence.createdEffects.push(doc.uuid);
        state.events.push({ cast: state.casts, event: 'createActiveEffect', ...briefEffect(doc) });
      }
    });
    const regionCreated = doc => {
      if (doc.parent?.id === state.sceneId && doc.getFlag('dnd5e', 'item') === item().uuid) {
        state.castEvidence.createdRegions.push(doc.uuid);
        state.sceneDocumentKeys.push(documentKey(doc));
        state.events.push({ cast: state.casts, event: 'createRegionOrTemplate', ...label(doc) });
      }
    };
    on('createRegion', regionCreated);
    on('createMeasuredTemplate', regionCreated);
    try {
      // Run the installed, unmodified activity use pipeline. The operator places the preview on the canvas.
      const result = await activity().use({ midiOptions: { workflowOptions: { autoRollDamage: 'none' } } }, {}, {});
      state.castEvidence.useResult = result === false ? 'FALSE' : result === undefined ? 'UNDEFINED' : 'RETURNED';
    } catch (error) {
      state.castEvidence.useResult = 'ERROR';
      state.events.push({ cast: state.casts, event: 'use-error', error: cutError(error) });
    }
    finally { for (const [name, id] of hooks) g.Hooks.off(name, id); await save(); }
    return await inspect();
  }

  async function deleteCleanupEffect() {
    if (!own(actor()) || !own(scene()) || !own(item())) throw new Error('Refusing effect deletion outside the owned fixture.');
    const before = await inspect();
    if (!before.linked || before.effects.length !== 1) throw new Error('No single cleanup effect with verified dependentOn links; do not fabricate the chain.');
    const effect = selectedEffects()[0];
    if (effect.type !== 'base') throw new Error(`Unexpected cleanup document type: ${effect.type}`);
    const regionUuids = before.regions.map(r => r.uuid);
    await effect.delete(); // ONLY the effect. Region deletion must be performed by the actual dependency implementation.
    let remaining = [];
    for (let attempt = 0; attempt < 30; attempt++) {
      remaining = (await Promise.all(regionUuids.map(uuid => g.fromUuid(uuid)))).filter(Boolean);
      if (!remaining.length) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    state.deletion = { cast: state.casts, effectUuid: effect.uuid, regionUuids, remaining: remaining.map(label),
      effectAbsent: !actor().effects.has(effect.id), cascadePass: !remaining.length && !actor().effects.has(effect.id) };
    await save(); return await inspect();
  }

  async function cleanup() {
    for (const id of [state.actorId, state.targetActorId]) {
      const doc = g.game.actors.get(id);
      if (doc && !own(doc)) throw new Error('Refusing cleanup of unowned Actor.');
    }
    const temporaryScene = scene();
    if (temporaryScene) {
      if (!own(temporaryScene) || temporaryScene.active) throw new Error('Refusing deletion of unowned or globally active scene.');
      const observedKeys = embeddedDocuments().filter(doc => doc.constructor.documentName !== 'MeasuredTemplate'
        || !scene().regions.has(doc.id)).map(documentKey);
      assertKnownSceneDocuments(state.sceneDocumentKeys ?? [], observedKeys);
      const original = g.game.scenes.get(state.originalScene);
      if (g.canvas.scene?.id === temporaryScene.id && original) await original.view();
      await temporaryScene.delete();
    }
    for (const id of [state.actorId, state.targetActorId]) {
      const doc = g.game.actors.get(id); if (doc) await doc.delete();
    }
    if (g.canvas.scene?.id === state.originalScene) g.canvas.tokens.setTargets(state.originalTargets.filter(id => g.canvas.tokens.get(id)), { mode: 'replace' });
    state.cleanup = { sceneAbsent: !g.game.scenes.has(state.sceneId), casterAbsent: !g.game.actors.has(state.actorId),
      targetAbsent: !g.game.actors.has(state.targetActorId), globalSettingsChanged: false, serviceStopped: false };
    await save();
  }

  let action;
  do {
    const current = state.snapshots.at(-1);
    const report = { clientBuild, schema: state.schema, casts: state.casts, castEvidence: state.castEvidence, events: state.events,
      snapshots: state.snapshots, deletion: state.deletion, cleanup: state.cleanup };
    action = await g.foundry.applications.api.DialogV2.wait({
      window: { title: 'Midi C/F — prepared fixture and evidence' }, position: { width: 760 },
      content: `<p>Prepare → Cast (place circle on canvas) → Inspect → Delete cleanup effect → Inspect → Cleanup fixture. Server stays running.</p><p>Precheck: ${current?.sourcePrecheck === true ? 'PASS: 1 minute / Circle 30 ft / creature / range 120 ft' : 'NOT RUN'} · Link: ${current?.linked ?? false} · Cascade: ${state.deletion?.cascadePass ?? 'NOT RUN'}</p><textarea aria-label="C/F evidence JSON" readonly style="width:100%;height:300px">${escape(JSON.stringify(report, null, 2))}</textarea>`,
      buttons: [
        { action: 'prepare', label: '1 Prepare and verify' }, { action: 'cast', label: '2 Cast and place Circle' },
        { action: 'inspect', label: '3 Inspect effect and links' }, { action: 'delete', label: '4 Delete cleanup effect only' },
        { action: 'trouble', label: 'Troubleshooter' }, { action: 'export', label: 'Export evidence JSON' },
        { action: 'cleanup', label: '5 Cleanup owned fixture' }, { action: 'done', label: 'Close' },
      ],
    });
    try {
      if (action === 'prepare') await prepare();
      else if (action === 'cast') await cast();
      else if (action === 'inspect') await inspect();
      else if (action === 'delete') await deleteCleanupEffect();
      else if (action === 'trouble') new ts().render({ force: true });
      else if (action === 'export') g.foundry.utils.saveDataToFile(JSON.stringify(report, null, 2), 'application/json', `${CF_PREFIX}-evidence.json`);
      else if (action === 'cleanup') await cleanup();
    } catch (error) { state.events.push({ event: 'harness-error', action, error: cutError(error) }); await save(); g.ui.notifications.error(error.message); }
  } while (action && action !== 'done');
}
