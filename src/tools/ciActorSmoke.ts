import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { convertMarkdownPathToOutput } from '../core/workflow/singleFileConversion';

const EXPECTED_WHITE_TUSK_ITEMS = [
  'Aggressive',
  'Minion: Savage Horde',
  'Spirit-Bonded Body',
  'Spirit-Bonded Mind',
  'Multiattack',
  'Blood-Searing Spear',
];

export async function runCiActorSmoke(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'fvtt-ci-actor-smoke-'));
  const sourcePath = resolve('obsidian/dnd数据转fvttjson/input/white-tusk-shaman.md');
  const outputPath = join(root, 'white-tusk-shaman.v14.json');
  const previousFetch = globalThis.fetch;
  let networkCalls = 0;

  try {
    globalThis.fetch = (async () => {
      networkCalls += 1;
      return new Response(JSON.stringify({
        choices: [{ message: { content: '<think>unexpected network path</think>污染翻译' } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;

    const result = await convertMarkdownPathToOutput({
      sourcePath,
      outputPath,
      fvttVersion: '14',
      effectProfile: 'modded-v14',
    });
    const actor = result.rawJson as { items?: Array<{ name?: unknown }> };
    const itemNames = (actor.items ?? []).map((item) => String(item.name ?? ''));

    if (networkCalls !== 0) {
      throw new Error(`offline Actor smoke attempted ${networkCalls} network translation calls`);
    }
    if (JSON.stringify(itemNames) !== JSON.stringify(EXPECTED_WHITE_TUSK_ITEMS)) {
      throw new Error(`White Tusk source item boundary changed: ${JSON.stringify(itemNames)}`);
    }
    if ((result.verification?.warnings.length ?? 0) !== 0) {
      throw new Error(`Actor verifier reported warnings: ${JSON.stringify(result.verification?.warnings)}`);
    }
    if (JSON.stringify(result.rawJson).includes('<think>')) {
      throw new Error('generated Actor contains provider reasoning markup');
    }

    console.log(
      `CI Actor smoke passed: ${result.name}, ${itemNames.length} source items, 0 verifier warnings, 0 network calls`,
    );
  } finally {
    globalThis.fetch = previousFetch;
    rmSync(root, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  await runCiActorSmoke();
}
