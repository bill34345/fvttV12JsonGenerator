import { readFileSync, writeFileSync } from 'node:fs';
import { Command } from 'commander';
import { ActorGenerator } from './core/generator/actor';
import type { EffectProfile } from './core/generator/effectProfileApplier';
import { PlainTextIngestionWorkflow } from './core/ingest/plaintext';
import { ParserFactory } from './core/parser/router';
import { ObsidianSyncWorkflow } from './core/workflow/obsidianSync';
import { JsonTranslationSyncWorkflow } from './core/workflow/jsonTranslationSync';
import { PlainTextActorWorkflow } from './core/workflow/plainTextActor';
import { ActorValidator } from './core/generator/validator';

const program = new Command();

program
  .name('fvtt-import')
  .description('Convert Obsidian NPC markdown to Foundry VTT JSON')
  .version('1.0.0')
  .argument('[input]', 'Input markdown file')
  .option('-o, --output <output>', 'Output JSON file')
  .option('--sync', 'Sync Obsidian vault input folder to output JSON')
  .option('--vault <path>', 'Obsidian vault path', 'obsidian/dnd数据转fvttjson')
  .option('--clear-backup', 'Clear output_backup folder before sync')
  .option('--translate-json', 'Translate pending JSON files in place')
  .option('--translate-dir <path>', 'Directory for --translate-json', 'data/need_tran')
  .option('--ingest-plaintext <source>', 'Split a plain-text creature collection into project markdown files')
  .option('--ingest-plaintext-actors <source>', 'Generate project markdown and actor JSON from a plain-text creature collection')
  .option('--emit-dir <path>', 'Output directory for --ingest-plaintext', 'obsidian/dnd数据转fvttjson/input')
  .option('--enable-ai-normalize', 'Enable optional AI normalization during --ingest-plaintext')
  .option('--dry-run', 'Preview outputs without writing files')
  .option('--effect-profile <profile>', 'Effect automation profile: core or modded-v12')
  .option('--fvtt-version <version>', 'Target Foundry major version (12 or 13)', '12')
  .action(async (input, options) => {
    try {
      const requestedVersion = String(options.fvttVersion ?? '12');
      if (requestedVersion !== '12' && requestedVersion !== '13') {
        throw new Error(`Unsupported --fvtt-version: ${requestedVersion}. Use 12 or 13.`);
      }
      const fvttVersion = requestedVersion as '12' | '13';
      const effectProfileOption = options.effectProfile as string | undefined;
      const effectProfile = (effectProfileOption ?? 'core') as EffectProfile;
      if (effectProfile !== 'core' && effectProfile !== 'modded-v12') {
        throw new Error(`Unsupported --effect-profile: ${effectProfile}. Use core or modded-v12.`);
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
        const workflow = new ObsidianSyncWorkflow();
        const result = await workflow.sync({
          vaultPath: options.vault,
          clearBackup: Boolean(options.clearBackup),
          fvttVersion,
          effectProfile,
        });

        console.log(`Synced vault: ${result.inputDir}`);
        console.log(`Processed: ${result.processed}`);
        console.log(`Skipped: ${result.skipped}`);
        console.log(`Failed: ${result.failed}`);
        console.log(`Backed up: ${result.backedUp}`);

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

        return;
      }

      if (options.ingestPlaintext) {
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

        return;
      }

      if (options.ingestPlaintextActors) {
        const workflow = new PlainTextActorWorkflow();
        const result = await workflow.ingestActors({
          sourcePath: options.ingestPlaintextActors,
          vaultPath: options.vault,
          dryRun: Boolean(options.dryRun),
          enableAiNormalize: Boolean(options.enableAiNormalize),
          effectProfile: effectProfileOption ? effectProfile : 'modded-v12',
          fvttVersion,
        });

        console.log(`Ingested source: ${result.sourcePath}`);
        console.log(`Detected creatures: ${result.markdown.files.length}`);
        console.log(`Vault: ${result.vaultPath}`);
        console.log(`Effect profile: ${result.effectProfile}`);
        console.log(`Dry run: ${result.markdown.dryRun ? 'yes' : 'no'}`);
        console.log(`AI normalize: ${result.markdown.usedAi ? 'enabled' : 'disabled'}`);
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
        }

        if (result.sync.failures.length > 0) {
          for (const failure of result.sync.failures) {
            console.error(`Failed: ${failure.input} -> ${failure.error}`);
          }
          process.exit(1);
        }

        return;
      }

      if (!input) {
        throw new Error('Input file is required unless --sync is used');
      }

      console.log(`Processing ${input}...`);
      const content = readFileSync(input, 'utf-8');

      const parserFactory = new ParserFactory();
      const route = parserFactory.detectRoute(content);
      const parsed = parserFactory.parse(content);
      
      const generator = new ActorGenerator({ fvttVersion, effectProfile });
      const actor = await generator.generateForRoute(parsed, route);
      
      const validator = new ActorValidator();
      const warnings = validator.validate(parsed, actor);
      if (warnings.length > 0) {
         console.warn('\n--- Validation Warnings ---');
         for (const w of warnings) {
            console.warn(`[WARN] ${w}`);
         }
         console.warn('---------------------------\n');
      } else {
         console.log('Validation passed: No issues detected.');
      }

      const output = options.output || input.replace(/\.md$/, '.json');
      writeFileSync(output, JSON.stringify(actor, null, 2));

      console.log(`Successfully generated ${output}`);
      console.log(`Name: ${actor.name}`);
      console.log(`Items: ${actor.items.length}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

program.parse();
