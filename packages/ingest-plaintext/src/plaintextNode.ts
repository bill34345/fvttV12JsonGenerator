import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { PlainTextAuditWorkflow } from './plaintextAudit';
import {
  normalizeBlock,
  parseCreatureBlock,
  parseYamlNormalizedBlock,
  splitCollection,
} from './plaintext';
import type {
  IngestedCreatureFile,
  PlainTextAiNormalizer,
} from './plaintext';

/**
 * Node-only adapter for the legacy path based ingest workflow. The parser,
 * normalizer, and Markdown projection remain in the browser-safe core.
 */
export interface PlainTextIngestionOptions {
  sourcePath: string;
  emitDir: string;
  dryRun?: boolean;
  enableAiNormalize?: boolean;
}

export interface PlainTextIngestionResult {
  sourcePath: string;
  emitDir: string;
  dryRun: boolean;
  usedAi: boolean;
  files: IngestedCreatureFile[];
}

export class PlainTextIngestionWorkflow {
  private readonly aiNormalizer?: PlainTextAiNormalizer;

  constructor(options: { aiNormalizer?: PlainTextAiNormalizer | null } = {}) {
    this.aiNormalizer = options.aiNormalizer ?? undefined;
  }

  public async ingest(options: PlainTextIngestionOptions): Promise<PlainTextIngestionResult> {
    const sourcePath = this.resolvePath(options.sourcePath);
    const emitDir = this.resolvePath(options.emitDir);
    const middleDir = join(dirname(emitDir), 'middle');
    const auditDir = join(dirname(emitDir), 'audits');
    const raw = readFileSync(sourcePath, 'utf-8');
    const blocks = splitCollection(raw);
    const files: IngestedCreatureFile[] = [];

    for (const block of blocks) {
      const ruleBasedNormalized = normalizeBlock(block.rawBlock);
      let normalized = ruleBasedNormalized;

      if (options.enableAiNormalize && this.aiNormalizer) {
        try {
          const aiText = await this.aiNormalizer.normalizeBlock(ruleBasedNormalized);
          const isYaml = aiText.trim().startsWith('---');
          const isMarkdown = aiText.includes('# **');
          if (isYaml || isMarkdown) normalized = aiText;
        } catch {
          // Preserve the historical compatibility fallback to rule parsing.
        }
      }

      const creature = normalized.trim().startsWith('---')
        ? parseYamlNormalizedBlock(normalized, block.heading)
        : parseCreatureBlock(normalized);
      files.push(creature);
    }

    if (!options.dryRun) {
      mkdirSync(middleDir, { recursive: true });
      mkdirSync(auditDir, { recursive: true });
      for (const file of files) {
        const outputPath = join(middleDir, file.fileName);
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, file.markdown);
      }

      new PlainTextAuditWorkflow().audit(middleDir, sourcePath);
    }

    return {
      sourcePath,
      emitDir: middleDir,
      dryRun: Boolean(options.dryRun),
      usedAi: Boolean(options.enableAiNormalize && this.aiNormalizer),
      files,
    };
  }

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : resolve(process.cwd(), path);
  }
}

export * from './plaintext';
