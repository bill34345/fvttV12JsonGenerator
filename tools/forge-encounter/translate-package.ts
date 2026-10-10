import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadMonsterIntakeConfig } from '@fvtt-json-generator/intake-ai/config';
import { createEncounterIntakeProviders, assertEncounterSecretsAbsent } from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import { localizeForgeEncounter, type EncounterLocalizationProgress } from '@fvtt-json-generator/forge-browser-runtime/encounter-localization';
import { decodeForgeEncounterPackageText, serializeForgeEncounterPackage, encodeForgeEncounterPackageZip } from '@fvtt-json-generator/forge-browser-runtime/encounter-package';

// This is a source-package workflow entry, never an in-place Actor JSON translator.
const [inputPath, outputPath, ...flags] = process.argv.slice(2);
let mode:string|undefined, resumePath:string|undefined;
for(let i=0;i<flags.length;i++){
  if(['--local-ds','--configured-provider'].includes(flags[i]!)&&!mode)mode=flags[i];
  else if(flags[i]==='--resume-review'&&!resumePath&&flags[i+1])resumePath=flags[++i];
  else throw new Error('Unknown or duplicate translation option.');
}
if (!inputPath || !outputPath) {
  throw new Error('Usage: bun run tools/forge-encounter/translate-package.ts <source.forge-encounter.json> <new-output-directory> [--local-ds|--configured-provider] [--resume-review <translation-review.json>]');
}
let localKey = process.env.DEEPSEEK_API_KEY ?? '';
const localDs = mode !== '--configured-provider';
if (localDs && !localKey && process.env.FVTT_LOCAL_DS_KEY_FILE) {
  const stored: unknown = JSON.parse(await readFile(resolve(process.env.FVTT_LOCAL_DS_KEY_FILE), 'utf8'));
  if (typeof stored !== 'string' || !stored.trim()) throw new Error('Local DS credential file has an unsupported format.');
  localKey = stored;
}
const config = localDs ? loadMonsterIntakeConfig({ MONSTER_INTAKE_AUTH_MODE: 'api-key', MONSTER_INTAKE_API_KEY: localKey,
  MONSTER_INTAKE_BASE_URL: 'https://api.deepseek.com', MONSTER_INTAKE_MODEL: 'deepseek-flash', MONSTER_INTAKE_REASONING_EFFORT: 'low',
  MONSTER_INTAKE_TIMEOUT_MS: '300000', MONSTER_INTAKE_REPAIR_TIMEOUT_MS: '300000' }) : loadMonsterIntakeConfig();
localKey = '';
const input = await readFile(resolve(inputPath), 'utf8');
const forbidden = [config.apiKey, config.baseUrl];
assertEncounterSecretsAbsent(input, forbidden);
const bundle = decodeForgeEncounterPackageText(input);
let priorReviews:EncounterLocalizationProgress[]|undefined;
if(resumePath){const text=await readFile(resolve(resumePath),'utf8');assertEncounterSecretsAbsent(text,forbidden);const parsed:unknown=JSON.parse(text);if(!Array.isArray(parsed))throw new Error('Translation review must be an array.');priorReviews=parsed;}
const output = resolve(outputPath);
await mkdir(output, { recursive: false });
const controller = new AbortController(); process.once('SIGINT', () => controller.abort());
const { translationService } = createEncounterIntakeProviders({ apiKey: config.apiKey, baseUrl: config.baseUrl,
  model: config.model, reviewModel: config.reviewModel, reasoning: config.reasoningEffort, protocol: 'openai-chat',
  timeoutMs: config.timeoutMs, repairTimeoutMs: config.repairTimeoutMs }, controller.signal);
const receipts: unknown[] = [];
const save = async (name: string, value: unknown) => {
  const text = JSON.stringify(value, null, 2); assertEncounterSecretsAbsent(text, forbidden);
  await writeFile(resolve(output, name), text);
};
const started = Date.now();
try {
  const prepared = await localizeForgeEncounter({ bundle, service: translationService, signal: controller.signal, priorReviews,
    onProgress: message => console.log(JSON.stringify({ at: new Date().toISOString(), message })),
    onReview: progress => { receipts.push(progress); const text=JSON.stringify(receipts,null,2);assertEncounterSecretsAbsent(text,forbidden);writeFileSync(resolve(output,'translation-review.json'),text); },
  });
  await save('translation-review.json', receipts);
  const serialized = serializeForgeEncounterPackage(prepared.bundle); assertEncounterSecretsAbsent(serialized, forbidden);
  await writeFile(resolve(output, 'encounter.forge-encounter.json'), serialized);
  await writeFile(resolve(output, 'encounter.forge-encounter.zip'), await encodeForgeEncounterPackageZip(prepared.bundle));
  for (const actor of prepared.actors) {
    await save(`${actor.key}.json`, actor.artifact);
    await writeFile(resolve(output, `${actor.key}.md`), prepared.bundle.actors.find(entry => entry.key === actor.key)!.source);
  }
  const receipt = { status: 'ready_for_gm_review', packageHash: prepared.hash, durationMs: Date.now() - started,
    actors: prepared.actors.map(actor => ({ key: actor.key, name: actor.name, artifactHash: actor.artifactHash })),
    translationModel: translationService.model, reviewModel: translationService.reviewModel, worldWrites: 0 };
  await save('receipt.json', receipt); console.log(JSON.stringify(receipt));
} catch (error) {
  await save('translation-review.json', receipts);
  const message = error instanceof Error ? error.message : 'Translation failed';
  const receipt = { status: 'needs_review', durationMs: Date.now() - started,
    findings: [message.replace(/https?:\/\/\S+/giu, '[endpoint]').replace(/Bearer\s+\S+/giu, '[credential]')], worldWrites: 0 };
  await save('receipt.json', receipt); console.log(JSON.stringify(receipt)); process.exitCode = 1;
}
