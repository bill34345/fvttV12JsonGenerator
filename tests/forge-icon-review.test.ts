import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import Handlebars from 'handlebars';
import { JSDOM } from 'jsdom';
import { buildForgeActorRequest, buildForgeItemRequest, convertFinalActorSource, convertFinalItemSource } from '@fvtt-json-generator/forge-browser-runtime';
import { decodeForgeActorResponse, decodeForgeItemResponse } from '@fvtt-json-generator/forge-gateway-protocol';
import { decodeIconReviewReport } from '@fvtt-json-generator/contracts/icon-review';
import { prepareForgeEncounter } from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import { serializeForgeEncounterPackage } from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import { encounterFixture } from './helpers/forge-encounter';
import { iconReviewPresentation } from '../foundry-modules/fvtt-json-forge/src/iconReviewPresentation';
import { createForgeEncounterApplicationClass } from '../foundry-modules/fvtt-json-forge/src/encounterApplication';

const actorSource = readFileSync(new URL('./fixtures/forge-semantic-icons.md', import.meta.url), 'utf8');
async function actorResponse() {
  const response = await convertFinalActorSource(buildForgeActorRequest({ content: actorSource, displayName: 'Report Fixture',
    requestId: 'icon-review-report', fvttVersion: '14.368', systemVersion: '5.3.3' }));
  if (!('result' in response) || response.result.status !== 'accepted') throw new Error('Fixture must generate successfully.');
  return response;
}

describe('Forge existing icon report crosses the result boundary', () => {
  test('retains the workflow report in Actor and Item wire responses and accepts older responses', async () => {
    const actor = await actorResponse();
    const report = actor.result.iconReview!;
    expect(report.entries.length).toBeGreaterThan(0);
    const decoded = decodeForgeActorResponse(JSON.parse(JSON.stringify(actor)));
    expect(decoded.ok).toBe(true);
    if (decoded.ok && 'result' in decoded.value) expect(decoded.value.result.iconReview).toEqual(report);
    const oldActor = structuredClone(actor); delete oldActor.result.iconReview;
    expect(decodeForgeActorResponse(oldActor).ok).toBe(true);
    const off = await convertFinalActorSource({ ...buildForgeActorRequest({ content: actorSource, displayName: 'Off',
      requestId: 'off-report', fvttVersion: '14.368', systemVersion: '5.3.3' }),
      resolvedTarget: { generatorProfile: 'v14', effectProfile: 'core', iconMode: 'off' } });
    expect('result' in off && Object.hasOwn(off.result, 'iconReview')).toBe(false);
    const item = await convertFinalItemSource(buildForgeItemRequest({
      content: readFileSync('obsidian/dnd数据转fvttjson/input/items/骑士之盾.md', 'utf8'), displayName: 'Shield',
      requestId: 'item-report', fvttVersion: '14.368', systemVersion: '5.3.3' }));
    if (!('result' in item)) throw new Error('Expected Item result.');
    expect(item.result.iconReview?.entries.length).toBeGreaterThan(0);
    expect(decodeForgeItemResponse(JSON.parse(JSON.stringify(item))).ok).toBe(true);
    const oldItem = structuredClone(item); delete oldItem.result.iconReview;
    expect(decodeForgeItemResponse(oldItem).ok).toBe(true);
  });

  test('retains the Actor with specific review diagnostics for malformed, extended, inconsistent or wrong-target icon reports', async () => {
    const original = await actorResponse();
    const changes = [
      (r: any) => { r.iconReview.summary.total++; },
      (r: any) => { r.iconReview.entries[0].selectedPath = '../secret.svg'; },
      (r: any) => { r.iconReview.entries[0].extra = 'unrecognized'; },
      (r: any) => { r.iconReview.target.systemVersion = '6.0.0'; },
      (r: any) => { r.target.iconMode = 'off'; },
      (r: any) => { r.artifact.name = 'Changed artifact'; },
    ];
    for (const [index,change] of changes.entries()) {
      const response = structuredClone(original); change(response.result);
      const decoded=decodeForgeActorResponse(response);expect(decoded.ok,`change ${index}`).toBe(true);
      if(!decoded.ok||!('result' in decoded.value))throw Error('Missing retained Actor');
      expect(decoded.value.result.artifact).toEqual(response.result.artifact);
      expect(decoded.value.result.status).not.toBe('accepted');
      expect(decoded.value.result.diagnostics).toContainEqual(expect.objectContaining({code:'FORGE_REPORT_INCOMPLETE',message:expect.stringContaining(index===4?'TARGET_MISMATCH':index===5?'ARTIFACT_HASH_MISMATCH':'INVALID_PROJECTION')}));
    }
  });

  test('displays category/low confidence separately from actual type defaults and escapes report text', async () => {
    const response = await actorResponse();
    const report = structuredClone(response.result.iconReview!);
    const entry = report.entries[0]!;
    entry.itemName = '<img src=x onerror=alert(1)>';
    entry.source = 'semantic'; entry.confidence = 'fallback'; entry.reasons = ['按被动特性类别选图'];
    report.summary = { total: report.entries.length, override: 0, existing: 0, exact: 0, semantic: report.entries.length, fallback: 0 };
    for (const other of report.entries) other.source = 'semantic';
    const text = iconReviewPresentation([decodeIconReviewReport(report)]);
    expect(text).toContain('类型默认图 0 项'); expect(text).toContain('低把握'); expect(text).toContain('按被动特性类别选图');
    const html = Handlebars.compile('<pre>{{iconReviewText}}</pre>')({ iconReviewText: text });
    expect(new JSDOM(html).window.document.querySelector('img')).toBeNull();
    expect(iconReviewPresentation([undefined])).toBe('此结果没有 Icon 选图报告。');
  });

  test('passes the regenerated final encounter report into the actual result view without changing the package schema', async () => {
    const bundle = encounterFixture();
    const serialized = serializeForgeEncounterPackage(bundle);
    const prepared = await prepareForgeEncounter(serialized);
    expect(prepared.actors.every(actor => actor.iconReview?.entries.length)).toBe(true);
    expect(serializeForgeEncounterPackage(prepared.bundle)).toBe(serialized);
    class Base { render() { return this; } }
    const App = createForgeEncounterApplicationClass({
      game: { version: '14.368', system: { id: 'dnd5e', version: '5.3.3' }, user: { isGM: true }, macros: { contents: [] } },
      foundry: { applications: { api: { ApplicationV2: Base, HandlebarsApplicationMixin: (base: any) => base } } },
    });
    const app: any = new App(); app.prepared = prepared;
    const context = await app._prepareContext();
    expect(context.iconReviewText).toContain(prepared.actors[0]!.iconReview!.entries[0]!.selectedPath);
    const template = readFileSync('foundry-modules/fvtt-json-forge/src/templates/forge-encounter.hbs', 'utf8');
    const html = Handlebars.compile(template)(context);
    expect(new JSDOM(html).window.document.body.textContent).toContain('Icon 选图依据与近似程度');
  });
});
