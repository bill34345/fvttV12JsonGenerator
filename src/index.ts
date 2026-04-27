import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { ActorGenerator } from './core/generator/actor';
import type { EffectProfile } from './core/generator/effectProfileApplier';
import { PlainTextIngestionWorkflow } from './core/ingest/plaintext';
import { ParserFactory } from './core/parser/router';
import { detectItemRoute } from './core/parser/item-router';
import { ObsidianSyncWorkflow } from './core/workflow/obsidianSync';
import { JsonTranslationSyncWorkflow } from './core/workflow/jsonTranslationSync';
import { PlainTextActorWorkflow } from './core/workflow/plainTextActor';
import { ActorValidator } from './core/generator/validator';
import { ItemsIngestionWorkflow } from './core/ingest/items';

interface StructuredActions {
  attacks?: any[];
  saves?: any[];
  utilities?: any[];
  casts?: any[];
  effects?: any[];
  uses?: any[];
  spells?: any[];
}

interface StageRequirement {
  name: string;
  description?: string;
  requirements?: string[];
}

function filterStructuredActionsByStage(
  structuredActions: StructuredActions | undefined,
  stages: StageRequirement[],
  stageIndex: number
): StructuredActions | undefined {
  if (!structuredActions) return undefined;

  // Cumulative requirements from all previous stages (for most effects)
  const cumulativeRequirements = new Set<string>();
  for (let i = 0; i <= stageIndex; i++) {
    const reqs = stages[i]?.requirements;
    if (reqs) {
      for (const req of reqs) {
        cumulativeRequirements.add(req);
      }
    }
  }

  // Current stage requirements only (for AC bonus replacement)
  const currentStageRequirements = new Set<string>(
    stages[stageIndex]?.requirements ?? []
  );

  const filter = <T extends { desc?: string; useAction?: { description?: string }; passiveEffect?: { type?: string } }>(arr: T[] | undefined): T[] | undefined => {
    if (!arr) return undefined;
    const filtered = arr.filter(item => {
      const text = item.desc || item.useAction?.description;
      // For AC bonus effects, only include if desc matches CURRENT stage requirements
      // (AC bonus is stage-specific, not cumulative)
      if (item.passiveEffect?.type === 'acBonus') {
        return currentStageRequirements.has(text);
      }
      // For other effects, include if desc matches cumulative requirements
      if (!text) return true;
      return cumulativeRequirements.has(text);
    });
    return filtered.length > 0 ? filtered : undefined;
  };

  const result: StructuredActions = {};
  if (structuredActions.attacks) result.attacks = structuredActions.attacks;
  if (structuredActions.saves) result.saves = filter(structuredActions.saves);
  if (structuredActions.utilities) result.utilities = filter(structuredActions.utilities);
  if (structuredActions.casts) result.casts = filter(structuredActions.casts);
  if (structuredActions.effects) result.effects = filter(structuredActions.effects);
  if (structuredActions.uses) result.uses = filter(structuredActions.uses);
  if (structuredActions.spells) result.spells = filter(structuredActions.spells);

  return Object.keys(result).length > 0 ? result : undefined;
}

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
  .option('--ingest-items <source>', 'Split a plain-text item collection into project markdown files')
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
        const workflow = new ObsidianSyncWorkflow({
          enableAiNormalize: Boolean(options.enableAiNormalize),
        });
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

      if (options.ingestItems) {
        const workflow = new ItemsIngestionWorkflow();
        const result = await workflow.ingest({
          sourcePath: options.ingestItems,
          emitDir: options.emitDir,
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

      if (detectItemRoute(content)) {
        const { ItemParser } = await import('./core/parser/item-parser');
        const { ItemGenerator } = await import('./core/generator/item-generator');

        const parser = new ItemParser();
        const parsed = parser.parse(content);

        const generator = new ItemGenerator({ fvttVersion });

        const stages = parsed.stages;
        const isMultiStage = stages && stages.length > 1;
        const output = options.output || input.replace(/\.md$/, '.json');

        if (isMultiStage) {
          mkdirSync(output, { recursive: true });

          const stageNameMap: Record<string, string> = {
            '休眠态': '',
            '觉醒态': ' (Awakened)',
            '升华态': ' (Exalted)',
          };

          for (let i = 0; i < stages.length; i++) {
            const stage = stages[i]!;

            const stageSuffix = stageNameMap[stage.name] ?? ` (${stage.name})`;

            const cumulativeRequirements: string[] = [];
            for (let j = 0; j <= i; j++) {
              const prevStage = stages[j]!;
              if (prevStage.requirements) {
                cumulativeRequirements.push(...prevStage.requirements);
              }
            }

            const stageUsesMax = stage.name === '升华态' ? '7'
              : stage.name === '觉醒态' ? '5'
              : parsed.uses?.max || '3';

            const stageUses = parsed.uses
              ? { ...parsed.uses, max: stageUsesMax }
              : { max: stageUsesMax, spent: 0, recovery: [{ period: 'dawn', type: 'recoverAll' }] };

            const filteredStructuredActions = filterStructuredActionsByStage(
              parsed.structuredActions,
              stages,
              i
            );

            const stageParsed = { ...parsed, uses: stageUses, structuredActions: filteredStructuredActions };

            const stageItem = await generator.generate({
              ...stageParsed,
              name: `${parsed.name}${stageSuffix}`,
              cumulativeRequirements,
            });

            const outputName = stageSuffix
              ? `${parsed.name}${stageSuffix}.json`
              : `${parsed.name}.json`;
            const outputPath = join(output, outputName);

            writeFileSync(outputPath, JSON.stringify(stageItem, null, 2));
            console.log(`Successfully generated ${outputPath}`);
            console.log(`Name: ${stageItem.name}`);
          }
        } else {
          const item = await generator.generate(parsed);

          writeFileSync(output, JSON.stringify(item, null, 2));
          console.log(`Successfully generated ${output}`);
          console.log(`Name: ${item.name}`);
        }
      } else {
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
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

program.parse();
