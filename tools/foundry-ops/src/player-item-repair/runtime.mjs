import { TARGETS, DIAGNOSTIC, stable, canonical, origins, sourceHints, identityKeys, contentIdentity, topLevelItem, brokenGrants, projectRepair, assertFresh, assertUnchanged } from './core.mjs';
import { APPROVAL } from './approval.mjs';
import { createLibraryWorkflow } from './library-workflow.mjs';

const NAME = 'NEXT-ITEM-REPAIR-20260928';
const BUILD = 'NEXT-ITEM-REPAIR-20260928-v11-authorized-library';
const FLAG = 'nextItemRepairReceipt';
const state = { report: { build: BUILD, mode: 'READ_ONLY', message: '先检查；来源未经主任务审查时不能应用。' }, busy: false };
const clone = value => structuredClone(value);
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(value))))).map(v => v.toString(16).padStart(2, '0')).join('');
const hash = value => digest(canonical(value));
function target() {
  if (location.hostname !== '127.0.0.1' || location.port !== '30002' || game.world.id !== 'cor-cotn' || game.version !== '14.368' || game.system.id !== 'dnd5e' || game.system.version !== '6.0.2' || !game.user.isGM) throw new Error('Wrong target/version/user; refused');
}
function rawActor(actor) {
  if (!actor) throw new Error('Actor missing');
  const source = actor.toObject(true);
  if (Array.isArray(actor.items?._source)) source.items = clone(actor.items._source);
  if (!Array.isArray(source.items)) throw new Error('Actor item source unavailable');
  return source;
}
function rawItem(actor, id) {
  const source = rawActor(actor).items.find(i => i._id === id);
  if (!source) throw new Error(`Item source missing: ${id}`);
  return source;
}
function metadata(source) {
  return { id: source._id, name: source.name, type: source.type, identifier: source.system?.identifier, origins: origins(source), sourceHints: sourceHints(source), identityKeys: identityKeys(source) };
}
async function semantic(source) {
  return { ...metadata(source), descriptionHash: await digest(source.system?.description ?? {}), systemHash: await digest(source.system ?? {}), contentHash: await digest(contentIdentity(source)), systemKeys: Object.keys(source.system ?? {}).sort(), activityCount: Object.keys(source.system?.activities ?? {}).length, effectCount: (source.effects ?? []).length, effectsHash: await digest(source.effects ?? []) };
}
async function reference(uuid) {
  const match = /^Actor\.([^.]+)\.Item\.([^.]+)$/.exec(uuid);
  if (match) return rawItem(game.actors.get(match[1]), match[2]);
  throw new Error('Unsupported embedded reference shape; requires review');
}
function readableSource(uuid) {
  if (uuid.startsWith('Item.')) return true;
  const pkg = uuid.split('.')[1];
  // Paid/unknown packages require separate scope review; never mass-search packs.
  return pkg === 'dnd5e' || pkg?.startsWith('fvtt-');
}
async function inspect() {
  target();
  const report = { build: BUILD, mode: 'READ_ONLY', identity: { world: game.world.id, foundry: game.version, system: game.system.version }, actors: [], retainedDiagnostic: null };
  const worldItems = Array.from(game.items ?? [], doc => ({ uuid: doc.uuid, documentName: doc.documentName, source: doc.toObject(true) }));
  const contentCache = new Map();
  async function worldCandidates(source) {
    const keys = identityKeys(source);
    const sourceContent = await digest(contentIdentity(source));
    const candidates = [];
    for (const entry of worldItems) {
      if (entry.documentName !== 'Item' || !topLevelItem(entry.uuid) || entry.source.type !== source.type) continue;
      const shared = identityKeys(entry.source).filter(k => keys.includes(k));
      let contentHash = contentCache.get(entry.uuid);
      if (!contentHash) { contentHash = await digest(contentIdentity(entry.source)); contentCache.set(entry.uuid, contentHash); }
      if (!shared.length && contentHash !== sourceContent) continue;
      candidates.push({ uuid: entry.uuid, status: 'REVIEW_REQUIRED', proofKind: shared.length ? 'EXACT_IMPORTER_IDENTITY' : 'EXACT_CONTENT_ONLY_NOT_PROVENANCE', sharedIdentityKeys: shared, contentEqual: contentHash === sourceContent, semantic: await semantic(entry.source), hash: await hash(entry.source), grants: Object.entries(entry.source.system?.advancement ?? {}).filter(([, a]) => a.type === 'ItemGrant').map(([id, a]) => ({ id, level: a.level, configuration: a.configuration, value: a.value })) });
    }
    return candidates;
  }
  report.worldSourceItemsScanned = worldItems.length;
  for (const entry of [...TARGETS, DIAGNOSTIC]) {
    const actor = game.actors.get(entry.actorId);
    const actorReport = { actorId: entry.actorId, name: actor?.name, itemCount: actor ? rawActor(actor).items.length : null, beforeHash: actor ? await hash(rawActor(actor)) : null, items: [] };
    for (const id of entry.itemIds) {
      try {
        const source = rawItem(actor, id);
        let invalidRead = 'not-listed-invalid';
        if (actor.items.invalidDocumentIds.has(id)) invalidRead = 'raw-source-only; v1 already tested getInvalid, avoid repeated construction warnings';
        const item = { ...metadata(source), beforeHash: await hash(source), invalid: actor.items.invalidDocumentIds.has(id), invalidRead, grants: [], worldSourceCandidates: await worldCandidates(source), grantConfigurations: Object.entries(source.system?.advancement ?? {}).filter(([, a]) => a.type === 'ItemGrant').map(([id, a]) => ({ id, level: a.level, configuration: a.configuration, value: a.value })), advancementTypes: Object.values(source.system?.advancement ?? {}).map(a => a.type) };
        for (const grant of brokenGrants(source)) {
          const row = { ...grant, candidates: [] };
          try {
            const referred = await reference(grant.uuid);
            row.referenced = await semantic(referred);
            row.referencedHash = await hash(referred);
            row.worldSourceCandidates = await worldCandidates(referred);
            for (const uuid of origins(referred).filter(topLevelItem)) {
              if (!readableSource(uuid)) { row.candidates.push({ uuid, status: 'SOURCE_PACKAGE_REQUIRES_SCOPE_REVIEW' }); continue; }
              const doc = await fromUuid(uuid);
              if (!doc || doc.documentName !== 'Item' || doc.isEmbedded) { row.candidates.push({ uuid, status: 'NOT_RESOLVED_TOP_LEVEL_ITEM' }); continue; }
              const data = doc.toObject(true);
              row.candidates.push({ uuid, status: 'REVIEW_REQUIRED', semantic: await semantic(data), hash: await hash(data), sameSystem: stable(referred.system) === stable(data.system), differingSystemKeys: [...new Set([...Object.keys(referred.system ?? {}), ...Object.keys(data.system ?? {})])].filter(k => stable(referred.system?.[k]) !== stable(data.system?.[k])) });
            }
            if (!row.candidates.length) row.status = row.worldSourceCandidates.length ? 'WORLD_CANDIDATES_REQUIRE_REVIEW' : 'NO_CANONICAL_PROVENANCE';
          } catch (error) { row.error = String(error.message); }
          item.grants.push(row);
        }
        actorReport.items.push(item);
      } catch (error) { actorReport.items.push({ id, error: String(error.message) }); }
    }
    if (entry === DIAGNOSTIC) report.retainedDiagnostic = actorReport;
    else report.actors.push(actorReport);
  }
  return report;
}
function macro() {
  const found = game.macros.filter(m => m.name === NAME && m.command.includes(BUILD));
  if (found.length !== 1) throw new Error('Task Macro identity is not unique');
  return found[0];
}
const { preview, apply, verify } = createLibraryWorkflow({ game, CONFIG, fromUuid, hash, digest, rawActor, rawItem, reference, target, macro, NAME, BUILD, FLAG }, APPROVAL);
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
async function run() {
  target();
  while (true) {
    const text = JSON.stringify(state.report, null, 2);
    const action = await foundry.applications.api.DialogV2.wait({ window: { title: NAME }, position: { width: 840 }, content: `<p>仅 ServerNext / 已授权6件物品 + 27条独立来源；雅灵不写入；当前 ${APPROVAL.actors.length ? '已装载审查映射' : '检查版本，应用锁定'}。</p><textarea name="repair-report" readonly style="width:100%;height:460px">${escape(text)}</textarea>`, buttons: [{ action: 'inspect', label: '检查（只读）', default: true }, { action: 'preview', label: '预览（只读）' }, { action: 'apply', label: '应用审查后的修复', disabled: !APPROVAL.actors.length }, { action: 'verify', label: '复核（只读）' }, { action: 'export', label: '导出诊断回执' }, { action: 'close', label: '关闭' }], rejectClose: false });
    if (!action || action === 'close') break;
    try {
      if (action === 'export') saveDataToFile(JSON.stringify(state.report, null, 2), 'application/json', `${NAME}-${state.report.mode}.json`);
      else state.report = await ({ inspect, preview, apply, verify }[action])();
    } catch (error) { state.report = { build: BUILD, mode: 'ERROR_NO_RETRY', error: String(error.message), context: error.context, previousReport: state.report }; }
  }
}
await run();
