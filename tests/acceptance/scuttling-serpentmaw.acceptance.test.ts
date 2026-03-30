import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from 'bun:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PlainTextActorWorkflow } from '../../src/core/workflow/plainTextActor';

setDefaultTimeout(30000);

const FIXTURE_DIR = resolve(process.cwd(), 'tests/fixtures/plaintext');
const SOURCE_PATH = join(
  FIXTURE_DIR,
  readdirSync(FIXTURE_DIR).find((entry) => entry.endsWith('.md')) ?? 'missing-fixture.md',
);

type GeneratedActor = {
  items: Array<{
    name: string;
    effects?: Array<{ statuses?: string[] }>;
    flags?: Record<string, any>;
    system: {
      activation?: { type?: string; cost?: number; condition?: string };
      activities?: Record<string, any>;
      description?: { value?: string };
    };
  }>;
};

function getActivities(item: GeneratedActor['items'][number]): any[] {
  return Object.values(item.system.activities ?? {});
}

function findItem(actor: GeneratedActor, englishName: string) {
  const item = actor.items.find((candidate) => candidate.name.includes(`(${englishName})`));
  expect(item).toBeDefined();
  if (!item) {
    throw new Error(`Expected item containing (${englishName})`);
  }
  return item;
}

describe('Scuttling Serpentmaw acceptance gate', () => {
  let vaultPath = '';
  let actor: GeneratedActor;

  beforeAll(async () => {
    vaultPath = mkdtempSync(join(tmpdir(), 'fvtt-serpentmaw-acceptance-'));

    const workflow = new PlainTextActorWorkflow();
    const result = await workflow.ingestActors({
      sourcePath: SOURCE_PATH,
      vaultPath,
      dryRun: false,
      effectProfile: 'modded-v12',
      fvttVersion: '12',
    });

    const actorFile = result.markdown.files.find((file) => file.slug === 'scuttling-serpentmaw');
    expect(actorFile).toBeDefined();
    if (!actorFile) {
      throw new Error('Expected Scuttling Serpentmaw markdown output');
    }

    actor = JSON.parse(
      readFileSync(join(vaultPath, 'output', actorFile.fileName.replace(/\.md$/i, '.json')), 'utf-8'),
    ) as GeneratedActor;
  });

  afterAll(() => {
    if (vaultPath) {
      rmSync(vaultPath, { recursive: true, force: true });
    }
  });

  it('keeps Venomous Bite as a normal action instead of inheriting the bloodied rider gate', () => {
    const venomousBite = findItem(actor, 'Venomous Bite');
    expect(venomousBite.system.activation?.type).toBe('action');
    expect(venomousBite.system.activation?.condition ?? '').toBe('');

    const attackActivity = getActivities(venomousBite).find((activity) => activity.type === 'attack');
    expect(attackActivity).toBeDefined();
    expect(attackActivity?.activation?.condition ?? '').toBe('');
  });

  it('does not auto-apply poison or bleed from the optional venom riders onto the base bite hit', () => {
    const venomousBite = findItem(actor, 'Venomous Bite');
    const activities = getActivities(venomousBite);

    expect((activities[0]?.effects ?? [])).toHaveLength(0);
    expect((venomousBite.effects ?? []).flatMap((effect) => effect.statuses ?? []).sort()).toEqual([
      'bleeding',
      'poisoned',
    ]);
  });

  it('does not infer a generic drop-to-zero heal rule from the Vampiric Bite rider text', () => {
    const venomousBite = findItem(actor, 'Venomous Bite');
    expect(venomousBite.flags?.fvttJsonGenerator?.rules?.onDropToZero).toBeUndefined();
  });

  it('creates three venom rider activities under Venomous Bite with their own once-per-day usage', () => {
    const venomousBite = findItem(actor, 'Venomous Bite');
    const activities = getActivities(venomousBite);

    expect(activities).toHaveLength(4);
    expect(activities[0]?.type).toBe('attack');
    expect(activities.slice(1).map((activity) => activity.type)).toEqual(['save', 'damage', 'utility']);
    for (const activity of activities.slice(1)) {
      expect(activity.uses).toEqual(
        expect.objectContaining({
          value: 1,
          max: 1,
          recovery: [expect.objectContaining({ period: 'day' })],
        }),
      );
    }
  });

  it('attaches poison and bleeding effects only to the corresponding venom rider activities', () => {
    const venomousBite = findItem(actor, 'Venomous Bite');
    const activities = getActivities(venomousBite);

    expect(activities[0]?.effects ?? []).toHaveLength(0);
    expect(activities[1]?.effects ?? []).toHaveLength(1);
    expect(activities[2]?.effects ?? []).toHaveLength(1);
    expect(activities[3]?.effects ?? []).toHaveLength(0);
    expect((venomousBite.effects ?? []).flatMap((effect) => effect.statuses ?? []).sort()).toEqual([
      'bleeding',
      'poisoned',
    ]);
  });

  it('creates a temporary AC reduction effect for Brittle Shell and a temporary AC boost effect for Retract', () => {
    const brittleShell = findItem(actor, 'Brittle Shell');
    const retract = findItem(actor, 'Retract');

    expect(brittleShell.effects ?? []).toHaveLength(1);
    expect(retract.effects ?? []).toHaveLength(1);

    const brittleChanges = brittleShell.effects?.[0]?.changes ?? [];
    const retractChanges = retract.effects?.[0]?.changes ?? [];

    expect(brittleChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'system.attributes.ac.flat',
          value: '14',
        }),
      ]),
    );
    expect(retractChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: '9',
        }),
      ]),
    );
    expect(getActivities(brittleShell)[0]?.effects ?? []).toHaveLength(1);
    expect(getActivities(retract)[0]?.effects ?? []).toHaveLength(1);
  });
});
