import { describe, expect, test } from 'bun:test';
import { sha256 } from '@fvtt-json-generator/contracts/hash';
import {
  RESOLVER_MODULE_ID,
  hashManifest,
  conflictingSpellReuseBindings,
  validatePortableSpellManifest,
  validatePortableSpellManifestStructure,
  type PortableSpellManifest,
} from '..';

const source = 'At will: mage armor (self only).';

function manifest(): PortableSpellManifest {
  const quote = 'mage armor';
  const start = source.indexOf(quote);
  return {
    schemaVersion: 1,
    manifestId: 'contract-package-test',
    sourceSha256: sha256(source),
    rulesPreference: '2024',
    spellcastingGroups: [{
      groupId: 'at-will',
      featureItemKey: 'innate-spellcasting',
      ability: 'cha',
      spellRefs: [{
        refId: 'mage-armor',
        identifier: 'mage-armor',
        originalName: 'Mage Armor',
        aliases: [],
        method: 'at-will',
        restrictions: [],
        evidence: [{ start, end: start + quote.length, quote }],
      }],
    }],
  };
}

describe('portable spell manifest package boundary', () => {
  test('validates a source-backed portable manifest without resolver runtime code', () => {
    const value = manifest();
    expect(RESOLVER_MODULE_ID).toBe('fvtt-json-generator-spell-resolver');
    expect(validatePortableSpellManifest(value, source)).toEqual({ ok: true, value });
  });

  test('rejects destination-world identifiers structurally', () => {
    const value = structuredClone(manifest());
    value.spellcastingGroups[0]!.spellRefs[0]!.originalName = 'Actor.abcdefghijklmnop';

    const result = validatePortableSpellManifestStructure(value);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected structural validation to fail.');
    expect(result.findings).toContainEqual(expect.objectContaining({
      code: 'FORBIDDEN_TARGET_WORLD_IDENTIFIER',
      path: '/spellcastingGroups/0/spellRefs/0/originalName',
    }));
  });
});

function reusedManifest(){
 const value=manifest(),text=source+'\nLegendary casting: mage armor.';
 value.sourceSha256=sha256(text);
 const target=value.spellcastingGroups[0]!,ref=structuredClone(target.spellRefs[0]!);
 ref.refId='legendary-armor';ref.reuseOf={groupId:target.groupId,refId:target.spellRefs[0]!.refId};
 const start=text.lastIndexOf('mage armor');ref.evidence=[{start,end:start+'mage armor'.length,quote:'mage armor'}];
 value.spellcastingGroups.push({...structuredClone(target),groupId:'legendary-carrier',featureItemKey:'second-feature',spellRefs:[ref]});
 return{value,text};
}
test('explicit source reuse retains one definition and a separate at-will carrier',()=>{
 const {value,text}=reusedManifest();expect(validatePortableSpellManifest(value,text)).toEqual({ok:true,value});
});
for(const wrong of ['missing-link','dangling','cycle','identity','profile','pool','method','recharge','evidence','extra-key'] as const)test('reuse cannot hide a duplicate definition or conflicting mechanic: '+wrong,()=>{
 const {value}=reusedManifest(),target=value.spellcastingGroups[0]!,group=value.spellcastingGroups[1]!,ref=group.spellRefs[0]!;
 if(wrong==='missing-link')delete ref.reuseOf;
 if(wrong==='dangling')ref.reuseOf!.refId='no-such-definition';
 if(wrong==='cycle')target.spellRefs[0]!.reuseOf={groupId:group.groupId,refId:ref.refId};
 if(wrong==='identity')ref.originalName='Shield';
 if(wrong==='profile')group.ability='int';
 if(wrong==='pool')ref.uses={value:3,recovery:'day',shared:false};
 if(wrong==='method')ref.method='innate';
 if(wrong==='recharge')group.recharge=[5,6];
 if(wrong==='evidence')ref.evidence=structuredClone(target.spellRefs[0]!.evidence);
 if(wrong==='extra-key')(ref.reuseOf as any).uuid='forbidden';
 const result=validatePortableSpellManifestStructure(value);expect(result.ok).toBe(false);
 if(result.ok)throw Error('Expected rejection');
 expect(result.findings.some(f=>['INVALID_SPELL_REUSE','DUPLICATE_LOGICAL_SPELL','UNKNOWN_PROPERTY'].includes(f.code))).toBe(true);
});

test('reuse relationship participates in the manifest hash and shared selected binding',()=>{
 const {value}=reusedManifest(),group=value.spellcastingGroups[1]!,ref=group.spellRefs[0]!,target=ref.reuseOf!;
 const first=hashManifest(value),changed=structuredClone(value);changed.spellcastingGroups[1]!.spellRefs[0]!.reuseOf!.refId='other';
 expect(hashManifest(changed)).not.toBe(first);
 const same=[{groupId:target.groupId,refId:target.refId,value:'chosen-source'},{groupId:group.groupId,refId:ref.refId,value:'chosen-source'}];
 expect(conflictingSpellReuseBindings(value,same)).toEqual([]);
 expect(conflictingSpellReuseBindings(value,[same[0]!,{...same[1]!,value:'other-source'}])).toEqual([{groupId:group.groupId,refId:ref.refId}]);
 expect(conflictingSpellReuseBindings(value,[same[1]!])).toHaveLength(1);
});
