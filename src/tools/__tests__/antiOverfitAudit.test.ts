import { describe, expect, it } from 'bun:test';
import { auditAntiOverfitText } from '../antiOverfitAudit';

describe('anti-overfit audit', () => {
  it('flags action-name predicates that can hide sample-specific mechanics', () => {
    const findings = auditAntiOverfitText(
      'src/core/generator/activity-derivation.ts',
      `
function isMentalAction(actionName: string): boolean {
  return /Dominate|Charm|Control/i.test(actionName);
}
`,
    );

    expect(findings).toEqual([
      expect.objectContaining({
        rule: 'action-name-predicate',
        line: 2,
      }),
    ]);
  });

  it('flags action-name branches that assign fixed mechanics', () => {
    const findings = auditAntiOverfitText(
      'src/core/generator/actor-special.ts',
      `
if (/Venomous Bite|Brine-shock/i.test(text)) {
  return { save: { dc: 14, ability: 'con' }, grantsTempHp: 10 };
}
`,
    );

    expect(findings.map((finding) => finding.rule)).toEqual(
      expect.arrayContaining(['named-mechanics-branch', 'fixed-save-dc', 'fixed-temp-hp']),
    );
  });

  it('flags fixed overtime mechanics embedded in module flag strings', () => {
    const findings = auditAntiOverfitText(
      'src/core/generator/actor-effects.ts',
      `
return {
  'midi-qol.OverTime': 'turn=start,damageRoll=4d6,damageType=necrotic,saveDC=15,saveAbility=con'
};
`,
    );

    expect(findings.map((finding) => finding.rule)).toEqual(
      expect.arrayContaining(['fixed-damage-roll', 'fixed-save-dc', 'fixed-save-ability']),
    );
  });

  it('flags fixed AC effects and failed-save outcomes', () => {
    const findings = auditAntiOverfitText(
      'src/core/generator/actor.ts',
      `
return createCustomEffect({
  changes: [{
    key: 'system.attributes.ac.flat',
    value: '14',
  }],
  save: { onFail: '目盲' },
});
`,
    );

    expect(findings.map((finding) => finding.rule)).toEqual(
      expect.arrayContaining(['fixed-ac-effect', 'fixed-on-fail']),
    );
  });

  it('allows source-derived AC and failed-save values', () => {
    const findings = auditAntiOverfitText(
      'src/core/generator/actor.ts',
      `
return createCustomEffect({
  changes: [{
    key: 'system.attributes.ac.flat',
    value: String(parsed.value),
  }],
  save: {
    ...(failureStatus ? { onFail: failureStatus } : {}),
  },
});
`,
    );

    expect(findings).toEqual([]);
  });

  it('allows source-derived parsers, schema maps, and documented explicit exceptions', () => {
    const findings = auditAntiOverfitText(
      'src/core/parser/example.ts',
      `
const dcMatch = text.match(/\\bDC\\s*(\\d+)\\b/i);
const dc = dcMatch ? Number.parseInt(dcMatch[1], 10) : undefined;
const dnd5eDamageTypes = { slashing: 'slashing', piercing: 'piercing' };

// anti-overfit: allow explicit-exception - user approved compatibility shim for imported legacy files
function isLegacyImportAction(actionName: string): boolean {
  return /Legacy Import/i.test(actionName);
}
`,
    );

    expect(findings).toEqual([]);
  });

  it('flags named rider marker tables in production mechanics extraction', () => {
    const findings = auditAntiOverfitText(
      'src/core/mechanics/mechanicsExtraction.ts',
      `
const RIDER_MARKERS = [
  { key: 'vampiric-bite', englishName: 'Vampiric Bite', pattern: /Vampiric Bite/i },
  { key: 'needling-bite', englishName: 'Needling Bite', pattern: /Needling Bite/i },
];
`,
    );

    expect(findings.map((finding) => finding.rule)).toEqual(
      expect.arrayContaining(['named-rider-marker']),
    );
  });

  it('flags named rider keys that branch mechanics behavior', () => {
    const findings = auditAntiOverfitText(
      'src/core/mechanics/mechanicsExtraction.ts',
      `
if (riderKey === 'needling-bite') {
  return [];
}
`,
    );

    expect(findings.map((finding) => finding.rule)).toEqual(
      expect.arrayContaining(['named-mechanics-key-branch']),
    );
  });

  it('flags named rider regex markers even when the table has a generic variable name', () => {
    const findings = auditAntiOverfitText(
      'src/core/generator/actor.ts',
      `
const markers = [
  { key: 'vampiric-bite', pattern: /Vampiric Bite/i },
];
const compoundRiderSegments = markers.map((marker) => text.search(marker.pattern));
`,
    );

    expect(findings.map((finding) => finding.rule)).toEqual(
      expect.arrayContaining(['named-rider-marker']),
    );
  });
});
