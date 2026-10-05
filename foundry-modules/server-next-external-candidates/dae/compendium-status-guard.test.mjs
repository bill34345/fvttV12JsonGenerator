import { legacyNextInputPath } from '../../../tests/helpers/legacy-next-inputs.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { patchCompendiumStatusReconciliation } from './compendium-status-guard.mjs';

const archive = legacyNextInputPath(fileURLToPath(new URL('../../../.local/next-finish-20261002/dae-upstream/dae-v14.0.14.zip', import.meta.url)));
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'), '82118247402d56da085144db0cd96cb6d61a79e2c88a72218111705ce2cc37de');
const released = execFileSync('python', ['-c','import sys,zipfile; sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read("dae/module/dae.js"))', archive]).toString('utf8');
const slice = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end,source.indexOf(start)));
function harness(patched) {
  const source = patched ? patchCompendiumStatusReconciliation(released) : released;
  const deletions=[], queued=[];
  const context = vm.createContext({dependentConditions:true, debugEnabled:0,
    reconciliationPending:new Set(), actionQueue:{add:fn=>queued.push(fn)},
    getStatusEffectsArray:()=>[{id:'invisible',_id:'dnd5einvisible00',statuses:[]}],
    toggleActorStatusEffect:async(actor,status,options)=>deletions.push({actor:actor.uuid,status,options}),
    console, warn(){}});
  vm.runInContext(slice(source,'function scheduleReconciliation(actor) {','function scheduleConditionalEffects(actor, updates) {')
    + slice(source,'async function reconcileActorStatuses(actor) {','Hooks.once("tidy5e-sheet.ready"')
    + '\nglobalThis.api={scheduleReconciliation,reconcileActorStatuses};',context);
  const actor = pack => ({pack,uuid:pack?'Compendium.dnd5e_classpack.summons.Actor.4XOCbibDwZcdgbhV':'Actor.worldActor',
    system:{traits:{ci:{value:new Set(['invisible'])}}},
    allApplicableEffects:()=>[{id:'dnd5einvisible00',active:true,flags:{},statuses:new Set(['invisible'])}]});
  return {api:context.api,deletions,queued,actor};
}
test('exact current DAE reproduces loss of an authored static invisibility effect on an immune compendium Actor',async()=>{
  const h=harness(false); await h.api.reconcileActorStatuses(h.actor('dnd5e_classpack.summons'));
  assert.equal(h.deletions.length,1);assert.equal(h.deletions[0].status,'invisible');assert.equal(h.deletions[0].options.active,false);
});
test('guard preserves compendium source through direct reconciliation and asynchronous scheduling',async()=>{
  const h=harness(true),actor=h.actor('dnd5e_classpack.summons');
  h.api.scheduleReconciliation(actor); await h.api.reconcileActorStatuses(actor);
  assert.equal(h.queued.length,0);assert.equal(h.deletions.length,0);
});
test('world Actor condition-immunity reconciliation retains its existing behavior',async()=>{
  const h=harness(true),actor=h.actor(undefined);h.api.scheduleReconciliation(actor);
  assert.equal(h.queued.length,1);await h.queued[0]();assert.equal(h.deletions.length,1);assert.equal(h.deletions[0].options.active,false);
});
test('patch requires the exact supported scheduling and reconciliation entrypoints',()=>{
  assert.throws(()=>patchCompendiumStatusReconciliation('changed source'),/anchor differs/);
  assert.throws(()=>patchCompendiumStatusReconciliation(patchCompendiumStatusReconciliation(released)),/already applied/);
});
