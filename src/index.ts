import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Command } from 'commander';
import type { EffectProfile } from './core/generator/effectProfileApplier';
import { PlainTextIngestionWorkflow } from './core/ingest/plaintext';
import { ObsidianSyncWorkflow } from './core/workflow/obsidianSync';
import { JsonTranslationSyncWorkflow } from './core/workflow/jsonTranslationSync';
import { PlainTextActorWorkflow } from './core/workflow/plainTextActor';
import { ItemTextWorkflow } from './core/workflow/itemTextWorkflow';
import { ItemsIngestionWorkflow } from './core/ingest/items';
import { buildImageAssetOptionsFromCli } from './core/assets/imageAssetOptions';
import { assertEffectProfileForTarget, parseFvttTargetVersion } from './core/foundryTarget';
import { loadMonsterIntakeConfig } from './core/intake/config';
import { OpenAICompatibleMonsterIntakeProvider, type IntakeProviderAuditEvent } from './core/intake/provider';
import { resumeMonsterIntake, runMonsterIntake } from './core/intake/orchestrator';
import { convertMarkdownContentToJson } from './core/workflow/singleFileConversion';

const DEFAULT_VAULT = 'obsidian/dnd数据转fvttjson';
const DEFAULT_EMIT_DIR = join(DEFAULT_VAULT, 'input');

const program = new Command();

program
  .name('fvtt-import')
  .description('Convert Obsidian NPC markdown to Foundry VTT JSON')
  .version('1.0.0')
  .argument('[input]', 'Input markdown file')
  .option('-o, --output <output>', 'Output JSON file')
  .option('--sync', 'Sync Obsidian vault input folder to output JSON')
  .option('--vault <path>', 'Obsidian vault path', DEFAULT_VAULT)
  .option('--clear-backup', 'Clear output_backup folder before sync')
  .option('--translate-json', 'Translate pending JSON files in place')
  .option('--translate-dir <path>', 'Directory for --translate-json', 'data/need_tran')
  .option('--intake-monsters <source>', 'AI-first monster/NPC intake from TXT or irregular Markdown (recommended)')
  .option('--resume-intake <run-dir>', 'Resume an AI monster intake review bundle')
  .option('--decisions <path>', 'Decision JSON file for --resume-intake')
  .option('--ingest-plaintext <source>', '[legacy rule-based] Split a plain-text creature collection into project markdown files')
  .option('--ingest-plaintext-actors <source>', '[legacy rule-based] Generate project markdown and actor JSON from a plain-text creature collection')
  .option('--ingest-items <source>', 'Split a plain-text item collection into project markdown files')
  .option('--ingest-items-json <source>', 'Generate project item markdown and Item JSON from a plain-text item collection')
  .option('--emit-dir <path>', 'Output directory for --ingest-plaintext', DEFAULT_EMIT_DIR)
  .option('--enable-ai-normalize', 'Enable optional AI normalization during --ingest-plaintext')
  .option('--dry-run', 'Preview outputs without writing files')
  .option('--effect-profile <profile>', 'Effect automation profile: core, modded-v12, or modded-v14')
  .option('--fvtt-version <version>', 'Target Foundry major version (12, 13, or 14)', '12')
  .option('--image-mode <mode>', 'Image asset workflow mode: none or ssh', 'none')
  .option('--image-ssh-target <target>', 'SSH target for image uploads')
  .option('--image-remote-root <path>', 'Remote image root directory for SSH uploads')
  .option('--image-public-base-url <url>', 'Public base URL for uploaded images')
  .option('--image-allow-http', 'Allow http:// image public URLs')
  .option('--image-actor-dir <dir>', 'Actor image subdirectory', 'actors')
  .option('--image-token-dir <dir>', 'Token image subdirectory', 'tokens')
  .option('--image-token-frame <path>', 'Transparent PNG token frame path')
  .option('--image-token-size <size>', 'Token output size in pixels', '1024')
  .option('--image-token-format <format>', 'Token output format', 'webp')
  .option('--image-token-crops <path>', 'JSON map of source-url hash to normalized token crop rectangles')
  .action(async (input, options) => {
    try {
      const fvttVersion = parseFvttTargetVersion(options.fvttVersion ?? '12');
      const effectProfileOption = options.effectProfile as string | undefined;
      const effectProfile = (effectProfileOption ?? 'core') as EffectProfile;
      if (effectProfile !== 'core' && effectProfile !== 'modded-v12' && effectProfile !== 'modded-v14') {
        throw new Error(`Unsupported --effect-profile: ${effectProfile}. Use core, modded-v12, or modded-v14.`);
      }
      assertEffectProfileForTarget(fvttVersion, effectProfile);
      const imageAssets = buildImageAssetOptionsFromCli(options);

      if (options.intakeMonsters) {
        const source = readFileSync(resolve(options.intakeMonsters), 'utf-8');
        const audit: IntakeProviderAuditEvent[] = [];
        const provider = options.dryRun ? undefined : new OpenAICompatibleMonsterIntakeProvider({
          ...loadMonsterIntakeConfig(),
          audit: (event) => audit.push(event),
        });
        const result = await runMonsterIntake({
          source,
          sourceName: options.intakeMonsters,
          vaultPath: options.vault,
          dryRun: Boolean(options.dryRun),
          fvttVersion: fvttVersion as '12' | '14',
          effectProfile,
        }, provider);
        if (result.runPath) writeFileSync(join(result.runPath, 'provider-audit.json'), JSON.stringify(audit, null, 2));
        printIntakeResult(result);
        process.exitCode = intakeExitCode(result.status);
        return;
      }

      if (options.resumeIntake) {
        if (!options.decisions) throw new Error('--resume-intake requires --decisions <path>.');
        const audit: IntakeProviderAuditEvent[] = [];
        const provider = new OpenAICompatibleMonsterIntakeProvider({
          ...loadMonsterIntakeConfig(),
          audit: (event) => audit.push(event),
        });
        const result = await resumeMonsterIntake(options.resumeIntake, options.decisions, provider, options.vault);
        writeFileSync(join(result.runPath, 'provider-audit.resume.json'), JSON.stringify(audit, null, 2));
        printIntakeResult(result);
        process.exitCode = intakeExitCode(result.status);
        return;
      }

      if (options.translateJson) {
        const workflow = new JsonTranslationSyncWorkflow();
        const result = await workflow.sync({
          dirPath: options.translateDir,
        });

        console.log(`Translated dir: ${result.dirPath}`);
        console.log(`Scanned files: ${result.scannedFiles}`);
        console.log(`Changed files: ${result.changedFiles}`);
        console.log(`Translated fields: ${result.translatedFields}`);
        console.log(`Skipped translated fields: ${result.skippedAlreadyTranslated}`);
        console.log(`Warnings: ${result.warnings}`);

        if (result.failures.length > 0) {
          for (const failure of result.failures) {
            console.error(`Failed: ${failure.file} -> ${failure.error}`);
          }
          process.exit(1);
        }

        return;
      }

      if (options.sync) {
        const workflow = new ObsidianSyncWorkflow({
          enableAiNormalize: Boolean(options.enableAiNormalize),
        });
        const result = await workflow.sync({
          vaultPath: options.vault,
          clearBackup: Boolean(options.clearBackup),
          fvttVersion,
          effectProfile,
          imageAssets,
        });

        console.log(`Synced vault: ${result.inputDir}`);
        console.log(`Processed: ${result.processed}`);
        console.log(`Skipped: ${result.skipped}`);
        console.log(`Failed: ${result.failed}`);
        console.log(`Backed up: ${result.backedUp}`);
        console.log(`Warnings: ${result.warnings.length}`);
        console.log(`AI normalize requested: ${result.aiNormalizeRequested ? 'yes' : 'no'}`);
        console.log(`AI normalize enabled: ${result.aiNormalizeEnabled ? 'yes' : 'no'}`);
        console.log(`Actor translation enabled: ${result.actorTranslationEnabled ? 'yes' : 'no'}`);

        if (result.createdExample) {
          console.log(`Created example: ${result.examplesDir}`);
        }

        if (result.clearedBackup) {
          console.log(`Cleared backup folder: ${result.backupDir}`);
        }

        if (result.failures.length > 0) {
          for (const failure of result.failures) {
            console.error(`Failed: ${failure.input} -> ${failure.error}`);
          }
          process.exit(1);
        }
        for (const warning of result.warnings) {
          console.error(`Warning: ${warning.displayName ?? 'image'} [${warning.stage}] ${warning.message}`);
        }

        return;
      }

      if (options.ingestPlaintext) {
        console.warn('[Legacy rule-based] This converter is retained for compatibility; use --intake-monsters for semantic intake.');
        const workflow = new PlainTextIngestionWorkflow();
        const result = await workflow.ingest({
          sourcePath: options.ingestPlaintext,
          emitDir: options.emitDir,
          dryRun: Boolean(options.dryRun),
          enableAiNormalize: Boolean(options.enableAiNormalize),
        });

        console.log(`Ingested source: ${result.sourcePath}`);
        console.log(`Detected creatures: ${result.files.length}`);
        console.log(`Output dir: ${result.emitDir}`);
        console.log(`Dry run: ${result.dryRun ? 'yes' : 'no'}`);
        console.log(`AI normalize: ${result.usedAi ? 'enabled' : 'disabled'}`);

        for (const file of result.files) {
          console.log(`- ${file.fileName} | sections=${Object.keys(file.sections).length} | notes=${file.rawNotes.length}`);
        }

        if (result.files.length === 0) throw new Error('Legacy plaintext ingestion detected 0 monsters.');

        return;
      }

      if (options.ingestPlaintextActors) {
        console.warn('[Legacy rule-based] This converter is retained for compatibility; use --intake-monsters for semantic intake.');
        const workflow = new PlainTextActorWorkflow();
        const result = await workflow.ingestActors({
          sourcePath: options.ingestPlaintextActors,
          vaultPath: options.vault,
          dryRun: Boolean(options.dryRun),
          enableAiNormalize: Boolean(options.enableAiNormalize),
          effectProfile: effectProfileOption ? effectProfile : fvttVersion === '14' ? 'core' : 'modded-v12',
          fvttVersion,
          imageAssets,
        });

        console.log(`Ingested source: ${result.sourcePath}`);
        console.log(`Detected creatures: ${result.markdown.files.length}`);
        console.log(`Vault: ${result.vaultPath}`);
        console.log(`Effect profile: ${result.effectProfile}`);
        console.log(`Dry run: ${result.markdown.dryRun ? 'yes' : 'no'}`);
        console.log(`AI normalize: ${result.markdown.usedAi ? 'enabled' : 'disabled'}`);
        console.log(`Image mode: ${imageAssets?.mode ?? 'none'}`);
        console.log(`Markdown dir: ${result.markdown.emitDir}`);
        console.log(`JSON dir: ${result.sync.outputDir}`);

        for (const file of result.markdown.files) {
          console.log(`- ${file.fileName} | sections=${Object.keys(file.sections).length} | notes=${file.rawNotes.length}`);
        }

        if (!result.markdown.dryRun) {
          console.log(`Processed: ${result.sync.processed}`);
          console.log(`Skipped: ${result.sync.skipped}`);
          console.log(`Failed: ${result.sync.failed}`);
          console.log(`Backed up: ${result.sync.backedUp}`);
          console.log(`Warnings: ${result.sync.warnings.length}`);
        }

        if (result.sync.failures.length > 0) {
          for (const failure of result.sync.failures) {
            console.error(`Failed: ${failure.input} -> ${failure.error}`);
          }
          process.exit(1);
        }
        for (const warning of result.sync.warnings) {
          console.error(`Warning: ${warning.displayName ?? 'image'} [${warning.stage}] ${warning.message}`);
        }

        if (result.markdown.files.length === 0) throw new Error('Legacy plaintext actor ingestion detected 0 monsters.');

        return;
      }

      if (options.ingestItemsJson) {
        const workflow = new ItemTextWorkflow();
        const result = await workflow.run({
          sourcePath: options.ingestItemsJson,
          vaultPath: options.vault,
          dryRun: Boolean(options.dryRun),
          fvttVersion,
          effectProfile,
        });

        console.log(`Ingested items from: ${result.ingestion.sourcePath}`);
        console.log(`Detected items: ${result.ingestion.files.length}`);
        console.log(`Markdown dir: ${result.ingestion.emitDir}`);
        console.log(`JSON dir: ${join(options.vault, "output", "items")}`);
        console.log(`Dry run: ${result.ingestion.dryRun ? 'yes' : 'no'}`);

        for (const file of result.ingestion.files) {
          console.log(`- ${file.fileName}`);
        }

        if (result.sync.failures.length > 0) {
          for (const failure of result.sync.failures) {
            console.error(`Failed: ${failure.input} -> ${failure.error}`);
          }
          process.exit(1);
        }

        return;
      }

      if (options.ingestItems) {
        const workflow = new ItemsIngestionWorkflow();
        const emitDirSource = program.getOptionValueSource('emitDir');
        const itemEmitDir = emitDirSource === 'default'
          ? join(options.vault, "middle", "items")
          : options.emitDir;
        const result = await workflow.ingest({
          sourcePath: options.ingestItems,
          emitDir: itemEmitDir,
          dryRun: Boolean(options.dryRun),
        });

        console.log(`Ingested items from: ${result.sourcePath}`);
        console.log(`Detected items: ${result.files.length}`);
        console.log(`Output dir: ${result.emitDir}`);
        console.log(`Dry run: ${result.dryRun ? 'yes' : 'no'}`);

        for (const file of result.files) {
          console.log(`- ${file.fileName}`);
        }

        return;
      }

      if (!input) {
        throw new Error('Input file is required unless --sync is used');
      }

      console.log(`Processing ${input}...`);
      const content = readFileSync(input, 'utf-8');
      const output = options.output || input.replace(/\.md$/, '.json');
      const result = await convertMarkdownContentToJson({
        content,
        sourcePath: input,
        outputPath: output,
        fvttVersion,
        effectProfile,
      });
      for (const diagnostic of result.diagnostics) {
        const writer = diagnostic.severity === 'error' ? console.error : console.warn;
        writer(`[${diagnostic.severity.toUpperCase()}] ${diagnostic.code} ${diagnostic.path}: ${diagnostic.message}`);
      }
      if (result.status !== 'accepted') {
        if (result.status === 'needs_review' && result.outputPath) {
          console.warn(`Generated review-required output: ${result.outputPath}`);
          console.warn('Status: needs_review (GM-assisted or external-rule mechanics are not automatic).');
          process.exitCode = 2;
          return;
        }
        console.error(`Generation ${result.status}; no formal output was written.`);
        process.exitCode = result.status === 'needs_review' ? 2 : 1;
        return;
      }
      console.log(`Successfully generated ${result.outputPath}`);
      console.log(`Name: ${result.name}`);
      console.log(`Items: ${result.itemCount}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

program.parse();

function intakeExitCode(status: string): number {
  if (status === 'succeeded' || status === 'dry_run') return 0;
  if (status === 'needs_review') return 2;
  return 1;
}

function printIntakeResult(result: Awaited<ReturnType<typeof runMonsterIntake>>): void {
  console.log(`AI intake run: ${result.runId}`);
  console.log(`Status: ${result.status}`);
  console.log(`Discovered monsters: ${result.discoveryCount}`);
  if (result.estimatedMaxCalls !== undefined) console.log(`Estimated worst-case provider calls: ${result.estimatedMaxCalls}`);
  if (result.runPath) console.log(`Review bundle: ${result.runPath}`);
  for (const creature of result.creatures) {
    console.log(`- ${creature.label}: ${creature.status} | calls extract=${creature.calls.extraction} review=${creature.calls.review} repair=${creature.calls.repair}`);
    if (creature.spellResolution.required) {
      if (creature.spellResolution.status === 'pending') {
        console.log(`  法术：已整理 ${creature.spellResolution.spellCount} 项；目标世界解析待完成（需 FVTT v14 解析模块）`);
      } else {
        console.log(`  法术：${creature.spellResolution.spellCount} 项；目标世界解析状态 ${creature.spellResolution.status}`);
      }
    }
    for (const finding of creature.findings.filter((value) => value.blocking)) console.log(`  blocking [${finding.code}] ${finding.message}`);
    if (creature.markdownPath) console.log(`  Markdown: ${creature.markdownPath}`);
    if (creature.actorPath) console.log(`  Actor JSON: ${creature.actorPath}`);
  }
}
