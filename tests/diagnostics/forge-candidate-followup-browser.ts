/** Bounded UI acceptance with an unchanged saved proposal, never a live provider.
 * Build with the module's browser bundle builder; invoke through normal Macro UI.
 * Analyze, formal generation, approval, creation, readback and downloads remain real.
 */
import { createForgeWorkspaceApplicationClass } from '../../foundry-modules/fvtt-json-forge/src/workspaceApplication';
import { DEFAULT_CLIENT_SETTINGS } from '../../foundry-modules/fvtt-json-forge/src/settings';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { ManagedForgeSourceLibrary, MemoryForgeSourceLibraryStore } from '@fvtt-json-generator/forge-browser-runtime/source-library';
import { ManagedForgeBatchQueue, MemoryForgeBatchQueueStore } from '@fvtt-json-generator/forge-browser-runtime/batch-queue';
import type { MonsterIntakeAiProvider, MonsterIntakeIR } from '@fvtt-json-generator/intake-ai';

const TOOL_KEY = '__forgeCandidateFollowup20261022';
type Seed = { source: string; ir: MonsterIntakeIR; sourceHash: string };

export async function openFrozenActorWorkspace() {
  const env = globalThis as any;
  const { game, foundry, ui } = env;
  if (location.origin !== 'http://127.0.0.1:30001' || game.world.id !== 'cor-cotn'
    || game.version !== '14.368' || game.system.id !== 'dnd5e' || game.system.version !== '5.3.3'
    || game.user?.isGM !== true) throw Error('Wrong local acceptance target.');
  if (foundry.applications.instances.has('fvtt-json-forge-workspace-actor')) {
    throw Error('Close the existing Actor workspace normally before opening the frozen-provider case.');
  }
  const response = await fetch('modules/fvtt-json-forge/scripts/qa-candidate-seed-20261022.json');
  if (!response.ok) throw Error('Saved proposal asset unavailable.');
  const seed: Seed = await response.json();
  if (hashSource(seed.source) !== seed.sourceHash || seed.ir.source.sha256 !== seed.sourceHash
    || seed.ir.source.length !== seed.source.length) throw Error('Frozen proposal source identity mismatch.');
  const calls = { discover: 0, extract: 0, review: 0, repair: 0, liveModel: 0 };
  const provider: MonsterIntakeAiProvider = {
    providerName: 'saved-proposal-ui-acceptance', extractionModel: 'frozen-mage-ir', reviewModel: 'disabled',
    discover: async request => {
      if (request.sourceSha256 !== seed.sourceHash || request.source !== seed.source) throw Error('Unexpected source.');
      calls.discover++;
      return { schemaVersion: 1, candidates: [{ id: 'saved-mage', label: 'Mage', start: 0,
        end: seed.source.length, quote: seed.source }] };
    },
    extract: async request => {
      if (request.sourceSha256 !== seed.sourceHash || request.source !== seed.source) throw Error('Unexpected source.');
      calls.extract++;
      return structuredClone(seed.ir);
    },
    review: async () => { calls.review++; throw Error('Live/extra review forbidden for this acceptance.'); },
    repair: async () => { calls.repair++; throw Error('Correction forbidden for this default-off acceptance.'); },
  };
  const settings = { ...DEFAULT_CLIENT_SETTINGS, providerId: 'custom' as const, endpoint: 'https://frozen.invalid/v1',
    model: 'frozen-mage-ir', protocol: 'openai-chat' as const, apiKey: 'fixture-only-not-a-secret',
    autoCorrect: false, persistApiKey: false, savedApiKeys: {} };
  const Application = createForgeWorkspaceApplicationClass({ game, foundry, ui, window: env.window,
    hooks: env.Hooks, directoryKind: 'Actor', initialMode: 'ai', intake: {
      sourceLibrary: new ManagedForgeSourceLibrary(new MemoryForgeSourceLibraryStore()),
      batchQueue: new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore()),
      services: { createBrowserAiProvider: () => provider,
        readForgeSessionSettings: () => structuredClone(settings),
        saveForgeSessionSettings: () => { throw Error('Acceptance must not save connection settings.'); },
        subscribeForgeSessionSettings: () => () => {}, isForgeSessionConnectionReady: () => true },
    } });
  const app = new Application();
  env[TOOL_KEY] = { app, calls, sourceHash: seed.sourceHash, source: seed.source,
    boundary: 'Frozen provider proposal only; real UI/formal/GM/create/readback/download services.' };
  await app.render({ force: true });
  return { id: app.id, sourceHash: seed.sourceHash, calls };
}

export function frozenActorReadback() {
  const state = (globalThis as any)[TOOL_KEY];
  if (!state) throw Error('Frozen UI case not initialized.');
  const intake = state.app.intake;
  const result = intake.generation?.candidateResponse?.result ?? intake.response?.result;
  return { calls: structuredClone(state.calls), sourceHash: state.sourceHash, boundary: state.boundary,
    status: intake.status, requestId: intake.requestId, attemptId: intake.attemptId,
    analysis: intake.analysis, generation: intake.generation, response: intake.response,
    artifact: result?.artifact, created: intake.createdDocument
      ? { uuid: intake.createdDocument.uuid, status: intake.createdDocument.status,
        dto: intake.createdDocument.document?.toObject() } : null };
}
