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

  it('does not require evidence for absent nullable optional mechanics', () => {
    const ir = buildValidLurkerIr();
    (ir.creature.attributes as unknown as { initiative: null }).initiative = null;
    ir.claims = ir.claims.filter((claim) => claim.path !== '/creature/attributes/initiative');

    const result = validateMonsterIntakeIR(LURKER_SOURCE, ir);

    expect(result.blocking.some((finding) => (
      finding.code === 'UNSUPPORTED_MECHANICAL_VALUE'
      && finding.path === '/creature/attributes/initiative'
    ))).toBe(false);
  });

  it('fails closed on a non-string biography instead of reaching the renderer', () => {
    const ir = buildValidLurkerIr() as any;
    ir.creature.biography = ['provider', 'array'];

    expect(() => validateMonsterIntakeIR(LURKER_SOURCE, ir)).not.toThrow();
    expect(validateMonsterIntakeIR(LURKER_SOURCE, ir).blocking).toContainEqual(expect.objectContaining({
      code: 'INVALID_BIOGRAPHY',
      path: '/creature/biography',
    }));
  });

  it('treats a null optional biography as absent provider data', () => {
    const ir = buildValidLurkerIr() as any;
    ir.creature.biography = null;

    expect(validateMonsterIntakeIR(LURKER_SOURCE, ir).blocking).not.toContainEqual(expect.objectContaining({
      code: 'INVALID_BIOGRAPHY',
      path: '/creature/biography',
    }));
  });

  it('fails closed on a non-empty array in optional language custom text', () => {
    const ir = buildValidLurkerIr() as any;
    ir.creature.languages.custom = ['Draconic'];

    expect(validateMonsterIntakeIR(LURKER_SOURCE, ir).blocking).toContainEqual(expect.objectContaining({
      code: 'INVALID_LANGUAGE_CUSTOM',
      path: '/creature/languages/custom',
    }));
  });

  it('fails closed on non-string identity and feature text fields', () => {
    const ir = buildValidLurkerIr() as any;
    ir.creature.identity.name = {};
    ir.creature.identity.creatureType = [];
    ir.creature.traits[0].name = {};
    ir.creature.traits[0].description = [];

    expect(() => validateMonsterIntakeIR(LURKER_SOURCE, ir)).not.toThrow();
    const paths = validateMonsterIntakeIR(LURKER_SOURCE, ir).blocking.map((finding) => finding.path);
    expect(paths).toContain('/creature/identity/name');
    expect(paths).toContain('/creature/identity/creatureType');
    expect(paths).toContain('/creature/traits/0/name');
    expect(paths).toContain('/creature/traits/0/description');
  });

  it.each([
    {
      label: 'object damage container',
      damage: { formula: '1d6' },
      code: 'INVALID_DAMAGE',
      path: '/creature/traits/0/damage',
    },
    {
      label: 'null damage element',
      damage: [null],
      code: 'INVALID_DAMAGE_PART',
      path: '/creature/traits/0/damage/0',
    },
    {
      label: 'primitive damage element',
      damage: [3],
      code: 'INVALID_DAMAGE_PART',
      path: '/creature/traits/0/damage/0',
    },
    {
      label: 'object damage formula',
      damage: [{ formula: {} }],
      code: 'INVALID_DICE_FORMULA',
      path: '/creature/traits/0/damage/0/formula',
    },
  ])('fails closed on a malformed $label', ({ damage, code, path }) => {
    const ir = buildValidLurkerIr() as any;
    ir.creature.traits[0].damage = damage;

    expect(() => validateMonsterIntakeIR(LURKER_SOURCE, ir)).not.toThrow();
    expect(validateMonsterIntakeIR(LURKER_SOURCE, ir).blocking).toContainEqual(expect.objectContaining({ code, path }));
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
