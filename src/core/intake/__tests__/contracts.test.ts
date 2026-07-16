import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { validateMonsterIntakeIR } from '../validator';
import { buildValidLurkerIr, LURKER_SOURCE } from './fixtures/lurker';

describe('MonsterIntakeIR validation', () => {
  it('accepts a source-complete evidence-backed Lurker IR', () => {
    const result = validateMonsterIntakeIR(LURKER_SOURCE, buildValidLurkerIr());
    expect(result.blocking).toHaveLength(0);
  });

  it('rejects evidence whose UTF-16 range does not reproduce its quote', () => {
    const ir = buildValidLurkerIr();
    ir.claims[0]!.evidence[0]!.start += 1;
    const result = validateMonsterIntakeIR(LURKER_SOURCE, ir);
    expect(result.blocking.some((finding) => finding.code === 'EVIDENCE_MISMATCH')).toBe(true);
  });

  it('requires every core field and an evidence claim', () => {
    const ir = buildValidLurkerIr();
    delete (ir.creature.attributes as Partial<typeof ir.creature.attributes>).ac;
    ir.claims = ir.claims.filter((claim) => claim.path !== '/creature/attributes/ac');
    const result = validateMonsterIntakeIR(LURKER_SOURCE, ir);
    expect(result.blocking.some((finding) => finding.path === '/creature/attributes/ac')).toBe(true);
  });

  it('rejects invalid dice formulas and uncovered non-whitespace source', () => {
    const ir = buildValidLurkerIr();
    ir.creature.attributes.hp.formula = '65 hit points';
    ir.coverage = [{
      start: 0,
      end: 10,
      quote: LURKER_SOURCE.slice(0, 10),
      classification: 'narrative',
      claimPaths: [],
    }];
    const result = validateMonsterIntakeIR(LURKER_SOURCE, ir);
    expect(result.blocking.some((finding) => finding.code === 'INVALID_DICE_FORMULA')).toBe(true);
    expect(result.blocking.some((finding) => finding.code === 'UNCOVERED_SOURCE')).toBe(true);
  });

  it('rejects conflicting explicit claims for the same field', () => {
    const ir = buildValidLurkerIr();
    ir.claims.find((claim) => claim.path === '/creature/attributes/ac')!.value = 14;
    ir.claims.push({
      path: '/creature/attributes/ac',
      valueKind: 'explicit',
      evidence: [{
        start: LURKER_SOURCE.indexOf('HP 65'),
        end: LURKER_SOURCE.indexOf('HP 65') + 'HP 65'.length,
        quote: 'HP 65',
      }],
      confidence: 'high',
      value: 20,
    });
    const result = validateMonsterIntakeIR(LURKER_SOURCE, ir);
    expect(result.blocking.some((finding) => finding.code === 'CONFLICTING_CLAIMS')).toBe(true);
  });

  it('rejects conflicting explicit AC values even when AI omits the second claim', () => {
    const note = '\n旁注：该生物的护甲等级为16，以上AC 14为旧数据。';
    const source = `${LURKER_SOURCE}${note}`;
    const ir = buildValidLurkerIr();
    ir.source = {
      sha256: createHash('sha256').update(source).digest('hex'),
      length: source.length,
    };
    ir.coverage.push({
      start: LURKER_SOURCE.length,
      end: source.length,
      quote: note,
      classification: 'narrative',
      claimPaths: [],
    });

    const result = validateMonsterIntakeIR(source, ir);
    const firstCandidateOnly = validateMonsterIntakeIR(source, ir, {
      coverageRange: { start: 0, end: LURKER_SOURCE.length },
    });

    expect(result.blocking.some((finding) => finding.code === 'CONFLICTING_SOURCE_VALUES')).toBe(true);
    expect(firstCandidateOnly.blocking.some((finding) => finding.code === 'CONFLICTING_SOURCE_VALUES')).toBe(false);
  });
});
