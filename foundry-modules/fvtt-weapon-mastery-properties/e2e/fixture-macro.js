/* Paste into a GM script macro, run once, then use WMP_E2E.ensureBatch/resetCase/runCase/exportReceipt.
 * runtime-api calls the public real Activity use chain; UI choices and actual damage application
 * still require a GM. Weapon source UUIDs must identify real dnd5e 5.3.3 Attack Activity weapons.
 */
function installWeaponE2EHarness() {
  if (globalThis.game?.user?.isGM !== true || globalThis.game?.users?.activeGM?.id !== globalThis.game.user.id)
    throw new Error('WMP E2E helper requires the active GM client.');
  const NS = 'fvtt-weapon-mastery-properties';
  const KEY = 'e2eFixture';
  const KINDS = ['cleave', 'graze', 'nick', 'push', 'sap', 'slow', 'topple', 'vex', 'deadly', 'fatal', 'criticalBleeding'];
  const PILOT = ['vex', 'slow', 'push'];
  const HOUSE = new Set(['deadly', 'fatal', 'criticalBleeding']);
  const VERSION = 2;
  let busy = false;
  async function exclusive(task) {
    if (busy) throw new Error('WMP E2E operation already in progress.');
    busy = true;
    try { return await task(); } finally { busy = false; }
  }
  const EXPECTED = { worldId: 'cor-cotn', foundryVersion: '14.364', systemId: 'dnd5e', systemVersion: '5.3.3' };
  const owned = (runId, role) => ({ [NS]: { [KEY]: { runId, role } } });
  const values = (collection) => collection?.contents ?? (collection?.values ? [...collection.values()] : []);
  const idOf = (document) => document?.id ?? document?._id;
  const flag = (document) => document?.getFlag?.(NS, KEY) ?? document?.flags?.[NS]?.[KEY];
  const json = (value) => JSON.parse(JSON.stringify(value));
  const safe = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const activeModules = () => values(game.modules).filter((entry) => entry.active).sort((a, b) => a.id.localeCompare(b.id));
  const current = () => ({
    worldId: game.world?.id,
    foundryVersion: game.version ?? game.release?.version,
    systemId: game.system?.id,
    systemVersion: game.system?.version,
    enabledModules: activeModules().map((entry) => ({ id: entry.id, version: String(entry.version ?? '') })),
    enabledModuleIds: activeModules().map((entry) => entry.id),
    enabledModuleVersions: Object.fromEntries(activeModules().map((entry) => [entry.id, entry.version ?? null])),
    userId: game.user?.id,
    activeSceneId: game.scenes?.active?.id ?? canvas?.scene?.id,
    combatId: game.combat?.id ?? null,
    combatSceneId: game.combat?.scene?.id ?? game.combat?.scene ?? null,
    paused: game.paused === true,
    activeTurnKey: Number.isInteger(game.combat?.round) && Number.isInteger(game.combat?.turn)
      ? `Combat.${game.combat.id}:${game.combat.round}:${game.combat.turn}` : null,
  });
  function assertGM() {
    if (game.user?.isGM !== true || game.user?.active === false || game.users?.activeGM?.id !== game.user.id) {
      throw new Error('WMP E2E requires the active GM client.');
    }
  }
  function environment(expectedEnabledModules) {
    const observed = current();
    const expected = { ...EXPECTED, enabledModules: [...expectedEnabledModules].sort((a, b) => a.id.localeCompare(b.id)) };
    const mismatches = Object.keys(expected).filter((key) => JSON.stringify(observed[key]) !== JSON.stringify(expected[key]));
    for (const id of [NS, 'fvtt-custom-conditions', 'fvtt-trigger-engine']) {
      if (!observed.enabledModuleIds.includes(id)) mismatches.push(`required:${id}`);
    }
    return { expected, observed, ok: mismatches.length === 0, mismatches };
  }
  function attackActivities(item) {
    return values(item?.system?.activities).filter((activity) => activity.type === 'attack').map((activity) => ({
      id: idOf(activity), type: activity.type, uuid: activity.uuid ?? null,
      canUse: typeof activity.canUse === 'boolean' ? activity.canUse : null,
    }));
  }
  function isLight(item) {
    const props = item?.system?.properties;
    return props instanceof Set ? props.has('lgt') : Boolean(props?.lgt ?? props?.light);
  }
  function rule(kind) {
    return { ruleId: `dnd2024.${kind}`, kind, label: kind[0].toUpperCase() + kind.slice(1),
      params: kind === 'cleave' ? { distance: 5, maxUses: 1 } : kind === 'nick' ? { maxUses: 1 }
        : kind === 'push' ? { distance: 10, maxSize: 3 } : kind === 'slow' ? { speedReduction: 10 } : {},
      stackingGroup: `dnd2024.${kind}` };
  }
  function configuration(kind, propertyRule) {
    if (HOUSE.has(kind)) {
      if (!propertyRule || propertyRule.kind !== kind || !String(propertyRule.ruleId).startsWith('house.')) {
        throw new Error(`${kind} requires an explicit validated house property rule; no dice or formula is inferred.`);
      }
      return { schemaVersion: 1, enabled: true, mastery: null, grantMastery: false, rules: [json(propertyRule)] };
    }
    return { schemaVersion: 1, enabled: true, mastery: `dnd2024.${kind}`, grantMastery: true, rules: [rule(kind)] };
  }
  function api() {
    const facade = game.modules?.get?.(NS)?.api ?? game.fvttWeaponMasteryProperties;
    if (typeof facade?.configure !== 'function' || typeof facade?.configuration !== 'function') {
      throw new Error('Weapon Mastery public configure/configuration API is unavailable.');
    }
    return facade;
  }
  function identity(expectedBuildId, expectedSettings = []) {
    const observedBuildId = api().buildId ?? null;
    const settings = expectedSettings.map((entry) => ({ namespace: entry.namespace, key: entry.key,
      expected: entry.value, observed: game.settings?.get?.(entry.namespace, entry.key) }));
    const settingsMatch = settings.every((entry) => JSON.stringify(entry.expected) === JSON.stringify(entry.observed));
    return { expectedBuildId: expectedBuildId ?? null, observedBuildId, settings,
      status: !settingsMatch ? 'MISMATCH' : !expectedBuildId ? 'INCOMPLETE'
        : observedBuildId === expectedBuildId ? 'PASS' : 'MISMATCH' };
  }
  function requireLedger(ledgerMessageId) {
    const message = game.messages?.get?.(ledgerMessageId);
    const data = flag(message);
    if (!message || data?.role !== 'ledger' || !data.runId || data.ledger?.messageId !== ledgerMessageId) {
      throw new Error('Exact fixture ledger message is unavailable.');
    }
    if (data.ledger.worldId !== game.world?.id) throw new Error('Fixture ledger belongs to another world.');
    if (data.ledger.schemaVersion && data.ledger.schemaVersion > VERSION) throw new Error('Fixture ledger was written by a newer helper.');
    return { message, data };
  }
  async function persist(message, data, replacement) {
    const deletions = {};
    if (replacement) {
      const next = data.ledger.cases[replacement.scenario];
      for (const key of replacement.previousKeys) {
        if (Object.hasOwn(next, key)) continue;
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) throw new Error('Unsupported persisted case field.');
        deletions[`flags.${NS}.${KEY}.ledger.cases.${replacement.scenario}.-=${key}`] = null;
      }
    }
    await message.update({ [`flags.${NS}.${KEY}`]: data,
      ...deletions,
      content: `<p><b>WMP E2E ${safe(data.runId)}</b> · ${safe(data.ledger.status)}</p>`
        + `<p>Scene: ${safe(data.ledger.sceneId ?? 'pending')} · Combat: ${safe(data.ledger.combatId ?? 'pending')}</p>`
        + `<p>${safe(Object.entries(data.ledger.cases ?? {}).map(([kind, entry]) => `${kind}: ${entry.status}`).join(' · '))}</p>`
        + '<p>Complete records are saved in this message. Use the GM test panel to inspect or export them.</p>' });
  }
  async function create({ runId, expectedEnabledModules, weaponSourceUuids, supportWeaponSourceUuids = {}, propertyRules = {}, expectedBuildId, expectedSettings = [] }) {
    assertGM();
    if (!/^WMP-E2E-[A-Za-z0-9_-]{6,40}$/.test(runId)) throw new Error('Use a unique WMP-E2E run ID.');
    if (!Array.isArray(expectedEnabledModules) || !expectedEnabledModules.length
      || expectedEnabledModules.some((entry) => !entry || typeof entry.id !== 'string' || typeof entry.version !== 'string')) {
      throw new Error('Supply the full expected enabled-module ID and version baseline.');
    }
    const env = environment(expectedEnabledModules);
    if (!env.ok) throw new Error(`Environment mismatch: ${env.mismatches.join(', ')}`);
    if (!weaponSourceUuids || PILOT.some((kind) => typeof weaponSourceUuids[kind] !== 'string')) throw new Error('Supply Vex, Slow, and Push weapon source UUIDs.');
    const kinds = KINDS.filter((kind) => typeof weaponSourceUuids[kind] === 'string');
    for (const kind of kinds.filter((entry) => HOUSE.has(entry))) configuration(kind, propertyRules[kind]);
    const weaponApi = api();
    if (identity(expectedBuildId, expectedSettings).status === 'MISMATCH') throw new Error('Build identity or setting profile differs from expected baseline.');
    if (values(game.messages).some((message) => flag(message)?.role === 'ledger' && flag(message)?.runId === runId)) throw new Error('Run ID already exists.');
    const sources = {};
    for (const kind of kinds) {
      const source = await fromUuid(weaponSourceUuids[kind]);
      if (source?.type !== 'weapon' || !source.toObject || !attackActivities(source).length) throw new Error(`${kind} source must be a real weapon with an Attack Activity.`);
      sources[kind] = source;
    }
    const ledger = { schemaVersion: VERSION, runId, worldId: game.world.id, status: 'creating', createdAt: Date.now(), cases: {},
      expectedBuildId: expectedBuildId ?? null, expectedSettings: json(expectedSettings),
      originalActiveSceneId: env.observed.activeSceneId, originalCombatId: env.observed.combatId, messageId: null,
      sceneId: null, combatId: null, actorIds: {}, itemIds: {}, itemUses: {}, supportItemIds: {}, tokenIds: {}, chatMessageIds: [],
      weaponSourceUuids: json(weaponSourceUuids), supportWeaponSourceUuids: json(supportWeaponSourceUuids),
      expectedEnabledModules: json(expectedEnabledModules) };
    const message = await ChatMessage.create({ content: `<pre>WMP E2E ${safe(runId)} ledger initializing</pre>`, whisper: [game.user.id], flags: owned(runId, 'ledger') });
    ledger.messageId = message.id;
    const data = { runId, role: 'ledger', ledger };
    await persist(message, data);
    try {
      const scene = await Scene.create({ name: `${runId} temporary grid`, width: 2000, height: 1400,
        grid: { type: 1, size: 100, distance: 5, units: 'ft' }, tokenVision: true,
        environment: { darknessLevel: 0, globalLight: { enabled: true, bright: true } },
        flags: owned(runId, 'scene') });
      ledger.sceneId = scene.id; await persist(message, data);
      const actorSpecs = [
        ['source', 120, 12], ['target', 200, 1], ['secondary', 200, 1],
      ];
      for (const [role, hp, ac] of actorSpecs) {
        const actor = await Actor.create({ name: `${runId} ${role}`, type: 'npc',
          system: { attributes: { hp: { value: hp, max: hp, temp: 0 }, ac: { calc: 'flat', flat: ac }, movement: { walk: 30 } }, traits: { size: 'med' } },
          flags: owned(runId, role) });
        ledger.actorIds[role] = actor.id; await persist(message, data);
      }
      const sourceActor = game.actors.get(ledger.actorIds.source);
      for (const kind of kinds) {
        const itemData = sources[kind].toObject();
        delete itemData._id;
        itemData.name = `${runId} ${kind} ${sources[kind].name}`;
        itemData.flags ??= {};
        itemData.flags[NS] = { [KEY]: { runId, role: `weapon:${kind}` } };
        const [item] = await sourceActor.createEmbeddedDocuments('Item', [itemData]);
        if (!item || !attackActivities(item).length) throw new Error(`${kind} copied weapon has no Attack Activity.`);
        const expectedConfiguration = configuration(kind, propertyRules[kind]);
        await weaponApi.configure(item, expectedConfiguration);
        if (JSON.stringify(weaponApi.configuration(item)) !== JSON.stringify(expectedConfiguration)) throw new Error(`${kind} public configuration readback differs.`);
        ledger.itemIds[kind] = item.id; await persist(message, data);
        ledger.itemUses[kind] = json(item.system?.uses ?? null); await persist(message, data);
      }
      if (supportWeaponSourceUuids.nickFirst) {
        const first = await fromUuid(supportWeaponSourceUuids.nickFirst);
        if (first?.type !== 'weapon' || !first.toObject || !attackActivities(first).length || !isLight(first))
          throw new Error('Nick first-attack source must be a real Light weapon with an Attack Activity.');
        const itemData = first.toObject(); delete itemData._id;
        itemData.name = `${runId} nick first ${first.name}`;
        itemData.flags ??= {}; itemData.flags[NS] = { [KEY]: { runId, role: 'support:nickFirst' } };
        const [item] = await sourceActor.createEmbeddedDocuments('Item', [itemData]);
        ledger.supportItemIds.nickFirst = item.id; await persist(message, data);
      }
      const tokens = await scene.createEmbeddedDocuments('Token', [
        { name: `${runId} source`, actorId: ledger.actorIds.source, actorLink: true, x: 500, y: 400,
          sight: { enabled: true, range: 60 }, flags: owned(runId, 'source-token') },
        { name: `${runId} target`, actorId: ledger.actorIds.target, actorLink: true, x: 600, y: 400,
          sight: { enabled: true, range: 60 }, flags: owned(runId, 'target-token') },
        { name: `${runId} secondary`, actorId: ledger.actorIds.secondary, actorLink: true, x: 600, y: 500,
          sight: { enabled: true, range: 60 }, flags: owned(runId, 'secondary-token') },
      ]);
      for (const token of tokens) {
        const role = ['source', 'target', 'secondary'].find((entry) => flag(token)?.role === `${entry}-token`);
        if (!role) throw new Error('Created token lost its ownership flag.');
        ledger.tokenIds[role] = token.id; await persist(message, data);
      }
      ledger.status = 'ready'; await persist(message, data);
      return snapshot({ ledgerMessageId: message.id, scenario: 'vex' });
    } catch (error) {
      ledger.status = 'create-failed'; ledger.error = String(error); await persist(message, data);
      throw new Error(`Fixture creation stopped; retain ledger ${message.id} for exact-ID cleanup. ${error}`);
    }
  }
  function effects(actor) {
    return values(actor?.effects).map((effect) => ({ id: effect.id, name: effect.name, img: effect.img,
      disabled: effect.disabled, origin: effect.origin ?? null, flags: json(effect.flags ?? {}),
      statuses: [...(effect.statuses ?? [])],
      changes: json(effect.changes ?? []) }));
  }
  function actorState(actor, token) {
    if (!actor) return null;
    return { actorId: actor.id, actorUuid: actor.uuid, actorType: actor.type,
      hp: json(actor.system?.attributes?.hp ?? null),
      hpValue: actor.system?.attributes?.hp?.value ?? null,
      tempHp: actor.system?.attributes?.hp?.temp ?? null,
      damageProof: json(actor.getFlag?.(NS, 'damageProof') ?? actor.flags?.[NS]?.damageProof ?? null),
      ac: json(actor.system?.attributes?.ac ?? null), abilities: json(actor.system?.abilities ?? {}),
      movement: json(actor.system?.attributes?.movement ?? null), size: actor.system?.traits?.size ?? null,
      effects: effects(actor), token: token ? { id: token.id, uuid: token.uuid, actorId: token.actorId,
        actorLink: token.actorLink, linkedActorId: token.actor?.id ?? null, x: token.x, y: token.y,
        width: token.width, height: token.height, elevation: token.elevation } : null };
  }
  function relatedMessage(message, ledger) {
    if (message.id === ledger.messageId || Number(message.timestamp) < ledger.createdAt) return false;
    const data = message.flags?.dnd5e ?? {};
    const uuids = [];
    const collect = (value) => {
      if (typeof value === 'string') uuids.push(value);
      else if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === 'object') Object.values(value).forEach(collect);
    };
    collect(data);
    collect(message.flags?.['midi-qol']);
    return uuids.some((value) => Object.values(ledger.actorIds).some((id) => value === `Actor.${id}` || value.startsWith(`Actor.${id}.`))
      || Object.values(ledger.itemIds).some((id) => value === `Item.${id}` || value.endsWith(`.Item.${id}`) || value.includes(`.Item.${id}.`))
      || Object.values(ledger.tokenIds).some((id) => value === `Scene.${ledger.sceneId}.Token.${id}`));
  }
  function combatMatchesLedger(combat, ledger) {
    if (!combat || (combat.scene?.id ?? combat.scene) !== ledger.sceneId) return false;
    const combatants = values(combat.combatants);
    const expectedTokenIds = Object.values(ledger.tokenIds);
    const tokenIds = combatants.map((combatant) => combatant.tokenId);
    return tokenIds.length === expectedTokenIds.length
      && new Set(tokenIds).size === expectedTokenIds.length
      && combatants.every((combatant) => !combatant.sceneId || combatant.sceneId === ledger.sceneId)
      && tokenIds.every((id) => expectedTokenIds.includes(id));
  }
  async function registerCombat({ ledgerMessageId, combatId }) {
    assertGM();
    const { message, data } = requireLedger(ledgerMessageId);
    const ledger = data.ledger;
    if (ledger.status !== 'ready' || ledger.combatId) throw new Error('Fixture is not ready for one new Combat registration.');
    if (typeof combatId !== 'string' || !combatId || combatId === ledger.originalCombatId) throw new Error('Combat ID must be distinct from the original Combat.');
    const combat = game.combats?.get?.(combatId);
    const combatantTokenIds = values(combat?.combatants).map((combatant) => combatant.tokenId);
    if (!combatMatchesLedger(combat, ledger)) {
      throw new Error('Combat must belong to the fixture scene and contain exactly the task Tokens.');
    }
    if (flag(combat)) throw new Error('Combat already has an E2E ownership marker.');
    await combat.setFlag(NS, KEY, { runId: ledger.runId, role: 'combat' });
    if (flag(combat)?.runId !== ledger.runId || flag(combat)?.role !== 'combat') throw new Error('Combat ownership marker did not persist.');
    ledger.combatId = combatId;
    await persist(message, data);
    return { runId: ledger.runId, combatId, sceneId: ledger.sceneId, combatantTokenIds, ownerMarker: json(flag(combat)) };
  }
  async function prepareCombat({ ledgerMessageId }) {
    return exclusive(async () => {
      assertGM();
      const { message, data } = requireLedger(ledgerMessageId);
      const ledger = data.ledger;
      if (ledger.status !== 'ready' || ledger.activeCase) throw new Error('Prepare combat only between completed cases.');
      if (!environment(ledger.expectedEnabledModules).ok
        || identity(ledger.expectedBuildId, ledger.expectedSettings ?? []).status !== 'PASS')
        throw new Error('Batch environment or loaded build changed.');
      const { scene } = ownedCaseDocuments(ledger, Object.keys(ledger.itemIds)[0]);
      if (typeof scene.activate !== 'function' || typeof scene.view !== 'function') throw new Error('Scene activation API unavailable.');
      await scene.activate(); await scene.view();
      let combat = ledger.combatId ? game.combats.get(ledger.combatId) :
        values(game.combats).find((entry) => flag(entry)?.runId === ledger.runId && flag(entry)?.role === 'combat');
      if (!combat) {
        if (typeof globalThis.Combat?.create !== 'function') throw new Error('Combat creation API unavailable.');
        combat = await globalThis.Combat.create({ scene: scene.id, active: true, flags: owned(ledger.runId, 'combat'),
          combatants: Object.entries(ledger.tokenIds).map(([role, tokenId], index) => ({ tokenId, sceneId: scene.id,
            actorId: ledger.actorIds[role], initiative: 20 - index })) });
      }
      if (!combatMatchesLedger(combat, ledger) || flag(combat)?.runId !== ledger.runId || flag(combat)?.role !== 'combat')
        throw new Error('Prepared Combat is not the exact task-owned encounter.');
      ledger.combatId = combat.id;
      await persist(message, data);
      await combat.activate();
      if (!combat.started) await combat.startCombat();
      return { status: 'combat-ready', runId: ledger.runId, sceneId: scene.id, combatId: combat.id,
        tokenIds: json(ledger.tokenIds) };
    });
  }
  function cleaveGeometry(scene, sourceToken, targetToken, secondaryToken, weapon, config) {
    const grid = globalThis.canvas?.grid;
    const reach = weapon?.system?.range?.reach ?? weapon?.system?.range?.value;
    const weaponUnits = weapon?.system?.range?.units;
    const reachFeet = weaponUnits === 'm' ? reach * 10 / 3 : weaponUnits === 'ft' ? reach : null;
    const maxDistanceFeet = config?.rules?.find((rule) => rule.kind === 'cleave')?.params?.distance ?? 5;
    const result = { legal: false, reachFeet, maxDistanceFeet, diagonals: grid?.diagonals,
      sourceToSecondaryFeet: null, primaryToSecondaryFeet: null, reason: 'cleave-geometry-unavailable' };
    if (globalThis.canvas?.scene?.id !== scene?.id || scene?.grid?.units !== 'ft'
      || typeof grid?.measurePath !== 'function' || !Number.isFinite(reachFeet) || reachFeet < 0
      || !Number.isFinite(maxDistanceFeet) || maxDistanceFeet < 0) return result;
    const cells = (token) => {
      if (!token || !Number.isInteger(token.width) || !Number.isInteger(token.height)
        || token.width < 1 || token.height < 1 || token.width > 20 || token.height > 20) return [];
      const points = [];
      for (let x = 0; x < token.width; x++) for (let y = 0; y < token.height; y++) {
        points.push({ x: token.x + (x + 0.5) * scene.grid.size, y: token.y + (y + 0.5) * scene.grid.size });
      }
      return points;
    };
    const distance = (left, right) => {
      const measured = cells(left).flatMap((a) => cells(right).map((b) => grid.measurePath([a, b]).distance));
      if (!measured.length || measured.some((value) => !Number.isFinite(value) || value < 0)) return null;
      return Math.hypot(Math.min(...measured), (left.elevation ?? 0) - (right.elevation ?? 0));
    };
    try {
      result.sourceToSecondaryFeet = distance(sourceToken, secondaryToken);
      result.primaryToSecondaryFeet = distance(targetToken, secondaryToken);
    } catch { return result; }
    if (result.sourceToSecondaryFeet === null || result.primaryToSecondaryFeet === null) return result;
    result.legal = result.sourceToSecondaryFeet <= reachFeet + 1e-6
      && result.primaryToSecondaryFeet <= maxDistanceFeet + 1e-6;
    result.reason = result.legal ? null : 'cleave-secondary-outside-reach-or-distance';
    return result;
  }
  function snapshot({ ledgerMessageId, scenario }) {
    assertGM();
    if (!KINDS.includes(scenario)) throw new Error('Unknown weapon scenario.');
    const { data } = requireLedger(ledgerMessageId);
    const ledger = data.ledger;
    if (!ledger.itemIds[scenario]) throw new Error('Scenario weapon was not prepared in this batch.');
    const scene = game.scenes.get(ledger.sceneId);
    const sourceActor = game.actors.get(ledger.actorIds.source);
    const targetActor = game.actors.get(ledger.actorIds.target);
    const secondaryActor = game.actors.get(ledger.actorIds.secondary);
    const sourceToken = scene?.tokens?.get?.(ledger.tokenIds.source);
    const targetToken = scene?.tokens?.get?.(ledger.tokenIds.target);
    const secondaryToken = scene?.tokens?.get?.(ledger.tokenIds.secondary);
    const weapon = sourceActor?.items?.get?.(ledger.itemIds[scenario]);
    const nickFirst = sourceActor?.items?.get?.(ledger.supportItemIds?.nickFirst);
    const config = weapon ? api().configuration(weapon) : null;
    const cleave = scenario === 'cleave' ? cleaveGeometry(scene, sourceToken, targetToken, secondaryToken, weapon, config) : null;
    const activities = attackActivities(weapon);
    const env = environment(ledger.expectedEnabledModules);
    const buildIdentity = identity(ledger.expectedBuildId, ledger.expectedSettings ?? []);
    const pushDestination = scenario === 'push' && scene && sourceToken && targetToken ? {
      x: targetToken.x + 2 * scene.grid.size, y: targetToken.y,
      distanceFeet: 2 * scene.grid.distance,
      awayFromSource: targetToken.x > sourceToken.x && targetToken.y === sourceToken.y,
      withinScene: targetToken.x + 2 * scene.grid.size + targetToken.width * scene.grid.size <= scene.width,
      collisionClear: values(scene.tokens).every((token) => token.id === targetToken.id
        || token.x !== targetToken.x + 2 * scene.grid.size || token.y !== targetToken.y)
        && values(scene.walls).length === 0,
    } : null;
    const preflight = { ok: env.ok && buildIdentity.status !== 'MISMATCH' && ledger.status === 'ready' && !!scene && !!sourceActor && !!targetActor
        && !!sourceToken && !!targetToken && !!weapon && activities.length > 0
        && (scenario !== 'cleave' || (!!secondaryActor && !!secondaryToken && secondaryToken.actor === secondaryActor && cleave?.legal))
        && (scenario !== 'nick' || (!!nickFirst && isLight(nickFirst) && isLight(weapon)
          && attackActivities(nickFirst).length > 0 && nickFirst.id !== weapon?.id))
        && sourceToken.actorLink === true && targetToken.actorLink === true
        && sourceToken.actor === sourceActor && targetToken.actor === targetActor
        && sourceActor.type === 'npc' && config?.enabled === true
        && (HOUSE.has(scenario) ? config.rules?.some((entry) => entry.kind === scenario && entry.ruleId.startsWith('house.'))
          : config?.mastery === `dnd2024.${scenario}` && config?.grantMastery === true)
        && Number.isFinite(targetActor.system?.attributes?.ac?.value)
        && Number.isFinite(targetActor.system?.attributes?.movement?.walk)
        && env.observed.activeSceneId === ledger.sceneId
        && env.observed.combatSceneId === ledger.sceneId
        && !!ledger.combatId && env.observed.combatId === ledger.combatId
        && combatMatchesLedger(game.combats?.get?.(ledger.combatId), ledger)
        && flag(game.combats?.get?.(ledger.combatId))?.runId === ledger.runId
        && flag(game.combats?.get?.(ledger.combatId))?.role === 'combat'
        && env.observed.activeTurnKey !== null
        && (scenario !== 'push' || (pushDestination?.awayFromSource && pushDestination?.withinScene && pushDestination?.collisionClear)),
      reasons: [] };
    if (!env.ok) preflight.reasons.push(`environment:${env.mismatches.join(',')}`);
    if (buildIdentity.status === 'MISMATCH') preflight.reasons.push('build-or-settings-mismatch');
    if (ledger.status !== 'ready') preflight.reasons.push(`ledger:${ledger.status}`);
    if (!scene || !sourceActor || !targetActor || !sourceToken || !targetToken) preflight.reasons.push('missing-document');
    if (scenario === 'cleave' && (!secondaryActor || !secondaryToken || secondaryToken.actor !== secondaryActor)) preflight.reasons.push('cleave-secondary-target-missing');
    if (scenario === 'cleave' && !cleave?.legal) preflight.reasons.push(cleave?.reason ?? 'cleave-geometry-unavailable');
    if (scenario === 'nick' && (!nickFirst || !isLight(nickFirst) || !isLight(weapon)
      || !attackActivities(nickFirst).length || nickFirst.id === weapon?.id)) preflight.reasons.push('nick-two-distinct-light-weapons-required');
    if (sourceToken && targetToken && (sourceToken.actorLink !== true || targetToken.actorLink !== true
      || sourceToken.actor !== sourceActor || targetToken.actor !== targetActor)) preflight.reasons.push('token-actor-not-linked');
    if (!weapon || !activities.length) preflight.reasons.push('missing-attack-activity');
    if (sourceActor?.type !== 'npc' || config?.enabled !== true || (HOUSE.has(scenario)
      ? !config.rules?.some((entry) => entry.kind === scenario && entry.ruleId.startsWith('house.'))
      : config?.mastery !== `dnd2024.${scenario}` || config?.grantMastery !== true)) preflight.reasons.push('missing-rule-configuration');
    if (!Number.isFinite(targetActor?.system?.attributes?.ac?.value)) preflight.reasons.push('missing-target-ac');
    if (!Number.isFinite(targetActor?.system?.attributes?.movement?.walk)) preflight.reasons.push('missing-target-walk');
    if (!env.observed.activeTurnKey) preflight.reasons.push('missing-active-combat-turn');
    if (env.observed.activeSceneId !== ledger.sceneId) preflight.reasons.push('fixture-scene-not-active');
    if (env.observed.combatSceneId !== ledger.sceneId) preflight.reasons.push('combat-not-in-fixture-scene');
    if (!ledger.combatId || env.observed.combatId !== ledger.combatId
      || !combatMatchesLedger(game.combats?.get?.(ledger.combatId), ledger)
      || flag(game.combats?.get?.(ledger.combatId))?.runId !== ledger.runId
      || flag(game.combats?.get?.(ledger.combatId))?.role !== 'combat') preflight.reasons.push('task-combat-not-registered-active');
    if (scenario === 'push' && (!pushDestination?.awayFromSource || !pushDestination?.withinScene || !pushDestination?.collisionClear)) preflight.reasons.push('invalid-push-destination');
    const chatMessages = values(game.messages).filter((message) => relatedMessage(message, ledger)).map((message) => ({
      id: message.id, type: message.type ?? null, timestamp: message.timestamp, dnd5eFlags: json(message.flags?.dnd5e ?? {}),
      moduleFlags: json(message.flags?.[NS] ?? {}) }));
    const selectedTargetTokenIds = values(game.user?.targets).map((token) => idOf(token.document ?? token)).filter(Boolean);
    const controlledTokenIds = values(globalThis.canvas?.tokens?.controlled).map((token) => idOf(token.document ?? token)).filter(Boolean);
    const result = { schemaVersion: VERSION, runId: ledger.runId, scenario, environment: env, buildIdentity, preflight,
      sourceSelection: { sourceTokenId: ledger.tokenIds.source, controlledTokenIds,
        matches: controlledTokenIds.length === 1 && controlledTokenIds[0] === ledger.tokenIds.source },
      targetSelection: { targetTokenId: ledger.tokenIds.target, selectedTokenIds: selectedTargetTokenIds,
        matches: selectedTargetTokenIds.length === 1 && selectedTargetTokenIds[0] === ledger.tokenIds.target },
      ledger: json({ ...ledger, cases: Object.fromEntries(Object.entries(ledger.cases ?? {}).map(([key, entry]) =>
        [key, { status: entry.status, source: entry.source ?? null, resetAt: entry.resetAt ?? null,
          startedAt: entry.startedAt ?? null, completedAt: entry.completedAt ?? null }])) }), activeTurnKey: env.observed.activeTurnKey,
      source: { ...actorState(sourceActor, sourceToken), weapon: weapon ? { id: weapon.id, uuid: weapon.uuid,
        sourceUuid: ledger.weaponSourceUuids[scenario], type: weapon.type, systemMastery: weapon.system?.mastery ?? null,
        configuration: json(config ?? null),
        useGate: { equipped: typeof weapon.system?.equipped === 'boolean' ? weapon.system.equipped : null,
          isEmbedded: typeof weapon.isEmbedded === 'boolean' ? weapon.isEmbedded : null,
          isOwner: typeof weapon.isOwner === 'boolean' ? weapon.isOwner : null,
          hasItemMacro: typeof weapon.hasMacro === 'function' ? Boolean(weapon.hasMacro()) : null },
        attackActivities: activities } : null,
      moduleLedger: json(sourceActor?.getFlag?.(NS, 'ledger') ?? sourceActor?.flags?.[NS]?.ledger ?? []) },
      target: actorState(targetActor, targetToken), secondary: actorState(secondaryActor, secondaryToken),
      nickFirst: nickFirst ? { id: nickFirst.id, uuid: nickFirst.uuid, attackActivities: attackActivities(nickFirst) } : null,
      pushDestination, ...(cleave ? { cleaveGeometry: cleave } : {}), chatMessages };
    return result;
  }
  async function ensureBatch(options) {
    return exclusive(async () => {
      assertGM();
      const existing = options.ledgerMessageId ? requireLedger(options.ledgerMessageId) :
        values(game.messages).find((entry) => flag(entry)?.role === 'ledger' && flag(entry)?.runId === options.runId);
      if (!existing) return create(options);
      const ledger = existing.data?.ledger ?? flag(existing)?.ledger;
      if (!ledger || !['ready', 'create-failed'].includes(ledger.status)) throw new Error('Batch is not reusable.');
      if (ledger.status !== 'ready') throw new Error('Incomplete batch creation requires exact-ID cleanup.');
      if (options.runId && options.runId !== ledger.runId) throw new Error('Run ID differs from existing batch.');
      const env = environment(ledger.expectedEnabledModules);
      if (!env.ok) throw new Error(`Environment mismatch: ${env.mismatches.join(', ')}`);
      if (options.expectedBuildId && ledger.expectedBuildId && options.expectedBuildId !== ledger.expectedBuildId)
        throw new Error('Expected build ID differs from existing batch.');
      if (!ledger.expectedBuildId && options.expectedBuildId) ledger.expectedBuildId = options.expectedBuildId;
      if ((!ledger.expectedSettings || !ledger.expectedSettings.length) && Array.isArray(options.expectedSettings))
        ledger.expectedSettings = json(options.expectedSettings);
      const buildIdentity = identity(ledger.expectedBuildId, ledger.expectedSettings ?? []);
      if (buildIdentity.status === 'MISMATCH') throw new Error('Build identity or setting profile differs from batch baseline.');
      if (flag(game.scenes.get(ledger.sceneId))?.runId !== ledger.runId) throw new Error('Batch scene ID or ownership is missing; inspect exact-ID cleanup ledger.');
      for (const [role, id] of Object.entries(ledger.actorIds)) {
        if (flag(game.actors.get(id))?.runId !== ledger.runId || flag(game.actors.get(id))?.role !== role)
          throw new Error(`Batch Actor ${role} ID or ownership is missing; inspect exact-ID cleanup ledger.`);
      }
      const scene = game.scenes.get(ledger.sceneId);
      for (const [role, id] of Object.entries(ledger.tokenIds)) {
        if (flag(scene.tokens?.get?.(id))?.runId !== ledger.runId || flag(scene.tokens?.get?.(id))?.role !== `${role}-token`)
          throw new Error(`Batch Token ${role} ID or ownership is missing; inspect exact-ID cleanup ledger.`);
      }
      const sourceActor = game.actors.get(ledger.actorIds.source);
      for (const [kind, id] of Object.entries(ledger.itemIds)) {
        const item = sourceActor.items?.get?.(id);
        if (flag(item)?.runId !== ledger.runId || flag(item)?.role !== `weapon:${kind}`)
          throw new Error(`Batch Item ${kind} ID or ownership is missing; inspect exact-ID cleanup ledger.`);
      }
      for (const [kind, id] of Object.entries(ledger.supportItemIds ?? {})) {
        if (flag(sourceActor.items?.get?.(id))?.role !== `support:${kind}` || flag(sourceActor.items?.get?.(id))?.runId !== ledger.runId)
          throw new Error(`Batch support Item ${kind} ID or ownership is missing; inspect exact-ID cleanup ledger.`);
      }
      if (options.weaponSourceUuids?.cleave && !ledger.actorIds.secondary) {
        const secondary = await Actor.create({ name: `${ledger.runId} secondary`, type: 'npc',
          system: { attributes: { hp: { value: 200, max: 200, temp: 0 }, ac: { calc: 'flat', flat: 1 },
            movement: { walk: 30 } }, traits: { size: 'med' } }, flags: owned(ledger.runId, 'secondary') });
        ledger.actorIds.secondary = secondary.id; await persist(existing.message ?? existing, existing.data ?? flag(existing));
        const [token] = await scene.createEmbeddedDocuments('Token', [{ name: `${ledger.runId} secondary`,
          actorId: secondary.id, actorLink: true, x: 600, y: 500, flags: owned(ledger.runId, 'secondary-token') }]);
        if (!token) throw new Error('Secondary Token creation stopped; inspect exact owned IDs.');
        ledger.tokenIds.secondary = token.id; await persist(existing.message ?? existing, existing.data ?? flag(existing));
        const combat = game.combats?.get?.(ledger.combatId);
        if (combat && combatMatchesLedger(combat, { ...ledger, tokenIds: { source: ledger.tokenIds.source, target: ledger.tokenIds.target } })) {
          if (typeof combat.createEmbeddedDocuments !== 'function') throw new Error('Add secondary task Token to task Combat through the UI before Cleave.');
          await combat.createEmbeddedDocuments('Combatant', [{ tokenId: token.id, actorId: secondary.id, sceneId: ledger.sceneId }]);
        }
      }
      for (const kind of KINDS.filter((entry) => options.weaponSourceUuids?.[entry] && !ledger.itemIds[entry])) {
        const sourceUuid = options.weaponSourceUuids[kind];
        const source = await fromUuid(sourceUuid);
        if (source?.type !== 'weapon' || !source.toObject || !attackActivities(source).length)
          throw new Error(`${kind} source must be a real weapon with an Attack Activity.`);
        const expectedConfiguration = configuration(kind, options.propertyRules?.[kind]);
        const itemData = source.toObject();
        delete itemData._id;
        itemData.name = `${ledger.runId} ${kind} ${source.name}`;
        itemData.flags ??= {};
        itemData.flags[NS] = { [KEY]: { runId: ledger.runId, role: `weapon:${kind}` } };
        const [item] = await sourceActor.createEmbeddedDocuments('Item', [itemData]);
        if (!item) throw new Error(`${kind} append returned no Item; inspect owned Actor Items before retry.`);
        ledger.itemIds[kind] = item.id;
        ledger.itemUses ??= {};
        ledger.itemUses[kind] = json(item.system?.uses ?? null);
        ledger.weaponSourceUuids[kind] = sourceUuid;
        await persist(existing.message ?? existing, existing.data ?? flag(existing));
        if (flag(item)?.runId !== ledger.runId || !attackActivities(item).length)
          throw new Error(`${kind} appended Item failed ownership or Attack Activity readback.`);
        await api().configure(item, expectedConfiguration);
        if (JSON.stringify(api().configuration(item)) !== JSON.stringify(expectedConfiguration))
          throw new Error(`${kind} appended configuration readback differs.`);
      }
      if (options.supportWeaponSourceUuids?.nickFirst && !ledger.supportItemIds?.nickFirst) {
        const first = await fromUuid(options.supportWeaponSourceUuids.nickFirst);
        if (first?.type !== 'weapon' || !first.toObject || !attackActivities(first).length || !isLight(first))
          throw new Error('Nick first-attack source must be a real Light weapon with an Attack Activity.');
        const itemData = first.toObject(); delete itemData._id;
        itemData.name = `${ledger.runId} nick first ${first.name}`;
        itemData.flags ??= {}; itemData.flags[NS] = { [KEY]: { runId: ledger.runId, role: 'support:nickFirst' } };
        const [item] = await sourceActor.createEmbeddedDocuments('Item', [itemData]);
        if (!item) throw new Error('Nick support Item creation returned no document.');
        ledger.supportItemIds ??= {}; ledger.supportItemIds.nickFirst = item.id;
        ledger.supportWeaponSourceUuids ??= {}; ledger.supportWeaponSourceUuids.nickFirst = first.uuid;
        await persist(existing.message ?? existing, existing.data ?? flag(existing));
      }
      ledger.schemaVersion ??= 1;
      ledger.cases ??= {};
      for (const entry of Object.values(ledger.cases)) if (entry.status === 'running') entry.status = 'interrupted';
      const unfinished = Object.entries(ledger.cases).filter(([, entry]) =>
        ['reset', 'running', 'interrupted', 'awaiting-observation'].includes(entry.status));
      if (unfinished.length > 1) throw new Error('Multiple unfinished cases need exact-ID reconciliation.');
      if (ledger.activeCase && unfinished.length && ledger.activeCase !== unfinished[0][0])
        throw new Error('Batch active case disagrees with persisted case state.');
      ledger.activeCase = unfinished[0]?.[0] ?? null;
      await persist(existing.message ?? existing, existing.data ?? flag(existing));
      return { schemaVersion: VERSION, ledger: json(ledger), environment: env, buildIdentity, resumed: true };
    });
  }
  async function adoptBuild({ ledgerMessageId, expectedBuildId, receiptsSaved = false }) {
    return exclusive(async () => {
      assertGM();
      const { message, data } = requireLedger(ledgerMessageId);
      const ledger = data.ledger;
      if (ledger.status !== 'ready') throw new Error('Only a ready batch can accept a new build.');
      if (!receiptsSaved) throw new Error('Save the previous build receipts before accepting a new build.');
      if (ledger.activeCase || Object.values(ledger.cases ?? {}).some((entry) =>
        ['reset', 'running', 'interrupted', 'awaiting-observation'].includes(entry.status))
        || pendingFixtureAttacks(ledger).length) throw new Error('Finish or reconcile the active case before accepting a new build.');
      if (typeof expectedBuildId !== 'string' || !expectedBuildId || api().buildId !== expectedBuildId)
        throw new Error('New build ID does not match the loaded module.');
      const env = environment(ledger.expectedEnabledModules);
      if (!env.ok || identity(expectedBuildId, ledger.expectedSettings ?? []).status !== 'PASS')
        throw new Error('Environment or settings changed; inspect the batch before accepting a build.');
      for (const scenario of Object.keys(ledger.itemIds)) ownedCaseDocuments(ledger, scenario);
      const previousBuildId = ledger.expectedBuildId;
      if (previousBuildId === expectedBuildId) return { status: 'build-unchanged', buildId: expectedBuildId };
      ledger.buildHistory ??= [];
      ledger.buildHistory.push({ from: previousBuildId, to: expectedBuildId, at: Date.now(),
        previousReceiptsSaved: true, cases: Object.fromEntries(Object.entries(ledger.cases ?? {}).map(([kind, entry]) =>
          [kind, { status: entry.status, evidenceBuildId: entry.receipt?.buildIdentity?.observedBuildId ?? previousBuildId }])) });
      ledger.expectedBuildId = expectedBuildId;
      await persist(message, data);
      return { status: 'build-adopted', previousBuildId, buildId: expectedBuildId,
        fixturesRetained: true, instruction: 'Reset each affected case before rerunning; previous receipts keep their original build identity.' };
    });
  }
  function ownedCaseDocuments(ledger, scenario) {
    const scene = game.scenes.get(ledger.sceneId);
    const source = game.actors.get(ledger.actorIds.source);
    const target = game.actors.get(ledger.actorIds.target);
    const item = source?.items?.get?.(ledger.itemIds[scenario]);
    const token = scene?.tokens?.get?.(ledger.tokenIds.target);
    const sourceToken = scene?.tokens?.get?.(ledger.tokenIds.source);
    if (flag(scene)?.runId !== ledger.runId || flag(scene)?.role !== 'scene'
      || flag(source)?.runId !== ledger.runId || flag(source)?.role !== 'source'
      || flag(target)?.runId !== ledger.runId || flag(target)?.role !== 'target'
      || flag(item)?.runId !== ledger.runId || flag(item)?.role !== `weapon:${scenario}`
      || flag(sourceToken)?.runId !== ledger.runId || flag(sourceToken)?.role !== 'source-token'
      || flag(token)?.runId !== ledger.runId || flag(token)?.role !== 'target-token') {
      throw new Error('Exact case document ownership changed.');
    }
    return { scene, source, target, item, token, sourceToken };
  }
  function pendingFixtureAttacks(ledger) {
    const actor = game.actors.get(ledger.actorIds.source);
    const entries = actor?.getFlag?.(NS, 'ledger') ?? actor?.flags?.[NS]?.ledger ?? [];
    if (!Array.isArray(entries)) return [];
    const itemUuids = Object.values(ledger.itemIds).map((id) => `Actor.${ledger.actorIds.source}.Item.${id}`);
    return entries.filter((entry) => itemUuids.includes(entry.itemUuid)
      && !['committed', 'cancelled'].includes(entry.step)).map((entry) => ({ attackId: entry.attackId, step: entry.step }));
  }
  function caseAttackTerminal(ledger, entry) {
    const source = game.actors.get(ledger.actorIds.source);
    const entries = source?.getFlag?.(NS, 'ledger') ?? source?.flags?.[NS]?.ledger ?? [];
    const attackId = entry.primaryAttackId ?? entry.publicResult?.attackId;
    const matching = Array.isArray(entries) ? entries.find((candidate) => candidate.attackId === attackId) : null;
    if (matching) return ['committed', 'cancelled'].includes(matching.step);
    return entry.publicResult?.status === 'committed' || entry.publicResult?.status === 'cancelled';
  }
  async function reconcileCase({ ledgerMessageId, scenario, isolationReason }) {
    return exclusive(async () => {
      assertGM();
      const { message, data } = requireLedger(ledgerMessageId);
      const ledger = data.ledger;
      const entry = ledger.cases?.[scenario];
      if (ledger.activeCase !== scenario || !entry || !['reset', 'interrupted', 'awaiting-observation'].includes(entry.status))
        throw new Error('Only the active reset, interrupted, or unfinished case can be reconciled.');
      const pending = pendingFixtureAttacks(ledger);
      if (pending.length && (typeof isolationReason !== 'string' || isolationReason.trim().length < 12))
        throw new Error(`Task attack is not terminal: ${pending.map((item) => `${item.attackId}:${item.step}`).join(', ')}`);
      const related = values(game.messages).filter((candidate) => !entry.messageIdsBefore.includes(candidate.id)
        && relatedMessage(candidate, ledger));
      if (!entry.primaryAttackId) {
        const scopedAttackIds = [...new Set(related.map((candidate) => candidate.flags?.[NS]?.attackId).filter(Boolean))];
        if (scopedAttackIds.length === 1) {
          entry.primaryAttackId = scopedAttackIds[0];
          entry.primaryAttackMessageId = selectAttackMessage(related, scopedAttackIds[0])?.id;
        }
      }
      const target = game.actors.get(ledger.actorIds.target);
      const changed = target?.system?.attributes?.hp?.value !== entry.before?.target?.hpValue
        || target?.system?.attributes?.hp?.temp !== entry.before?.target?.tempHp
        || values(target?.effects).some((effect) => !entry.before?.target?.effects?.some((old) => old.id === effect.id));
      const unresolvedStart = pending.length > 0 || ((entry.publicResult?.attackId || related.length || changed) && !caseAttackTerminal(ledger, entry));
      if (unresolvedStart && (typeof isolationReason !== 'string' || isolationReason.trim().length < 12))
        throw new Error('Attack completion or a documented scoped isolation is required before reconciliation.');
      if (!unresolvedStart && caseAttackTerminal(ledger, entry))
        entry.reconciliationAfter = snapshot({ ledgerMessageId, scenario });
      entry.status = unresolvedStart ? 'isolated' : 'abandoned'; entry.reconciledAt = Date.now();
      entry.reconciliation = { attackTerminal: pending.length === 0 && caseAttackTerminal(ledger, entry),
        pendingAttacks: json(pending), isolationReason: isolationReason ?? null };
      if (unresolvedStart) ledger.status = 'isolated';
      ledger.activeCase = null;
      await persist(message, data);
      if (scenario === 'vex') globalThis.__FVTT_WMP_DAMAGE_DIAGNOSTICS__ = false;
      return { status: entry.status, scenario, requireNewBatch: !!unresolvedStart,
        retainedIds: unresolvedStart ? { ledgerMessageId, sceneId: ledger.sceneId, combatId: ledger.combatId,
          actorIds: json(ledger.actorIds), itemIds: json(ledger.itemIds), tokenIds: json(ledger.tokenIds) } : null,
        reconciliation: json(entry.reconciliation) };
    });
  }
  async function removeRecordedCaseEffects(ledger) {
    const actors = Object.fromEntries(Object.entries(ledger.actorIds).map(([role, id]) => [role, game.actors.get(id)]));
    const known = new Set();
    for (const entry of Object.values(ledger.cases ?? {})) {
      if (entry.status !== 'exported' && !(entry.status === 'abandoned' && entry.reconciliationAfter)) continue;
      const after = entry.status === 'exported' ? entry.receipt?.after : entry.reconciliationAfter;
      for (const role of ['source', 'target', 'secondary']) {
        const before = new Set((entry.before?.[role]?.effects ?? []).map((effect) => effect.id));
        for (const effect of after?.[role]?.effects ?? []) if (!before.has(effect.id)) known.add(effect.id);
      }
    }
    const conditions = game.modules?.get?.('fvtt-custom-conditions')?.api?.weaponEffects;
    for (const actor of Object.values(actors)) {
      if (!actor) continue;
      const effects = values(actor.effects).filter((effect) => !effect.disabled);
      for (const effect of effects) if (!known.has(effect.id)) throw new Error(`Unrecorded effect ${effect.id} requires inspection before reset.`);
      for (const effect of effects) {
        const managed = conditions?.list?.(actor)?.find((entry) => entry.id === effect.id);
        if (managed) {
          const sourceItemUuid = managed.instance?.source?.itemUuid;
          if (!Object.values(ledger.itemIds).some((id) => sourceItemUuid === `Actor.${ledger.actorIds.source}.Item.${id}`))
            throw new Error(`Effect ${effect.id} source is not a batch weapon.`);
          await conditions.remove(actor, effect.id);
        } else {
          if (typeof actor.deleteEmbeddedDocuments !== 'function') throw new Error('Owned Actor cannot remove recorded effect.');
          await actor.deleteEmbeddedDocuments('ActiveEffect', [effect.id]);
        }
        if (actor.effects?.get?.(effect.id)) throw new Error(`Effect ${effect.id} persisted after reset.`);
      }
    }
  }
  async function resetCase({ ledgerMessageId, scenario }) {
    return exclusive(async () => {
      assertGM();
      const { message, data } = requireLedger(ledgerMessageId);
      const ledger = data.ledger;
      if (ledger.status !== 'ready' || !ledger.itemIds[scenario]) throw new Error('Batch scenario is not ready.');
      if (ledger.activeCase && ledger.activeCase !== scenario) throw new Error(`Finish active case ${ledger.activeCase} before resetting another case.`);
      if (Object.entries(ledger.cases ?? {}).some(([kind, entry]) => kind !== scenario
        && ['reset', 'running', 'interrupted', 'awaiting-observation'].includes(entry.status)))
        throw new Error('Another unfinished case must be reconciled first.');
      if (['running', 'interrupted', 'awaiting-observation'].includes(ledger.cases?.[scenario]?.status))
        throw new Error('Reconcile or complete this case before resetting it.');
      const pending = pendingFixtureAttacks(ledger);
      if (pending.length) throw new Error(`Task attack is not terminal: ${pending.map((entry) => `${entry.attackId}:${entry.step}`).join(', ')}`);
      const { source, target, token, sourceToken, item: caseItem } = ownedCaseDocuments(ledger, scenario);
      const secondary = game.actors.get(ledger.actorIds.secondary);
      const secondaryToken = game.scenes.get(ledger.sceneId)?.tokens?.get?.(ledger.tokenIds.secondary);
      if (secondary && (flag(secondary)?.runId !== ledger.runId || flag(secondary)?.role !== 'secondary')) throw new Error('Secondary Actor ownership changed.');
      if (secondaryToken && (flag(secondaryToken)?.runId !== ledger.runId || flag(secondaryToken)?.role !== 'secondary-token')) throw new Error('Secondary Token ownership changed.');
      await removeRecordedCaseEffects(ledger);
      const baselineEffects = [...values(source.effects), ...values(target.effects), ...values(secondary?.effects)].filter((entry) => !entry.disabled);
      if (baselineEffects.length) throw new Error('Fixture effects persisted after case reset.');
      const originalWalk = Object.values(ledger.cases ?? {}).map((entry) => entry.before?.target?.movement?.walk)
        .find((value) => Number.isFinite(value));
      if (Number.isFinite(originalWalk) && target.system?.attributes?.movement?.walk !== originalWalk)
        throw new Error('Target movement did not return to the recorded clean baseline.');
      if (typeof target.update !== 'function' || typeof token.update !== 'function') throw new Error('Owned target/token update API unavailable.');
      await target.update({ 'system.attributes.hp.value': target.system.attributes.hp.max, 'system.attributes.hp.temp': 0,
        'system.attributes.ac.calc': 'flat', 'system.attributes.ac.flat': scenario === 'graze' ? 99 : 1 });
      await token.update({ x: 600, y: 400 });
      if (secondary && secondaryToken) {
        await secondary.update({ 'system.attributes.hp.value': secondary.system.attributes.hp.max, 'system.attributes.hp.temp': 0 });
        await secondaryToken.update({ x: 600, y: 500 });
      }
      await source.update({ 'system.attributes.hp.value': source.system.attributes.hp.max, 'system.attributes.hp.temp': 0,
        'system.abilities.str.value': 16, 'system.abilities.dex.value': 16,
        'system.traits.size': scenario === 'cleave' ? 'lg' : 'med' });
      // A 2x2 source can reach both adjacent test targets without relying on
      // a world's diagonal metric. Keep the real weapon reach unchanged.
      await sourceToken.update({ x: scenario === 'cleave' ? 400 : 500, y: 400,
        width: scenario === 'cleave' ? 2 : 1, height: scenario === 'cleave' ? 2 : 1 });
      if (scenario === 'cleave') {
        ledger.testConditions ??= {};
        ledger.testConditions.cleave = { sourceSize: 'lg', sourceFootprint: [2, 2],
          reason: 'Two non-overlapping targets within real weapon reach under the existing grid metric' };
      }
      if (HOUSE.has(scenario)) {
        const attackActivity = values(caseItem.system?.activities).find((activity) => activity.type === 'attack');
        if (typeof caseItem.update !== 'function') throw new Error('Test weapon cannot configure its real critical threshold.');
        // This is a documented dnd5e test-weapon setting, not a forced roll or effect.
        await caseItem.update({ [`system.activities.${idOf(attackActivity)}.attack.critical.threshold`]: 2 });
        ledger.testConditions ??= {};
        ledger.testConditions[scenario] = { criticalThreshold: 2, ordinaryDice: true, scope: 'task-owned-weapon' };
      }
      for (const [kind, id] of Object.entries(ledger.itemIds)) {
        const item = source.items?.get?.(id);
        const uses = ledger.itemUses?.[kind];
        if (uses && JSON.stringify(item?.system?.uses) !== JSON.stringify(uses)) {
          if (typeof item?.update !== 'function') throw new Error(`Weapon ${kind} uses cannot be reset.`);
          await item.update({ 'system.uses': json(uses) });
        }
      }
      const combat = game.combats?.get?.(ledger.combatId);
      const sourceTurn = values(combat?.turns).findIndex((combatant) => combatant.tokenId === ledger.tokenIds.source);
      if (!combat || sourceTurn < 0 || typeof combat.update !== 'function')
        throw new Error('Task Combat turn order cannot select the source Token.');
      await combat.update({ round: Math.max(1, Number(combat.round ?? 0) + 1), turn: sourceTurn });
      if ((combat.combatant ?? values(combat.turns)[combat.turn])?.tokenId !== ledger.tokenIds.source)
        throw new Error('Task Combat did not enter the source Token turn.');
      const canvasLayer = globalThis.canvas?.tokens;
      const sourcePlaceable = canvasLayer?.get?.(ledger.tokenIds.source);
      const targetPlaceable = canvasLayer?.get?.(ledger.tokenIds.target);
      if (scenario === 'vex' && globalThis.canvas?.scene?.id === ledger.sceneId
        && sourcePlaceable?.document?.id === ledger.tokenIds.source
        && sourcePlaceable.document.actorId === ledger.actorIds.source
        && flag(sourcePlaceable.document)?.runId === ledger.runId
        && flag(sourcePlaceable.document)?.role === 'source-token'
        && typeof sourcePlaceable.control === 'function') {
        if (typeof canvasLayer?.activate === 'function') await canvasLayer.activate();
        sourcePlaceable.control({ releaseOthers: true });
      }
      if (globalThis.canvas?.scene?.id === ledger.sceneId && typeof canvasLayer?.setTargets === 'function'
        && targetPlaceable?.document?.id === ledger.tokenIds.target
        && targetPlaceable.document.actorId === ledger.actorIds.target
        && flag(targetPlaceable.document)?.runId === ledger.runId
        && flag(targetPlaceable.document)?.role === 'target-token') {
        canvasLayer.setTargets([ledger.tokenIds.target], { mode: 'replace' });
      } else if (typeof game.user?.updateTokenTargets === 'function') game.user.updateTokenTargets([ledger.tokenIds.target]);
      const before = snapshot({ ledgerMessageId, scenario });
      if (!before.preflight.ok) throw new Error(`Case preflight failed: ${before.preflight.reasons.join(', ')}`);
      ledger.schemaVersion = VERSION;
      ledger.cases ??= {};
      const previousKeys = Object.keys(ledger.cases[scenario] ?? {});
      ledger.cases[scenario] = { status: 'reset', resetAt: Date.now(), before,
        messageIdsBefore: values(game.messages).filter((entry) => relatedMessage(entry, ledger)).map((entry) => entry.id) };
      ledger.activeCase = scenario;
      // Flag updates merge recursively. Omitted checkpoint fields must be
      // explicitly deleted or they can bind this run to an older attack/build.
      await persist(message, data, { scenario, previousKeys });
      return { status: 'reset', scenario, before, uiRequired: ['Select task source and target Tokens', 'Use the real Attack Activity', 'Apply real damage where the rule requires it', 'Record choices and inspect resulting rolls/effects'] };
    });
  }
  async function runCase({ ledgerMessageId, scenario, source = 'ui-activity', request = {} }) {
    return exclusive(async () => {
      assertGM();
      const { message, data } = requireLedger(ledgerMessageId);
      const ledger = data.ledger;
      const entry = ledger.cases?.[scenario];
      if (ledger.activeCase !== scenario) throw new Error('Another case owns the batch.');
      let switchToApi = false;
      if (entry?.status === 'awaiting-observation' && entry.source === 'ui-activity' && source === 'ui-activity') {
        return { status: entry.status, scenario, source, alreadyArmed: true, startedAt: entry.startedAt,
          before: entry.before, after: entry.after,
          uiRequired: ['已准备，请攻击；完成真实 Activity 和伤害应用后导出收据'] };
      }
      if (entry?.status === 'awaiting-observation' && entry.source === 'ui-activity' && source === 'runtime-api') {
        const newMessages = values(game.messages).filter((candidate) =>
          !entry.messageIdsBefore.includes(candidate.id) && relatedMessage(candidate, ledger));
        const actorChanged = ['source', 'target', 'secondary'].some((role) => {
          const actor = game.actors.get(ledger.actorIds[role]);
          const baseline = entry.before?.[role];
          return actor && baseline && (actor.system?.attributes?.hp?.value !== baseline.hpValue
            || actor.system?.attributes?.hp?.temp !== baseline.tempHp
            || JSON.stringify(effects(actor)) !== JSON.stringify(baseline.effects));
        });
        if (newMessages.length || actorChanged || pendingFixtureAttacks(ledger).length || entry.publicResult) {
          throw new Error('UI case already has activity; export or reconcile it before another use.');
        }
        switchToApi = true;
      }
      if (!entry || (entry.status !== 'reset' && !switchToApi)) throw new Error('Call resetCase before each run; interrupted runs need an explicit reset.');
      if (!['ui-activity', 'runtime-api'].includes(source)) throw new Error('Unknown case source.');
      if (scenario === 'nick' && source === 'runtime-api') throw new Error('Nick needs two timed Light Activity uses; run this case through UI Activity.');
      const before = snapshot({ ledgerMessageId, scenario });
      if (!before.preflight.ok) throw new Error(`Case preflight failed: ${before.preflight.reasons.join(', ')}`);
      if (source === 'ui-activity' && scenario === 'vex' && !before.sourceSelection.matches)
        throw new Error('Case preflight failed: vex-source-token-not-controlled');
      if (source === 'ui-activity' && scenario === 'vex' && !before.targetSelection.matches)
        throw new Error('Case preflight failed: vex-target-token-not-selected');
      if (switchToApi) entry.uiArmedAt = entry.startedAt;
      const { source: actor, target, item, token } = ownedCaseDocuments(ledger, scenario);
      entry.status = 'running'; entry.source = source; entry.startedAt = Date.now(); entry.runPreflight = before;
      if (scenario === 'vex') {
        globalThis.__FVTT_WMP_DAMAGE_DIAGNOSTICS__ = true;
        globalThis.__FVTT_WMP_DAMAGE_DIAGNOSTICS_LOG__ = [];
      }
      await persist(message, data);
      try {
        if (source === 'runtime-api') {
          const facade = api();
          const activity = values(item.system?.activities).find((candidate) => candidate.type === 'attack');
          if (!activity) throw new Error('Real Attack Activity unavailable.');
          const midi = game.modules?.get?.('midi-qol');
          if (midi?.active === true) {
            const midiApi = typeof midi.api?.completeActivityUse === 'function' ? midi.api : globalThis.MidiQOL;
            const complete = midiApi?.completeActivityUse;
            if (typeof complete !== 'function') throw new Error('Midi public completeActivityUse API unavailable.');
            const workflow = await complete.call(midiApi, activity, { midiOptions: { ...(request.midiOptions ?? {}),
              targetsToUse: new Set([token]), ignoreUserTargets: true } }, {}, {});
            const actorLedger = actor.getFlag?.(NS, 'ledger') ?? actor.flags?.[NS]?.ledger ?? [];
            const matching = Array.isArray(actorLedger) ? actorLedger.filter((candidate) => candidate.itemUuid === item.uuid
              && Number(candidate.createdAt) >= entry.startedAt).at(-1) : null;
            entry.driver = 'midi-qol';
            entry.publicResult = { attackId: matching?.attackId ?? null,
              status: matching?.step === 'committed' ? 'committed' : matching?.step === 'cancelled'
                ? 'cancelled' : workflow?.aborted ? 'cancelled' : 'pending',
              workflowId: typeof workflow?.id === 'string' ? workflow.id : null,
              aborted: workflow?.aborted === true };
          } else {
            if (typeof facade.use !== 'function') throw new Error('Public use API unavailable.');
            const result = await facade.use(activity, { ...request, item, actor, activity, targetActor: target, targetToken: token });
            entry.driver = 'weapon-api';
            entry.publicResult = result ? { attackId: typeof result.attackId === 'string' ? result.attackId : null,
              status: typeof result.status === 'string' ? result.status : 'pending',
              reason: typeof result.reason === 'string' ? result.reason : null,
              messageId: typeof result.results?.message?.id === 'string' ? result.results.message.id : null } : null;
          }
        }
        entry.after = snapshot({ ledgerMessageId, scenario });
        entry.newMessageIds = values(game.messages).filter((candidate) => !entry.messageIdsBefore.includes(candidate.id)
          && relatedMessage(candidate, ledger)).map((candidate) => candidate.id);
        entry.status = 'awaiting-observation'; entry.completedAt = Date.now();
        await persist(message, data);
        return { status: entry.status, scenario, source, driver: entry.driver ?? 'ui-activity', publicResult: entry.publicResult ?? null,
          newMessageIds: [...entry.newMessageIds], before: entry.before, after: entry.after,
          uiRequired: source === 'ui-activity' ? ['Use real Attack Activity', 'Apply damage', 'Record attack and damage cards, choices, and new effects']
            : ['Complete any pending attack, damage, Push destination, saving throw, or choice dialog', 'Inspect actual cards and effects'] };
      } catch (error) {
        entry.status = 'interrupted'; entry.error = String(error); await persist(message, data);
        throw error;
      }
    });
  }
  function selectAttackMessage(messages, attackId) {
    // Usage cards also carry attackId. Only the actual attack roll can anchor
    // damage proof and a first-hit checkpoint; two matching rolls are ambiguous.
    const candidates = messages.filter((message) => message.flags?.dnd5e?.roll?.type === 'attack'
      && message.type !== 'usage' && ![0, 4].includes(message.flags?.['midi-qol']?.type)
      && (!attackId || message.flags?.[NS]?.attackId === attackId));
    return candidates.length === 1 ? candidates[0] : undefined;
  }
  function classifiedInput(ledger, scenario, entry, after, messages, observations) {
    const before = entry.before;
    const primaryAfter = entry.primaryAfter ?? after;
    const config = after.source.weapon.configuration;
    const rule = HOUSE.has(scenario) ? config.rules.find((candidate) => candidate.kind === scenario) : null;
    const attackId = entry.primaryAttackId ?? entry.publicResult?.attackId ?? observations.attackId
      ?? messages.map((message) => message.flags?.[NS]?.attackId).find(Boolean);
    const attackMessage = selectAttackMessage(messages, attackId);
    const attackRoll = attackMessage?.rolls?.find((roll) => roll.type === 'attack')
      ?? attackMessage?.rolls?.[0];
    const attackTotal = Number.isFinite(attackRoll?.total) ? attackRoll.total : observations.attackTotal;
    const d20 = values(attackRoll?.dice).find((die) => die.faces === 20);
    const natural = values(d20?.results).find((result) => result.active !== false)?.result;
    const natural1 = natural === 1;
    const natural20 = natural === 20;
    const targetAc = before.target.ac?.value;
    const outcome = observations.attackOutcome ?? (Number.isFinite(attackTotal) && Number.isFinite(targetAc)
      ? natural1 ? 'miss' : natural20 || attackTotal >= targetAc ? 'hit' : 'miss' : undefined);
    const beforeEffects = [...before.source.effects, ...before.target.effects].map((effect) => effect.id);
    const fresh = [...after.source.effects, ...after.target.effects].filter((effect) => !beforeEffects.includes(effect.id));
    const match = fresh.find((effect) => {
      const managed = effect.flags?.['fvtt-custom-conditions']?.weaponEffect;
      return managed?.effectKind === scenario && managed?.source?.actorUuid === before.source.actorUuid
        && managed?.source?.itemUuid === before.source.weapon.uuid
        && managed?.target?.actorUuid === before.target.actorUuid;
    });
    // A second Vex hit may create a new effect. Consumption still refers to the saved first instance.
    const observedEffect = entry.observedEffect?.effect ?? match;
    const managed = observedEffect?.flags?.['fvtt-custom-conditions']?.weaponEffect;
    const laterAttack = (scenario === 'vex' || scenario === 'sap') && !managed
      && (Boolean(observations.nextAttack) || messages.some((message) => message.id !== attackMessage?.id
        && (message.flags?.dnd5e?.roll?.type === 'attack' || message.flags?.[NS]?.attackId)));
    const proof = primaryAfter.target.damageProof;
    const proofMatches = proof?.attackId === attackId && proof?.targetActorUuid === before.target.actorUuid
      && proof?.attackMessageId === attackMessage?.id;
    const completeProof = proofMatches && proof.schemaVersion === 1 && proof.actorUuid === before.source.actorUuid
      && typeof proof.nonce === 'string' && proof.nonce.length > 0
      && [proof.before?.hp, proof.before?.tempHp, proof.after?.hp, proof.after?.tempHp]
        .every(value => Number.isFinite(value) && value >= 0);
    // The final case snapshot may also include condition ticks or healing.
    // Attribute this attack only to its matching persisted damage event.
    const damageBefore = completeProof ? proof.before : { hp: before.target.hpValue, tempHp: before.target.tempHp };
    const damageAfter = completeProof ? proof.after : { hp: primaryAfter.target.hpValue, tempHp: primaryAfter.target.tempHp };
    const applied = damageBefore.hp + damageBefore.tempHp - damageAfter.hp - damageAfter.tempHp;
    const uiApplied = (observations.damageAppliedMessageId ?? entry.primaryObservations?.damageAppliedMessageId) === attackMessage?.id
      && (observations.appliedToTargetTokenId ?? entry.primaryObservations?.appliedToTargetTokenId) === ledger.tokenIds.target;
    const accepted = proofMatches && proof.schemaVersion === 1 && !completeProof ? undefined
      : completeProof ? applied > 0 : entry.primaryDamageUnattributed ? undefined
      : applied > 0 && (proofMatches || uiApplied) ? true
        : observations.damageApplicationComplete === true ? false : undefined;
    const sourceLedger = after.source.moduleLedger?.find((candidate) => candidate.attackId === attackId);
    const evidence = { attempted: true, source: entry.source,
      attackerActorId: ledger.actorIds.source, itemId: ledger.itemIds[scenario],
      activityId: after.source.weapon.attackActivities?.[0]?.id,
      targetActorId: ledger.actorIds.target, targetTokenId: ledger.tokenIds.target,
      qualification: { actorType: after.source.actorType,
        selectedMasteryRuleId: config.mastery, grantMastery: config.grantMastery, nativeMasteryUnlocked: false,
        ...(rule ? { propertyRuleId: rule.ruleId, propertyKind: rule.kind, propertyParams: rule.params } : {}) },
      activeTurnKey: before.activeTurnKey,
      ...(attackMessage && attackId && Number.isFinite(attackTotal) && Number.isFinite(targetAc) && outcome
        ? { attack: { attackId, messageId: attackMessage.id, timestamp: Number(attackMessage.timestamp),
          total: attackTotal, targetAc, outcome, natural1, natural20,
          critical: observations.critical === true || attackRoll?.isCritical === true || attackRoll?.options?.critical === true } } : {}),
      ...(sourceLedger ? { sourceLedger } : {}),
      damage: { accepted, amount: Math.max(0, applied), hpBefore: damageBefore.hp, hpAfter: damageAfter.hp,
        tempHpBefore: damageBefore.tempHp, tempHpAfter: damageAfter.tempHp },
      beforeEffectIds: beforeEffects,
      effectReadback: { complete: !laterAttack, instance: managed ? { id: observedEffect.id, kind: managed.effectKind,
        holderActorId: entry.observedEffect?.holderActorId ?? (after.source.effects.some((effect) => effect.id === observedEffect.id)
          ? ledger.actorIds.source : ledger.actorIds.target),
        sourceActorId: ledger.actorIds.source, targetActorId: ledger.actorIds.target,
        itemUuid: managed.source.itemUuid, createdAt: managed.createdAt } : null },
      speed: { before: before.target.movement?.walk, after: primaryAfter.target.movement?.walk },
      ...(observations.mechanic ? { mechanic: json(observations.mechanic) } : {}),
      ...(observations.nextAttack && (scenario !== 'vex' || (entry.vexCheckpoint?.status === 'SAVED'
        && entry.vexPreRoll?.status === 'READY'))
        ? { nextAttack: { ...json(observations.nextAttack),
        effectAfter: observations.nextAttack.effectAfter ?? (observedEffect
          ? { complete: true, present: [...after.source.effects, ...after.target.effects]
            .some((effect) => effect.id === observedEffect.id) } : undefined) } } : {}),
      ...(observations.push ? { push: json(observations.push) } : {}),
    };
    const buildIdentity = JSON.stringify(before.buildIdentity) === JSON.stringify(primaryAfter.buildIdentity)
      && JSON.stringify(before.buildIdentity) === JSON.stringify(after.buildIdentity)
      ? after.buildIdentity : { ...after.buildIdentity, status: 'MISMATCH' };
    return { environment: { expected: after.environment.expected, observed: after.environment.observed },
      buildIdentity, rules: { [scenario]: evidence } };
  }
  async function exportReceipt({ ledgerMessageId, scenario, observations = {} }) {
    return exclusive(async () => {
      assertGM();
      const { message, data } = requireLedger(ledgerMessageId);
      const ledger = data.ledger;
      const entry = ledger.cases?.[scenario];
      if (ledger.activeCase !== scenario || !entry || entry.status !== 'awaiting-observation')
        throw new Error('No active completed case run to export.');
      const after = snapshot({ ledgerMessageId, scenario });
      const messageIds = values(game.messages).filter((candidate) => !entry.messageIdsBefore.includes(candidate.id)
        && relatedMessage(candidate, ledger)).map((candidate) => candidate.id);
      const capturedChatMessageIds = await captureChatMessages({ ledgerMessageId });
      ledger.chatMessageIds = [...new Set([...ledger.chatMessageIds, ...capturedChatMessageIds])];
      const newMessages = messageIds.map((id) => {
        const item = game.messages.get(id);
        return { id, type: item?.type ?? null, timestamp: item?.timestamp ?? null, dnd5eFlags: json(item?.flags?.dnd5e ?? {}),
          moduleFlags: json(item?.flags?.[NS] ?? {}), midiFlags: json(item?.flags?.['midi-qol'] ?? {}),
          rolls: values(item?.rolls).map((roll) => ({ total: roll.total, formula: roll.formula,
            type: roll.options?.type ?? roll.options?.rollType ?? null,
            dice: values(roll.dice).map((die) => ({ faces: die.faces, results: json(die.results ?? []) })) })) };
      });
      const beforeEffects = [...entry.before.source.effects, ...entry.before.target.effects].map((effect) => effect.id);
      const freshEffects = [...after.source.effects, ...after.target.effects].filter((effect) => !beforeEffects.includes(effect.id));
      const scopedMessages = messageIds.map((id) => game.messages.get(id)).filter(Boolean);
      if (!entry.primaryAttackId) entry.primaryAttackId = entry.publicResult?.attackId ?? observations.attackId
        ?? scopedMessages.map((item) => item.flags?.[NS]?.attackId).find(Boolean);
      if (!entry.primaryAttackMessageId) entry.primaryAttackMessageId = selectAttackMessage(scopedMessages, entry.primaryAttackId)?.id;
      if (!entry.primaryAfter && entry.primaryAttackMessageId) {
        const laterAttack = scopedMessages.some((item) => item.id !== entry.primaryAttackMessageId
          && (item.flags?.dnd5e?.roll?.type === 'attack' || (item.flags?.[NS]?.attackId
            && item.flags[NS].attackId !== entry.primaryAttackId)));
        if (laterAttack) entry.primaryDamageUnattributed = true;
        const applied = entry.before.target.hpValue + entry.before.target.tempHp
          - after.target.hpValue - after.target.tempHp;
        const proof = after.target.damageProof;
        const proofMatches = proof?.attackId === entry.primaryAttackId
          && proof?.attackMessageId === entry.primaryAttackMessageId
          && proof?.targetActorUuid === entry.before.target.actorUuid;
        const uiApplied = observations.damageAppliedMessageId === entry.primaryAttackMessageId
          && observations.appliedToTargetTokenId === ledger.tokenIds.target;
        if (!laterAttack && !entry.primaryDamageUnattributed && applied > 0 && (proofMatches || uiApplied)) {
          entry.primaryAfter = after;
          entry.primaryObservations = { damageAppliedMessageId: observations.damageAppliedMessageId,
            appliedToTargetTokenId: observations.appliedToTargetTokenId };
        }
      }
      if (!entry.observedEffect) {
        const matched = freshEffects.find((effect) => {
          const managed = effect.flags?.['fvtt-custom-conditions']?.weaponEffect;
          return managed?.effectKind === scenario && managed?.source?.actorUuid === entry.before.source.actorUuid
            && managed?.source?.itemUuid === entry.before.source.weapon.uuid
            && managed?.target?.actorUuid === entry.before.target.actorUuid;
        });
        if (matched) entry.observedEffect = { effect: matched,
          holderActorId: after.source.effects.some((effect) => effect.id === matched.id)
            ? ledger.actorIds.source : ledger.actorIds.target };
      }
      const input = classifiedInput(ledger, scenario, entry, after, scopedMessages, observations);
      const close = observations.closeCase === true;
      if (close && (!entry.primaryAttackMessageId || pendingFixtureAttacks(ledger).length || !caseAttackTerminal(ledger, entry)))
        throw new Error('Case has no verified terminal attack; export an interim receipt or reconcile it.');
      const receipt = { schemaVersion: VERSION, runId: ledger.runId, scenario, source: entry.source,
        buildIdentity: after.buildIdentity,
        environment: after.environment, before: entry.before, after, publicResult: entry.publicResult ?? null,
        newMessageIds: messageIds, newMessages, freshEffects, classifiedInput: input,
        actualDamageDelta: { hp: entry.before.target.hpValue - after.target.hpValue,
          tempHp: entry.before.target.tempHp - after.target.tempHp }, observations: json(observations),
        pendingUi: !close, ...(scenario === 'vex' ? { vexCheckpoint: entry.vexCheckpoint ?? null,
          vexPreRoll: entry.vexPreRoll ?? null,
          diagnostics: json(globalThis.__FVTT_WMP_DAMAGE_DIAGNOSTICS_LOG__ ?? []) } : {}) };
      entry.receipt = receipt; entry.status = close ? 'exported' : 'awaiting-observation';
      if (close) { entry.exportedAt = Date.now(); ledger.activeCase = null; }
      await persist(message, data);
      if (close && scenario === 'vex') globalThis.__FVTT_WMP_DAMAGE_DIAGNOSTICS__ = false;
      return json(receipt);
    });
  }
  async function checkpointVex({ ledgerMessageId, observations = {} }) {
    // Capture the first attack before another Activity can change HP or consume the effect.
    const receipt = await exportReceipt({ ledgerMessageId, scenario: 'vex', observations });
    return exclusive(async () => {
      const { message, data } = requireLedger(ledgerMessageId);
      const entry = data.ledger.cases?.vex;
      const evidence = receipt.classifiedInput.rules.vex;
      const effect = evidence.effectReadback?.instance;
      const failures = [];
      const laterAttacks = values(game.messages).filter((candidate) => !entry.messageIdsBefore.includes(candidate.id)
        && relatedMessage(candidate, data.ledger) && candidate.id !== evidence.attack?.messageId
        && (candidate.flags?.[NS]?.attackId ? candidate.flags[NS].attackId !== evidence.attack?.attackId
          : candidate.flags?.dnd5e?.roll?.type === 'attack'));
      if (!entry?.primaryAfter || evidence.damage?.accepted !== true) failures.push('first-damage-not-attributed');
      if (!evidence.attack?.attackId || !evidence.attack?.messageId) failures.push('first-attack-identity-missing');
      if (!effect || effect.kind !== 'vex' || effect.holderActorId !== data.ledger.actorIds.source)
        failures.push('attacker-vex-effect-missing');
      if (entry?.primaryDamageUnattributed || laterAttacks.length) failures.push('later-attack-already-observed');
      const checkpoint = { status: failures.length ? 'STOP' : 'SAVED', capturedAt: Date.now(),
        reasons: failures, attackId: evidence.attack?.attackId ?? null,
        attackMessageId: evidence.attack?.messageId ?? null,
        damage: evidence.damage, effectId: effect?.id ?? null,
        attackerActorId: data.ledger.actorIds.source, targetActorId: data.ledger.actorIds.target };
      entry.vexCheckpoint = checkpoint;
      await persist(message, data);
      return { ...receipt, vexCheckpoint: checkpoint, checkpoint };
    });
  }
  async function prepareVexNext({ ledgerMessageId }) {
    return exclusive(async () => {
      const { message, data } = requireLedger(ledgerMessageId);
      const ledger = data.ledger;
      const entry = ledger.cases?.vex;
      const checkpoint = entry?.vexCheckpoint;
      if (ledger.activeCase !== 'vex' || entry?.status !== 'awaiting-observation'
        || checkpoint?.status !== 'SAVED') throw new Error('STOP: save a valid Vex first-hit checkpoint before the next attack.');
      const now = snapshot({ ledgerMessageId, scenario: 'vex' });
      const effect = now.source.effects.find((candidate) => candidate.id === checkpoint.effectId);
      const newAttacks = values(game.messages).filter((candidate) => !entry.messageIdsBefore.includes(candidate.id)
        && relatedMessage(candidate, ledger)
        && candidate.id !== checkpoint.attackMessageId
        && (candidate.flags?.[NS]?.attackId ? candidate.flags[NS].attackId !== checkpoint.attackId
          : candidate.flags?.dnd5e?.roll?.type === 'attack'));
      const selected = game.user?.targets ? values(game.user.targets).map((token) => token.id) : null;
      if (!effect || newAttacks.length || now.target.actorId !== checkpoint.targetActorId
        || now.source.actorId !== checkpoint.attackerActorId
        || (selected && (selected.length !== 1 || selected[0] !== ledger.tokenIds.target)))
        throw new Error('STOP: Vex effect, target, or attack sequence changed after the first-hit checkpoint.');
      entry.vexNextPrepared = { at: Date.now(), effectId: checkpoint.effectId,
        attackerActorId: checkpoint.attackerActorId, targetActorId: checkpoint.targetActorId,
        targetTokenId: ledger.tokenIds.target };
      await persist(message, data);
      return { status: 'READY_FOR_DIALOG', ...entry.vexNextPrepared,
        instruction: 'Confirm this target and the actual Vex advantage source in the game dialog before rolling.' };
    });
  }
  async function recordVexPreRoll({ ledgerMessageId, observation }) {
    return exclusive(async () => {
      const { message, data } = requireLedger(ledgerMessageId);
      const entry = data.ledger.cases?.vex;
      const prepared = entry?.vexNextPrepared;
      if (data.ledger.activeCase !== 'vex' || !prepared) throw new Error('STOP: prepare the Vex second attack first.');
      const currentEffect = snapshot({ ledgerMessageId, scenario: 'vex' }).source.effects
        .some((effect) => effect.id === prepared.effectId);
      const sourceLabel = String(observation?.sourceLabel ?? '').trim();
      const valid = observation?.targetActorId === prepared.targetActorId
        && observation?.effectId === prepared.effectId && typeof observation?.offeredAdvantage === 'boolean'
        && ['advantage', 'normal', 'disadvantage'].includes(observation?.selectedMode)
        && !!sourceLabel && currentEffect;
      if (!valid) throw new Error('STOP: record the actual target, effect ID, advantage offer, source label, and selected mode before rolling.');
      entry.vexPreRoll = { ...json(observation), sourceLabel, recordedAt: Date.now(),
        status: observation.offeredAdvantage && observation.selectedMode === 'advantage' ? 'READY' : 'STOP' };
      await persist(message, data);
      return { ...entry.vexPreRoll,
        instruction: entry.vexPreRoll.status === 'READY' ? 'Roll now, then record the roll and effect consumption.'
          : 'Stop this case. Preserve the short evidence; do not treat a normal roll as a Vex failure.' };
    });
  }
  async function cleanupBatch(options) { return exclusive(() => cleanup(options)); }
  async function captureChatMessages({ ledgerMessageId }) {
    assertGM();
    const { message, data } = requireLedger(ledgerMessageId);
    const ledger = data.ledger;
    const candidates = values(game.messages).filter((entry) => relatedMessage(entry, ledger));
    for (const candidate of candidates) {
      const marker = flag(candidate);
      if (marker && (marker.runId !== ledger.runId || marker.role !== 'attack-message')) continue;
      if (!marker) await candidate.setFlag(NS, KEY, { runId: ledger.runId, role: 'attack-message' });
      if (!ledger.chatMessageIds.includes(candidate.id)) {
        ledger.chatMessageIds.push(candidate.id);
        await persist(message, data);
      }
    }
    return [...ledger.chatMessageIds];
  }
  async function cleanup({ ledgerMessageId }) {
    assertGM();
    const { message, data } = requireLedger(ledgerMessageId);
    const ledger = data.ledger;
    if (ledger.status === 'cleaned') return { status: 'already-cleaned', ledgerMessageId, ...ledger.cleanup };
    if (current().activeSceneId !== ledger.originalActiveSceneId) throw new Error('Restore the original active scene before fixture cleanup.');
    if (current().combatId !== ledger.originalCombatId) {
      ledger.status = 'cleanup-incomplete';
      ledger.cleanup = { ...(ledger.cleanup ?? {}),
        skipped: ['original-combat-selection-not-restored'],
        skippedIds: ['original-combat-selection-not-restored'],
        originalActiveCombatRestored: false };
      await persist(message, data);
      return { status: ledger.status, ledgerMessageId, ...ledger.cleanup };
    }
    const priorCleanup = ledger.cleanup;
    const deleted = priorCleanup?.deleted ? json(priorCleanup.deleted)
      : { chatMessageIds: [], combatId: null, sceneId: null, actorIds: [] };
    const skipped = [];
    const entry = (kind, id, role, document) => {
      const previous = priorCleanup?.entries?.find((record) => record.kind === kind && record.id === id
        && record.fixtureId === ledger.runId && record.role === role
        && record.ownershipVerified === true && record.absentAfterCleanup === true);
      return { kind, id, fixtureId: ledger.runId, role,
        ownerMarker: document ? json(flag(document) ?? null) : previous?.ownerMarker ?? null,
        ownershipVerified: document ? flag(document)?.runId === ledger.runId && flag(document)?.role === role : !!previous,
        absentAfterCleanup: !document && !!previous };
    };
    const sceneBefore = game.scenes.get(ledger.sceneId);
    const combatBefore = game.combats?.get?.(ledger.combatId);
    const sourceBefore = game.actors.get(ledger.actorIds.source);
    const records = [
      ...ledger.chatMessageIds.map((id) => entry('chatMessage', id, 'attack-message', game.messages.get(id))),
      ...(ledger.combatId ? [entry('combat', ledger.combatId, 'combat', combatBefore)] : []),
      entry('scene', ledger.sceneId, 'scene', sceneBefore),
      ...Object.entries(ledger.actorIds).map(([role, id]) => entry('actor', id, role, game.actors.get(id))),
      ...Object.entries(ledger.tokenIds).map(([role, id]) => entry('token', id, `${role}-token`, sceneBefore?.tokens?.get?.(id))),
      ...Object.entries(ledger.itemIds).map(([kind, id]) => entry('item', id, `weapon:${kind}`, sourceBefore?.items?.get?.(id))),
      ...Object.entries(ledger.supportItemIds ?? {}).map(([kind, id]) => entry('item', id, `support:${kind}`, sourceBefore?.items?.get?.(id))),
    ];
    for (const id of ledger.chatMessageIds) {
      const entry = game.messages.get(id);
      if (!entry) continue;
      if (!relatedMessage(entry, ledger) || flag(entry)?.runId !== ledger.runId || flag(entry)?.role !== 'attack-message') {
        skipped.push(`chat:${id}`); continue;
      }
      await entry.delete(); deleted.chatMessageIds.push(id);
    }
    const unregisteredCombats = values(game.combats).filter((combat) =>
      (combat.scene?.id ?? combat.scene) === ledger.sceneId && combat.id !== ledger.combatId);
    if (unregisteredCombats.length) skipped.push(`unregistered-combat:${unregisteredCombats.map((combat) => combat.id).join(',')}`);
    if (ledger.combatId) {
      const combat = game.combats?.get?.(ledger.combatId);
      if (!combat && deleted.combatId === ledger.combatId
        && records.some((record) => record.kind === 'combat' && record.id === ledger.combatId
          && record.ownershipVerified && record.absentAfterCleanup)) {
        // A previous cleanup pass already deleted this exact owned Combat.
      } else if (!combat || flag(combat)?.runId !== ledger.runId || flag(combat)?.role !== 'combat'
        || !combatMatchesLedger(combat, ledger)) {
        skipped.push(`combat:${ledger.combatId}`);
      } else {
        await combat.delete();
        deleted.combatId = ledger.combatId;
        if (game.combats.get(ledger.combatId)) skipped.push(`combat-still-present:${ledger.combatId}`);
      }
    }
    if (current().combatId !== ledger.originalCombatId) skipped.push('original-combat-selection-not-restored');
    const scene = game.scenes.get(ledger.sceneId);
    if (scene) {
      if (unregisteredCombats.length || (ledger.combatId && game.combats?.get?.(ledger.combatId))
        || flag(scene)?.runId !== ledger.runId || flag(scene)?.role !== 'scene'
        || values(scene.tokens).some((token) => !Object.values(ledger.tokenIds).includes(token.id))
        || ['walls', 'drawings', 'tiles', 'lights', 'sounds', 'templates', 'notes', 'regions'].some((key) => values(scene[key]).length > 0)
        || Object.entries(ledger.tokenIds).some(([role, id]) => {
          const token = scene.tokens?.get?.(id);
          return token && (flag(token)?.runId !== ledger.runId || flag(token)?.role !== `${role}-token`);
        })) skipped.push(`scene:${ledger.sceneId}`);
      else { await scene.delete(); deleted.sceneId = ledger.sceneId; }
    }
    for (const role of Object.keys(ledger.actorIds)) {
      const id = ledger.actorIds[role];
      const actor = game.actors.get(id);
      if (!actor) continue;
      if (scene && !deleted.sceneId) skipped.push(`actor:${id}`);
      else if (flag(actor)?.runId !== ledger.runId || flag(actor)?.role !== role
        || values(actor.items).some((item) => ![...Object.values(ledger.itemIds), ...Object.values(ledger.supportItemIds ?? {})].includes(item.id))
        || (role === 'source' && Object.entries(ledger.itemIds).some(([kind, itemId]) => {
          const item = actor.items?.get?.(itemId);
          return item && (flag(item)?.runId !== ledger.runId || flag(item)?.role !== `weapon:${kind}`);
        })) || (role === 'source' && Object.entries(ledger.supportItemIds ?? {}).some(([kind, itemId]) => {
          const item = actor.items?.get?.(itemId);
          return item && (flag(item)?.runId !== ledger.runId || flag(item)?.role !== `support:${kind}`);
        }))) skipped.push(`actor:${id}`);
      else { await actor.delete(); deleted.actorIds.push(id); }
    }
    for (const record of records) {
      const present = record.kind === 'chatMessage' ? game.messages.get(record.id)
        : record.kind === 'combat' ? game.combats?.get?.(record.id)
        : record.kind === 'scene' ? game.scenes.get(record.id)
          : record.kind === 'actor' ? game.actors.get(record.id)
            : record.kind === 'token' ? game.scenes.get(ledger.sceneId)?.tokens?.get?.(record.id)
              : game.actors.get(ledger.actorIds.source)?.items?.get?.(record.id);
      record.absentAfterCleanup = !present;
    }
    const residualRelatedChatIds = values(game.messages).filter((entry) => relatedMessage(entry, ledger)).map((entry) => entry.id);
    if (residualRelatedChatIds.length) skipped.push(`residual-chat:${residualRelatedChatIds.join(',')}`);
    ledger.status = skipped.length ? 'cleanup-incomplete' : 'cleaned';
    ledger.cleanedAt = Date.now(); ledger.cleanup = { deleted, skipped, skippedIds: [...skipped],
      combatUsed: !!ledger.combatId, registeredCombatId: ledger.combatId,
      originalCombatId: ledger.originalCombatId,
      originalActiveCombatRestored: current().combatId === ledger.originalCombatId,
      expectedChatMessageIds: [...ledger.chatMessageIds],
      residualRelatedChatIds,
      entries: [...records, { kind: 'chatMessage', id: ledgerMessageId, fixtureId: ledger.runId,
        role: 'ledger', ownerMarker: json(flag(message)), ownershipVerified: true,
        disposition: 'retained-ledger', ledgerStatus: ledger.status, status: ledger.status,
        presentAfterCleanup: true }] };
    await persist(message, data);
    return { status: ledger.status, ledgerMessageId, ...ledger.cleanup };
  }
  async function finalize({ ledgerMessageId, externalReceiptSaved }) {
    assertGM();
    if (externalReceiptSaved !== true) throw new Error('Save the external cleanup receipt before finalizing.');
    const { message, data } = requireLedger(ledgerMessageId);
    const ledger = data.ledger;
    if (ledger.status !== 'cleaned' || ledger.cleanup?.entries?.some((entry) => entry.disposition !== 'retained-ledger' && !entry.absentAfterCleanup)) {
      throw new Error('Complete exact-ID fixture cleanup and save its external receipt before finalizing.');
    }
    await message.delete();
    const absentAfterFinalization = !game.messages.get(ledgerMessageId);
    return { status: absentAfterFinalization ? 'finalized' : 'ledger-still-present',
      finalized: absentAfterFinalization, externalReceiptSaved: true,
      ledgerMessageId, ownerMarker: { runId: ledger.runId, role: 'ledger' }, absentAfterFinalization };
  }
  if (globalThis.WMP_E2E?.isBusy?.()) throw new Error('WMP E2E helper has an active operation; do not rebootstrap it.');
  globalThis.WMP_E2E = Object.freeze({ version: VERSION, isBusy: () => busy, environment, ensureBatch, adoptBuild, resetCase,
    runCase, reconcileCase, prepareCombat, snapshot, checkpointVex, prepareVexNext, recordVexPreRoll,
    exportReceipt, cleanupBatch, create, registerCombat, captureChatMessages, cleanup, finalize });
  console.info('WMP_E2E v2 ready: ensureBatch, resetCase, runCase, snapshot, exportReceipt, cleanupBatch; legacy create/registerCombat/cleanup/finalize preserved');
}
globalThis.WMP_E2E_INSTALL = installWeaponE2EHarness;
// Standalone GM macro compatibility. The module itself imports this before Foundry ready.
if (globalThis.game?.user?.isGM === true
  && (globalThis.game.ready === true || typeof globalThis.Hooks?.once !== 'function')) installWeaponE2EHarness();
