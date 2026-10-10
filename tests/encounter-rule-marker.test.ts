import { describe, expect, test } from 'bun:test';
import { readEncounterRuleMarker } from '@fvtt-json-generator/contracts/encounter-rules';

function fixture(mode:'staged'|'manual',section:string='Legendary Actions',field:'section'|'actionSection'='section'){
  const prefix=`encounter-${mode}`;
  return {
    item:{name:'Legendary fixture',flags:{'tidy5e-sheet':{[field]:section}}},
    mechanic:{id:`${prefix}-legendary-4`,kind:'lifecycle',coverage:'literal',executionMode:'gm-assisted',ruleSource:'source-derived',
      carrier:{section:'传奇动作',name:'Legendary fixture'},
      conditions:[`${prefix}:/creature/legendaryActions/3/appliedConditions/0`,`${prefix}-coverage:actor.legendaryActions`,`${prefix}-status:stunned`],
      gmSteps:['Use the source-bound condition.','Apply its stated duration.']},
  };
}

describe('source-bound encounter rule marker Item section aliases',()=>{
  for(const mode of ['staged','manual'] as const)for(const section of ['传奇动作','Legendary Actions'])for(const field of ['section','actionSection'] as const){
    test(`${mode}: accepts exact ${section} in ${field}`,()=>{
      const {item,mechanic}=fixture(mode,section,field);
      expect(readEncounterRuleMarker(item,mechanic)).toEqual({mode,section:'legendaryActions',featureIndex:3,
        paths:[`encounter-${mode}:/creature/legendaryActions/3/appliedConditions/0`],statuses:['stunned']});
    });
  }
  test('accepts the flat normalized Item view without changing the canonical carrier',()=>{
    const {item,mechanic}=fixture('manual');
    expect(readEncounterRuleMarker({...item,section:'Legendary Actions'},mechanic)?.section).toBe('legendaryActions');
    expect(readEncounterRuleMarker(item,{...mechanic,carrier:{...mechanic.carrier,section:'Legendary Actions'}})).toBeUndefined();
  });
  test('does not loosen case, section priority, other section identities or feature identity',()=>{
    for(const section of ['Actions','动作','legendary actions','LEGENDARY ACTIONS','Legendary Actions ','Legendary Action']){
      const {item,mechanic}=fixture('manual',section);
      expect(readEncounterRuleMarker(item,mechanic)).toBeUndefined();
    }
    const {item,mechanic}=fixture('manual');
    expect(readEncounterRuleMarker({...item,section:'动作'},mechanic)).toBeUndefined();
    expect(readEncounterRuleMarker({...item,name:'Other feature'},mechanic)).toBeUndefined();
    expect(readEncounterRuleMarker(item,{...mechanic,id:'encounter-manual-action-4'})).toBeUndefined();
  });
  test('keeps exact condition index, source path and coverage checks',()=>{
    const {item,mechanic}=fixture('staged');
    for(const path of ['/creature/legendaryActions/2/appliedConditions/0','/creature/actions/3/appliedConditions/0',
      '/creature/legendaryActions/3/appliedConditions/01','/creature/legendaryActions/3/appliedConditions/0/extra']){
      expect(readEncounterRuleMarker(item,{...mechanic,conditions:[`encounter-staged:${path}`,...mechanic.conditions.slice(1)]})).toBeUndefined();
    }
    expect(readEncounterRuleMarker(item,{...mechanic,conditions:[mechanic.conditions[0],'encounter-staged-coverage:actor.actions']})).toBeUndefined();
    expect(readEncounterRuleMarker(item,{...mechanic,conditions:[...mechanic.conditions,mechanic.conditions[0]]})).toBeUndefined();
    expect(readEncounterRuleMarker(item,{...mechanic,id:'encounter-staged-legendary-0'})).toBeUndefined();
  });
});
