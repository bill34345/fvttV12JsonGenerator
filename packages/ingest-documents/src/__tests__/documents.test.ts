import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import { DocumentCandidateFilter, detectSignals } from '../filter';
import { cleanOcrText, isPdfPageLikelyNeedsOcr } from '../extractor';
import { protectMechanicalContent, restoreMechanicalContent } from '../translation';
import { DocumentConversionWorkflow } from '../workflow';
import type { DocumentExtractor, ExtractedDocument, MarkdownTranslationService } from '../types';

const scratch = join(process.cwd(), 'temp', 'document-ingest-tests');

afterEach(() => {
  if (existsSync(scratch)) rmSync(scratch, { recursive: true });
});

function sourceDocument(): ExtractedDocument {
  const page = (pageNumber: number, id: string, text: string) => ({
    pageNumber,
    width: 612,
    height: 792,
    method: 'native-pdf-text' as const,
    confidence: 1,
    warnings: [],
    blocks: [{
      id,
      pageNumber,
      text,
      boxes: [{ x: 10, y: 10, width: 200, height: 20 }],
      method: 'native-pdf-text' as const,
      confidence: 1,
      language: 'en' as const,
      bbox: { x: 10, y: 10, width: 200, height: 20 },
    }],
  });
  const pages = [
    page(1, 'p1-lore', '# Lore\nA beholder story and a table of contents.'),
    page(2, 'p2-hivemother', '# Beholder Hivemother CR 24\nAC 20\nHP 315\nSpeed Fly 40 ft.\nSTR 23 DEX 11 CON 25 INT 22 WIS 19 CHA 21\nTraits\nActions\nBonus Actions\nLegendary Actions\nMythic Actions\n+13 DC 21 6d10 + 6 6d6 12d8'),
    page(3, 'p3-other', '# Other Monster CR 3\nAC 13\nHP 40\nSpeed 30 ft.\nSTR 11 DEX 14 CON 12 INT 10 WIS 13 CHA 17\nActions'),
  ];
  return {
    schemaVersion: 1,
    sourcePath: 'fixture.pdf',
    fileName: 'fixture.pdf',
    kind: 'pdf',
    pageCount: pages.length,
    pages,
    blocks: pages.flatMap((pageValue) => pageValue.blocks),
    warnings: [],
  };
}

describe('document candidate filtering', () => {
  test('recognizes compact Chinese stat labels and cleans mixed-language OCR punctuation', () => {
    const text = '波\'巴拉（被附身)Bolbara\nAC13\nHP 40\n速度30尺\n力量11 敏捷14 体质12 智力10 感知13 魅力17\n挑战等级：3';
    const signals = detectSignals(text);
    expect(signals.armorClass).toBe(true);
    expect(signals.hitPoints).toBe(true);
    expect(signals.challenge).toBe(true);
    expect(cleanOcrText(text)).toContain('波巴拉（被附身）Bolbara');
    expect(cleanOcrText('动作 Multiatiack')).toContain('动作 Multiattack');
  });

  test('marks an empty or abnormal PDF text page for OCR fallback', () => {
    expect(isPdfPageLikelyNeedsOcr({ pageNumber: 1, width: 1, height: 1, blocks: [], method: 'empty', confidence: 0, warnings: [] })).toBe(true);
    expect(isPdfPageLikelyNeedsOcr({
      pageNumber: 2,
      width: 1,
      height: 1,
      blocks: [{ id: 'p2', pageNumber: 2, text: '.'.repeat(200), boxes: [], method: 'native-pdf-text', confidence: 1, language: 'en' }],
      method: 'native-pdf-text',
      confidence: 1,
      warnings: [],
    })).toBe(true);
  });

  test('excludes lore and identifies feature-rich stat blocks', () => {
    const result = new DocumentCandidateFilter().filter(sourceDocument());
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]?.label).toContain('Beholder Hivemother');
    expect(result.candidates.every((candidate) => candidate.status === 'high')).toBe(true);
    expect(result.excludedPages.map((page) => page.pageNumber)).toEqual([1]);
    expect(detectSignals(sourceDocument().pages[1]!.blocks[0]!.text).sections).toBeGreaterThanOrEqual(5);
  });

  test('keeps side-by-side candidates independent', () => {
    const document = sourceDocument();
    const right = structuredClone(document.pages[2]!.blocks[0]!);
    right.id = 'p3-right';
    right.text = right.text.replace('Other Monster', 'Right Monster');
    document.pages[2]!.blocks.push(right);
    document.blocks.push(right);
    const result = new DocumentCandidateFilter().filter(document);
    expect(result.candidates.filter((candidate) => candidate.pageNumber === 3)).toHaveLength(2);
    expect(new Set(result.candidates.map((candidate) => candidate.id)).size).toBe(result.candidates.length);
  });
});

describe('document conversion workflow', () => {
  test('filters before translating and preserves mechanical tokens', async () => {
    mkdirSync(scratch, { recursive: true });
    const calls: string[] = [];
    const extractor: DocumentExtractor = {
      async extract() {
        return sourceDocument();
      },
    };
    const translator: MarkdownTranslationService = {
      async translate(text) {
        calls.push(text);
        return { text: text.replace(/Beholder Hivemother/gi, '眼魔母巢').replace(/Other Monster/gi, '其他怪物') };
      },
    };
    const generated: string[] = [];
    const workflow = new DocumentConversionWorkflow({
      extractor,
      translationService: translator,
      convertMarkdown: async (options) => {
        generated.push(options.content);
        writeFileSync(options.outputPath, JSON.stringify({ name: 'translated actor' }));
        return { status: 'accepted', rawJson: { name: 'translated actor' } };
      },
    });
    const candidates = new DocumentCandidateFilter().filter(sourceDocument()).candidates;
    const hivemother = candidates.find((candidate) => candidate.label.includes('Hivemother'))!;
    const result = await workflow.run({
      inputPath: join(scratch, 'fixture.pdf'),
      runRoot: scratch,
      candidateIds: [hivemother.id],
      fvttVersion: '12',
      effectProfile: 'core',
    });

    expect(result.status).toBe('succeeded');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('Hivemother');
    expect(calls[0]).not.toContain('Lore');
    expect(generated).toHaveLength(1);
    expect(generated[0]).toContain('CR 24');
    expect(generated[0]).toContain('DC 21');
    expect(generated[0]).toContain('6d10 + 6');
    expect(result.translatedMarkdownPath).toBeDefined();
  });

  test('does not call a missing translation service and blocks formal output', async () => {
    let converted = false;
    const workflow = new DocumentConversionWorkflow({
      extractor: { extract: async () => sourceDocument() },
      convertMarkdown: async () => {
        converted = true;
        return { status: 'accepted' };
      },
    });
    const result = await workflow.run({ inputPath: join(scratch, 'fixture.pdf'), runRoot: scratch });
    expect(result.status).toBe('needs_review');
    expect(converted).toBe(false);
    expect(result.failures.every((failure) => failure.error.includes('翻译'))).toBe(true);
  });
});

test('protects page markers, DCs, distances, bonuses, and dice formulas', () => {
  const protectedValue = protectMechanicalContent('<!-- page=20 --> AC 20; DC 21; +13; 120 ft; 6d10 + 6; 12d8');
  expect(protectedValue.tokens.length).toBeGreaterThan(5);
  expect(protectedValue.text).not.toContain('DC 21');
  expect(protectedValue.text).not.toContain('6d10 + 6');
});

test('protects English feature labels before numeric placeholders and restores them after translation', () => {
  const source = [
    'Traits',
    'Domain Intrusion (Mythic Trait, 1/Day). The creature resets to 310 hit points.',
    'Actions',
    'Dream of Creation (Concentration). Summon one creature within 100 ft.',
  ].join('\n');
  const protectedValue = protectMechanicalContent(source);
  expect(protectedValue.tokens.map((token) => token.value)).toContain('Domain Intrusion (Mythic Trait, 1/Day)');
  expect(protectedValue.tokens.map((token) => token.value)).toContain('Dream of Creation (Concentration)');
  expect(protectedValue.text).not.toContain('Domain Intrusion');
  expect(protectedValue.text).not.toContain('Dream of Creation');

  const translated = protectedValue.text.replace('Traits', '特性').replace('Actions', '动作');
  const restored = restoreMechanicalContent(translated, protectedValue.tokens);
  expect(restored).toContain('Domain Intrusion (Mythic Trait, 1/Day)');
  expect(restored).toContain('Dream of Creation (Concentration)');
});

test('retries a translation that loses a protected token and only accepts an exact ordered set', async () => {
  mkdirSync(scratch, { recursive: true });
  let calls = 0;
  const source = sourceDocument();
  const candidates = new DocumentCandidateFilter().filter(source).candidates;
  const candidate = candidates.find((item) => item.label.includes('Hivemother'))!;
  const workflow = new DocumentConversionWorkflow({
    extractor: { extract: async () => source },
    translationService: {
      async translate(text) {
        calls += 1;
        if (calls === 1) {
          const firstToken = text.match(/__FVTT_MECHANICAL_[A-Z]+__/)?.[0];
          return { text: firstToken ? text.replace(firstToken, '') : text };
        }
        return { text: text.replace(/Beholder Hivemother/gi, '眼魔母巢') };
      },
    },
    convertMarkdown: async (options) => {
      writeFileSync(options.outputPath, JSON.stringify({ name: 'translated actor' }));
      return { status: 'accepted', rawJson: { name: 'translated actor' } };
    },
  });

  const result = await workflow.run({
    inputPath: join(scratch, 'fixture.pdf'),
    runRoot: scratch,
    candidateIds: [candidate.id],
  });

  expect(result.status).toBe('succeeded');
  expect(calls).toBe(2);
  expect(result.translatedCandidates[0]?.status).toBe('translated');
  expect(result.translatedCandidates[0]?.translatedMarkdown).toContain('CR 24');
  expect(result.translatedCandidates[0]?.warnings.map((warning) => warning.code)).toContain('PROTECTED_TOKEN_RETRY');
});
