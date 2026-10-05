// Import the companion JSON as a Script Macro and run once as the ServerNext GM.
// This macro only prepares owned documents. Attack, damage roll and APPLY stay manual.
await (async () => {
  const prefix = 'SN-MIDI-L9-ISDMG-20260924';
  const marker = 'serverNextLocal9IsDamaged';
  const ids = {};
  let stage = 'preflight';
  let preflightPassed = false;
  const report = { case: 'Midi local.9 manual APPLY isDamaged setup', status: 'FAIL', prefix, ids };
  const fail = code => { throw new Error(code); };
  const owned = document => document?.getFlag?.('world', marker)?.prefix === prefix;
  const flags = { world: { [marker]: { prefix, purpose: 'manual-apply-isDamaged-setup' } } };
  const html = value => JSON.stringify(value, null, 2).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

  try {
    const url = new URL(location.href);
    const midi = game.modules.get('midi-qol');
    const dae = game.modules.get('dae');
    const settings = globalThis.MidiQOL?.configSettings?.();
    if (url.origin !== 'http://127.0.0.1:30002' || url.pathname !== '/game'
      || game.world?.id !== 'cor-cotn' || game.release?.version !== '14.368'
      || game.system?.id !== 'dnd5e' || game.system?.version !== '6.0.2'
      || game.user?.isGM !== true || !game.user.active
      || midi?.active !== true || midi.version !== '14.6.0-beta.4338eeab.local.9'
      || dae?.active !== true || dae.version !== '14.0.14'
      || settings?.autoApplyDamage !== 'none') fail('TARGET_OR_SETTINGS_MISMATCH');
    if (game.actors.some(a => a.name?.startsWith(prefix) || owned(a))
      || game.scenes.some(s => s.name?.startsWith(prefix) || owned(s))) fail('PRIOR_FIXTURE_EXISTS');
    const freshId = collection => {
      let id;
      do { id = foundry.utils.randomID(); } while (collection.get(id));
      return id;
    };
    ids.attacker = freshId(game.actors);
    ids.target = freshId(game.actors);
    ids.scene = freshId(game.scenes);
    if (new Set(Object.values(ids)).size !== 3) fail('ID_COLLISION');
    report.preflight = {
      origin: url.origin, path: url.pathname, world: game.world.id,
      foundry: game.release.version, dnd5e: game.system.version,
      midi: midi.version, dae: dae.version, autoApplyDamage: settings.autoApplyDamage,
      gm: game.user.id, initialScene: canvas.scene?.uuid ?? null,
      activeScene: game.scenes.active?.uuid ?? null,
      initialControlled: (canvas.tokens?.controlled ?? []).map(token => token.document.uuid),
      initialTargets: [...game.user.targets].map(token => token.document.uuid)
    };
    preflightPassed = true;

    stage = 'attacker';
    const attacker = await Actor.create({ _id: ids.attacker, name: `${prefix}-Attacker`,
      type: 'npc', flags, img: 'icons/svg/sword.svg',
      system: { abilities: { str: { value: 10 } }, attributes: { hp: { value: 20, max: 20 } } },
      prototypeToken: { actorLink: true, disposition: 1 } }, { keepId: true });
    if (attacker?.id !== ids.attacker || !owned(attacker)) fail('ATTACKER_READBACK_FAILED');

    stage = 'target';
    const target = await Actor.create({ _id: ids.target, name: `${prefix}-Target`,
      type: 'npc', flags, img: 'icons/svg/target.svg',
      system: { attributes: { hp: { value: 40, max: 40, temp: 0 },
        ac: { override: 1 }, movement: { walk: 0 } } },
      prototypeToken: { actorLink: true, disposition: -1 } }, { keepId: true });
    if (target?.id !== ids.target || !owned(target)
      || target.system.attributes.hp.value !== 40 || target.system.attributes.hp.temp !== 0
      || target.system.attributes.ac.value !== 1 || target.system.attributes.movement.walk !== 0) {
      fail('TARGET_BASELINE_READBACK_FAILED');
    }

    stage = 'weapon';
    const weaponId = freshId(attacker.items);
    ids.weapon = weaponId;
    const activityId = 'local9Attack0001';
    if (!/^[A-Za-z0-9]{16}$/.test(activityId)) fail('ACTIVITY_ID_NOT_16_CHARACTERS');
    const [weapon] = await attacker.createEmbeddedDocuments('Item', [{
      _id: weaponId, name: `${prefix}-Dagger`, type: 'weapon', flags,
      system: { equipped: true, proficient: 0, type: { value: 'simpleM', baseItem: 'dagger' },
        damage: { base: { number: 1, denomination: 4, bonus: '10', types: ['piercing'] } },
        activities: { [activityId]: { _id: activityId, type: 'attack', name: 'Attack',
          activation: { type: 'action', value: 1 },
          attack: { ability: 'none', bonus: '10', flat: false,
            type: { value: 'melee', classification: 'weapon' } },
          damage: { includeBase: true, parts: [] },
          target: { prompt: false, affects: { type: 'creature', count: '1' } }
        } } }
    }], { keepId: true });
    const activity = weapon?.system?.activities?.get(activityId);
    if (weapon?.id !== weaponId || !owned(weapon) || activity?.type !== 'attack'
      || activity?.toObject()?.attack?.bonus !== '10'
      || activity?.toObject()?.attack?.ability !== 'none'
      || activity?.damage?.includeBase !== true
      || weapon.system.damage.base.number !== 1 || weapon.system.damage.base.denomination !== 4
      || weapon.system.damage.base.bonus !== '10'
      || !weapon.system.damage.base.types.has('piercing')) fail('NATIVE_ATTACK_READBACK_FAILED');
    ids.activity = activityId;

    stage = 'effect';
    const effectId = freshId(target.effects);
    ids.effect = effectId;
    const [effect] = await target.createEmbeddedDocuments('ActiveEffect', [{
      _id: effectId, name: `${prefix}-isDamaged`, type: 'base', flags: {
        ...flags, dae: { specialDuration: ['isDamaged'] }
      }, disabled: false, transfer: false,
      system: { changes: [{ key: 'system.attributes.movement.speeds.walk',
        type: 'add', value: 10, priority: 20 }] }
    }], { keepId: true });
    if (effect?.id !== effectId || effect.type !== 'base' || !owned(effect)
      || !effect.active || !effect.getFlag('dae', 'specialDuration')?.includes('isDamaged')
      || effect.system.changes.length !== 1 || effect.system.changes[0].type !== 'add'
      || effect.system.changes[0].key !== 'system.attributes.movement.speeds.walk'
      || effect.system.changes[0].value !== 10
      || target.system.attributes.movement.speeds.walk !== 10
      || target.system.attributes.hp.value !== 40 || target.system.attributes.hp.temp !== 0) {
      report.effectReadback = { id: effect?.id ?? null, type: effect?.type ?? null,
        owned: owned(effect), active: effect?.active ?? null,
        specialDuration: effect?.getFlag('dae', 'specialDuration') ?? null,
        changes: effect?.system?.changes?.map(change => ({ key: change.key,
          type: change.type, value: change.value })) ?? null,
        walk: target.system.attributes.movement.speeds.walk,
        hp: target.system.attributes.hp.value, temp: target.system.attributes.hp.temp };
      fail('EFFECT_PREPARED_READBACK_FAILED');
    }

    stage = 'scene';
    const scene = await Scene.create({ _id: ids.scene, name: `${prefix}-Scene`, flags,
      width: 1600, height: 1200, padding: 0.1, navigation: false,
      tokenVision: false, fog: { exploration: false },
      grid: { type: 1, size: 100, distance: 5, units: 'ft' } }, { keepId: true });
    if (scene?.id !== ids.scene || !owned(scene) || scene.active) fail('SCENE_READBACK_FAILED');
    const attackerToken = await attacker.getTokenDocument({ x: 250, y: 500,
      name: `${prefix}-Attacker`, actorLink: true, flags });
    const targetToken = await target.getTokenDocument({ x: 350, y: 500,
      name: `${prefix}-Target`, actorLink: true, flags });
    const tokens = await scene.createEmbeddedDocuments('Token', [attackerToken.toObject(), targetToken.toObject()]);
    if (tokens.length !== 2 || scene.tokens.size !== 2
      || tokens[0].actorId !== ids.attacker || tokens[1].actorId !== ids.target
      || !tokens.every(owned)) fail('TOKEN_READBACK_FAILED');
    ids.attackerToken = tokens[0].id;
    ids.targetToken = tokens[1].id;

    stage = 'view';
    await scene.view(); // Local client view only; never activate the shared Scene.
    if (canvas.scene?.id !== ids.scene || scene.active) fail('SCENE_VIEW_FAILED');
    const attackerObject = canvas.tokens.get(ids.attackerToken);
    const targetObject = canvas.tokens.get(ids.targetToken);
    if (!attackerObject || !targetObject) fail('TOKEN_CANVAS_READBACK_FAILED');
    attackerObject.control({ releaseOthers: true });
    await targetObject.setTarget(true, { releaseOthers: true });
    if (!game.user.targets.has(targetObject) || !attackerObject.controlled) fail('LOCAL_SELECTION_FAILED');
    attacker.sheet.render(true);

    report.status = 'PRECHECK_PASS';
    report.ready = { attacker: attacker.uuid, target: target.uuid, scene: scene.uuid,
      attackerToken: tokens[0].uuid, targetToken: tokens[1].uuid,
      weapon: weapon.uuid, activity: activity.uuid, effect: effect.uuid,
      targetHp: target.system.attributes.hp.value, targetTemp: target.system.attributes.hp.temp,
      targetAc: target.system.attributes.ac.value, walkBeforeEffect: 0,
      walkPrepared: target.system.attributes.movement.speeds.walk,
      specialDuration: effect.getFlag('dae', 'specialDuration'), sceneViewed: canvas.scene.id,
      targetSelected: true, attackerControlled: true };
  } catch (error) {
    report.error = { stage, message: String(error?.message ?? error) };
  }
  // On failure, leave any created objects intact for exact-ID inspection and normal UI cleanup.
  if (preflightPassed) {
    try {
      const message = await ChatMessage.create({ content: `<pre>${html(report)}</pre>`, whisper: [game.user.id] });
      report.message = message.uuid;
    } catch (error) {
      report.messageError = String(error?.message ?? error);
      console.error('Midi local.9 fixture report', report);
    }
  }
  ui.notifications[report.status === 'PRECHECK_PASS' ? 'info' : 'error'](
    `Midi local.9 setup ${report.status}; stage=${stage}; ${Object.entries(ids).map(([k,v]) => `${k}=${v}`).join(' ')}`);
  return report;
})();
