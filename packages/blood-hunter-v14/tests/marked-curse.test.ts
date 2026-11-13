import { expect, test } from 'bun:test';
import { compileBloodHunterV14Package } from '../src/index.ts';
import { makeBloodHunter2024Fixture } from './fixture.ts';

test('projects Marked source effects to sourceStart and CAT while retaining source identity and the amplification cost activity', () => {
  const source = makeBloodHunter2024Fixture();
  const entry = source.optionalfeature.find((feature) => feature.ENG_name === 'Blood Curse of the Marked')!;
  source.foundryOptionalfeature!.push({
    name: entry.name, source: entry.source,
    effects: ['source-only', 'all-attackers'].map((scope, index) => ({
      foundryId: index ? 'ea2cc143dc326cdb' : 'f39c809aadf72388', name: scope,
      type: 'base', disabled: true, transfer: false,
      changes: [{ key: 'flags.fvttJsonGenerator.bloodCurseMark', mode: 'OVERRIDE', value: scope }],
      duration: { expiry: 'sourceEnd' }, flags: { dae: { specialDuration: [] } },
    })),
    activities: [{
      _id: '6f6ad7b229d76963', name: '增幅印记血咒', type: 'utility',
      activation: { type: 'bonus', value: 1 },
      effects: [{ foundryId: 'ea2cc143dc326cdb' }],
      macroData: { name: 'manual', command: 'await ChatMessage.create({content:"manual"});' },
      midiProperties: { triggeredActivityId: '462ffe7b3656aed5' },
    }, {
      _id: '462ffe7b3656aed5', name: '增幅失血', type: 'damage',
      activation: { type: 'special', value: null },
      macroData: { name: 'loss', command: 'await actor.update({"system.attributes.hp.value":1});' },
    }],
    flags: { 'midi-qol': { onUseMacroName: '[postActiveEffects]ActivityMacro-6f6ad7b229d76963,[preDamageApplication]ActivityMacro-462ffe7b3656aed5' } },
  });
  const before = structuredClone(source);
  const pkg = compileBloodHunterV14Package(source);
  const marked: any = pkg.features.find((item) => (item.flags as any).fvttJsonGenerator.bloodHunter2024.sourceIdentity.normalizedName === 'blood-curse-of-the-marked')!;
  expect(source).toEqual(before);
  expect(marked.effects.map((effect: any) => effect._id)).toEqual(['f39c809aadf72388', 'ea2cc143dc326cdb']);
  expect(marked.effects.map((effect: any) => effect.duration.expiry)).toEqual(['sourceStart', 'sourceStart']);
  expect(marked.effects.map((effect: any) => effect.flags['fvtt-blood-hunter-2024'].markedScope)).toEqual(['source-only', 'all-attackers']);
  for (const effect of marked.effects) expect(effect.flags.cat.macros.roll).toEqual([{ source: 'fvtt-blood-hunter-2024', rules: 'all', identifier: 'bloodCurseOfTheMarked' }]);
  expect(marked.system.activities['6f6ad7b229d76963'].macroData.command).toBe('');
  expect(marked.system.activities['6f6ad7b229d76963'].midiProperties.triggeredActivityId).toBe('462ffe7b3656aed5');
  expect(marked.system.activities['462ffe7b3656aed5'].macroData.command).toBe('await actor.update({"system.attributes.hp.value":1});');
  expect(marked.flags['midi-qol'].onUseMacroName).toBe('[preDamageApplication]ActivityMacro-462ffe7b3656aed5');
  expect(pkg.coverageLedger.find((feature) => feature.sourceIdentity.normalizedName === 'blood-curse-of-the-marked')?.review.status).toBe('adjusted');
});
