import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { anchorIrEvidence } from '@fvtt-json-generator/intake-ai/orchestrator';
import { validateMonsterIntakeIR } from '@fvtt-json-generator/intake-ai/validator';
import { buildValidLurkerIr, LURKER_SOURCE } from '../src/core/intake/__tests__/fixtures/lurker';

function movementSample(line: string, quotes: string[]) {
  const source = `${LURKER_SOURCE}\n${line}`;
  const ir = buildValidLurkerIr();
  ir.source = { sha256: createHash('sha256').update(source).digest('hex'), length: source.length };
  ir.creature.attributes.movement = { fly: 25, swim: 10 };
  const claim = ir.claims.find(value => value.path === '/creature/attributes/movement')!;
  claim.evidence = quotes.map(quote => {
    const start = source.lastIndexOf(quote);
    return { start, end: start + quote.length, quote };
  });
  ir.coverage = [{ start: 0, end: source.length, quote: source, classification: 'mechanical', claimPaths: ir.claims.map(value => value.path) }];
  return { source, ir, candidate: { id: 'movement', label: 'Movement', start: 0, end: source.length, quote: source } };
}

describe('source-scoped movement qualifiers', () => {
  test('restores hover from separate exact movement quotes in an interleaved native PDF line', () => {
    const sample = movementSample('Speed 5 ft., Fly 25 ft. Type Elemental\n(Hover), Swim 10 ft.', ['Fly 25 ft.', '(Hover), Swim 10 ft.']);
    const anchored = anchorIrEvidence(sample.source, sample.candidate, sample.ir);
    expect(anchored.creature.attributes.movement).toEqual({ fly: 25, swim: 10, hover: true });
    expect(sample.ir.creature.attributes.movement.hover).toBeUndefined();
  });

  test('blocks a source-proven hover omission even when IR and its future projection would agree', () => {
    const sample = movementSample('Speed fly 25 ft. (hover), swim 10 ft.', ['Speed fly 25 ft. (hover), swim 10 ft.']);
    const findings = validateMonsterIntakeIR(sample.source, sample.ir).blocking;
    expect(findings).toContainEqual(expect.objectContaining({ code: 'SOURCE_HOVER_OMITTED', path: '/creature/attributes/movement/hover' }));
  });

  test('retains a source-explicit Chinese qualifier across two exact quotes', () => {
    const sample = movementSample('速度：飞行25尺\n（悬浮），游泳10尺', ['飞行25尺', '（悬浮），游泳10尺']);
    expect(anchorIrEvidence(sample.source, sample.candidate, sample.ir).creature.attributes.movement.hover).toBe(true);
  });

  test('does not grant hover from a different creature outside the selected candidate', () => {
    const sample = movementSample('Speed fly 25 ft. (hover), swim 10 ft.', ['Speed fly 25 ft. (hover), swim 10 ft.']);
    const candidate = { id: 'first', label: 'First', start: 0, end: LURKER_SOURCE.length, quote: LURKER_SOURCE };
    expect(anchorIrEvidence(sample.source, candidate, sample.ir).creature.attributes.movement.hover).toBeUndefined();
  });

  test('direct validation blocks an unproven hover value before normalization', () => {
    const sample = movementSample('Speed fly 25 ft.', ['Speed fly 25 ft.']);
    sample.ir.creature.attributes.movement.hover = true;
    expect(validateMonsterIntakeIR(sample.source, sample.ir).blocking).toContainEqual(expect.objectContaining({ code: 'UNSUPPORTED_HOVER' }));
  });

  test('does not combine movement with hover mentioned in a trait', () => {
    const sample = movementSample('Speed fly 25 ft.\nTraits\nSilent Orbit. It can hover while hidden.', ['Speed fly 25 ft.']);
    expect(anchorIrEvidence(sample.source, sample.candidate, sample.ir).creature.attributes.movement.hover).toBeUndefined();
  });

  test('does not treat an explicit cannot-hover qualifier as hover', () => {
    const sample = movementSample('Speed fly 25 ft. (cannot hover)', ['Speed fly 25 ft. (cannot hover)']);
    sample.ir.creature.attributes.movement.hover = true;
    expect(anchorIrEvidence(sample.source, sample.candidate, sample.ir).creature.attributes.movement.hover).toBeUndefined();
  });

  test('does not grant hover from a fabricated quote and keeps invalid evidence blocking', () => {
    const sample = movementSample('Speed fly 25 ft.', ['Speed fly 25 ft.']);
    sample.ir.claims.find(value => value.path === '/creature/attributes/movement')!.evidence[0]!.quote += ' (hover)';
    const anchored = anchorIrEvidence(sample.source, sample.candidate, sample.ir);
    expect(anchored.creature.attributes.movement.hover).toBeUndefined();
    expect(validateMonsterIntakeIR(sample.source, anchored).blocking.some(value => value.code.startsWith('EVIDENCE_'))).toBe(true);
  });

  test('does not combine remote evidence spans into a local qualifier', () => {
    const sample = movementSample(`Speed fly 25 ft.\n${'Unrelated narration. '.repeat(12)}\n(hover)`, ['Speed fly 25 ft.', '(hover)']);
    expect(anchorIrEvidence(sample.source, sample.candidate, sample.ir).creature.attributes.movement.hover).toBeUndefined();
  });
});
