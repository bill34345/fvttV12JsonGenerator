import { legacyNextInputURL } from '../../../tests/helpers/legacy-next-inputs.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as utils from 'file:///F:/FoundryLab/foundry-v14/app/14.368/common/utils/helpers.mjs';
const code=await readFile(new URL('./acceptance-macro.js',import.meta.url),'utf8');
const raw=JSON.parse(await readFile('F:/FoundryLab/foundry-v14/evidence/server-next-migration/item-piles-20260929/recovery3/controls-readback-after-adapter2-result.json','utf8'));
const record=raw.receipt??raw;
const start=code.indexOf('function normalizeCurrencyRuntimeMarkers('),end=code.indexOf('\nasync function validateAdapter(',start);
const ds=code.indexOf('function differences('),de=code.indexOf('\nfunction verifyTransferred(',ds);
const ctx=vm.createContext({});vm.runInContext(code.slice(start,end)+'\n'+code.slice(ds,de)+'\nglobalThis.normalize=normalizeCurrencyRuntimeMarkers;globalThis.diff=differences;',ctx);
function compare(current){const expected=structuredClone(record.systemBeforeV3);expected.systemVersion='1.0.10';const normalized=ctx.normalize(expected,current);return {normalized,diff:ctx.diff(expected,current)}}
test('actual CURRENCIES getter creates secondary=false in cached objects without a persisted write',async()=>{
 const source=(await readFile(legacyNextInputURL(new URL('./sources/base/src/API/api.js',import.meta.url)),'utf8')).replaceAll('\r\n','\n');
 const a=source.indexOf('static get CURRENCIES()'),b=source.indexOf('\n\t}',a)+3;
 const cache=structuredClone(record.systemSettings.currencies),persisted=structuredClone(cache);
 const API=new Function('Helpers','SETTINGS','foundry','CompendiumUtilities','return class{'+source.slice(a,b)+'}')({getSetting:()=>cache},{CURRENCIES:'currencies'},{utils},{});
 const derived=API.CURRENCIES;assert.equal(derived.length,5);assert.ok(cache.every(c=>c.secondary===false));assert.ok(persisted.every(c=>!Object.hasOwn(c,'secondary')));
});
test('exact observed five currency markers normalize, real currency or unrelated setting changes fail',()=>{
 const current=structuredClone(record.systemSettings);const result=compare(current);assert.equal(result.normalized.length,5);assert.equal(result.diff.length,0);
 for(const change of [c=>c.currencies[1].exchangeRate=99,c=>c.currencies[0].secondary=true,c=>c.itemFilters=[],c=>c.currencies[0].data.path='system.currency.gp']){
  const changed=structuredClone(current);change(changed);assert.ok(compare(changed).diff.length>0);
 }
 assert.deepEqual(current,record.systemSettings);
});
