// Read-only diagnosis. Import into the existing task Macro via normal UI.
import { canonicalMetadata as canonical, stable } from './core.mjs';

const BUILD = 'NEXT-ITEM-REPAIR-20260928-v7-drift-read-only';
if (location.hostname !== '127.0.0.1' || location.port !== '30002' || game.world.id !== 'cor-cotn'
    || game.version !== '14.368' || game.system.id !== 'dnd5e' || game.system.version !== '6.0.2' || !game.user.isGM) throw new Error('Wrong target');
const actor = game.actors.get('aMZwC9ORkpZpdlkc');
const data = actor.toObject(true);
if (Array.isArray(actor.items?._source)) data.items = structuredClone(actor.items._source);
const item = data.items.find(i => i._id === 'Oqs0HDVs0QOmvzb9');
if (!item) throw new Error('Sea Elf not found');
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(value))))).map(v => v.toString(16).padStart(2, '0')).join('');
const hash = value => digest(canonical(value));
const normalized = canonical(item);
const effect = normalized.effects.find(e => e._id === 'SIoBMgJ64YgbJ1eS');
if (!effect || !Array.isArray(effect.system?.changes) || effect.system.changes.length !== 1) throw new Error('Unexpected Swim Speed effect structure');
const generatedId = effect.system.changes[0]._id;
delete effect.system.changes[0]._id;
const leaves = {};
async function visit(value, path) {
  if (value && typeof value === 'object' && Object.keys(value).length) {
    for (const [key, child] of Object.entries(value)) await visit(child, [...path, key]);
  } else leaves[path.join('.')] = { type: Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value, hash: await digest(value) };
}
await visit(canonical(item), []);
const report = { build: BUILD, mode: 'SEA_ELF_DRIFT_READ_ONLY', actorId: actor.id, itemId: item._id,
  rawItemHash: await hash(item), actorHash: await hash(data), maskedItemHash: await hash(normalized),
  maskedField: 'effects.SIoBMgJ64YgbJ1eS.system.changes.0._id', generatedId,
  fieldHashes: Object.fromEntries(await Promise.all(Object.entries(item).map(async ([k, v]) => [k, await hash({ [k]: v })]))),
  leafHashes: leaves, itemStats: item._stats,
  effects: item.effects.map(e => ({ id: e._id, name: e.name, stats: e._stats, system: e.system, origin: e.origin, disabled: e.disabled, transfer: e.transfer })),
  itemCount: data.items.length, invalid: actor.items.invalidDocumentIds.has(item._id), writes: 0 };
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
await foundry.applications.api.DialogV2.wait({ window: { title: BUILD }, position: { width: 840 },
  content: `<p>仅检查海精灵字段指纹；没有应用或写入操作。</p><textarea name="repair-report" readonly style="width:100%;height:460px">${escape(JSON.stringify(report, null, 2))}</textarea>`,
  buttons: [{ action: 'close', label: '关闭', default: true }], rejectClose: false });
