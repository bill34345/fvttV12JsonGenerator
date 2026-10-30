import { describe, expect, test } from 'bun:test';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { auditMonsterIntakeSource } from '@fvtt-json-generator/intake-ai/validator';
import { renderMonsterIntakeMarkdown } from '@fvtt-json-generator/intake-ai/renderer';
import { buildForgeActorRequest, convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';
import { buildValidLurkerIr, LURKER_SOURCE } from '../src/core/intake/__tests__/fixtures/lurker';

const REPEAT = 'At the end of each of its turns, the target can make a DC 15 Constitution saving throw, ending the effect on a success.';
const ATTACK = 'Blinding Claw. Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 7 (1d6 + 4) Slashing damage, and the target is Blinded for 1 minute.';

function fixture(quote = `${ATTACK} ${REPEAT}`) {
  const source = `${LURKER_SOURCE}\n${quote}`;
  const ir = buildValidLurkerIr();
  ir.source = { sha256: hashSource(source), length: source.length };
  const start = source.indexOf(quote);
  const evidence = { start, end: start + quote.length, quote };
  const index = ir.creature.actions.length;
  ir.creature.actions.push({ name: 'Blinding Claw', description: quote, activityType: 'attack',
    attack: { type: 'mwak', toHit: 7, reach: 5 },
    damage: [{ formula: '1d6+4', type: 'slashing', relationship: 'base' }],
    save: { dc: 15, ability: 'con', condition: 'ending the effect on a success' },
    appliedConditions: [{ statuses: ['Blinded'], escapeDc: 15, condition: REPEAT, duration: '1 minute' }],
    evidence: [evidence] });
  const path = `/creature/actions/${index}`;
  ir.claims.push({ path, valueKind: 'explicit', confidence: 'high', evidence: [evidence] });
  ir.claims.push({ path: `${path}/save/dc`, valueKind: 'explicit', confidence: 'high', evidence: [evidence] });
  ir.claims.push({ path: `${path}/save/ability`, valueKind: 'explicit', confidence: 'high', evidence: [evidence] });
  return { source, ir, path, feature: ir.creature.actions[index]! };
}

function findings(source: string, ir: ReturnType<typeof fixture>['ir']) {
  return auditMonsterIntakeSource(source, ir).findings.map(finding => ({ code: finding.code, path: finding.path }));
}

describe('attack repeat-save source slots', () => {
  test('a turn-end-only repeat save cannot occupy primary save or escapeDc', () => {
    const { source, ir, path } = fixture();
    expect(findings(source, ir)).toContainEqual({ code: 'ATTACK_REPEAT_SAVE_NOT_INITIAL', path: `${path}/save` });
    expect(findings(source, ir)).toContainEqual({ code: 'REPEAT_SAVE_NOT_ESCAPE_DC', path: `${path}/appliedConditions/0/escapeDc` });
    const reversed = fixture(`${ATTACK} The target can repeat a DC 15 Constitution saving throw at the end of each of its turns, ending the effect on a success.`);
    expect(findings(reversed.source, reversed.ir)).toContainEqual({ code: 'ATTACK_REPEAT_SAVE_NOT_INITIAL', path: `${reversed.path}/save` });
  });

  test('corrected IR keeps the repeat literal and formally projects the attack', async () => {
    const { source, ir, path, feature } = fixture();
    delete feature.save;
    feature.appliedConditions![0]!.statuses=['blinded'];
    delete feature.appliedConditions![0]!.escapeDc;
    ir.claims = ir.claims.filter(claim => !claim.path.startsWith(`${path}/save/`));
    expect(feature.description).toContain(REPEAT);
    expect(feature.appliedConditions![0]!.condition).toBe(REPEAT);
    expect(findings(source, ir)).not.toContainEqual(expect.objectContaining({ code: 'ATTACK_REPEAT_SAVE_NOT_INITIAL' }));
    expect(findings(source, ir)).not.toContainEqual(expect.objectContaining({ code: 'REPEAT_SAVE_NOT_ESCAPE_DC' }));
    const rendered = renderMonsterIntakeMarkdown(ir);
    expect(rendered).toContain(REPEAT);
    const response = await convertFinalActorSource(buildForgeActorRequest({ content: rendered,
      displayName: 'Repeat save source projection', requestId: 'repeat-save-source', fvttVersion: '14.364', systemVersion: '5.3.3' }));
    if (!('result' in response)) throw Error('Missing formal Actor result');
    if (response.result.status === 'failed') throw Error(JSON.stringify(response.result.diagnostics));
    expect(response.result.status).not.toBe('failed');
    expect(response.result.diagnostics.some(diagnostic => diagnostic.code === 'GEN_MECHANIC_NOT_PROJECTED')).toBe(false);
    const items = response.result.artifact?.items;
    if (!Array.isArray(items)) throw Error('Formal Actor artifact has no items');
    const item = items.find(entry => typeof entry === 'object' && entry !== null && !Array.isArray(entry) && entry.name === 'Blinding Claw') as any;
    expect(item).toBeTruthy();
    expect(Object.values(item.system.activities).some((activity:any) => activity.type === 'attack')).toBe(true);
  });

  test('source-explicit initial on-hit save remains a legitimate primary save', () => {
    const initial = 'Hit: 7 (1d6 + 4) Slashing damage, and the target must make a DC 15 Constitution saving throw. On a failure, the target is Blinded for 1 minute.';
    const quote = `${ATTACK.replace('Hit: 7 (1d6 + 4) Slashing damage, and the target is Blinded for 1 minute.', initial)} ${REPEAT}`;
    const { source, ir, path, feature } = fixture(quote);
    delete feature.appliedConditions![0]!.escapeDc;
    expect(findings(source, ir)).not.toContainEqual({ code: 'ATTACK_REPEAT_SAVE_NOT_INITIAL', path: `${path}/save` });
  });

  test('a separate source-explicit escape check preserves its matching escapeDc', () => {
    const quote = `${ATTACK} ${REPEAT} The target can use its action to make a DC 15 Strength check to escape.`;
    const { source, ir, path, feature } = fixture(quote);
    delete feature.save;
    expect(findings(source, ir)).not.toContainEqual({ code: 'REPEAT_SAVE_NOT_ESCAPE_DC', path: `${path}/appliedConditions/0/escapeDc` });
    feature.appliedConditions![0]!.escapeDc = 16;
    expect(findings(source, ir)).toContainEqual({ code: 'REPEAT_SAVE_NOT_ESCAPE_DC', path: `${path}/appliedConditions/0/escapeDc` });
  });
});
