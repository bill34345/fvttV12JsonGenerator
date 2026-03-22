import { describe, expect, it } from 'bun:test';
import {
  buildHeavyHitAutomationSpec,
  buildHeavyHitMacroCommand,
  selectHeavyHitBranch,
  shouldTriggerHeavyHit,
} from '../heavyHitAutomation';

describe('heavyHitAutomation', () => {
  it('does not trigger until the attack total is at least 5 over the target AC', () => {
    expect(shouldTriggerHeavyHit({ attackTotal: 19, targetAC: 15 })).toBe(false);
    expect(shouldTriggerHeavyHit({ attackTotal: 20, targetAC: 15 })).toBe(true);
    expect(shouldTriggerHeavyHit({ attackTotal: 24, targetAC: 20, acMargin: 5 })).toBe(false);
    expect(shouldTriggerHeavyHit({ attackTotal: 25, targetAC: 20, acMargin: 5 })).toBe(true);
  });

  it('maps deterministic random rolls onto the configured branch list', () => {
    const branches = [
      { key: 'bleeding-wound', activityId: 'act-bleed' },
      { key: 'reeling-impact', activityId: 'act-daze' },
      { key: 'push', activityId: 'act-push' },
    ];

    expect(selectHeavyHitBranch(branches, 1)).toEqual(branches[0]);
    expect(selectHeavyHitBranch(branches, 2)).toEqual(branches[1]);
    expect(selectHeavyHitBranch(branches, 3)).toEqual(branches[2]);
  });

  it('builds a random midi-qol automation spec and macro command from generic branch metadata', () => {
    const spec = buildHeavyHitAutomationSpec([
      { key: 'bleeding-wound', activityId: 'act-bleed' },
      { key: 'reeling-impact', activityId: 'act-daze' },
      { key: 'push', activityId: 'act-push' },
    ]);

    expect(spec).toEqual(
      expect.objectContaining({
        mode: 'random',
        acMargin: 5,
        dieFormula: '1d3',
        branchActivityIds: ['act-bleed', 'act-daze', 'act-push'],
      }),
    );

    const command = buildHeavyHitMacroCommand(spec);
    expect(command).toContain('attackTotal');
    expect(command).toContain('targetAC');
    expect(command).toContain('1d3');
    expect(command).toContain('MidiQOL');
    expect(command).toContain('act-bleed');
    expect(command).toContain('act-daze');
    expect(command).toContain('act-push');
  });
});
