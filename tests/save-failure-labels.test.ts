import { describe, expect, test } from 'bun:test';
import yaml from 'js-yaml';
import { buildForgeActorRequest, convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';
import { deriveExplicitSaveOutcome } from '@fvtt-json-generator/generation/save-outcome';

async function generate(description: string,withDamage=true) {
  const content = `---\n${yaml.dump({
    名称: 'Branch source fixture', 类型: 'npc', 护甲等级: 12, 生命值: 40,
    能力: { 力量: 10, 敏捷: 12, 体质: 14, 智力: 10, 感知: 10, 魅力: 10 },
    动作: [{ 名称: 'Source Pulse', 类型: 'save', 激活: 'action', 描述: description, DC: 15, 属性: '敏捷', ...(withDamage?{伤害: [{ 公式: '2d6', 类型: 'fire' }]}:{}) }],
  }, { lineWidth: -1 })}---\n`;
  const response = await convertFinalActorSource(buildForgeActorRequest({ content, displayName: 'Branch source fixture', requestId: 'branch-fixture', fvttVersion: '14.364', systemVersion: '5.3.3' }));
  expect('result' in response).toBe(true);
  if (!('result' in response)) throw new Error('Formal request failed.');
  if (response.result.status === 'failed') throw new Error('Formal Actor generation failed.');
  return response.result;
}

describe('source-labelled failed-save damage', () => {
  test.each([
    'Dexterity Saving Throw: DC 15. Failure: The creature\nis Restrained until the end of its next turn.',
    'Dexterity Saving Throw: DC 15. First Failure:\nThe target is\nUnconscious for one minute.',
    'Dexterity Saving Throw: DC 15. FAILURE: 目标\n陷入束缚，持续至下一回合结束。',
  ])('projects wrapped ordinary failed-save conditions without changing the formal Actor shape: %s',async(description)=>{
    const baseline=await generate(description.replaceAll('\n',' '),false);
    for(const newline of ['\n','\r\n']){
      const result=await generate(description.replaceAll('\n',newline),false);
      expect(result.verification.mechanicsCoverage.find(entry=>entry.kind==='save')?.status).toBe('projected');
      const normalized=[result,baseline].map(output=>{
        const actor=structuredClone(output.artifact) as any;
        for(const item of actor.items){
          item.system.description.value='';
          for(const effect of item.effects??[]){expect(effect.description.replace(/\s+/gu,' ')).toContain(description.replace(/\s+/gu,' '));effect.description='';}
          item.system.activities=Object.fromEntries(Object.entries(item.system.activities).map(([id,value],index)=>{
            const activity=value as any;
            expect(activity._id).toBe(id);
            expect(activity.save).toEqual({ability:['dex'],dc:{calculation:'',formula:'15'}});
            expect(activity.damage).toEqual({onSave:'none',parts:[]});
            activity._id=`source-activity-${index}`;activity.description.chatFlavor='';return [activity._id,activity];
          }));
        }
        const normalize=(value:any):any=>Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,key==='_id'?'<document-id>':['sourceText','description'].includes(key)&&typeof entry==='string'?entry.replace(/\s+/gu,' '):normalize(entry)])):value;
        return normalize(actor);
      });
      expect(normalized[0]).toEqual(normalized[1]);
    }
  });
  test('keeps review for wrapped margin/second failure, a separate paragraph or unresolved success',async()=>{
    for(const description of [
      'DC 15. Failure by 5 or More: The creature\nis Restrained.',
      'DC 15. Second Failure:\nThe target is Unconscious.',
      'DC 15. Failure: The GM decides.\nThe target is Restrained.',
      'DC 15. Failure: The GM decides\n\nThe target is Restrained.',
      'DC 15. Failure: The creature\nis Restrained. Success: The creature is Restrained for less time.',
      'DC 15. Failure: The creature is not\nRestrained.',
      'DC 15. Failure: The creature is immune to\nbeing Restrained.',
      'DC 15. Failure: If the target is already\nRestrained, the GM decides what happens.',
    ]){
      const result=await generate(description,false);
      expect(result.verification.mechanicsCoverage.find(entry=>entry.kind==='save')?.status).toBe('literal-only');
    }
  });
  test('preserves a literal Curse with native Save mechanics and no invented native condition',async()=>{
    const baseline=await generate('The target must succeed on a DC 15 Dexterity saving throw or be Cursed.',false);
    for(const description of [
      'Dexterity Saving Throw: DC 15. Failure: The creature is Cursed. Failure by 5 or More: Concentration is not required.',
      'Dexterity Saving Throw: DC 15.\nFIRST FAILURE :\nThe target becomes Cursed.',
      'Dexterity Saving Throw: DC 15. Failure: 目标受到诅咒。',
    ]){
      const result=await generate(description,false);
      expect(result.verification.mechanicsCoverage.find(entry=>entry.kind==='save')?.status).toBe('projected');
      const normalized=[result,baseline].map(output=>{
        const actor=structuredClone(output.artifact) as any;
        for(const item of actor.items){
          expect(item.effects).toEqual([]);
          // Content-selected icons can differ for distinct literal descriptions;
          // keep this comparison on the complete mechanical document shape.
          item.img='content-icon';
          item.system.description.value='';
          for(const effect of item.effects??[]){expect(effect.description.replace(/\s+/gu,' ')).toContain(description.replace(/\s+/gu,' '));effect.description='';}
          item.system.activities=Object.fromEntries(Object.entries(item.system.activities).map(([id,value],index)=>{
            const activity=value as any;expect(id).toMatch(/^[0-9a-z]{16}$/);expect(activity._id).toBe(id);
            expect(activity.save).toEqual({ability:['dex'],dc:{calculation:'',formula:'15'}});
            expect(activity.damage).toEqual({onSave:'none',parts:[]});
            expect(activity.effects??[]).toEqual([]);
            activity.img='content-icon';
            activity._id=`source-activity-${index}`;activity.description.chatFlavor='';return [activity._id,activity];
          }));
        }
        const normalize=(value:any):any=>Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,key==='_id'?'<document-id>':['sourceText','description'].includes(key)&&typeof entry==='string'?entry.replace(/\s+/gu,' '):normalize(entry)])):value;
        return normalize(actor);
      });
      expect(normalized[0]).toEqual(normalized[1]);
    }
    for(const description of [
      'DC 15. Failure by 5 or More: The creature is Cursed.',
      'DC 15. Second Failure: The target becomes Cursed.',
      'DC 15. Failure: The creature is Cursed. Success: The creature is Cursed for a shorter duration.',
      'DC 15. Failure: If the creature is already Cursed, the GM decides what happens.',
      'DC 15. Failure: The creature is immune to being Cursed.',
    ]){
      const result=await generate(description,false);
      expect(result.verification.mechanicsCoverage.find(entry=>entry.kind==='save')?.status).toBe('literal-only');
      expect(result.diagnostics.some(entry=>entry.code==='GEN_LITERAL_REVIEW_REQUIRED')).toBe(true);
    }
  });
  test('preserves explicit non-damage ordinary and first-failure Save activities without treating arbitrary prose as an outcome',async()=>{
    for(const description of ['Dexterity Saving Throw: DC 15. Failure: Unconscious for one minute.','Dexterity Saving Throw: DC 15. FAILURE: The target is Dazed.','Dexterity Saving Throw: DC 15. First Failure: Restrained. Second Failure: Petrified.']){
      const result=await generate(description,false);
      expect(result.verification.mechanicsCoverage.find(entry=>entry.kind==='save')?.status).toBe('projected');
      const activity=Object.values((result.artifact as any).items[0].system.activities)[0] as any;
      expect(activity.save).toEqual({ability:['dex'],dc:{calculation:'',formula:'15'}});
      expect(activity.damage).toEqual({onSave:'none',parts:[]});
    }
    expect(deriveExplicitSaveOutcome({desc:'DC 15. SECOND FAILURE: Petrified.',damage:[]})).toBe('literal');
  });
  const labelled = [
    'Each creature makes a Dexterity Saving Throw: DC 15. FAILURE: 7 (2d6) Fire damage.',
    'One creature makes a Dexterity saving throw: DC 15. Failure: 7 (2d6) Fire damage. FAILURE BY 5 OR MORE: The creature additionally has Disadvantage on Strength and Dexterity tests until it regains any Hit Points.',
    'Dexterity Saving Throw: DC 15.\nFAILURE :\n7 (2d6) Fire damage.',
  ];
  for (const [index, description] of labelled.entries()) test(`recognizes explicit failure label ${index + 1} through the formal workflow`, async () => {
    const result = await generate(description);
    const baseline = await generate('Each creature makes a DC 15 Dexterity saving throw, taking 7 (2d6) fire damage on a failed save.');
    expect(result.status).toBe('accepted');
    expect(result.verification.mechanicsCoverage.find(entry => entry.kind === 'save')?.status).toBe('projected');
    const actual = structuredClone(result.artifact) as any;
    const expected = structuredClone(baseline.artifact) as any;
    // Compare the full output; IDs bind literal descriptions, so validate their
    // linkage before normalizing those IDs and the two source descriptions.
    for (const actor of [actual, expected]) for (const item of actor.items) {
      item.system.description.value = '';
      item.system.activities = Object.fromEntries(Object.entries(item.system.activities).map(([id, activity], index) => {
        const entry = activity as any;
        expect(id).toMatch(/^[0-9a-z]{16}$/);
        expect(entry._id).toBe(id);
        entry.description.chatFlavor = '';
        entry._id = `source-activity-${index}`;
        return [entry._id, entry];
      }));
    }
    expect(actual).toEqual(expected);
    const activity = Object.values((result.artifact as any).items[0].system.activities)[0] as any;
    expect(activity.save).toEqual({ ability: ['dex'], dc: { calculation: '', formula: '15' } });
    expect(activity.damage).toEqual({ onSave: 'none', parts: [{ number: 2, denomination: 6, bonus: '', types: ['fire'], custom: { enabled: false, formula: '' }, scaling: { mode: 'whole', number: 1, formula: '' } }] });
  });
  test('retains review for an unimplemented success branch, margin-only failure and missing branch', async () => {
    for (const description of [
      'Dexterity Saving Throw: DC 15. FAILURE: 7 (2d6) Fire damage. SUCCESS: 3 Fire damage and the creature moves 10 feet.',
      'Dexterity Saving Throw: DC 15. FAILURE: 7 (2d6) Fire damage; SUCCESS: 3 Fire damage.',
      'Dexterity Saving Throw: DC 15. FAILURE BY 5 OR MORE: 7 (2d6) Fire damage.',
      'Dexterity Saving Throw: DC 15. A failure can have a consequence described by the GM.',
    ]) {
      const result = await generate(description);
      expect(result.status).toBe('needs_review');
      expect(result.diagnostics.some(entry => entry.code === 'GEN_LITERAL_REVIEW_REQUIRED')).toBe(true);
    }
  });
  test('keeps explicit outcome and existing unrelated inputs unchanged', () => {
    expect(deriveExplicitSaveOutcome({ save: { outcome: 'half' }, desc: labelled[0], damage: [{ formula: '2d6', type: 'fire' }] })).toBe('half');
    expect(deriveExplicitSaveOutcome({ desc: 'On a failed save, the creature takes damage. On a successful save, it takes half damage.', damage: [{ formula: '2d6', type: 'fire' }] })).toBe('half');
    expect(deriveExplicitSaveOutcome({ desc: 'Melee Attack Roll: +5. Hit: 7 (2d6) Fire damage.', damage: [{ formula: '2d6', type: 'fire' }] })).toBe('literal');
    expect(deriveExplicitSaveOutcome({ desc: 'Dexterity Saving Throw: DC 15. FAILURE: the GM decides.', damage: [] })).toBe('literal');
  });
});
