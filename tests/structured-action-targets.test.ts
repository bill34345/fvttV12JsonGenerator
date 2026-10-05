import { describe, expect, test } from 'bun:test';
import type { ActionData } from '@fvtt-json-generator/models/action';
import { ActivityGenerator } from '@fvtt-json-generator/generation/activity';
import { ActorGenerator } from '@fvtt-json-generator/generation/actor';
import { YamlParser } from '@fvtt-json-generator/parser/yaml';

const FIXTURE_ROOT = 'tests/fixtures/structured-action-targets';

describe('structured individual targets', () => {
  test.each([
    { fixture: 'one-creature', count: 1 },
    { fixture: 'two-creatures', count: 2 },
  ])('projects $count creature target(s) into affects without an area template', async ({ fixture, count }) => {
    const activity = await generateFixtureActivity(fixture);

    expect(activity).toMatchObject({
      type: 'save',
      save: {
        ability: ['dex'],
        dc: { calculation: '', formula: '13' },
      },
      damage: {
        onSave: 'none',
        parts: [expect.objectContaining({ number: count, denomination: 6, types: ['lightning'] })],
      },
      target: {
        override: false,
        prompt: true,
        template: {
          count: '',
          contiguous: false,
          type: '',
          size: '',
          width: '',
          height: '',
          units: 'ft',
        },
        affects: {
          count,
          type: 'creature',
          choice: false,
          special: '',
        },
      },
      description: { chatFlavor: expect.any(String) },
      activation: { type: 'action', value: null, override: false, condition: '' },
    });
    expect(activity.target.template.type).not.toBe('radius');
  });

  test('preserves an AoE template while adding the all-creatures affected target', async () => {
    const activity = await generateFixtureActivity('all-within-area');

    expect(activity).toMatchObject({
      type: 'save',
      target: {
        override: false,
        prompt: true,
        template: {
          count: '',
          contiguous: false,
          type: 'sphere',
          size: 15,
          width: '',
          height: '',
          units: 'ft',
        },
        affects: {
          count: '',
          type: 'creature',
          choice: false,
          special: '',
        },
      },
    });
    expect(activity.target.template.type).toBe('sphere');
    expect(activity.target.affects.count).toBe('');
  });

  test('preserves the source target type instead of assuming creature', async () => {
    const activity = await generateFixtureActivity('object-target');

    expect(activity).toMatchObject({
      type: 'save',
      target: {
        template: { type: '', size: '' },
        affects: { count: 1, type: 'object', choice: false, special: '' },
      },
    });
  });

  test('preserves a nonnumeric source restriction as special target text', async () => {
    const activity = await generateFixtureActivity('restricted-target');

    expect(activity).toMatchObject({
      type: 'save',
      target: {
        template: { type: '', size: '' },
        affects: {
          count: '',
          type: 'creature',
          choice: false,
          special: '所有非异怪生物',
        },
      },
    });
  });

  test('leaves an unrelated structured save without a target while preserving its full activity data', async () => {
    const activity = await generateFixtureActivity('no-target');

    expect(activity).toMatchObject({
      type: 'save',
      save: {
        ability: ['dex'],
        dc: { calculation: '', formula: '13' },
      },
      damage: {
        onSave: 'none',
        parts: [expect.objectContaining({ number: 1, denomination: 6, types: ['lightning'] })],
      },
      description: { chatFlavor: expect.any(String) },
      activation: { type: 'action', value: null, override: false, condition: '' },
    });
    expect(activity.target).toBeUndefined();
  });
});

describe('legacy template targets', () => {
  test('continues to project ActionData template targets with their complete Activity structure', () => {
    const generated = new ActivityGenerator({ fvttVersion: '14' }).generate({
      name: 'Legacy Template',
      type: 'save',
      save: { dc: 13, ability: 'dex', dcSourceKind: 'literal' },
      target: { value: 15, type: 'sphere', units: 'ft' },
      damage: [{ formula: '1d6', type: 'lightning' }],
      desc: 'An existing template target.',
    } satisfies ActionData);
    const activity = Object.values(generated)[0]!;

    expect(activity).toMatchObject({
      type: 'save',
      save: { ability: ['dex'], dc: { calculation: '', formula: '13' } },
      damage: {
        onSave: 'none',
        parts: [expect.objectContaining({ number: 1, denomination: 6, types: ['lightning'] })],
      },
      target: {
        template: { count: 1, type: 'sphere', size: '15', units: 'ft' },
        affects: { count: '', type: '', choice: false, special: '' },
      },
      description: { chatFlavor: 'An existing template target.' },
    });
  });
});

async function generateFixtureActivity(fixture: string): Promise<any> {
  const source = await Bun.file(`${FIXTURE_ROOT}/${fixture}.md`).text();
  const parsed = new YamlParser().parse(source);
  const actor = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(parsed);
  const item = (actor.items as any[]).find((entry) =>
    Object.values(entry.system?.activities ?? {}).some((activity: any) => activity.type === 'save'));
  if (!item) throw new Error(`No save Item generated from fixture ${fixture}.`);
  const activity = Object.values(item.system.activities ?? {})[0];
  if (!activity) throw new Error(`No Activity generated from fixture ${fixture}.`);
  return activity;
}
