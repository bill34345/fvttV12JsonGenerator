import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import {
  buildForgeActorRequest,
  convertFinalActorSource,
} from '@fvtt-json-generator/forge-browser-runtime';
import {
  normalizeBlock,
  parseCreatureBlock,
  splitCollection,
} from '@fvtt-json-generator/ingest-plaintext/plaintext-core';
import {
  analyzePlaintextActorSource,
  buildPlaintextAuditFindings,
} from '../packages/forge-browser-runtime/src/plaintext';

const COLLECTION = readFileSync(resolve('tests/fixtures/plaintext/月蚀矿腐化生物数据.md'), 'utf8');
const BLOCKS = splitCollection(COLLECTION);

describe('Forge browser-safe plaintext Actor analysis', () => {
  test('pauses on one bilingual entity with exact source evidence and Node parser parity', () => {
    const source = BLOCKS[0]!.quote;
    const analysis = analyzePlaintextActorSource(source);
    const expected = parseCreatureBlock(normalizeBlock(BLOCKS[0]!.rawBlock));
    expect(analysis.status).toBe('ready_to_generate');
    expect(analysis.rawSourceHash).toBe(hashSource(source));
    expect(analysis.candidate).toEqual(expect.objectContaining({
      start: 0,
      end: source.length,
      quote: source,
      label: expect.stringContaining('Scuttling Serpentmaw'),
    }));
    expect(analysis.creature).toMatchObject({
      chineseName: expected.chineseName,
      englishName: expected.englishName,
      frontmatter: expected.frontmatter,
      sections: expected.sections,
    });
    expect(analysis.canonicalSource).toBe(expected.markdown);
    expect(analysis).not.toHaveProperty('response');
    expect(analysis).not.toHaveProperty('artifactHash');
  });

  test('blocks zero, multiple, and uncovered source text without selecting a first candidate', () => {
    const zero = analyzePlaintextActorSource('ordinary prose without a creature heading');
    expect(zero.status).toBe('needs_review');
    expect(zero.errorCode).toBe('no_entities');
    expect(zero.canonicalSource).toBeUndefined();

    const multiple = analyzePlaintextActorSource(`${BLOCKS[0]!.quote}\n${BLOCKS[1]!.quote}`);
    expect(multiple.status).toBe('needs_review');
    expect(multiple.errorCode).toBe('multiple_entities');
    expect(multiple.candidates).toHaveLength(2);
    expect(multiple.canonicalSource).toBeUndefined();

    const uncovered = analyzePlaintextActorSource(`unreviewed prelude\n${BLOCKS[0]!.quote}`);
    expect(uncovered.status).toBe('needs_review');
    expect(uncovered.errorCode).toBe('coverage_gap');
    expect(uncovered.canonicalSource).toBeUndefined();
  });

  test('preserves exact CRLF evidence offsets while keeping parser semantics identical', () => {
    const source = BLOCKS[0]!.quote.replace(/\n/gu, '\r\n');
    const blocks = splitCollection(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ start: 0, end: source.length, quote: source });
    const analysis = analyzePlaintextActorSource(source);
    expect(analysis.status).toBe('ready_to_generate');
    expect(analysis.candidate).toMatchObject({ start: 0, end: source.length, quote: source });
    const expected = parseCreatureBlock(normalizeBlock(BLOCKS[0]!.rawBlock));
    expect(analysis.creature).toMatchObject({
      chineseName: expected.chineseName,
      englishName: expected.englishName,
    });
  });

  test('sends one accepted plaintext candidate through the formal Actor workflow with source-faithful semantics', async () => {
    const source = BLOCKS[0]!.quote;
    const analysis = analyzePlaintextActorSource(source);
    expect(analysis.status).toBe('ready_to_generate');
    if (!analysis.canonicalSource) throw new Error('Expected canonical plaintext Actor source.');
    const response = await convertFinalActorSource(buildForgeActorRequest({
      content: analysis.canonicalSource,
      displayName: 'Plaintext semantic acceptance',
      requestId: 'plaintext-semantic-acceptance',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
    }));
    expect(response).toHaveProperty('result.status', 'accepted');
    if (!('result' in response) || response.result.status !== 'accepted') throw new Error('Expected accepted Actor response.');
    expect(response.result.actorVerification.actor).toMatchObject({
      name: '蛇口蛮蟹 (Scuttling Serpentmaw)',
      hp: { value: 75, max: 75 },
      ac: { flat: 17, calc: 'flat' },
      senses: { ranges: { blindsight: 60 } },
    });
    expect(response.result.actorVerification.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '爪击 (Claw)', activityTypes: expect.arrayContaining(['attack']) }),
      expect.objectContaining({ name: '毒液咬击 (Venomous Bite)', activityTypes: expect.arrayContaining(['attack', 'save']) }),
      expect.objectContaining({ name: '缩壳防御 (Retract)', effects: expect.arrayContaining([
        expect.objectContaining({ sourceDerivedAcEffect: true, sourceText: '+9 AC' }),
      ]) }),
    ]));
  });

  test('maps legacy audit warnings and errors to blocking review findings while info remains non-blocking', () => {
    const findings = buildPlaintextAuditFindings({
      chineseName: '审计生物',
      englishName: 'Audit Creature',
      frontmatter: {
        名称: '审计生物 (Audit Creature)',
        动作: [
          { 名称: '', 类型: 'attack', 攻击类型: 'invalid', 目标: { 类型: 'invalid' }, 伤害: [{ 类型: '未知' }] },
        ],
      },
    });
    expect(findings.some((finding) => finding.code === 'PLAINTEXT_AUDIT_ERROR' && finding.blocking)).toBe(true);
    expect(findings.some((finding) => finding.code === 'PLAINTEXT_AUDIT_WARNING' && finding.blocking)).toBe(true);
    expect(findings.some((finding) => finding.code === 'PLAINTEXT_AUDIT_INFO' && !finding.blocking)).toBe(true);
  });

  test('keeps the browser core free of Node imports', () => {
    for (const path of [
      'packages/ingest-plaintext/src/plaintext.ts',
      'packages/ingest-plaintext/src/plaintextAuditCore.ts',
      'packages/forge-browser-runtime/src/plaintext.ts',
    ]) {
      expect(readFileSync(resolve(path), 'utf8')).not.toMatch(/from\s+['"]node:/u);
    }
  });
});
