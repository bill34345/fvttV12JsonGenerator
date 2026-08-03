import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import {
  createDefaultDocumentExtractor,
  documentKindForPath,
} from './extractor';
import { DocumentCandidateFilter } from './filter';
import { MarkdownTranslationWorkflow } from './translation';
import type {
  DocumentCandidate,
  DocumentConversionDependencies,
  DocumentConversionJsonResult,
  DocumentConversionOptions,
  DocumentConversionResult,
  DocumentOutputFile,
  ExtractedDocument,
  TranslatedCandidate,
} from './types';

export class DocumentConversionWorkflow {
  private readonly dependencies: Required<Pick<DocumentConversionDependencies, 'extractor' | 'filter' | 'translation'>> & DocumentConversionDependencies;

  constructor(dependencies: DocumentConversionDependencies = {}) {
    this.dependencies = {
      extractor: dependencies.extractor ?? createDefaultDocumentExtractor(),
      filter: dependencies.filter ?? new DocumentCandidateFilter(),
      translation: dependencies.translation ?? new MarkdownTranslationWorkflow(),
      ...dependencies,
    };
  }

  async run(options: DocumentConversionOptions): Promise<DocumentConversionResult> {
    const inputPath = resolve(options.inputPath);
    const runId = randomUUID();
    const runPath = resolve(options.runRoot ?? join(process.cwd(), '.local', 'document-runs'), runId);
    mkdirSync(runPath, { recursive: true });

    const extracted = await this.dependencies.extractor.extract(inputPath, {
      engine: options.engine ?? 'auto',
      language: options.language ?? 'auto',
    });
    const rawMarkdownPath = join(runPath, 'raw-extracted.md');
    writeFileSync(rawMarkdownPath, renderRawExtractedMarkdown(extracted), 'utf8');

    const filtered = this.dependencies.filter.filter(extracted);
    const candidatesPath = join(runPath, 'document-candidates.json');
    writeJson(candidatesPath, filtered);
    const reportPath = join(runPath, 'extraction-report.json');
    writeJson(reportPath, {
      schemaVersion: 1,
      stage: 'filtered',
      sequence: ['extracted', 'filtered'],
      sourcePath: inputPath,
      fileName: basename(inputPath),
      kind: documentKindForPath(inputPath),
      pageCount: extracted.pageCount,
      extractedBlocks: extracted.blocks.length,
      candidates: filtered.candidates.map((candidate) => ({
        id: candidate.id,
        label: candidate.label,
        pageNumber: candidate.pageNumber,
        status: candidate.status,
        confidence: candidate.confidence,
        reason: candidate.reason,
      })),
      excludedPages: filtered.excludedPages,
      warnings: [...extracted.warnings, ...filtered.warnings],
    });

    const selectedCandidateIds = selectCandidates(filtered.candidates, options.candidateIds);
    const baseResult = {
      schemaVersion: 1 as const,
      runId,
      runPath,
      sourcePath: inputPath,
      rawMarkdownPath,
      candidatesPath,
      reportPath,
      pageCount: extracted.pageCount,
      candidates: filtered.candidates,
      selectedCandidateIds,
      translatedCandidates: [] as TranslatedCandidate[],
      outputFiles: baseOutputFiles(rawMarkdownPath, candidatesPath, reportPath),
      warnings: [...extracted.warnings, ...filtered.warnings],
      failures: [] as Array<{ candidateId?: string; error: string }>,
    };

    if (options.extractOnly) {
      const result: DocumentConversionResult = { ...baseResult, status: 'extracted', stage: 'filtered' };
      writeJson(join(runPath, 'document-result.json'), result);
      return result;
    }
    if (selectedCandidateIds.length === 0) {
      const result: DocumentConversionResult = {
        ...baseResult,
        status: 'needs_review',
        stage: 'filtered',
        warnings: [...baseResult.warnings, '没有可自动处理的高置信度 NPC/怪物候选。'],
      };
      writeJson(join(runPath, 'document-result.json'), result);
      return result;
    }

    const translatedCandidates = await this.dependencies.translation.translateCandidates(
      filtered.candidates,
      selectedCandidateIds,
      {
        targetLanguage: options.targetLanguage ?? 'zh-CN',
        sourceLanguage: options.language ?? 'auto',
        service: this.dependencies.translationService,
      },
    );
    const translatedMarkdownPath = join(runPath, 'translated.md');
    writeFileSync(translatedMarkdownPath, renderTranslatedMarkdown(translatedCandidates, filtered.candidates), 'utf8');
    baseResult.outputFiles.push({
      path: translatedMarkdownPath,
      fileName: 'translated.md',
      contentType: 'text/markdown; charset=utf-8',
      label: '翻译后候选 Markdown',
    });
    baseResult.warnings.push(...translatedCandidates.flatMap((candidate) => candidate.warnings.map((warning) => warning.message)));

    const failures = [...baseResult.failures];
    const generatedFiles: DocumentOutputFile[] = [];
    for (const translated of translatedCandidates) {
      const candidate = filtered.candidates.find((item) => item.id === translated.candidateId);
      if (!candidate) {
        failures.push({ candidateId: translated.candidateId, error: '翻译结果找不到来源候选。' });
        continue;
      }
      if (translated.status === 'needs_review') {
        failures.push({ candidateId: candidate.id, error: translated.warnings.map((warning) => warning.message).join('；') || '翻译需要人工复核。' });
        continue;
      }
      const generated = await this.generateCandidate(options, runPath, candidate, translated);
      generatedFiles.push(...generated.files);
      if (generated.failure) failures.push({ candidateId: candidate.id, error: generated.failure });
    }

    const outputFiles = [...baseResult.outputFiles, ...generatedFiles];
    const acceptedCount = generatedFiles.filter((file) => file.contentType.startsWith('application/json')).length;
    const selectedCount = selectedCandidateIds.length;
    const status: DocumentConversionResult['status'] = failures.length === 0 && acceptedCount === selectedCount
      ? 'succeeded'
      : acceptedCount > 0
        ? 'partial'
        : 'needs_review';
    const result: DocumentConversionResult = {
      ...baseResult,
      status,
      stage: acceptedCount > 0 ? 'generated' : 'translated',
      translatedMarkdownPath,
      translatedCandidates,
      outputFiles,
      failures,
    };
    writeJson(reportPath, {
      schemaVersion: 1,
      stage: result.stage,
      sequence: ['extracted', 'filtered', 'translated', ...(this.dependencies.intake ? ['intake'] : []), ...(acceptedCount > 0 ? ['generated'] : [])],
      sourcePath: inputPath,
      pageCount: extracted.pageCount,
      selectedCandidateIds,
      candidates: filtered.candidates,
      translatedCandidates,
      failures,
      warnings: result.warnings,
    });
    writeJson(join(runPath, 'document-result.json'), result);
    return result;
  }

  private async generateCandidate(
    options: DocumentConversionOptions,
    runPath: string,
    candidate: DocumentCandidate,
    translated: TranslatedCandidate,
  ): Promise<{ files: DocumentOutputFile[]; failure?: string }> {
    const candidatePath = join(runPath, 'candidates', safeFilePart(candidate.id));
    mkdirSync(candidatePath, { recursive: true });
    const translatedPath = join(candidatePath, 'translated.md');
    const rawPath = join(candidatePath, 'raw.md');
    writeFileSync(rawPath, candidate.rawMarkdown, 'utf8');
    writeFileSync(translatedPath, translated.translatedMarkdown, 'utf8');
    const files: DocumentOutputFile[] = [
      { path: rawPath, fileName: `${safeFilePart(candidate.id)}-raw.md`, contentType: 'text/markdown; charset=utf-8', label: `${candidate.label} · 原始候选 Markdown`, candidateId: candidate.id },
      { path: translatedPath, fileName: `${safeFilePart(candidate.id)}-translated.md`, contentType: 'text/markdown; charset=utf-8', label: `${candidate.label} · 翻译 Markdown`, candidateId: candidate.id },
    ];

    if (this.dependencies.intake) {
      const intakeRoot = join(candidatePath, 'intake');
      const result = await this.dependencies.intake({
        source: translated.translatedMarkdown,
        sourceName: `${candidate.id}.md`,
        runRoot: intakeRoot,
        vaultPath: join(intakeRoot, 'vault'),
        fvttVersion: options.fvttVersion,
        effectProfile: options.effectProfile,
        iconOptions: options.iconOptions,
      });
      const creature = result?.creatures?.find((item) => item.status === 'accepted') ?? result?.creatures?.[0];
      if (!creature?.markdownPath || !creature.actorPath || creature.status !== 'accepted') {
        return { files, failure: `Intake 未接受候选 ${candidate.label}。` };
      }
      const standardPath = join(candidatePath, 'standard.md');
      const actorPath = join(candidatePath, 'actor.json');
      copyFileSync(creature.markdownPath, standardPath);
      copyFileSync(creature.actorPath, actorPath);
      files.push(
        { path: standardPath, fileName: `${safeFilePart(candidate.id)}-standard.md`, contentType: 'text/markdown; charset=utf-8', label: `${candidate.label} · 标准项目 Markdown`, candidateId: candidate.id },
        { path: actorPath, fileName: `${safeFilePart(candidate.id)}.json`, contentType: 'application/json; charset=utf-8', label: `${candidate.label} · Actor JSON`, candidateId: candidate.id },
      );
      copyToRequestedOutput(options.outputPath, actorPath, candidate, selectedOutputIsSingle(options, candidate));
      return { files };
    }

    if (!this.dependencies.convertMarkdown) {
      return { files, failure: '没有配置现有 Markdown → JSON workflow。' };
    }
    const standardPath = join(candidatePath, 'standard.md');
    const actorPath = join(candidatePath, 'actor.json');
    writeFileSync(standardPath, translated.translatedMarkdown, 'utf8');
    const generated: DocumentConversionJsonResult = await this.dependencies.convertMarkdown({
      content: translated.translatedMarkdown,
      sourcePath: standardPath,
      outputPath: actorPath,
      fvttVersion: options.fvttVersion,
      effectProfile: options.effectProfile,
      translationService: null,
      iconOptions: options.iconOptions,
    });
    if (generated.status !== 'accepted') {
      return { files, failure: `现有 Markdown → JSON workflow 返回 ${generated.status}。` };
    }
    files.push(
      { path: standardPath, fileName: `${safeFilePart(candidate.id)}-standard.md`, contentType: 'text/markdown; charset=utf-8', label: `${candidate.label} · 标准项目 Markdown`, candidateId: candidate.id },
      { path: actorPath, fileName: `${safeFilePart(candidate.id)}.json`, contentType: 'application/json; charset=utf-8', label: `${candidate.label} · Actor JSON`, candidateId: candidate.id },
    );
    copyToRequestedOutput(options.outputPath, actorPath, candidate, selectedOutputIsSingle(options, candidate));
    return { files };
  }
}

export function renderRawExtractedMarkdown(document: ExtractedDocument): string {
  const sections = [`# 原始文档提取：${document.fileName}`, '', `<!-- source-kind=${document.kind} pages=${document.pageCount} -->`, ''];
  for (const page of document.pages) {
    sections.push(`## Page ${page.pageNumber}`, `<!-- page-method=${page.method} confidence=${page.confidence.toFixed(3)} -->`, '');
    for (const block of page.blocks) {
      sections.push(`### ${block.id}`, `<!-- block-method=${block.method} confidence=${block.confidence.toFixed(3)} bbox=${JSON.stringify(block.bbox ?? null)} -->`, block.text.trim(), '');
    }
  }
  return `${sections.join('\n').trim()}\n`;
}

function renderTranslatedMarkdown(translated: TranslatedCandidate[], candidates: DocumentCandidate[]): string {
  const sections = ['# 已筛选候选的翻译 Markdown', ''];
  for (const item of translated) {
    const candidate = candidates.find((value) => value.id === item.candidateId);
    sections.push(`## ${candidate?.label ?? item.candidateId}`, `<!-- candidate-id=${item.candidateId} status=${item.status} -->`, item.translatedMarkdown.trim(), '');
  }
  return `${sections.join('\n').trim()}\n`;
}

function selectCandidates(candidates: DocumentCandidate[], requested: string[] | undefined): string[] {
  if (requested && requested.length > 0) {
    const byId = new Set(candidates.map((candidate) => candidate.id));
    const invalid = requested.filter((id) => !byId.has(id));
    if (invalid.length > 0) throw new Error(`未知文档候选 ID：${invalid.join(', ')}`);
    return [...new Set(requested)];
  }
  return candidates.filter((candidate) => candidate.status === 'high').map((candidate) => candidate.id);
}

function baseOutputFiles(raw: string, candidates: string, report: string): DocumentOutputFile[] {
  return [
    { path: raw, fileName: 'raw-extracted.md', contentType: 'text/markdown; charset=utf-8', label: '原始提取 Markdown' },
    { path: candidates, fileName: 'document-candidates.json', contentType: 'application/json; charset=utf-8', label: '候选怪物清单' },
    { path: report, fileName: 'extraction-report.json', contentType: 'application/json; charset=utf-8', label: '识别报告' },
  ];
}

function copyToRequestedOutput(outputPath: string | undefined, actorPath: string, candidate: DocumentCandidate, single: boolean): void {
  if (!outputPath) return;
  const target = single
    ? resolve(outputPath)
    : join(resolve(outputPath), `${safeFilePart(candidate.label)}.json`);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(actorPath, target);
}

function selectedOutputIsSingle(options: DocumentConversionOptions, candidate: DocumentCandidate): boolean {
  return Boolean(options.outputPath && options.candidateIds?.length === 1 && options.candidateIds[0] === candidate.id);
}

function safeFilePart(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '_').slice(0, 120) || 'candidate';
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
