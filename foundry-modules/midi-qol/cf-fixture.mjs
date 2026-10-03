// Runtime fixtures only. These are not formal generator outputs or campaign content.
export const CF_KEY = 'midiCf20260920';
export const CF_PREFIX = 'E2E-MIDI6-CF-20260920';
export const CF_MACRO_NAME = `${CF_PREFIX}-Harness`;
export const CF_ACTIVITY_ID = 'MidiCfCircleTest';
export const CF_EXPECTED_VERSION = '14.6.0-beta.4338eeab.local.8';

export function makeCfItemData() {
  const duration = { value: '1', units: 'minute', concentration: false, override: true };
  const target = {
    override: true, prompt: true,
    affects: { type: 'creature', count: '', choice: false, special: '' },
    template: { type: 'circle', size: '30', units: 'ft', count: '1', contiguous: false },
  };
  const range = { value: '120', units: 'ft', special: '', override: true };
  return {
    name: `${CF_PREFIX}-Circle-1min`, type: 'spell', img: 'icons/svg/aura.svg',
    flags: { world: { [CF_KEY]: true } },
    system: {
      level: 0, school: 'abj', properties: [],
      description: { value: '<p>Temporary C/F fixture: 1 minute, Circle 30 ft, creature targets, no damage, no concentration.</p>' },
      duration: { value: '1', units: 'minute' },
      range, target, activation: { type: 'action', value: 1 },
      activities: {
        [CF_ACTIVITY_ID]: {
          _id: CF_ACTIVITY_ID, type: 'utility', name: 'C/F Circle — 1 minute',
          activation: { type: 'action', value: 1, override: true },
          duration, range, target,
          consumption: { spellSlot: false, targets: [], scaling: { allowed: false } },
          effects: [], roll: { formula: '', prompt: false, visible: false },
          midiProperties: { confirmTargets: 'never', forceConsumeDialog: 'never', autoTargetAction: 'none' },
          otherActivityId: 'none', regionBehavior: { enabled: false }, regionLight: { enabled: false },
        },
      },
    },
  };
}

export function assertCfActivity(activity) {
  const errors = [];
  if (!activity || activity.type !== 'utility') errors.push('utility activity missing');
  if (activity?.duration?.units !== 'minute' || Number(activity?.duration?.value) !== 1) errors.push('duration must be 1 minute');
  if (activity?.duration?.override !== true) errors.push('duration override must be enabled');
  if (activity?.duration?.concentration === true) errors.push('concentration would bypass ordinary cleanup creation');
  if (activity?.target?.override !== true || activity?.target?.prompt !== true) errors.push('target override and measured template prompt required');
  if (activity?.target?.template?.type !== 'circle' || Number(activity?.target?.template?.size) !== 30
      || activity?.target?.template?.units !== 'ft' || Number(activity?.target?.template?.count) !== 1) errors.push('template must be one Circle 30 ft');
  if (activity?.target?.affects?.type !== 'creature') errors.push('target must be creature');
  if (activity?.range?.units !== 'ft' || Number(activity?.range?.value) !== 120) errors.push('range must be 120 ft');
  if (errors.length) throw new Error(`C/F PRECHECK FAILED: ${errors.join('; ')}`);
  return true;
}
