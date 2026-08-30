import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
  decodeForgeItemResponse,
  hashArtifact,
  hashSource,
  type ForgeItemRequest,
  type ForgeItemResponse,
  type ForgeItemSourceId,
  type JsonObject,
} from '@fvtt-json-generator/forge-gateway-protocol';
import {
  buildForgeItemRequest,
  convertFinalItemSource,
} from '@fvtt-json-generator/forge-browser-runtime';
import { conversionApplication } from '../src/core/application/conversion';
import { normalizeForgeItemArtifact } from '../packages/forge-browser-runtime/src/artifact';
import { buildBrowserBundle } from '../foundry-modules/fvtt-json-forge/build';

const ITEM_SOURCE_ID = 'item:v1:123e4567-e89b-42d3-a456-426614174000' as ForgeItemSourceId;
const SHIELD_SOURCE = readFileSync(resolve('obsidian/dnd数据转fvttjson/input/items/骑士之盾.md'), 'utf8');
const JEWEL_SOURCE = readFileSync(resolve('obsidian/dnd数据转fvttjson/input/items/三祷之坠.md'), 'utf8');

describe('browser Forge Item runtime', () => {
  test.each([
    ['12.331', '12', '4.3.9'],
    ['13.340', '12', '4.3.9'],
    ['14.364', '14', '5.3.3'],
  ] as const)('matches the formal Node Shield artifact for FVTT %s', async (fvttVersion, workflowTarget, systemVersion) => {
    const request = buildForgeItemRequest({
      content: SHIELD_SOURCE,
      sourceId: ITEM_SOURCE_ID,
      displayName: 'Shield',
      requestId: `shield-${fvttVersion}`,
      fvttVersion,
      systemVersion,
    });
    expect(request.source.sourceId).toBe(ITEM_SOURCE_ID);
    expect(request.source.utf8Sha256).toBe(hashSource(request.source.content));

    const nodeResponse = await convertFinalItemSource(request);
    const browserResponse = await (await browserRuntime()).convertFinalItemSource(request);
    const decoded = decodeForgeItemResponse(browserResponse);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok || !('result' in decoded.value) || decoded.value.result.status !== 'accepted') {
      throw new Error(`Expected accepted Item response: ${JSON.stringify(browserResponse)}`);
    }
    expect(browserResponse).toEqual(nodeResponse);

    const formal = await conversionApplication.convertContent({
      content: request.source.content,
      fvttVersion: workflowTarget,
      effectProfile: 'core',
    });
    expect(formal.kind).toBe('item');
    expect(formal.status).toBe('accepted');
    const normalized = normalizeForgeItemArtifact(formal.rawJson, workflowTarget);
    expect(decoded.value.result.artifact).toEqual(normalized);
    expect(decoded.value.result.artifactHash).toBe(hashArtifact(normalized));
    expect(decoded.value.result.target.systemVersionObserved).toBe(systemVersion);
    expect(JSON.stringify(browserResponse)).not.toMatch(/sourcePath|localCache|workflow|canonical|dnd5eRepo|reference/u);
    const bash = Object.values(((normalized.system as JsonObject).activities as JsonObject))
      .find((entry) => (entry as JsonObject).name === '强力猛击 (Forceful Bash)') as JsonObject;
    if (workflowTarget === '14') {
      expect(bash.activation).toEqual({ type: 'action', override: false });
      expect(bash.range).toEqual({ override: true, value: '5', units: 'ft', special: '' });
    } else {
      expect(bash.activation).toBeUndefined();
      expect(bash.consumption).toBeUndefined();
      expect(bash.duration).toBeUndefined();
      expect(bash.uses).toBeUndefined();
      expect(bash.range).toEqual({ override: false, value: null, long: null, reach: 5, units: 'ft', special: '' });
    }
  });

  test('returns a byte-stable Shield response across time without freezing clocks or randomness', async () => {
    const request = buildForgeItemRequest({
      content: SHIELD_SOURCE,
      sourceId: ITEM_SOURCE_ID,
      displayName: 'Stable Shield',
      requestId: 'stable-shield',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    });
    const runtime = await browserRuntime();
    const first = await runtime.convertFinalItemSource(request);
    await Bun.sleep(30);
    const second = await runtime.convertFinalItemSource(request);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    if (!('result' in first) || first.result.status !== 'accepted' || !('artifact' in first.result)) {
      throw new Error(`Expected accepted stable Item response: ${JSON.stringify(first)}`);
    }
    expect((first.result.artifact._stats as Record<string, unknown>)?.createdTime).toBeNull();
    expect((first.result.artifact._stats as Record<string, unknown>)?.modifiedTime).toBeNull();
  });

  test('preserves Shield source semantics in the accepted closed summaries', async () => {
    const response = await convertFinalItemSource(buildForgeItemRequest({
      content: SHIELD_SOURCE,
      sourceId: ITEM_SOURCE_ID,
      displayName: 'Shield',
      requestId: 'shield-semantics',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    }));
    if (!('result' in response) || response.result.status !== 'accepted') {
      throw new Error(`Expected accepted Shield: ${JSON.stringify(response)}`);
    }
    expect(response.result.diagnostics).toEqual([]);
    expect(response.result.itemDocument).toMatchObject({
      description: {
        value: expect.stringContaining('强力猛击'),
        chat: '',
      },
      rarity: 'veryRare',
      attunement: 'required',
      armor: { value: 2, magicalBonus: 2 },
      itemType: { value: 'shield', baseItem: 'shield' },
      properties: ['mgc'],
      weight: { value: 6, units: 'lb' },
    });
    const bash = response.result.itemDocument.activities.find((entry) => entry.name.includes('Forceful Bash'));
    const field = response.result.itemDocument.activities.find((entry) => entry.name.includes('Protective Field'));
    expect(bash).toMatchObject({
      type: 'attack',
      description: { chatFlavor: expect.stringContaining('2d6 + 2') },
      activation: { type: 'action', override: false },
      attack: { ability: 'str' },
      damage: { parts: [{ custom: { formula: '2d6+2+@mod' }, types: ['force'] }] },
      range: { value: '5', units: 'ft', override: true },
      consumption: { targets: [], scaling: { allowed: false }, spellSlot: true },
      duration: { units: 'inst', concentration: false, override: false },
      uses: { spent: 0, max: '', recovery: [] },
    });
    const bashArtifact = Object.values(
      ((response.result.artifact.system as JsonObject).activities as JsonObject),
    ).find((entry) => (entry as JsonObject).name === '强力猛击 (Forceful Bash)') as JsonObject;
    expect(bashArtifact.range).toEqual({ override: true, value: '5', units: 'ft', special: '' });
    expect(bashArtifact.activation).toEqual({ type: 'action', override: false });
    expect(bash?.effectIds).toHaveLength(1);
    expect(response.result.itemDocument.effects).toContainEqual(expect.objectContaining({
      id: bash?.effectIds[0],
      statuses: ['prone'],
    }));
    expect(field).toMatchObject({
      type: 'utility',
      description: { chatFlavor: expect.stringMatching(/5 尺内[\s\S]*次日黎明/) },
      activation: { type: 'reaction' },
      range: { override: false },
      uses: { max: '1', recovery: [{ period: 'dawn', type: 'recoverAll' }] },
      duration: { value: '1', units: 'minute', concentration: true },
      target: { override: false, template: { type: 'radius', size: '5' } },
    });
  });

  test('blocks multi-stage Jewel output without choosing an artifact or returning a hash', async () => {
    const response = await (await browserRuntime()).convertFinalItemSource(buildForgeItemRequest({
      content: JEWEL_SOURCE,
      sourceId: ITEM_SOURCE_ID,
      displayName: 'Jewel',
      requestId: 'jewel-multi-stage',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    }));
    const decoded = decodeForgeItemResponse(response);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok || !('result' in decoded.value)) throw new Error('Expected decoded multi-stage response.');
    expect(decoded.value.result.status).toBe('needs_review');
    expect(decoded.value.result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'FORGE_ITEM_MULTIPLE_ARTIFACTS_UNSUPPORTED',
      severity: 'warning',
    }));
    expect('artifact' in decoded.value.result).toBe(false);
    expect('artifactHash' in decoded.value.result).toBe(false);
  });

  test('keeps normal CLI/Web workflow output unnormalized and outside the Forge projection', async () => {
    const formal = await conversionApplication.convertContent({ content: SHIELD_SOURCE, fvttVersion: '14', effectProfile: 'core' });
    const raw = formal.rawJson as Record<string, any>;
    expect(raw._stats.createdTime).toEqual(expect.any(Number));
    expect(raw._stats.modifiedTime).toEqual(expect.any(Number));
    const normalized = normalizeForgeItemArtifact(raw, '14');
    expect((normalized._stats as Record<string, unknown>).createdTime).toBeNull();
    expect((normalized._stats as Record<string, unknown>).modifiedTime).toBeNull();
    expect(raw._stats.createdTime).toEqual(expect.any(Number));
  });
});

let builtBrowserRuntime: Promise<{
  convertFinalItemSource: (request: ForgeItemRequest) => Promise<ForgeItemResponse>;
}> | undefined;

async function browserRuntime(): Promise<{
  convertFinalItemSource: (request: ForgeItemRequest) => Promise<ForgeItemResponse>;
}> {
  if (!builtBrowserRuntime) {
    builtBrowserRuntime = (async () => {
      const outdir = await mkdtemp(resolve(tmpdir(), 'fvtt-json-forge-item-browser-'));
      try {
        const entrypoint = resolve('foundry-modules/fvtt-json-forge/tests/fixtures/browser-runtime-entry.ts');
        const bundlePath = await buildBrowserBundle({ entrypoint, outdir, naming: 'runtime.js' });
        const bundle = await readFile(bundlePath, 'utf8');
        expect(bundle).not.toMatch(/process\.env|\bBun\.|(?:from|require)\s*\(?\s*["'](?:node:|fs|path|sharp|crawlee)/iu);
        return await import(pathToFileURL(bundlePath).href) as {
          convertFinalItemSource: (request: ForgeItemRequest) => Promise<ForgeItemResponse>;
        };
      } finally {
        await rm(outdir, { recursive: true });
      }
    })();
  }
  return builtBrowserRuntime;
}
