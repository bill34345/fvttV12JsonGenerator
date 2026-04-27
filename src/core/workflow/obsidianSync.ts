import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { ActorGenerator } from '../generator/actor';
import type { EffectProfile } from '../generator/effectProfileApplier';
import { ItemAiNormalizer } from '../ingest/item-ai-normalizer';
import { ItemParser } from '../parser/item-parser';
import { detectItemRoute } from '../parser/item-router';
import { ParserFactory } from '../parser/router';
import type { TranslationContext } from '../translation';
import { createTranslationConfigFromEnv } from '../translation/config';

export interface ObsidianSyncOptions {
  vaultPath: string;
  clearBackup?: boolean;
  fvttVersion?: '12' | '13';
  effectProfile?: EffectProfile;
  excludeInputPaths?: string[];
  forceInputPaths?: string[];
}

interface TranslationServiceLike {
  translate(text: string, context?: TranslationContext): Promise<{ text: string } | string>;
}

interface ManifestEntry {
  hash: string;
  output: string;
  fvttVersion?: '12' | '13';
  effectProfile?: EffectProfile;
  status: 'success' | 'failed' | 'stale';
  lastSuccessAt?: string;
  lastAttemptAt: string;
  lastError?: string;
}

type Manifest = Record<string, ManifestEntry>;

export interface ObsidianSyncResult {
  inputDir: string;
  examplesDir: string;
  outputDir: string;
  backupDir: string;
  manifestPath: string;
  processed: number;
  skipped: number;
  failed: number;
  backedUp: number;
  createdExample: boolean;
  clearedBackup: boolean;
  failures: Array<{ input: string; error: string }>;
}

export class ObsidianSyncWorkflow {
  private parserFactory = new ParserFactory();
  private itemParser = new ItemParser();
  private itemAiNormalizer: ItemAiNormalizer | null = null;

  constructor(
    private readonly options: { translationService?: TranslationServiceLike | null; enableAiNormalize?: boolean } = {},
  ) {
    if (options.enableAiNormalize) {
      const config = createTranslationConfigFromEnv();
      if (config.apiKey) {
        this.itemAiNormalizer = new ItemAiNormalizer({
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          model: config.model,
          timeoutMs: config.timeoutMs,
        });
      }
    }
  }

  public async sync(options: ObsidianSyncOptions): Promise<ObsidianSyncResult> {
    const fvttVersion = options.fvttVersion ?? '12';
    const effectProfile = options.effectProfile ?? 'core';
    const generator = new ActorGenerator({
      fvttVersion,
      translationService: this.options.translationService,
      effectProfile,
    });
    const vaultDir = this.resolvePath(options.vaultPath);
    const inputDir = join(vaultDir, 'input');
    const examplesDir = join(vaultDir, 'examples');
    const outputDir = join(vaultDir, 'output');
    const backupDir = join(vaultDir, 'output_backup');
    const manifestPath = join(vaultDir, '.fvtt-sync-manifest.json');

    this.ensureDir(vaultDir);
    this.ensureDir(inputDir);
    this.ensureDir(examplesDir);
    this.ensureDir(outputDir);
    this.ensureDir(backupDir);

    const result: ObsidianSyncResult = {
      inputDir,
      examplesDir,
      outputDir,
      backupDir,
      manifestPath,
      processed: 0,
      skipped: 0,
      failed: 0,
      backedUp: 0,
      createdExample: false,
      clearedBackup: false,
      failures: [],
    };

    if (options.clearBackup) {
      rmSync(backupDir, { recursive: true, force: true });
      this.ensureDir(backupDir);
      result.clearedBackup = true;
    }

    result.createdExample = this.ensureExampleFile(examplesDir);

    const manifest = this.loadManifest(manifestPath);
    const markdownFiles = this.collectMarkdownFiles(inputDir, options.excludeInputPaths ?? []);
    const forcedInputs = new Set(
      (options.forceInputPaths ?? []).map((path) => this.normalizeForComparison(this.resolvePath(path))),
    );
    const seen = new Set<string>();

    for (const inputPath of markdownFiles) {
      const relInput = this.normalizeRelPath(relative(inputDir, inputPath));
      seen.add(relInput);
      const outputRel = relInput.replace(/\.md$/i, '.json');
      const outputPath = join(outputDir, outputRel);

      try {
        const content = readFileSync(inputPath, 'utf-8');
        if (!this.isProjectMarkdown(content)) {
          delete manifest[relInput];
          result.skipped++;
          continue;
        }
        const hash = this.hashContent(
          `${content}\n#fvttVersion=${fvttVersion}\n#effectProfile=${effectProfile}`,
        );
        const prev = manifest[relInput];
        const forceProcess = forcedInputs.has(this.normalizeForComparison(inputPath));

        if (!forceProcess && prev?.status === 'success' && prev.hash === hash && existsSync(outputPath)) {
          result.skipped++;
          continue;
        }

        const isItem = detectItemRoute(content);
        let outputData: unknown;

        if (isItem) {
          let normalizedBody: string | undefined;
          if (this.itemAiNormalizer) {
            const bodyMatch = content.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/);
            const bodyText = bodyMatch?.[1] ?? '';
            normalizedBody = await this.itemAiNormalizer.normalizeItem(bodyText);
          }
          const parsedItem = this.itemParser.parse(content, normalizedBody);
          const { ItemGenerator } = await import('../generator/item-generator');
          const itemGenerator = new ItemGenerator({ fvttVersion });
          outputData = await itemGenerator.generate(parsedItem);
        } else {
          const route = this.parserFactory.detectRoute(content);
          const parsed = this.parserFactory.parse(content);
          outputData = await generator.generateForRoute(parsed, route);
        }

        if (existsSync(outputPath)) {
          const ts = new Date().toISOString().replace(/[:.]/g, '-');
          const backupRel = outputRel.replace(/\.json$/i, `.${ts}.json`);
          const backupPath = join(backupDir, backupRel);
          this.ensureDir(dirname(backupPath));
          renameSync(outputPath, backupPath);
          result.backedUp++;
        }

        this.ensureDir(dirname(outputPath));
        writeFileSync(outputPath, JSON.stringify(outputData, null, 2));

        manifest[relInput] = {
          hash,
          output: this.normalizeRelPath(relative(vaultDir, outputPath)),
          fvttVersion,
          effectProfile,
          status: 'success',
          lastSuccessAt: new Date().toISOString(),
          lastAttemptAt: new Date().toISOString(),
        };
        result.processed++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        manifest[relInput] = {
          hash: '',
          output: this.normalizeRelPath(relative(vaultDir, outputPath)),
          fvttVersion,
          effectProfile,
          status: 'failed',
          lastAttemptAt: new Date().toISOString(),
          lastError: message,
        };
        result.failed++;
        result.failures.push({ input: relInput, error: message });
      }
    }

    for (const [key, entry] of Object.entries(manifest)) {
      if (seen.has(key)) continue;
      const staleOutputPath = isAbsolute(entry.output)
        ? entry.output
        : resolve(vaultDir, entry.output);
      if (existsSync(staleOutputPath)) {
        rmSync(staleOutputPath, { force: true });
      }
      manifest[key] = {
        ...entry,
        status: 'stale',
        lastAttemptAt: new Date().toISOString(),
        lastError: 'source markdown removed',
      };
    }

    this.saveManifest(manifestPath, manifest);
    return result;
  }

  private ensureExampleFile(examplesDir: string): boolean {
    const target = join(examplesDir, 'npc-example.md');
    if (existsSync(target)) return false;

    const source = resolve(process.cwd(), 'templates', 'npc-example.md');
    if (existsSync(source)) {
      writeFileSync(target, readFileSync(source, 'utf-8'));
    } else {
      writeFileSync(
        target,
        ['---', '名称: 示例NPC', '类型: npc', '---', '# 说明', '请按模板填写字段。', ''].join('\n'),
      );
    }
    return true;
  }

  private loadManifest(manifestPath: string): Manifest {
    if (!existsSync(manifestPath)) return {};

    try {
      const raw = readFileSync(manifestPath, 'utf-8');
      const parsed = JSON.parse(raw) as Manifest;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private saveManifest(manifestPath: string, manifest: Manifest): void {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  private collectMarkdownFiles(dir: string, excludeInputPaths: string[]): string[] {
    if (!existsSync(dir)) return [];

    const excluded = new Set(
      excludeInputPaths.map((path) => this.normalizeForComparison(this.resolvePath(path))),
    );
    const files: string[] = [];
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);

      if (entry.isDirectory()) {
        files.push(...this.collectMarkdownFiles(full, excludeInputPaths));
        continue;
      }

      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith('.md')) continue;

      if (statSync(full).size === 0) continue;
      if (excluded.has(this.normalizeForComparison(full))) continue;
      files.push(full);
    }

    return files.sort();
  }

  private hashContent(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  private isProjectMarkdown(content: string): boolean {
    return content.trimStart().startsWith('---');
  }

  private ensureDir(path: string): void {
    mkdirSync(path, { recursive: true });
  }

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : resolve(process.cwd(), path);
  }

  private normalizeRelPath(path: string): string {
    return path.replace(/\\/g, '/');
  }

  private normalizeForComparison(path: string): string {
    return resolve(path).replace(/\\/g, '/').toLowerCase();
  }
}
