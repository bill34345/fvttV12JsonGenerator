import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runV14AcceptanceSuite,
  runV14SchemaChecks,
  type V14AcceptanceSample,
} from '../v14AcceptanceSuite';

describe('v14AcceptanceSuite', () => {
  test('generates v14 actor JSON and a markdown report for explicit markdown samples', async () => {
    const root = mkdtempSync(join(tmpdir(), 'v14-acceptance-suite-'));
    try {
      const sourcePath = join(root, 'test-guardian.md');
      const outDir = join(root, 'out');
      const reportPath = join(root, 'report.md');
      writeFileSync(sourcePath, [
        '---',
        'layout: creature',
        'name: "Test Guardian"',
        'size: Medium humanoid',
        'alignment: neutral',
        'challenge: "1 (200 XP)"',
        'speed: "30 ft."',
        'hit_points: "22 (4d8 + 4)"',
        'armor_class: "13 (natural armor)"',
        'senses: "darkvision 60 ft., passive Perception 12"',
        '---',
        '',
        '### Actions',
        '',
        '***Bite.*** Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) piercing damage.',
        '',
      ].join('\n'));

      const samples: V14AcceptanceSample[] = [{
        id: 'test-guardian',
        label: 'Test Guardian',
        category: 'unit fixture',
        sourcePath,
      }];

      const result = await runV14AcceptanceSuite({
        samples,
        outDir,
        reportPath,
        includeCrawlFixture: false,
      });

      expect(result.summary.total).toBe(1);
      expect(result.summary.passed).toBe(1);
      expect(result.summary.failed).toBe(0);
      expect(existsSync(join(outDir, 'test-guardian.v14.json'))).toBe(true);
      const report = readFileSync(reportPath, 'utf-8');
      expect(report).toContain('# Foundry v14 Core Batch Verification');
      expect(report).toContain('Test Guardian');
      expect(report).toContain('actor core version');
      expect(report).toContain('Foundry runtime import: not run');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('runs the local GoddessFantasy fixture pipeline into a v14 actor artifact', async () => {
    const root = mkdtempSync(join(tmpdir(), 'v14-acceptance-gf-'));
    try {
      const result = await runV14AcceptanceSuite({
        samples: [],
        outDir: join(root, 'out'),
        reportPath: join(root, 'report.md'),
        includeCrawlFixture: true,
      });

      expect(result.summary.failed).toBe(0);
      expect(result.samples).toHaveLength(1);
      expect(result.samples[0]?.id).toBe('goddessfantasy-yithian');
      expect(result.samples[0]?.schemaChecks.every((check) => check.ok)).toBe(true);
      expect(existsSync(join(root, 'out', 'goddessfantasy-yithian.v14.json'))).toBe(true);
      expect(existsSync(join(root, 'out', 'goddessfantasy-yithian.md'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('generates a modded-v14 report and preserves explicit midi-qol OverTime', async () => {
    const root = mkdtempSync(join(tmpdir(), 'v14-modded-acceptance-suite-'));
    try {
      const sourcePath = join(root, 'bleeding-guardian.md');
      const outDir = join(root, 'out');
      const reportPath = join(root, 'report.md');
      writeFileSync(sourcePath, [
        '---',
        'layout: creature',
        'name: "Bleeding Guardian"',
        'size: Medium humanoid',
        'alignment: neutral',
        'challenge: "1 (200 XP)"',
        'speed: "30 ft."',
        'hit_points: "22 (4d8 + 4)"',
        'armor_class: "13"',
        '---',
        '',
        '### Actions',
        '',
        '- **Bleeding Bite.** Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) piercing damage, and the target starts bleeding, taking `1d6` piercing damage at the start of each turn.',
        '',
      ].join('\n'));

      const result = await runV14AcceptanceSuite({
        samples: [{
          id: 'bleeding-guardian',
          label: 'Bleeding Guardian',
          category: 'modded-v14 overtime',
          sourcePath,
        }],
        outDir,
        reportPath,
        includeCrawlFixture: false,
        effectProfile: 'modded-v14',
      } as any);

      expect(result.summary.failed).toBe(0);
      const actor = JSON.parse(readFileSync(join(outDir, 'bleeding-guardian.v14.json'), 'utf-8'));
      const overtimeChanges = actor.items.flatMap((item: any) =>
        (item.effects ?? []).flatMap((effect: any) => effect.system?.changes ?? []),
      );
      expect(overtimeChanges).toContainEqual({
        key: 'flags.midi-qol.OverTime',
        mode: 5,
        value: 'turn=start,damageRoll=1d6,damageType=piercing,label=Bleeding',
        priority: 20,
      });
      expect(actor.items.flatMap((item: any) => item.effects ?? []).some(
        (effect: any) => effect.flags?.['midi-qol.OverTime'],
      )).toBe(false);
      const report = readFileSync(reportPath, 'utf-8');
      expect(report).toContain('Effect profile: `modded-v14`');
      expect(report).toContain('MIDI-QOL `14.0.9`');
      expect(report).toContain('Times Up: not used for v14');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('flags v12-only actor shape in v14 schema spot checks', () => {
    const checks = runV14SchemaChecks({
      _stats: { coreVersion: '12.331', systemId: 'dnd5e', systemVersion: '4.3.9' },
      system: {
        attributes: {
          senses: { darkvision: 60 },
        },
      },
      items: [{
        _stats: { coreVersion: '12.331', systemVersion: '4.3.9' },
        system: { activation: { type: 'action' }, activities: {} },
      }],
    });

    expect(checks.some((check) => check.name === 'actor core version' && !check.ok)).toBe(true);
    expect(checks.some((check) => check.name === 'v14 senses ranges' && !check.ok)).toBe(true);
    expect(checks.some((check) => check.name === 'no item-level legacy activation' && !check.ok)).toBe(true);
  });
});
