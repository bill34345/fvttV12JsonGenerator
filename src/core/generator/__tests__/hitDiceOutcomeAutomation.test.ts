import { describe, expect, it } from 'bun:test';
import {
  buildHitDiceOutcomeAutomationSpec,
  buildHitDiceOutcomeMacroCommand,
} from '../hitDiceOutcomeAutomation';
import type { ExtractedRider } from '../../mechanics/mechanicsExtraction';

const rider = {
  key: 'pale-toll',
  name: 'Pale Toll',
  englishName: 'Pale Toll',
  outcomes: [
    { kind: 'hitDiceChange', direction: 'lose', count: 1, pool: 'unspent', target: 'failedSaveTarget' },
    { kind: 'tempHp', amount: 10, target: 'self', condition: 'hitDiceChangeApplied' },
    { kind: 'followupSave', label: 'Ruidium Corruption', trigger: 'targetHitDiceReducedToZero', target: 'failedSaveTarget' },
  ],
} as ExtractedRider;

describe('hitDiceOutcomeAutomation', () => {
  it('builds a serializable spec from outcome IR and generated activity ids', () => {
    const spec = buildHitDiceOutcomeAutomationSpec(rider, {
      primaryActivityId: 'act-save',
      loseHitDieActivityId: 'act-lose-hd',
      tempHpActivityId: 'act-temp-hp',
      followupSaveActivityId: 'act-ruidium',
    });

    expect(spec).toEqual(
      expect.objectContaining({
        mode: 'hit-dice-outcome',
        primaryActivityId: 'act-save',
        loseHitDieActivityId: 'act-lose-hd',
        tempHpActivityId: 'act-temp-hp',
        followupSaveActivityId: 'act-ruidium',
        hitDiceChange: expect.objectContaining({ direction: 'lose', count: 1, pool: 'unspent' }),
        tempHp: expect.objectContaining({ amount: 10, target: 'self' }),
        followupSave: expect.objectContaining({ label: 'Ruidium Corruption' }),
      }),
    );
  });

  it('builds guarded macro code from the spec without hardcoded rider values', () => {
    const spec = buildHitDiceOutcomeAutomationSpec(rider, {
      primaryActivityId: 'act-save',
      loseHitDieActivityId: 'act-lose-hd',
      tempHpActivityId: 'act-temp-hp',
      followupSaveActivityId: 'act-ruidium',
    });

    const command = buildHitDiceOutcomeMacroCommand(spec);

    expect(command).toContain('MidiQOL');
    expect(command).toContain('workflow');
    expect(command).toContain('hitDiceOutcomeSpec');
    expect(command).toContain('safeHitDiceUpdate');
    expect(command).toContain('GM must manually apply');
    expect(command).toContain('act-temp-hp');
    expect(command).toContain('act-ruidium');
    expect(command).not.toContain('Vampiric Bite');
    expect(command).not.toContain('Needling Bite');
    expect(command).not.toContain('pale-toll');
    expect(command).not.toContain('grantsTempHp: 10');
  });

  it('omits absent optional fields instead of materializing undefined JSON values', () => {
    const spec = buildHitDiceOutcomeAutomationSpec(
      {
        ...rider,
        outcomes: [
          {
            kind: 'hitDiceChange',
            direction: 'lose',
            count: 1,
            pool: 'unspent',
            target: 'failedSaveTarget',
            evidence: undefined,
          },
          {
            kind: 'tempHp',
            amount: 5,
            target: 'self',
            condition: undefined,
            evidence: undefined,
          },
        ],
      } as ExtractedRider,
      {
        primaryActivityId: 'act-save',
        loseHitDieActivityId: 'act-lose-hd',
        tempHpActivityId: undefined,
        followupSaveActivityId: undefined,
      },
    );

    expect(spec.hitDiceChange).toEqual(expect.objectContaining({ count: 1 }));
    expect(Object.prototype.hasOwnProperty.call(spec.tempHp, 'condition')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(spec.tempHp, 'evidence')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(spec, 'followupSave')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(spec, 'tempHpActivityId')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(spec, 'followupSaveActivityId')).toBe(false);
    expect(JSON.parse(JSON.stringify(spec))).toEqual(spec);
  });

  it('falls back before temp hp automation when no versioned safe hit-dice path is confirmed', () => {
    const spentPoolSpec = buildHitDiceOutcomeAutomationSpec(
      {
        ...rider,
        outcomes: [
          { kind: 'hitDiceChange', direction: 'lose', count: 1, pool: 'spent', target: 'target' },
          { kind: 'tempHp', amount: 5, target: 'self', condition: 'hitDiceChangeApplied' },
        ],
      } as ExtractedRider,
      {
        primaryActivityId: 'act-save',
        loseHitDieActivityId: 'act-lose-hd',
        tempHpActivityId: 'act-temp-hp',
      },
    );

    const command = buildHitDiceOutcomeMacroCommand(spentPoolSpec);

    expect(command).toContain('hitDiceOutcomeSpec.hitDiceChange');
    expect(command).toContain('safeHitDiceUpdate');
    expect(command).toContain('No versioned safe hit dice update path is configured.');
    expect(command).toContain('return;');
  });
});
