/** Companion runtime for the source-authored Crystalbleed V14 encounter.
 * No server installation, global settings changes or Actor definition patches.
 * All Actor/Item definitions are imported from the project CLI artifacts.
 */
import { buildConditionFlag, createConditionInstance, isConditionId, projectedConditionStatusId, readConditionInstance } from '@fvtt-json-generator/contracts/conditions';

export const RUNTIME_VERSION = '2.1.1';
const FLAG = 'crystalbleedV14';
const DRAGON_MARKER = 'crystalbleed-eclipse-ward';
const CRYSTAL_MARKER = 'salvo-crystal-pulse';

export function wardDamage(total, state, proficiency = 5) {
  if (!Number.isFinite(total) || total <= 20 || state === 'broken') return total;
  if (state === 'weakened') return Math.max(0, total - proficiency);
  return Math.floor(total / 2);
}

export function rectanglesOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function tokenFootprint(token, gridSize) {
  return token.document ? {
    x: token.document.x, y: token.document.y,
    w: token.document.width * gridSize, h: token.document.height * gridSize,
  } : { x: token.x, y: token.y, w: token.w, h: token.h };
}

export function adjacentSquares(target, size) {
  const positions = [];
  const width = Math.max(1, Math.ceil(target.w / size));
  const height = Math.max(1, Math.ceil(target.h / size));
  for (let row = -1; row <= height; row++) {
    for (let col = -1; col <= width; col++) {
      if (row >= 0 && row < height && col >= 0 && col < width) continue;
      positions.push({ x: target.x + col * size, y: target.y + row * size, w: size, h: size });
    }
  }
  return positions;
}

export function nextTargetRound(round, currentIndex, targetIndex) {
  if (round < 1) return 1;
  return round + (targetIndex <= currentIndex ? 1 : 0);
}

export function shouldOfferDefiance(success, managedDragon, remaining) {
  return !success && managedDragon && remaining > 0;
}

export function permittedStatuses(statuses, immunities) {
  return statuses.filter(status => !immunities.has(status));
}

export function findCompanionEffect(item, key) {
  const statusIds = isConditionId(key) ? [key, projectedConditionStatusId(key)] : [key];
  return Array.from(item?.effects?.contents ?? item?.effects ?? []).find(effect =>
    effect.flags?.fvttJsonGenerator?.behaviorState?.stateId === key
    || Array.from(effect.statuses ?? []).some(status => statusIds.includes(status)));
}

export function createCompanionEffectData(template, sourceUuid, worldTime, existing) {
  const data = template.toObject ? template.toObject() : structuredClone(template);
  delete data._id;
  delete data._stats;
  const condition = readConditionInstance(template);
  if (condition?.template) {
    const current = readConditionInstance(existing);
    data.flags = { ...(data.flags ?? {}), ...buildConditionFlag(createConditionInstance(condition.conditionId, condition.params, {
      ...(current && !current.template && current.conditionId === condition.conditionId ? { instanceId: current.instanceId } : {}),
      source: sourceUuid, origin: sourceUuid, createdAt: worldTime,
    })) };
  }
  return data;
}

export function legendarySpendUpdate(resource, amount) {
  const max = Number(resource.max);
  const spent = Number(resource.spent);
  if (![max, spent, amount].every(Number.isFinite) || amount <= 0 || max - spent < amount) {
    throw new Error(`传奇动作不足或数据无效：需要 ${amount}，剩余 ${max - spent}。`);
  }
  return { 'system.resources.legact.spent': spent + amount };
}

export function preserveOwnTurnLegendaryBudget(periods, updates) {
  // The source uses the legacy own-turn budget, while 5.3.3 NPC defaults reset
  // legendary uses at every creature's turn end. Keep other recovery intact.
  if (periods.includes('turnEnd')) delete updates['system.resources.legact.spent'];
}

export function applyWardToSummary(damages, state, proficiency, healingTypes) {
  if (damages.some(damage => damage.active?.[FLAG])) return null;
  const relevant = damages.filter(damage => !(damage.type in healingTypes));
  const total = relevant.reduce((sum, damage) => sum + damage.value, 0);
  const reduced = wardDamage(total, state, proficiency);
  if (reduced === total) return null;
  for (const damage of relevant) {
    damage.value *= reduced / total;
    damage.active ??= {};
    damage.active[FLAG] = true;
  }
  // dnd5e 5.3.3 computes the aggregate BEFORE this hook; applyDamage reads it.
  // Preserve healing and temporary/max-HP accounting while replacing damage.
  damages.amount = Math.trunc(damages.reduce((sum, damage) =>
    sum + (['temphp', 'maximum'].includes(damage.type) ? 0 : damage.value), 0)
    + Math.min(0, Number(damages.tempMax ?? 0)));
  return { total, reduced, state };
}

export async function installCrystalbleedRuntime(env = globalThis, options = {}) {
  const { game, canvas, Hooks, ui, ChatMessage, Combat, Roll, DialogV2, CONFIG } = env;
  if (typeof DialogV2 !== 'function' || typeof Combat !== 'function' || typeof ChatMessage?.create !== 'function') {
    throw new Error('缺少 Foundry V14 API 绑定；请重新导入完整 V14 战斗宏。');
  }
  if (!game?.user?.isGM) throw new Error('请由 GM 运行晶血龙兽战斗控制。');
  if (game.version !== '14.364' || game.system?.id !== 'dnd5e' || game.system.version !== '5.3.3') {
    throw new Error('此宏适用 Foundry 14.364 / dnd5e 5.3.3；V12 请使用原版控制宏。');
  }
  if (!canvas?.ready || !canvas.scene) throw new Error('请先打开战斗场景，再运行此宏。');
  if (!options.actors || !/^Actor\.[0-9a-f]{16}$/.test(options.actors.dragon) || !/^Actor\.[0-9a-f]{16}$/.test(options.actors.crystal)) {
    throw new Error('请通过 Forge 战斗包入口导入并启动此宏，缺少角色绑定。');
  }
  const bindingSignature = `${options.actors.dragon}|${options.actors.crystal}`;
  if (game[FLAG]?.version === RUNTIME_VERSION && game[FLAG]?.bindingSignature === bindingSignature) {
    if (options.showPanel !== false) game[FLAG].showPanel();
    return game[FLAG];
  }
  game[FLAG]?.stop?.();
  const hooks = [];
  const history = [];
  const busyActors = new Set();
  const wardSyncs = new Map();
  const turns = new Map();
  let combatQueue = Promise.resolve();
  let stopped = false;

  const list = collection => Array.from(collection?.contents ?? collection ?? []);
  const hasMarker = (actor, marker) => list(actor?.items).some(item =>
    (item.flags?.fvttJsonGenerator?.behaviorMechanics ?? []).some(mechanic => mechanic.id === marker));
  const isDragon = actor => actor?.id === options.actors.dragon.slice(6) && hasMarker(actor, DRAGON_MARKER);
  const isCrystal = actor => actor?.id === options.actors.crystal.slice(6) && hasMarker(actor, CRYSTAL_MARKER);
  const flag = document => document?.flags?.world?.[FLAG] ?? {};
  const activeEffects = actor => list(actor?.effects).filter(effect => !effect.disabled);
  const log = (event, detail = {}) => {
    history.push({ event, at: Date.now(), ...detail });
    if (history.length > 200) history.shift();
  };
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const notifyError = error => { log('error', { message: error.message }); ui.notifications.error(error.message); };
  const register = (name, callback) => { const id = Hooks.on(name, callback); hooks.push([name, id]); };
  const whisper = async (title, lines, actor) => ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: ChatMessage.getWhisperRecipients('GM').map(user => user.id),
    content: `<h3>${escape(title)}</h3>${lines.map(line => `<p>${escape(line)}</p>`).join('')}`,
    flags: { world: { [FLAG]: { event: title } } },
  });

  function itemFor(actor, label) {
    const item = list(actor?.items).find(item => item.name === label);
    if (!item) throw new Error(`缺少正式生成的能力：${label}`);
    return item;
  }
  function primary(item, type) {
    const activity = list(item.system.activities).find(activity =>
      (!type || activity.type === type) && !activity.flags?.fvttJsonGenerator?.behaviorOperation);
    if (!activity) throw new Error(`能力没有对应的原生活动：${item.name}`);
    return activity;
  }
  function combatFor(scene = canvas.scene) {
    const candidates = list(game.combats).filter(combat => combat.scene?.id === scene.id);
    const active = candidates.find(combat => combat.active);
    if (active) return active;
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) throw new Error('当前场景有多个战斗，请先在先攻栏选择要使用的战斗。');
    return null;
  }
  function tokenFor(actor) {
    if (actor?.token?.object) return actor.token.object;
    const matches = canvas.tokens.placeables.filter(token => token.actor?.id === actor?.id);
    const controlled = matches.filter(token => token.controlled);
    if (controlled.length === 1) return controlled[0];
    if (matches.length === 1) return matches[0];
    throw new Error('请只选中一个要行动的龙兽或晶体指示物。');
  }
  function assertSceneToken(token) {
    if (!token?.actor || token.document.parent?.id !== canvas.scene?.id) throw new Error('目标不在当前查看的场景。');
  }
  function distance(source, target) {
    const size = canvas.dimensions.size;
    const cells = token => {
      const bounds = tokenFootprint(token, size);
      const result = [];
      for (let x = 0; x < Math.max(1, Math.ceil(bounds.w / size)); x++) {
        for (let y = 0; y < Math.max(1, Math.ceil(bounds.h / size)); y++) result.push({ x: bounds.x + (x + 0.5) * size, y: bounds.y + (y + 0.5) * size });
      }
      return result;
    };
    const horizontal = Math.min(...cells(source).flatMap(a => cells(target).map(b => canvas.grid.measurePath([a, b]).distance)));
    return Math.hypot(horizontal, Number(source.document.elevation ?? 0) - Number(target.document.elevation ?? 0));
  }
  function center(token) {
    const bounds = tokenFootprint(token, canvas.dimensions.size);
    return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
  }
  function unblocked(source, point, type = 'move') {
    return !CONFIG.Canvas.polygonBackends[type].testCollision(center(source), point, { type, mode: 'any' });
  }
  function adjacentPosition(target) {
    if (canvas.scene.grid.type !== 1) throw new Error('当前召唤定位只验证过方格地图。');
    const size = canvas.dimensions.size;
    const rect = canvas.dimensions.sceneRect;
    const candidate = adjacentSquares(tokenFootprint(target, size), size).find(position =>
      position.x >= rect.x && position.y >= rect.y && position.x + size <= rect.x + rect.width && position.y + size <= rect.y + rect.height
      && !canvas.tokens.placeables.some(token => rectanglesOverlap(position, tokenFootprint(token, size)))
      && unblocked(target, { x: position.x + size / 2, y: position.y + size / 2 }));
    if (!candidate) throw new Error('齐射目标旁没有合法空位；此次齐射尚未扣除传奇动作。');
    return candidate;
  }
  function crystalBlueprint() {
    const candidates = list(game.actors).filter(actor => isCrystal(actor) && actor.name === '月石晶体 (Moonstone Crystal)');
    if (candidates.length !== 1) throw new Error('请保留唯一一份正式生成的“月石晶体”Actor 作为召唤来源。');
    return candidates[0];
  }
  async function locked(actor, task) {
    if (busyActors.has(actor.uuid)) throw new Error(`${actor.name} 正在结算上一次操作，请勿重复点击。`);
    busyActors.add(actor.uuid);
    try { return await task(); }
    finally { busyActors.delete(actor.uuid); }
  }

  function wardState(actor) {
    if (activeEffects(actor).some(effect => flag(effect).role === 'ward-broken')) return 'broken';
    const item = itemFor(actor, '绯晶拒绝 (Ruidium Defiance)');
    return Number(item.system.uses.spent) >= Number(item.system.uses.max) ? 'weakened' : 'full';
  }
  function effectTemplate(item, key) {
    const effect = findCompanionEffect(item, key);
    if (!effect) throw new Error(`正式生成产物缺少效果：${item.name} / ${key}`);
    return effect;
  }
  function expiryFor(target, phase) {
    const combat = combatFor();
    if (!combat) return { phase, combatId: null, round: null };
    const index = combat.turns.findIndex(combatant => combatant.tokenId === target.id);
    if (index < 0) return { phase, combatId: combat.id, round: null };
    return { phase, combatId: combat.id, round: nextTargetRound(combat.round, combat.turn, index) };
  }
  async function applyEffect(actor, item, key, role, extra = {}) {
    const template = effectTemplate(item, key);
    const statuses = Array.from(template.statuses ?? []);
    const allowed = permittedStatuses(statuses, actor.system.traits.ci.value);
    if (statuses.length && !allowed.length) {
      log('condition-immune', { actor: actor.name, statuses, role });
      return null;
    }
    const existing = list(actor.effects).find(effect => flag(effect).role === role
      && (['ward', 'ward-broken', 'corrupted'].includes(role) || flag(effect).source === item.parent.uuid));
    const data = createCompanionEffectData(template, item.uuid, game.time.worldTime, existing);
    data.disabled = false;
    // Core has no dazed status. Preserve the source-authored named effect and
    // expiry without registering a global condition or substituting stunned.
    data.statuses = allowed.filter(status => CONFIG.statusEffects.some(effect => effect.id === status));
    data.origin = item.uuid;
    data.duration = { ...data.duration, startTime: game.time.worldTime };
    data.flags ??= {};
    data.flags.world = { ...(data.flags.world ?? {}), [FLAG]: { role, source: item.parent.uuid, appliedAt: game.time.worldTime, ...extra } };
    if (existing) { await existing.update(data); return existing; }
    return (await actor.createEmbeddedDocuments('ActiveEffect', [data]))[0];
  }
  async function syncWard(actor) {
    if (!isDragon(actor)) return;
    const pending = (wardSyncs.get(actor.uuid) ?? Promise.resolve()).then(async () => {
      const labels = { full: '月蚀守护·完整（超过20减半）', broken: '月蚀守护·碎裂（无减伤）', weakened: '月蚀守护·削弱（超过20减5）' };
      const existing = list(actor.effects).find(effect => flag(effect).role === 'ward');
      if (existing?.name === labels[wardState(actor)] && !existing.disabled) return;
      const effect = await applyEffect(actor, itemFor(actor, '月蚀守护（血魔法）'), 'ward-visible', 'ward');
      await effect.update({ name: labels[wardState(actor)] });
    });
    wardSyncs.set(actor.uuid, pending);
    try { await pending; }
    finally { if (wardSyncs.get(actor.uuid) === pending) wardSyncs.delete(actor.uuid); }
  }

  async function rollSave(actor, ability, dc, label, advantage = false) {
    const rolls = await actor.rollSavingThrow({ ability, rolls: [{ options: { advantage } }] }, { configure: false }, {
      rollMode: 'gmroll', data: { flavor: `${label}：DC ${dc} ${CONFIG.DND5E.abilities[ability].label}` },
    });
    const roll = rolls?.[0];
    if (!Number.isFinite(roll?.total)) throw new Error('豁免掷骰未完成，停止后续结算。');
    const result = { total: roll.total, dc, success: roll.total >= dc, advantage: roll.hasAdvantage ?? advantage };
    const defianceItem = isDragon(actor) ? itemFor(actor, '绯晶拒绝 (Ruidium Defiance)') : null;
    const remaining = defianceItem ? Number(defianceItem.system.uses.max) - Number(defianceItem.system.uses.spent) : 0;
    if (shouldOfferDefiance(result.success, Boolean(defianceItem), remaining)) {
      const useDefiance = await DialogV2.confirm({
          window: { title: `${actor.name}：绯晶拒绝` },
          content: `<p>${escape(label)}：豁免结果 ${result.total}，未达到 DC ${dc}。</p><p>是否消耗一次绯晶拒绝，将失败改为成功？守护会碎裂至龙兽下一回合开始。剩余 ${remaining} 次。</p>`,
          yes: { label: '使用绯晶拒绝' },
          no: { label: '接受豁免失败', default: true },
          rejectClose: false,
      });
      if (useDefiance) { await defiance(actor); result.success = true; result.defiance = true; }
    }
    log('save', { actor: actor.name, ability, label, ...result });
    return result;
  }
  async function rollDamage(activity) {
    const result = [];
    for (const part of activity.damage.parts) {
      const types = Array.from(part.types ?? []);
      if (types.length !== 1 || !part.formula) throw new Error('伤害类型或公式不唯一，请在面板使用原生活动。');
      const roll = await new CONFIG.Dice.DamageRoll(part.formula, activity.item.actor.getRollData(), { type: types[0] }).evaluate();
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: activity.item.actor }), flavor: activity.item.name }, { rollMode: 'gmroll' });
      result.push({ value: roll.total, type: types[0], properties: new Set() });
    }
    return result;
  }
  async function applyDamage(actor, damages, multiplier = 1) {
    const before = actor.system.attributes.hp.value;
    if (multiplier !== 0 && damages.length) await actor.applyDamage(damages, { multiplier });
    log('damage', { actor: actor.name, before, after: actor.system.attributes.hp.value, multiplier });
  }
  async function spendLegendary(actor, amount) {
    await actor.update(legendarySpendUpdate(actor.system.resources.legact, amount));
  }
  async function corruption(item, target) {
    assertSceneToken(target);
    const activity = primary(item, 'save');
    const dc = Number(activity.save.dc.value ?? activity.save.dc.formula);
    const save = await rollSave(target.actor, 'cha', dc, '绯晶腐化（月石腐化）');
    if (save.success) return { ...save, outcome: 'none' };
    const alreadyCorrupted = activeEffects(target.actor).some(effect => flag(effect).role === 'corrupted'
      || /绯晶腐化|月石腐化|Ruidium Corruption/i.test(effect.name));
    if (alreadyCorrupted) {
      if (target.actor.system.traits.ci.value.has('exhaustion')) {
        log('corruption', { target: target.name, outcome: 'immune-exhaustion' });
        await whisper('腐化加深', [`${target.name} 已有腐化，但免疫力竭，本次不增加力竭。`], target.actor);
        return { ...save, outcome: 'immune-exhaustion' };
      }
      const before = Number(target.actor.system.attributes.exhaustion ?? 0);
      await target.actor.update({ 'system.attributes.exhaustion': Math.min(6, before + 1) });
      log('corruption', { target: target.name, outcome: 'exhaustion', before, requestedAfter: Math.min(6, before + 1) });
      await whisper('腐化加深', [`${target.name} 已有腐化，获得 1 级力竭。`], target.actor);
      return { ...save, outcome: 'exhaustion' };
    }
    await applyEffect(target.actor, item, 'corrupted', 'corrupted');
    log('corruption', { target: target.name, outcome: 'marked' });
    await whisper('绯晶腐化', [`${target.name} 首次受到腐化；这次不增加力竭。`], target.actor);
    return { ...save, outcome: 'marked' };
  }

  async function summon(source, target, position, blueprint) {
    const tokenData = await blueprint.getTokenDocument({
      x: position.x, y: position.y, elevation: target.document.elevation,
      actorLink: false, disposition: source.document.disposition,
      flags: { world: { [FLAG]: { summoned: true, source: source.document.uuid } } },
    });
    const [created] = await canvas.scene.createEmbeddedDocuments('Token', [tokenData.toObject()]);
    const combat = combatFor() ?? await Combat.create({ scene: canvas.scene.id, active: false });
    const [combatant] = await combat.createEmbeddedDocuments('Combatant', [{ tokenId: created.id, actorId: blueprint.id, sceneId: canvas.scene.id }]);
    await combat.rollInitiative([combatant.id], { updateTurn: true, messageOptions: { rollMode: 'gmroll' } });
    log('summon', { tokenId: created.id, combatId: combat.id, combatantId: combatant.id, initiative: combatant.initiative, x: created.x, y: created.y });
    return { token: created, combat, combatant };
  }
  async function salvo(source, target) {
    assertSceneToken(source); assertSceneToken(target);
    if (!isDragon(source.actor)) throw new Error('请选择这次正式生成的晶血龙兽。');
    if (source.id === target.id || distance(source, target) > 30 || !unblocked(source, center(target), 'sight')) throw new Error('齐射需要 30 尺内可见的另一生物。');
    return locked(source.actor, async () => {
      const blueprint = crystalBlueprint();
      const position = adjacentPosition(target);
      const item = itemFor(source.actor, '晶片齐射 (Shard Salvo)');
      const activity = primary(item, 'save');
      const bloodied = source.actor.system.attributes.hp.value <= source.actor.system.attributes.hp.max / 2;
      await spendLegendary(source.actor, Number(activity.activation.value));
      const save = await rollSave(target.actor, 'con', Number(activity.save.dc.value), item.name);
      const damages = await rollDamage(activity);
      await applyDamage(target.actor, damages, save.success ? 0.5 : 1);
      let dazedApplied = false;
      if (!save.success) {
        dazedApplied = Boolean(await applyEffect(target.actor, item, 'dazed', 'dazed', { expiry: expiryFor(target, 'end') }));
        if (bloodied) await corruption(itemFor(source.actor, '绯晶腐化 (Ruidium Corruption)'), target);
      }
      const summoned = await summon(source, target, position, blueprint);
      await whisper('晶片齐射完成', [`${target.name} ${save.success ? '豁免成功：半伤，无恍惚' : dazedApplied ? '豁免失败：全伤，恍惚至其下回合结束' : '豁免失败：全伤，但免疫恍惚'}。`, '目标旁已生成月石晶体并投掷先攻；到晶体自己的回合才发动戳刺。'], source.actor);
      log('salvo', { source: source.name, target: target.name, success: save.success, bloodied });
      return { save, dazedApplied, damages: damages.map(damage => ({ value: damage.value, type: damage.type })), tokenId: summoned.token.id, initiative: summoned.combatant.initiative };
    });
  }
  async function defiance(actor) {
    if (!isDragon(actor)) throw new Error('请选择这次正式生成的晶血龙兽。');
    return locked(actor, async () => {
      const item = itemFor(actor, '绯晶拒绝 (Ruidium Defiance)');
      const spent = Number(item.system.uses.spent);
      if (spent >= Number(item.system.uses.max)) throw new Error('绯晶拒绝次数已耗尽。');
      const source = tokenFor(actor);
      await item.update({ 'system.uses.spent': spent + 1 });
      await applyEffect(actor, item, 'ward-broken', 'ward-broken', { expiry: expiryFor(source, 'start') });
      await syncWard(actor);
      await whisper('绯晶拒绝', ['将刚才失败的豁免视为成功。月蚀守护碎裂至龙兽下一回合开始。', `剩余次数：${Number(item.system.uses.max) - spent - 1}。AC 不变。`], actor);
      log('defiance', { actor: actor.name, spent: spent + 1, ac: actor.system.attributes.ac.value });
    });
  }
  async function breath(source, targets) {
    assertSceneToken(source);
    if (!isDragon(source.actor)) throw new Error('请选择这次正式生成的晶血龙兽。');
    if (!targets.length) throw new Error('请标选六十尺锥形范围内的目标。');
    targets.forEach(assertSceneToken);
    if (targets.some(target => target.id === source.id || distance(source, target) > 60)) throw new Error('吐息目标必须在龙兽六十尺范围内。锥形朝向由 GM 确定。');
    return locked(source.actor, async () => {
      const item = itemFor(source.actor, '噩梦吐息 (Nightmare Breath)');
      if (Number(item.system.uses.spent) >= Number(item.system.uses.max)) throw new Error('噩梦吐息尚未充能。');
      const activity = primary(item, 'save');
      await item.update({ 'system.uses.spent': Number(item.system.uses.spent) + 1 });
      const damages = await rollDamage(activity);
      const results = [];
      for (const target of targets) {
        const save = await rollSave(target.actor, 'wis', Number(activity.save.dc.value), item.name);
        await applyDamage(target.actor, damages, save.success ? 0.5 : 1);
        const fearApplied = !save.success && Boolean(await applyEffect(target.actor, item, 'frightened', 'nightmare', { until: game.time.worldTime + 60, dc: Number(activity.save.dc.value) }));
        results.push({ target: target.name, ...save, fearApplied });
      }
      await whisper('噩梦吐息完成', results.map(result => `${result.target}：${result.success ? '成功，半伤，无恐慌' : result.fearApplied ? '失败，全伤，恐慌并在回合结束重复豁免' : '失败，全伤，但免疫恐慌'}`), source.actor);
      log('breath', { targets: results });
      return results;
    });
  }
  async function pulse(token, combat = combatFor()) {
    assertSceneToken(token);
    if (!isCrystal(token.actor) || token.actor.system.attributes.hp.value <= 0) return { skipped: 'not-alive-crystal' };
    if (!combat?.started || combat.combatant?.tokenId !== token.id) throw new Error('只有到这个晶体自己的先攻回合时才能戳刺。');
    const key = `${combat.id}:${combat.round}:${combat.combatant.id}`;
    if (flag(token.document).lastPulse === key) return { skipped: 'already-pulsed' };
    return locked(token.actor, async () => {
      if (flag(token.document).lastPulse === key) return { skipped: 'already-pulsed' };
      const item = itemFor(token.actor, '月石戳刺 (Moonstone Spikes)');
      const activity = primary(item, 'save');
      const targets = canvas.tokens.placeables.filter(target => target.id !== token.id && target.actor && distance(token, target) <= 10);
      await token.document.setFlag('world', `${FLAG}.lastPulse`, key);
      if (!targets.length) { log('pulse', { tokenId: token.id, targets: [] }); return { targets: [] }; }
      const damages = await rollDamage(activity);
      const results = [];
      for (const target of targets) {
        const save = await rollSave(target.actor, 'dex', Number(activity.save.dc.value), item.name);
        if (!save.success) {
          await applyDamage(target.actor, damages);
          await corruption(itemFor(token.actor, '月石腐化 (Moonstone Corruption)'), target);
        }
        results.push({ target: target.name, tokenId: target.id, ...save });
      }
      await whisper('月石戳刺', results.map(result => `${result.target}：${result.success ? '敏捷豁免成功，无伤害也无腐化豁免' : '敏捷豁免失败，受到穿刺伤害并已结算腐化豁免'}`), token.actor);
      log('pulse', { tokenId: token.id, targets: results });
      return { targets: results, damages: damages.map(damage => ({ value: damage.value, type: damage.type })) };
    });
  }

  async function expireEffects(token, phase, combat, round) {
    if (!token?.actor) return;
    for (const effect of activeEffects(token.actor)) {
      const state = flag(effect);
      if (state.expiry?.phase === phase && (state.expiry.combatId === combat.id || state.expiry.combatId === null)
        && (state.expiry.round === null || round >= state.expiry.round)) {
        await effect.update({ disabled: true });
        log('expired', { actor: token.name, role: state.role, round, phase });
      } else if (phase === 'end' && state.role === 'nightmare') {
        if (game.time.worldTime >= state.until) await effect.update({ disabled: true });
        else {
          const save = await rollSave(token.actor, 'wis', state.dc, '噩梦吐息：回合结束重复豁免');
          if (save.success) await effect.update({ disabled: true });
        }
      }
    }
    if (isDragon(token.actor)) await syncWard(token.actor);
  }
  async function startDragonTurn(token) {
    const actor = token.actor;
    await actor.update({ 'system.resources.legact.spent': 0 });
    // dnd5e Combat._onStartTurn -> Combatant.recoverCombatUses already rolls
    // the source-authored recharge exactly once. A second roll here doubles it.
  }
  function turnSnapshot(combat) {
    return { round: combat.round, id: combat.combatant?.id, tokenId: combat.combatant?.tokenId, sceneId: combat.scene?.id };
  }
  async function onTurn(combat, previous, current) {
    if (stopped || current.sceneId !== canvas.scene?.id) return;
    if (previous?.round > 0 && previous.tokenId) await expireEffects(canvas.tokens.get(previous.tokenId), 'end', combat, previous.round);
    if (current.round < 1 || !current.tokenId) return;
    const token = canvas.tokens.get(current.tokenId);
    await expireEffects(token, 'start', combat, current.round);
    if (isDragon(token?.actor)) await startDragonTurn(token);
    if (isCrystal(token?.actor)) await pulse(token, combat);
  }

  function selectedToken() {
    const selected = canvas.tokens.controlled.filter(token => isDragon(token.actor) || isCrystal(token.actor));
    if (selected.length !== 1) throw new Error('请只选中一只重制龙兽或其晶体。');
    return selected[0];
  }
  function selectedTargets() { return Array.from(game.user.targets); }
  function oneTarget() {
    const targets = selectedTargets();
    if (targets.length !== 1) throw new Error('请只标选一个目标。');
    return targets[0];
  }
  function dispatch(kind, actor) {
    const source = actor ? tokenFor(actor) : selectedToken();
    if (kind === 'salvo') return salvo(source, oneTarget());
    if (kind === 'defiance') return defiance(source.actor);
    if (kind === 'breath') return breath(source, selectedTargets());
    if (kind === 'pulse') return pulse(source);
    if (kind === 'corruption') return corruption(itemFor(source.actor, isDragon(source.actor) ? '绯晶腐化 (Ruidium Corruption)' : '月石腐化 (Moonstone Corruption)'), oneTarget());
  }
  function showPanel() {
    new DialogV2({
      window: { title: '晶血龙兽·战斗控制 V14' },
      position: { width: 610 },
      rejectClose: false,
      content: '<p>自动处理已启用。请仅由一个 GM 客户端运行；选中重制龙兽，再标选目标。</p><p>齐射会完整结算伤害、恍惚、半血腐化与召唤；晶体回合自动戳刺。吐息请先由 GM 标选六十尺锥形内的目标。</p><p>攻击、血液支配的反应攻击、尾击分支及盟友拔刺救援按原生面板和规则处理。关掉此窗口后自动处理继续；刷新页面后须重新运行宏，并保持查看战斗所在场景。</p>',
      buttons: [
        { action: 'salvo', label: '晶片齐射', callback: () => dispatch('salvo').catch(notifyError) },
        { action: 'breath', label: '噩梦吐息', callback: () => dispatch('breath').catch(notifyError) },
        { action: 'defiance', label: '绯晶拒绝', callback: () => dispatch('defiance').catch(notifyError) },
        { action: 'corruption', label: '腐化豁免', callback: () => dispatch('corruption').catch(notifyError) },
        { action: 'pulse', label: '当前晶体戳刺', callback: () => dispatch('pulse').catch(notifyError) },
      ],
    }).render({ force: true });
  }

  register('dnd5e.calculateDamage', (actor, damages) => {
    if (!isDragon(actor)) return;
    const result = applyWardToSummary(damages, wardState(actor), Number(actor.system.attributes.prof), CONFIG.DND5E.healingTypes);
    if (result) log('ward', { actor: actor.name, ...result });
  });
  register('dnd5e.combatRecovery', (combatant, periods, results) => {
    if (isDragon(combatant.actor)) preserveOwnTurnLegendaryBudget(periods, results.actor);
  });
  register('dnd5e.preUseActivity', activity => {
    const actor = activity.item?.actor;
    if ((!isDragon(actor) && !isCrystal(actor)) || activity.flags?.fvttJsonGenerator?.behaviorOperation) return;
    const kind = {
      '晶片齐射 (Shard Salvo)': 'salvo', '绯晶拒绝 (Ruidium Defiance)': 'defiance',
      '噩梦吐息 (Nightmare Breath)': 'breath', '绯晶腐化 (Ruidium Corruption)': 'corruption',
      '月石腐化 (Moonstone Corruption)': 'corruption', '月石戳刺 (Moonstone Spikes)': 'pulse',
    }[activity.item.name];
    if (!kind) return;
    void Promise.resolve().then(() => dispatch(kind, actor)).catch(notifyError);
    return false;
  });
  register('preUpdateToken', (document, changes) => {
    if (!isCrystal(document.actor)) return;
    if (['x', 'y', 'elevation'].some(key => key in changes && changes[key] !== document[key])) {
      ui.notifications.warn('月石晶体不能移动。');
      return false;
    }
  });
  register('updateCombat', combat => {
    const previous = turns.get(combat.id);
    const current = turnSnapshot(combat);
    turns.set(combat.id, current);
    if (previous?.id === current.id && previous?.round === current.round) return;
    combatQueue = combatQueue.then(() => onTurn(combat, previous, current)).catch(notifyError);
  });
  register('createCombat', combat => turns.set(combat.id, turnSnapshot(combat)));
  register('updateItem', item => { if (isDragon(item.parent) && item.name === '绯晶拒绝 (Ruidium Defiance)') void syncWard(item.parent).catch(notifyError); });
  register('createToken', document => { if (isDragon(document.actor)) void syncWard(document.actor).catch(notifyError); });
  for (const combat of list(game.combats)) turns.set(combat.id, turnSnapshot(combat));
  for (const actor of list(game.actors).filter(isDragon)) await syncWard(actor);
  for (const token of canvas.tokens.placeables.filter(token => isDragon(token.actor))) await syncWard(token.actor);

  const api = {
    version: RUNTIME_VERSION, bindingSignature, history, isDragon, isCrystal, wardState, distance, salvo, defiance, breath, pulse, corruption,
    showPanel, syncWard,
    settle: () => combatQueue,
    stop: () => { stopped = true; for (const [name, id] of hooks) Hooks.off(name, id); delete game[FLAG]; },
  };
  game[FLAG] = api;
  if (options.showPanel !== false) showPanel();
  ui.notifications.info('晶血龙兽自动处理已启用；刷新页面后请重新运行此宏。');
  return api;
}
