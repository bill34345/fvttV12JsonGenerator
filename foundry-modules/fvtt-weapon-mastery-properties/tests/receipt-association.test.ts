import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { evaluateExport } from '../e2e/receipt-cli.ts';

function recorded(): any {
  return JSON.parse(readFileSync(new URL('./fixtures/vex-two-hit-receipt.json', import.meta.url), 'utf8'));
}

function cleaveRecorded(): any {
  return JSON.parse(readFileSync(new URL('./fixtures/cleave-hit-receipt.json', import.meta.url), 'utf8'));
}

test('recorded Cleave links the child ledger and Midi card even without a parent flag on its native roll', () => {
  const receipt = cleaveRecorded();
  const original = JSON.stringify(receipt);
  const result = evaluateExport(receipt);
  expect(result.exitCode).toBe(0);
  expect(result.manifest.rules.cleave.status).toBe('PASS');
  expect(result.evidenceAssociation).toMatchObject({ status: 'derived', scope: 'cleave-child-attack-and-damage' });
  expect(result.manifest.rules.nick.status).toBe('NOT_EXECUTED');
  expect(JSON.stringify(receipt)).toBe(original);
});

test.each([
  ['missing parent link', (r: any) => { delete r.after.source.moduleLedger.find((e: any) => e.parentAttackId).parentAttackId; }],
  ['wrong child target', (r: any) => { r.newMessages.at(-1).dnd5eFlags.targets[0].uuid = 'Actor.other'; }],
  ['duplicate child native roll', (r: any) => { r.newMessages.push(structuredClone(r.newMessages.at(-1))); }],
  ['second distinct native roll for the child', (r: any) => { r.newMessages.push({ ...structuredClone(r.newMessages.at(-1)), id: 'different-message' }); }],
  ['extra child ledger', (r: any) => { r.after.source.moduleLedger.push(structuredClone(r.after.source.moduleLedger.find((e: any) => e.parentAttackId))); }],
  ['wrong damage proof', (r: any) => { r.after.secondary.damageProof.attackMessageId = 'other'; }],
  ['unrelated HP update', (r: any) => { r.after.secondary.hpValue--; }],
  ['different turn', (r: any) => { r.after.activeTurnKey = 'another-turn'; }],
  ['mixed batch', (r: any) => { r.before.runId = 'another-batch'; }],
  ['ambiguous damage rolls', (r: any) => { r.newMessages[2].rolls.push(structuredClone(r.newMessages[2].rolls[1])); }],
  ['missing geometry', (r: any) => { delete r.before.cleaveGeometry; }],
  ['child still pending', (r: any) => { r.after.source.moduleLedger.find((e: any) => e.parentAttackId).step = 'prepared'; }],
] as const)('Cleave association rejects %s', (_name, alter) => {
  const receipt = cleaveRecorded(); alter(receipt);
  expect(evaluateExport(receipt).exitCode).toBe(2);
});

test('Cleave reports FAIL when the linked actual damage incorrectly includes a positive ability modifier', () => {
  const receipt = cleaveRecorded();
  const damage = receipt.newMessages[2].rolls[1];
  damage.total = 5; damage.formula = '1d12 + 3';
  receipt.after.secondary.hpValue = 195;
  receipt.after.secondary.damageProof.after.hp = 195;
  const result = evaluateExport(receipt);
  expect(result.exitCode).toBe(1);
  expect(result.manifest.rules.cleave.reasons).toContain('cleave-child-damage-or-range-wrong');
});

test('explicit Cleave child observations retain their own incomplete result', () => {
  const receipt = cleaveRecorded();
  receipt.classifiedInput.rules.cleave.mechanic = { childAttack: {} };
  const result = evaluateExport(receipt);
  expect(result.evidenceAssociation.status).toBe('unchanged');
  expect(result.exitCode).toBe(2);
});

test('saved real two-hit receipt closes without manually entering the second attack IDs', () => {
  const receipt = recorded();
  const original = JSON.stringify(receipt);
  const result = evaluateExport(receipt);
  expect(result.exitCode).toBe(0);
  expect(result.manifest.rules.vex.status).toBe('PASS');
  expect(result.evidenceAssociation).toMatchObject({ status: 'derived', scope: 'advantage-consumption-and-regrant' });
  expect(result.manifest.rules.slow.status).toBe('NOT_EXECUTED');
  expect(result.manifest.cleanup.status).toBe('NOT_EXECUTED');
  expect(JSON.stringify(receipt)).toBe(original);
});

test('a second damaging hit without a fresh Vex is FAIL, despite successful advantage and consumption', () => {
  const receipt = recorded();
  receipt.after.source.effects = [];
  const result = evaluateExport(receipt);
  expect(result.exitCode).toBe(1);
  expect(result.manifest.rules.vex.reasons).toContain('vex-regrant-effect-instance-absent');
});

test.each([
  ['ambiguous second attack', (r: any) => { r.newMessages.push(structuredClone(r.newMessages.at(-1))); }],
  ['wrong target', (r: any) => { r.newMessages.at(-1).dnd5eFlags.targets[0].uuid = 'Actor.other'; }],
  ['missing checkpoint', (r: any) => { delete r.vexCheckpoint; }],
  ['normal explicitly selected', (r: any) => { r.vexPreRoll.selectedMode = 'normal'; }],
  ['missing effect reservation', (r: any) => { r.after.source.moduleLedger[1].reservations = []; }],
  ['wrong workflow on Midi card', (r: any) => { r.newMessages[2].midiFlags.attackRoll.options.__fvttWeaponMasteryUse = 'other'; }],
  ['missing effect readback', (r: any) => { delete r.after.source.effects; }],
  ['unrelated HP change', (r: any) => { r.after.target.hpValue -= 1; }],
  ['missing damage proof', (r: any) => { delete r.after.target.damageProof; }],
  ['proof from another target', (r: any) => { r.after.target.damageProof.targetActorUuid = 'Actor.other'; }],
  ['stale replacement effect', (r: any) => { r.after.source.effects[0].flags['fvtt-custom-conditions'].weaponEffect.createdAt = 1; }],
  ['mixed batch', (r: any) => { r.after.runId = 'other'; }],
  ['mixed build', (r: any) => { r.classifiedInput.buildIdentity.observedBuildId = 'other'; }],
  ['ambiguous new effects', (r: any) => { r.after.source.effects.push(structuredClone(r.after.source.effects[0])); }],
] as const)('recorded association stays incomplete for %s', (_name, alter) => {
  const receipt = recorded();
  alter(receipt);
  expect(evaluateExport(receipt).exitCode).toBe(2);
});

test('explicit incomplete observations are not silently replaced with inferred success', () => {
  const receipt = recorded();
  receipt.classifiedInput.rules.vex.nextAttack = {};
  const result = evaluateExport(receipt);
  expect(result.exitCode).toBe(2);
  expect(result.evidenceAssociation.status).toBe('unchanged');
});
