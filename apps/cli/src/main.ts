import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Command } from 'commander';
import {
  assertEffectProfileForTarget,
  buildImageAssetOptionsFromCli,
  canonicalSourcesFromMarkdown,
  convertMarkdownContentToJson,
  convertCanonicalActorCollection,
  documentDoctor,
  type EffectProfile,
  ItemTextWorkflow,
  ItemsIngestionWorkflow,
  JsonTranslationSyncWorkflow,
  runMonsterIntakeDoctor,
  ObsidianSyncWorkflow,
  createItemIntakeProvider,
  createMonsterIntakeProvider,
  PlainTextIngestionWorkflow,
  parseFvttTargetVersion,
  parseIconMode,
  resumeItemIntake,
  resumeMonsterIntake,
  runDocumentConversion,
  runItemIntake,
  runMonsterIntake,
  isDocumentInputPath,
  type IntakeProviderAuditEvent,
} from '../../../src/core/application/cli';

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
  .option('--intake-items <source>', 'AI-first Item intake from TXT or irregular Markdown (Foundry V14/core)')
  .option('--resume-item-intake <run-dir>', 'Resume an AI Item Intake review bundle')
  .option('--decisions <path>', 'Decision JSON file for --resume-intake')
  .option('--ingest-plaintext <source>', '[deprecated legacy rule-based] Split a plain-text creature collection into project markdown files')
  .option('--ingest-plaintext-actors <source>', '[deprecated legacy rule-based] Generate project markdown and actor JSON from a plain-text creature collection')
  .option('--ingest-items <source>', '[legacy strict format] Split a plain-text item collection into project markdown files')
  .option('--ingest-items-json <source>', '[legacy strict format] Generate project item markdown and Item JSON from a plain-text item collection')
  .option('--emit-dir <path>', 'Output directory for --ingest-plaintext', DEFAULT_EMIT_DIR)
  .option('--enable-ai-normalize', '[legacy strict Item Markdown only] Enable optional compatibility normalization; failures preserve source parsing')
  .option('--dry-run', 'Preview outputs without writing files')
  .option('--effect-profile <profile>', 'Effect automation profile: core, modded-v12, or modded-v14')
  .option('--fvtt-version <version>', 'Target Foundry major version (12, 13, or 14)', '12')
  .option('--icon-mode <mode>', 'v14 Item artwork mode: off or safe', 'off')
  .option('--icon-overrides <path>', 'v14 icon override JSON path')
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
  .option('--document-engine <engine>', 'Document engine: auto, native, or paddleocr', 'auto')
  .option('--document-language <language>', 'Document language: auto, en, zh-CN, or mixed', 'auto')
  .option('--document-candidate <id>', 'Only process one document candidate ID (repeatable)', collectOption, [])
  .option('--extract-only', 'Only extract/filter document input; do not translate or generate JSON')
  .option('--document-target-language <language>', 'Document Markdown target language', 'zh-CN')
  .option('--document-doctor', 'Report local PDF/OCR document dependencies')
  .option('--intake-doctor', 'Report AI Intake configuration and Codex OAuth bridge status')
  .action(async (input, options) => {
    try {
      if (options.documentDoctor) {
        console.log(JSON.stringify(documentDoctor(), null, 2));
        return;
      }
      if (options.intakeDoctor) {
        const report = await runMonsterIntakeDoctor();
        console.log(JSON.stringify(report, null, 2));
        if (!report.configured || (report.authMode === 'codex-oauth' && !report.bridge?.reachable)) {
          process.exitCode = 1;
        }
        return;
      }
      const fvttVersion = parseFvttTargetVersion(options.fvttVersion ?? '12');
      const iconMode = parseIconMode(options.iconMode);
      if (iconMode === 'safe' && fvttVersion !== '14') {
        throw new Error(`--icon-mode safe requires --fvtt-version 14, not ${fvttVersion}.`);
      }
      const iconOptions = {
        mode: iconMode,
        ...(options.iconOverrides ? { overridePath: resolve(options.iconOverrides) } : {}),
      };
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
        const provider = options.dryRun ? undefined : createMonsterIntakeProvider({
          audit: (event) => audit.push(event),
        });
        const result = await runMonsterIntake({
          source,
          sourceName: options.intakeMonsters,
          vaultPath: options.vault,
          dryRun: Boolean(options.dryRun),
          fvttVersion: fvttVersion as '12' | '14',
          effectProfile,
          iconOptions,
        }, provider);
        if (result.runPath) writeFileSync(join(result.runPath, 'provider-audit.json'), JSON.stringify(audit, null, 2));
        printIntakeResult(result);
        process.exitCode = intakeExitCode(result.status);
        return;
      }

      if (options.resumeIntake) {
        if (!options.decisions) throw new Error('--resume-intake requires --decisions <path>.');
        const audit: IntakeProviderAuditEvent[] = [];
        const provider = createMonsterIntakeProvider({
          audit: (event) => audit.push(event),
        });
        const result = await resumeMonsterIntake(options.resumeIntake, options.decisions, provider, options.vault);
        writeFileSync(join(result.runPath, 'provider-audit.resume.json'), JSON.stringify(audit, null, 2));
        printIntakeResult(result);
        process.exitCode = intakeExitCode(result.status);
        return;
      }

      if (options.intakeItems) {
        const source = readFileSync(resolve(options.intakeItems), 'utf-8');
        const audit: IntakeProviderAuditEvent[] = [];
        const provider = options.dryRun ? undefined : createItemIntakeProvider({
          audit: (event) => audit.push(event),
        });
        const result = await runItemIntake({
          source,
          sourceName: options.intakeItems,
          vaultPath: options.vault,
          dryRun: Boolean(options.dryRun),
          fvttVersion: fvttVersion as '14',
          effectProfile: effectProfile as 'core',
          iconOptions,
        }, provider);
        if (result.runPath) writeFileSync(join(result.runPath, 'provider-audit.json'), JSON.stringify(audit, null, 2));
        printItemIntakeResult(result);
        process.exitCode = intakeExitCode(result.status);
        return;
      }

      if (options.resumeItemIntake) {
        if (!options.decisions) throw new Error('--resume-item-intake requires --decisions <path>.');
        const audit: IntakeProviderAuditEvent[] = [];
        const provider = createItemIntakeProvider({
          audit: (event) => audit.push(event),
        });
        const result = await resumeItemIntake(options.resumeItemIntake, options.decisions, provider, options.vault);
        writeFileSync(join(result.runPath, 'provider-audit.resume.json'), JSON.stringify(audit, null, 2));
        printItemIntakeResult(result);
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
          iconOptions,
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
        console.warn('[Legacy rule-based][deprecated] --ingest-plaintext is retained for one compatibility cycle; use --intake-monsters for semantic intake.');
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
        console.warn('[Legacy rule-based][deprecated] --ingest-plaintext-actors is retained for one compatibility cycle; use --intake-monsters for semantic intake.');
        const workflow = new PlainTextIngestionWorkflow();
        const markdownResult = await workflow.ingest({
          sourcePath: options.ingestPlaintextActors,
          emitDir: join(options.vault, 'middle', 'legacy-plaintext'),
          dryRun: Boolean(options.dryRun),
          enableAiNormalize: Boolean(options.enableAiNormalize),
        });
        const sources = canonicalSourcesFromMarkdown(markdownResult.files.map((file) => ({
          sourceId: `${options.ingestPlaintextActors}:${file.fileName}`,
          sourceUrl: options.ingestPlaintextActors,
          fileName: file.fileName,
          markdown: file.markdown,
        })));
        const result = await convertCanonicalActorCollection({
          sources,
          vaultPath: options.vault,
          dryRun: Boolean(options.dryRun),
          fvttVersion,
          effectProfile: effectProfileOption ? effectProfile : fvttVersion === '14' ? 'core' : 'modded-v12',
          iconOptions,
          imageAssets,
        });

        console.log(`Ingested source: ${markdownResult.sourcePath}`);
        console.log(`Detected creatures: ${markdownResult.files.length}`);
        console.log(`Vault: ${result.vaultPath}`);
        console.log(`Effect profile: ${result.effectProfile}`);
        console.log(`Dry run: ${markdownResult.dryRun ? 'yes' : 'no'}`);
        console.log(`AI normalize: ${markdownResult.usedAi ? 'enabled' : 'disabled'}`);
        console.log(`Image mode: ${imageAssets?.mode ?? 'none'}`);
        console.log(`Markdown dir: ${markdownResult.emitDir}`);
        console.log(`JSON dir: ${result.outputDir}`);

        for (const file of markdownResult.files) {
          console.log(`- ${file.fileName} | sections=${Object.keys(file.sections).length} | notes=${file.rawNotes.length}`);
        }

        if (!markdownResult.dryRun && result.sync) {
          console.log(`Processed: ${result.sync.processed}`);
          console.log(`Skipped: ${result.sync.skipped}`);
          console.log(`Failed: ${result.sync.failed}`);
          console.log(`Backed up: ${result.sync.backedUp}`);
          console.log(`Warnings: ${result.sync.warnings.length}`);
        }

        if (result.failures.length > 0) {
          for (const failure of result.failures) {
            console.error(`Failed: ${failure.sourceId || failure.index} -> ${failure.error}`);
          }
          process.exit(1);
        }
        for (const warning of result.warnings) console.error(`Warning: ${warning.code} ${warning.message}`);

        if (markdownResult.files.length === 0) throw new Error('Legacy plaintext actor ingestion detected 0 monsters.');
        if (result.status === 'needs_review' || result.status === 'partial') process.exitCode = 2;

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
          iconOptions,
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

      if (isDocumentInputPath(input)) {
        const candidateIds = Array.isArray(options.documentCandidate)
          ? options.documentCandidate as string[]
          : [];
        const result = await runDocumentConversion({
          inputPath: input,
          outputPath: options.output,
          engine: normalizeDocumentEngine(options.documentEngine),
          language: normalizeDocumentLanguage(options.documentLanguage),
          targetLanguage: String(options.documentTargetLanguage ?? 'zh-CN'),
          candidateIds,
          extractOnly: Boolean(options.extractOnly),
          fvttVersion,
          effectProfile,
          iconOptions,
        });
        printDocumentResult(result);
        process.exitCode = result.status === 'succeeded' || result.status === 'extracted'
          ? 0
          : result.status === 'needs_review' || result.status === 'partial'
            ? 2
            : 1;
        return;
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
        iconOptions,
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

function printItemIntakeResult(result: Awaited<ReturnType<typeof runItemIntake>>): void {
  console.log(`AI Item Intake run: ${result.runId}`);
  console.log(`Status: ${result.status}`);
  console.log(`Discovered items: ${result.discoveryCount}`);
  if (result.estimatedMaxCalls !== undefined) console.log(`Estimated worst-case provider calls: ${result.estimatedMaxCalls}`);
  if (result.runPath) console.log(`Review bundle: ${result.runPath}`);
  for (const item of result.items) {
    console.log(`- ${item.label}: ${item.status} | calls extract=${item.calls.extraction} review=${item.calls.review} repair=${item.calls.repair}`);
    for (const finding of item.findings.filter((value) => value.blocking)) console.log(`  blocking [${finding.code}] ${finding.message}`);
    if (item.markdownPath) console.log(`  Markdown: ${item.markdownPath}`);
    if (item.itemPath) console.log(`  Item JSON: ${item.itemPath}`);
  }
}

function collectOption(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function normalizeDocumentEngine(value: unknown): 'auto' | 'native' | 'paddleocr' {
  if (value === 'auto' || value === 'native' || value === 'paddleocr') return value;
  throw new Error(`Unsupported --document-engine: ${String(value)}. Use auto, native, or paddleocr.`);
}

function normalizeDocumentLanguage(value: unknown): 'auto' | 'en' | 'zh-CN' | 'mixed' {
  if (value === 'auto' || value === 'en' || value === 'zh-CN' || value === 'mixed') return value;
  throw new Error(`Unsupported --document-language: ${String(value)}. Use auto, en, zh-CN, or mixed.`);
}

function printDocumentResult(result: Awaited<ReturnType<typeof runDocumentConversion>>): void {
  console.log(`Document run: ${result.runId}`);
  console.log(`Status: ${result.status}`);
  console.log(`Stage: ${result.stage}`);
  console.log(`Pages: ${result.pageCount}`);
  console.log(`Candidates: ${result.candidates.length}`);
  console.log(`Selected: ${result.selectedCandidateIds.join(', ') || '(none)'}`);
  console.log(`Run directory: ${result.runPath}`);
  console.log(`Raw Markdown: ${result.rawMarkdownPath}`);
  console.log(`Candidates JSON: ${result.candidatesPath}`);
  console.log(`Report: ${result.reportPath}`);
  if (result.translatedMarkdownPath) console.log(`Translated Markdown: ${result.translatedMarkdownPath}`);
  for (const candidate of result.candidates) {
    console.log(`- ${candidate.id} | ${candidate.status} | page=${candidate.pageNumber} | ${candidate.label}`);
  }
  for (const failure of result.failures) {
    console.error(`Failed${failure.candidateId ? ` [${failure.candidateId}]` : ''}: ${failure.error}`);
  }
  for (const warning of result.warnings) console.error(`Warning: ${warning}`);
  for (const file of result.outputFiles) console.log(`Artifact: ${file.path}`);
}
