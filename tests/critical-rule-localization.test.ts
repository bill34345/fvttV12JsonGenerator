import { describe, expect, test } from 'bun:test';
import { localizationHash, localizationRequest, localizationText, validateLocalizationDraft, localizationMeaningFindings, approveLocalizationByGm, assertReviewedLocalization } from '@fvtt-json-generator/contracts/localization';
import { createReviewedTranslationService } from '@fvtt-json-generator/intake-ai/localization';
import { protectCriticalRulePhrases } from '../packages/intake-ai/src/critical-rule-localization';
import companyFailure from './fixtures/forge-company-rule-localization.json';

describe('source-derived critical rule protection', () => {
  for(const saved of companyFailure.cases)test('the recorded rule meaning failure is flagged while its reviewed correction remains usable: '+saved.originalTextId,()=>{
    const field=localizationText('body',saved.source),request=localizationRequest('recorded-meaning',[field]);
    expect(localizationMeaningFindings(request,{texts:[{id:field.id,text:saved.failedTranslation}]}).length).toBeGreaterThan(0);
    expect(localizationMeaningFindings(request,{texts:[{id:field.id,text:saved.reviewedCorrection}]})).toEqual([]);
    // Simulate a historical, hash-consistent approval. It is a validation
    // fixture only, not a new user approval or an importable product record.
    const stale=approveLocalizationByGm(request,{texts:[{id:field.id,text:saved.reviewedCorrection}]},'test-only-gm');
    stale.texts=[{id:field.id,text:saved.failedTranslation}];
    stale.approval.translationHash=localizationHash({requestHash:stale.requestHash,texts:stale.texts});
    expect(()=>assertReviewedLocalization(request,stale)).toThrow('中文');
    expect(validateLocalizationDraft(request,{texts:stale.texts})).toEqual({texts:stale.texts});
  });
  for(const [radius,range] of [[15,60],[10,90],[20,120]])test('a sphere origin range stays distinct from its radius: '+radius+'/'+range,()=>{
    const source=`Each creature in a ${radius}-foot radius Sphere within ${range} feet must make a saving throw.`;
    const protectedRule=protectCriticalRulePhrases(source),restored=protectedRule.restore(protectedRule.text);
    expect(restored).toContain(`中心距使用此能力的生物${range}尺以内`);expect(restored).toContain(`半径${radius}尺`);expect(restored).not.toContain('施放者');
  });
  test('soft line breaks preserve the independent effect after a half-damage condition',()=>{
    const source='<p>Damage, or half as much damage if<br>the creature is Bloodied, and the target is Grappled<br>(escape DC 18).</p>';
    const protectedRule=protectCriticalRulePhrases(source);
    const restored=protectedRule.restore(protectedRule.text.replace('the creature','该生物'));
    expect(restored).toContain('此伤害');expect(restored).toContain('。目标还会陷入受擒状态');expect(restored.match(/<br>/gu)).toHaveLength(2);
    expect(restored.match(/<[^>]*>/gu)).toEqual(source.match(/<[^>]*>/gu));
    expect(()=>protectedRule.restore(protectedRule.text.replace('⟪RULEA⟫','TEMP').replace('⟪RULEB⟫','⟪RULEA⟫').replace('TEMP','⟪RULEB⟫'))).toThrow('受保护的关键规则');
    expect(()=>protectedRule.restore(protectedRule.text.replace('the creature','')+'该生物')).toThrow('受保护的关键规则');
  });
  test('a negated half-damage predicate remains negated inside the atomic result',()=>{
    const protectedRule=protectCriticalRulePhrases('Damage, or half as much damage if the creature is not Bloodied, and the target is Grappled.');
    const restored=protectedRule.restore(protectedRule.text.replace('the creature','该生物'));
    expect(restored).toContain('未处于浴血状态，此伤害减半。目标还会陷入受擒状态');
  });
  test('normal translation transport restores the new relation tokens with exact HTML and numbers',async()=>{
    const input=localizationRequest('new-source-relations',[
      localizationText('body','<p>Each creature in a 15-foot radius Sphere within 60 feet must make a saving throw.</p>'),
      localizationText('body','<p>Damage, or half as much damage if<br>the creature is Bloodied, and the target is Grappled<br>(escape DC 18).</p>'),
      localizationText('body','<p>Size Huge (Swarm of<br>Medium)</p>'),
    ]);
    let calls=0;
    const service=createReviewedTranslationService({baseUrl:'https://provider.example/v1',apiKey:'test-only',model:'fake',httpClient:async(_url,init)=>{
      calls++;const payload=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      const texts=payload.texts.map((entry:{id:string;source:string})=>({id:entry.id,text:entry.source.replace('must make a','必须进行一次').replace('Damage','伤害').replace('the creature','该生物').replace('escape','逃脱')}));
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({texts})}}]}),{status:200});
    }});
    const translated=await service.translate(input);expect(calls).toBe(1);
    expect(validateLocalizationDraft(input,translated)).toEqual(translated);expect(localizationMeaningFindings(input,translated)).toEqual([]);
    expect(translated.texts[0]!.text).toContain('半径15尺');expect(translated.texts[1]!.text).toContain('。目标还会陷入受擒状态');expect(translated.texts[2]!.text).toContain('由中型生物<br>组成的集群');
  });
  test('nearby conditional effects and a sphere around someone else are not rewritten as unconditional or caster-centered',()=>{
    for(const source of ['Damage, or half as much damage only if the creature is Bloodied, and the target is Grappled.','Damage, or half as much damage if the creature is Bloodied, and the target is Grappled only if it is prone.','Each creature in a 15-foot radius Sphere within 60 feet of the target.'])expect(protectCriticalRulePhrases(source).text).toBe(source);
  });
  test('a reformulated per-target distance limit is rejected without inventing a range owner',()=>{
    const source='Each creature in a 15-foot radius Sphere within 60 feet must make a saving throw.',field=localizationText('body',source),request=localizationRequest('sphere-rewording',[field]);
    expect(localizationMeaningFindings(request,{texts:[{id:field.id,text:'半径15尺的球形区域内的每个生物都必须进行豁免检定；每个生物必须位于60尺内。'}]}).length).toBeGreaterThan(0);
    const protection=protectCriticalRulePhrases(source);expect(protection.restore(protection.text)).not.toContain('施放者');
  });
  test.each([
    ['Save Ends at end of turn', '在每个回合结束时再次豁免，成功则结束此效应'],
    ['Save ends at the start of each turn', '在每个回合开始时再次豁免，成功则结束此效应'],
    ['Save Ends at beginning of turn', '在每个回合开始时再次豁免，成功则结束此效应'],
    ['The target can repeat the saving throw at the end of each of its turns, ending the effect on a success', '目标可以在其每个回合结束时再次进行豁免检定，成功则结束此效应'],
    ['At the start of each of its turns, the affected creature may repeat this saving throw, ending this effect on a success', '受影响的生物可以在其每个回合开始时再次进行豁免检定，成功则结束此效应'],
    ['On a successful saving throw, this effect ends', '豁免成功时，此效应结束'],
    ['The effect ends on a success', '成功时，此效应结束'],
    ['Failure by 5 or More', '失败差值达到5或以上'],
    ['fails this saving throw by 3 or more', '这次豁免检定的失败差值达到3或以上'],
    ['If this damage reduces the target to 0 Hit Points', '如果此次伤害使目标的生命值降至0'],
    ['If a creature is reduced to 0 HP by this damage', '如果一个生物因此次伤害而生命值降至0'],
    ['A creature reduced to 0 Hit Points by this damage', '因此次伤害生命值降至0的生物'],
  ])('restores %s with its exact timing, branch, margin or cause', (source, expected) => {
    const protectedRule = protectCriticalRulePhrases(source);
    expect(protectedRule.text).toBe('⟪RULEA⟫');
    expect(protectedRule.restore(protectedRule.text)).toBe(expected);
  });

  test('keeps ambiguous and unrelated clauses for ordinary translation', () => {
    for (const source of [
      'Save Ends at end of next turn',
      'The effect lasts until the end of the target’s next turn.',
      'Failure by at least 5',
      'If any damage reduces the target to 0 Hit Points',
      'If this damage reduces the target to 1 Hit Point',
      'The target can repeat its saving throw after taking damage.',
      '在回合结束时重复豁免，成功则结束。',
      'Save <strong>Ends</strong> at end of turn',
      '<span title="Save Ends at end of turn">The effect remains.</span>',
    ]) {
      const protectedRule = protectCriticalRulePhrases(source);
      const expected=source.replace(/\bsaving throws?\b/giu,'豁免检定').replace(/\b(?:activity|activities)\b/giu,'能力活动');
      expect(protectedRule.restore(protectedRule.text)).toBe(expected);
    }
  });

  test('restores the saved Company-style comma before the protected conditional as one separator',()=>{
    const protectedRule=protectCriticalRulePhrases('Damage, or half as much damage if the creature is Bloodied, and the target is Grappled.');
    const restored=protectedRule.restore('伤害，'+protectedRule.text.slice(protectedRule.text.indexOf('⟪RULEA⟫')).replace('the creature','该生物'));
    expect(restored).toBe('伤害；若该生物处于浴血状态，此伤害减半。目标还会陷入受擒状态.');
  });

  test('makes self-teleport range and spell level explicit without moving a target-relative origin',()=>{
    for(const range of [30,120,240]){
      const text=`The creature teleports to a space within ${range} feet.`;
      const rule=protectCriticalRulePhrases(text);
      expect(rule.restore(rule.text)).toBe(`The creature 传送至距其当前位置${range}尺以内的一处空间.`);
    }
    const target='The creature teleports to a space within 120 feet of the target.';
    expect(protectCriticalRulePhrases(target).text).toBe(target);
    const wrapped=protectCriticalRulePhrases('The creature teleports to a space<br>within 120 feet.');
    expect(wrapped.restore(wrapped.text)).toBe('The creature <br>传送至距其当前位置120尺以内的一处空间.');
    const otherOrigin='The creature teleports to a space<br>within 120 feet of the target.';
    expect(protectCriticalRulePhrases(otherOrigin).text).toBe(otherOrigin);
    const spell=protectCriticalRulePhrases('SUCCESS OR FAILURE: Each spell of Level 2 or below affecting<br>the creature ends.');
    expect(spell.restore(spell.text)).toBe('SUCCESS OR FAILURE: <br>影响该生物的2环或更低环阶法术都结束.');
  });

  test('locks confirmed Saving Throw and Activity wording without inventing timing',()=>{
    const protectedRule=protectCriticalRulePhrases('Use the Activity and make a Saving Throw.');
    expect(protectedRule.restore(protectedRule.text)).toBe('Use the 能力活动 and make a 豁免检定.');
  });

  test('rejects missing, duplicated, altered or invented rule placeholders', () => {
    const protectedRule = protectCriticalRulePhrases('Save Ends at end of turn. Failure by 5 or More.');
    expect(protectedRule.text).toBe('⟪RULEA⟫. ⟪RULEB⟫.');
    for (const bad of [
      '⟪RULEA⟫。',
      '⟪RULEA⟫、⟪RULEA⟫。',
      '⟪RULEA⟫、⟪RULEC⟫。',
      '⟪RULEA⟫、⟪RULEB⟩。',
      '⟪RULEA⟫、⟪RULEB⟫、⟪RULEC⟫。',
    ]) expect(() => protectedRule.restore(bad)).toThrow('受保护的关键规则');
  });

  test('one fake provider request preserves Auntie-style HTML, numbers and mechanics without review', async () => {
    const input = localizationRequest('critical-rule-fixture', [
      localizationText('body', '<p>Frightened for 1 minute (Save Ends at end of turn).</p>'),
      localizationText('body', 'Failure by 5 or More: The hag can maintain this effect without Concentration.'),
      localizationText('body', 'A creature reduced to 0 Hit Points by this damage is infected with Merthirst.'),
      localizationText('body', 'The target can repeat the saving throw at the start of each of its turns, ending the effect on a success.'),
    ]);
    const hash = localizationHash(input);
    let calls = 0;
    const service = createReviewedTranslationService({ baseUrl: 'https://provider.example/v1', apiKey: 'fixture-only', model: 'fixture',
      httpClient: async (_url, init) => {
        calls++;
        const body = JSON.parse(String(init?.body));
        const payload = JSON.parse(body.messages[1].content);
        expect(payload.texts).toHaveLength(4);
        expect(payload.texts.map((entry: { source: string }) => entry.source)).toEqual([
          '⟦0⟧Frightened for ⟦1⟧ minute (⟪RULEA⟫).⟦2⟧',
          '⟪RULEA⟫: The hag can maintain this effect without Concentration.',
          '⟪RULEA⟫ is infected with Merthirst.',
          '⟪RULEA⟫.',
        ]);
        const chinese = [
          '⟦0⟧恐慌持续⟦1⟧分钟（⟪RULEA⟫）。⟦2⟧',
          '⟪RULEA⟫：海妖婆可以在不专注的情况下维持此效应。',
          '⟪RULEA⟫会感染海渴症。',
          '⟪RULEA⟫。',
        ];
        const response = { texts: payload.texts.map((entry: { id: string }, index: number) => ({ id: entry.id, text: chinese[index] })) };
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(response) } }] }), { status: 200 });
      },
    });
    const translated = await service.translate(input);
    expect(calls).toBe(1);
    expect(localizationHash(input)).toBe(hash);
    expect(validateLocalizationDraft(input, translated)).toEqual(translated);
    expect(translated.texts.map(entry => entry.text)).toEqual([
      '<p>恐慌持续1分钟（在每个回合结束时再次豁免，成功则结束此效应）。</p>',
      '失败差值达到5或以上：海妖婆可以在不专注的情况下维持此效应。',
      '因此次伤害生命值降至0的生物会感染海渴症。',
      '目标可以在其每个回合开始时再次进行豁免检定，成功则结束此效应。',
    ]);
  });

  test('service rejects a provider that drops its source-backed rule token', async () => {
    const input = localizationRequest('missing-rule-fixture', [localizationText('body', 'Save Ends at end of turn')]);
    const service = createReviewedTranslationService({ baseUrl: 'https://provider.example/v1', apiKey: 'fixture-only', model: 'fixture',
      httpClient: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        texts: [{ id: input.texts[0]!.id, text: '在回合结束时豁免。' }],
      }) } }] }), { status: 200 }),
    });
    await expect(service.translate(input)).rejects.toThrow('受保护的关键规则');
  });
});
