import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PlainTextActorWorkflow } from '../../src/core/workflow/plainTextActor';

setDefaultTimeout(30000);

const FIXTURE_DIR = resolve(process.cwd(), 'tests/fixtures/plaintext');
const SOURCE_PATH = join(FIXTURE_DIR, '月蚀矿腐化生物数据.md');

type GeneratedActor = {
  type: string;
  system: any;
  prototypeToken: any;
  items: Array<{
    name: string;
    type: string;
    img?: string;
    effects?: Array<{ img?: string; statuses?: string[] }>;
    system: {
      activation?: { type?: string; cost?: number };
      uses?: any;
      activities?: Record<string, any>;
      description?: { value?: string };
      type?: { value?: string; subtype?: string };
    };
  }>;
};

function getActivities(item: GeneratedActor['items'][number]): any[] {
  return Object.values(item.system.activities ?? {});
}

function getFirstActivity(item: GeneratedActor['items'][number]): any {
  return getActivities(item)[0];
}

function findItem(actor: GeneratedActor, englishName: string) {
  const item = actor.items.find((candidate) => candidate.name.includes(`(${englishName})`));
  expect(item).toBeDefined();
  if (!item) {
    throw new Error(`Expected item containing (${englishName})`);
  }
  return item;
}

function collectStatuses(item: GeneratedActor['items'][number]): string[] {
  return (item.effects ?? []).flatMap((effect) => effect.statuses ?? []);
}

function hasStructuredHtml(value: string | undefined): boolean {
  if (!value) return false;
  return /<\/p>\s*<p>|<ul>|<ol>|<li>|<br\s*\/?>/i.test(value);
}

describe('Slithering Bloodfin acceptance gate', () => {
  let vaultPath = '';
  let actor: GeneratedActor;

  beforeAll(async () => {
    vaultPath = mkdtempSync(join(tmpdir(), 'fvtt-bloodfin-acceptance-'));

    const workflow = new PlainTextActorWorkflow();
    const result = await workflow.ingestActors({
      sourcePath: SOURCE_PATH,
      vaultPath,
      dryRun: false,
      effectProfile: 'modded-v12',
      fvttVersion: '12',
    });

    const bloodfinFile = result.markdown.files.find((file) => file.slug === 'slithering-bloodfin');
    expect(bloodfinFile).toBeDefined();
    if (!bloodfinFile) {
      throw new Error('Expected Slithering Bloodfin markdown output');
    }

    actor = JSON.parse(
      readFileSync(join(vaultPath, 'output', bloodfinFile.fileName.replace(/\.md$/i, '.json')), 'utf-8'),
    ) as GeneratedActor;
  });

  afterAll(() => {
    if (vaultPath) {
      rmSync(vaultPath, { recursive: true, force: true });
    }
  });

  it('maps Bloodfin to a Foundry-usable aberration type instead of leaving raw localized text', () => {
    expect(actor.type).toBe('npc');
    expect(actor.system.details.type.value).toBe('aberration');
  });

  it('derives initiative bonus from the source total instead of copying the total blindly', () => {
    expect(actor.system.attributes.init.bonus).toBe(4);
  });

  it('models the Dex save line structurally instead of leaving the save unproficient', () => {
    expect(actor.system.abilities.dex.proficient).toBe(1);
  });

  it('retains Bloodfin senses and passive perception data', () => {
    expect(actor.system.attributes.senses.blindsight).toBe(100);
    expect(actor.system.skills.prc.bonuses.passive).toBe('+4');
    expect(actor.prototypeToken.detectionModes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'blindsight',
          enabled: true,
          range: 100,
        }),
      ]),
    );
  });

  it('creates the three Bloodfin trait items instead of flattening them into biography text', () => {
    findItem(actor, 'Blood Frenzy');
    findItem(actor, 'Wriggly');
    findItem(actor, 'Death Burst');
  });

  it('keeps Blood Frenzy and Wriggly as utility traits with explicit activation semantics while allowing structured special traits', () => {
    const bloodFrenzy = findItem(actor, 'Blood Frenzy');
    const wriggly = findItem(actor, 'Wriggly');
    const deathBurst = findItem(actor, 'Death Burst');

    expect(bloodFrenzy.system.activation?.type).toBe('');
    expect(wriggly.system.activation?.type).toBe('special');
    expect(deathBurst.system.activation?.type).toBe('special');

    for (const item of [bloodFrenzy, wriggly]) {
      const activities = getActivities(item);
      expect(activities.length).toBeGreaterThan(0);
      expect(activities.every((activity) => activity.type === 'utility')).toBe(true);
    }
    expect(getActivities(deathBurst).every((activity) => activity.type === 'save')).toBe(true);
  });

  it('keeps passive and special trait activation costs off the generated utility activities', () => {
    const bloodFrenzy = findItem(actor, 'Blood Frenzy');
    const wriggly = findItem(actor, 'Wriggly');
    const deathBurst = findItem(actor, 'Death Burst');

    expect((bloodFrenzy as any).flags?.['tidy5e-sheet']).toEqual(
      expect.objectContaining({
        section: '特性',
        actionSection: '特性',
      }),
    );
    expect((wriggly as any).flags?.['tidy5e-sheet']).toEqual(
      expect.objectContaining({
        section: '特性',
        actionSection: '特性',
      }),
    );
    expect((deathBurst as any).flags?.['tidy5e-sheet']).toEqual(
      expect.objectContaining({
        section: '特性',
        actionSection: '特性',
      }),
    );
    expect(getFirstActivity(bloodFrenzy).activation).toEqual(
      expect.objectContaining({
        type: '',
        value: null,
      }),
    );
    expect(getFirstActivity(wriggly).activation).toEqual(
      expect.objectContaining({
        type: 'special',
        value: null,
      }),
    );
    expect(getFirstActivity(deathBurst).activation).toEqual(
      expect.objectContaining({
        type: 'special',
        value: null,
      }),
    );
  });

  it('does not auto-apply grappled or restrained effects for Wriggly because it clears statuses instead of inflicting them', () => {
    const wriggly = findItem(actor, 'Wriggly');
    expect(wriggly.effects ?? []).toHaveLength(0);
    expect(getFirstActivity(wriggly).effects ?? []).toHaveLength(0);
  });

  it('models Death Burst as two save activities instead of a utility placeholder', () => {
    const deathBurst = findItem(actor, 'Death Burst');
    const activities = getActivities(deathBurst);
    expect(activities).toHaveLength(2);
    expect(activities.every((activity) => activity.type === 'save')).toBe(true);
    expect(activities[0].save.dc.value).toBe(16);
    expect(activities[0].save.ability).toContain('con');
    expect(activities[0].damage.parts).toHaveLength(1);
    expect(activities[0].damage.parts[0]).toEqual(
      expect.objectContaining({
        number: 3,
        denomination: 6,
        types: ['poison'],
      }),
    );
    expect((activities[0].effects ?? []).length).toBeGreaterThan(0);
    expect(activities[1].save.dc.value).toBe(16);
    expect(activities[1].save.ability).toContain('cha');
    expect(activities[1].damage.parts ?? []).toHaveLength(0);
    expect(activities[1].effects ?? []).toHaveLength(0);
  });

  it('keeps Multiattack as a utility placeholder', () => {
    const multiattack = findItem(actor, 'Multiattack');
    expect(getActivities(multiattack).some((activity) => activity.type === 'utility')).toBe(true);
  });

  it('models Bite as an attack instead of a damage-only stub', () => {
    const bite = findItem(actor, 'Bite');
    const biteActivities = getActivities(bite);
    expect(biteActivities.some((activity) => activity.type === 'attack')).toBe(true);
    expect(biteActivities.every((activity) => activity.type !== 'damage')).toBe(true);
  });

  it('keeps Tail Crash attack-first instead of reducing it to a save-only item', () => {
    const tailCrash = findItem(actor, 'Tail Crash');
    const tailActivities = getActivities(tailCrash);
    expect(tailActivities.length).toBeGreaterThan(1);
    expect(tailActivities.some((activity) => activity.type === 'attack')).toBe(true);
    expect(tailActivities.every((activity) => activity.type === 'save')).toBe(false);
  });

  it('keeps Tail Crash main attack damage limited to the hit clause instead of swallowing Heavy Hit branch dice', () => {
    const tailCrash = findItem(actor, 'Tail Crash');
    const attackActivity = getActivities(tailCrash).find((activity) => activity.type === 'attack');
    expect(attackActivity).toBeDefined();
    expect((tailCrash as any).system?.range).toEqual(
      expect.objectContaining({
        value: null,
        long: null,
        reach: 10,
        units: 'ft',
      }),
    );
    expect(attackActivity.range).toEqual(
      expect.objectContaining({
        override: false,
        reach: 10,
        units: 'ft',
      }),
    );
    expect(attackActivity.target).toEqual(
      expect.objectContaining({
        override: false,
        prompt: true,
        template: expect.objectContaining({
          contiguous: false,
          units: 'ft',
          type: '',
        }),
      }),
    );
    expect(attackActivity.damage.parts).toHaveLength(1);
    expect(attackActivity.damage.parts[0]).toEqual(
      expect.objectContaining({
        number: 4,
        denomination: 6,
        bonus: '5',
        types: ['bludgeoning'],
      }),
    );
  });

  it('keeps Heavy Hit branch effects as hints instead of auto-applying them on Tail Crash activities', () => {
    const tailCrash = findItem(actor, 'Tail Crash');
    expect((tailCrash as any).flags?.fvttJsonGenerator?.effectHints).toEqual(
      expect.objectContaining({
        heavyHit: true,
        dazed: true,
        bleed: true,
      }),
    );
    expect(tailCrash.effects ?? []).toHaveLength(0);
    for (const activity of getActivities(tailCrash)) {
      expect(activity.effects ?? []).toHaveLength(0);
    }
  });

  it('emits random Heavy Hit automation metadata and branch linkage instead of only static prose', () => {
    const tailCrash = findItem(actor, 'Tail Crash');
    const attackActivity = getActivities(tailCrash).find((activity) => activity.type === 'attack');

    expect(attackActivity?.midiProperties).toEqual(
      expect.objectContaining({
        identifier: 'heavy-hit-primary',
        otherActivityCompatible: true,
      }),
    );
    expect(attackActivity?.macroData?.command).toMatch(/attackTotal|targetAC|1d3|MidiQOL/);
    expect((tailCrash as any).flags?.fvttJsonGenerator?.heavyHit).toEqual(
      expect.objectContaining({
        mode: 'random',
        acMargin: 5,
        dieFormula: '1d3',
      }),
    );
    expect((tailCrash as any).flags?.fvttJsonGenerator?.heavyHit?.branchActivityIds).toHaveLength(3);
  });

  it('keeps the Bleeding Wound branch as a single follow-up damage roll instead of duplicating the bleed die', () => {
    const tailCrash = findItem(actor, 'Tail Crash');
    const bleedBranch = getActivities(tailCrash).find(
      (activity) => activity?.flags?.fvttJsonGenerator?.heavyHitBranch?.key === 'bleeding-wound',
    );

    expect(bleedBranch).toBeDefined();
    expect(bleedBranch.type).toBe('damage');
    expect(bleedBranch.damage.parts).toHaveLength(1);
    expect(bleedBranch.damage.parts[0]).toEqual(
      expect.objectContaining({
        number: 1,
        denomination: 6,
        types: ['bludgeoning'],
      }),
    );
  });

  it('keeps Swallow as a bonus action', () => {
    const swallow = findItem(actor, 'Swallow');
    expect(swallow.system.activation?.type).toBe('bonus');
    const activities = getActivities(swallow);
    expect(activities.map((activity) => activity.type)).toEqual(['attack', 'damage', 'save']);
    expect(activities[0].effects ?? []).toHaveLength(2);
    expect(activities[1].effects ?? []).toHaveLength(0);
    expect(activities[2].effects ?? []).toHaveLength(0);
    expect(activities[1].damage.parts).toEqual([
      expect.objectContaining({
        number: 4,
        denomination: 6,
        types: ['necrotic'],
      }),
    ]);
    expect(activities[2].save.dc.value).toBe(15);
    expect(activities[2].save.ability).toContain('con');
  });

  it('does not inject prone into Swallow as an unconditional generated effect', () => {
    const swallow = findItem(actor, 'Swallow');
    expect(collectStatuses(swallow)).not.toContain('prone');
    expect((swallow.effects ?? []).some((effect: any) => /Swallowed|吞咽中/i.test(String(effect?.name ?? '')))).toBe(false);
    expect(collectStatuses(swallow).sort()).toEqual(['blinded', 'restrained']);
  });

  it('keeps Slippery and Pelagic Screech as reactions', () => {
    const slippery = findItem(actor, 'Slippery');
    expect(slippery.system.activation?.type).toBe('reaction');
    expect((slippery as any).flags?.['tidy5e-sheet']).toEqual(
      expect.objectContaining({
        section: '反应',
        actionSection: '反应',
      }),
    );
    expect(getFirstActivity(slippery).activation).toEqual(
      expect.objectContaining({
        type: 'reaction',
        value: null,
      }),
    );

    const pelagicScreech = findItem(actor, 'Pelagic Screech');
    expect(pelagicScreech.system.activation?.type).toBe('reaction');
    expect((pelagicScreech as any).flags?.['tidy5e-sheet']).toEqual(
      expect.objectContaining({
        section: '反应',
        actionSection: '反应',
      }),
    );
    expect(getFirstActivity(pelagicScreech).activation).toEqual(
      expect.objectContaining({
        type: 'reaction',
        value: null,
      }),
    );
  });

  it('preserves full 1/day recovery metadata for Pelagic Screech instead of storing only a per flag', () => {
    const pelagicScreech = findItem(actor, 'Pelagic Screech');
    expect(pelagicScreech.system.uses).toEqual(
      expect.objectContaining({
        value: 1,
        max: 1,
      }),
    );
    expect(Array.isArray(pelagicScreech.system.uses?.recovery)).toBe(true);
    expect(pelagicScreech.system.uses?.recovery?.[0]).toEqual(
      expect.objectContaining({
        period: 'day',
      }),
    );
    expect(getFirstActivity(pelagicScreech).consumption).toEqual(
      expect.objectContaining({
        targets: [
          expect.objectContaining({
            type: 'itemUses',
            value: '1',
          }),
        ],
      }),
    );
  });

  it('models Death Burst as a 10-foot burst instead of leaving the save activities untargeted', () => {
    const deathBurst = findItem(actor, 'Death Burst');
    const firstSave = getActivities(deathBurst)[0];

    expect(firstSave.target).toEqual(
      expect.objectContaining({
        override: false,
        prompt: true,
        template: expect.objectContaining({
          type: 'sphere',
          size: '10',
          units: 'ft',
        }),
      }),
    );
  });

  it('preserves Pelagic Screech range instead of dropping the 300-foot targeting data', () => {
    const pelagicScreech = findItem(actor, 'Pelagic Screech');
    const saveActivity = getFirstActivity(pelagicScreech);

    expect(saveActivity.range).toEqual(
      expect.objectContaining({
        override: false,
        value: 300,
        long: null,
        reach: null,
        units: 'ft',
      }),
    );
  });

  it('preserves the bloodied-only gate for Pelagic Screech instead of dropping it into plain prose', () => {
    const pelagicScreech = findItem(actor, 'Pelagic Screech');
    expect(String(pelagicScreech.system.activation?.condition ?? '')).toMatch(/bloodied|濒血/i);
  });

  it('assigns real dnd5e status icons instead of leaving generated effects blank', () => {
    const actorEffects = actor.system.effects ?? actor.effects ?? [];
    const effectedItems = actor.items.filter((item) => (item.effects ?? []).length > 0);
    expect(actorEffects.length + effectedItems.length).toBeGreaterThan(0);

    for (const effect of actorEffects) {
      expect(effect.img).toMatch(/^systems\/dnd5e\/icons\/svg\/statuses\/.+\.svg$/);
    }
    for (const item of effectedItems) {
      for (const effect of item.effects ?? []) {
        expect(effect.img).toMatch(/^systems\/dnd5e\/icons\/svg\/statuses\/.+\.svg$/);
      }
    }
  });

  it('keeps generated condition effect labels readable instead of mojibake', () => {
    const bite = findItem(actor, 'Bite');
    const deathBurst = findItem(actor, 'Death Burst');
    const swallow = findItem(actor, 'Swallow');
    const pelagicScreech = findItem(actor, 'Pelagic Screech');

    expect((bite.effects ?? []).map((effect: any) => effect.name)).toEqual(
      expect.arrayContaining(['受限 (Restrained)', '被擒抱 (Grappled)']),
    );
    expect((deathBurst.effects ?? []).map((effect: any) => effect.name)).toEqual(
      expect.arrayContaining(['中毒 (Poisoned)']),
    );
    expect((swallow.effects ?? []).map((effect: any) => effect.name)).toEqual(
      expect.arrayContaining(['受限 (Restrained)', '目盲 (Blinded)']),
    );
    expect((pelagicScreech.effects ?? []).map((effect: any) => effect.name)).toEqual(
      expect.arrayContaining(['恍惚 (Dazed)']),
    );
  });

  it('preserves structured biography markup instead of flattening traits into plain text', () => {
    expect(hasStructuredHtml(actor.system.details.biography.value)).toBe(true);
  });

  it('preserves structured action and reaction descriptions instead of flattening them into a single paragraph blob', () => {
    expect(hasStructuredHtml(findItem(actor, 'Tail Crash').system.description?.value)).toBe(true);
    expect(hasStructuredHtml(findItem(actor, 'Pelagic Screech').system.description?.value)).toBe(true);
  });

  it('preserves structured trait descriptions on the trait items themselves', () => {
    expect(hasStructuredHtml(findItem(actor, 'Blood Frenzy').system.description?.value)).toBe(true);
    expect(hasStructuredHtml(findItem(actor, 'Wriggly').system.description?.value)).toBe(true);
    expect(hasStructuredHtml(findItem(actor, 'Death Burst').system.description?.value)).toBe(true);
  });
});
