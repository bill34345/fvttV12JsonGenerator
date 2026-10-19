import {test,expect} from 'bun:test';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {buildForgeActorRequest,convertFinalActorSource} from '@fvtt-json-generator/forge-browser-runtime';
import {buildRatWarlockIr} from '../src/core/intake/__tests__/fixtures/rat-warlock';
test('explicit natural AC kind survives formal rendering when a separate note was not duplicated by AI',async()=>{
  const ir=buildRatWarlockIr();ir.creature.attributes.acKind='natural';delete ir.creature.attributes.acNote;
  const markdown=renderMonsterIntakeMarkdown(ir);
  expect(markdown).toContain('天生护甲');
  const response=await convertFinalActorSource(buildForgeActorRequest({content:markdown,displayName:ir.creature.identity.name,requestId:'natural-ac-note-fixture',fvttVersion:'14.364',systemVersion:'5.3.3'}));
  if(!('result' in response)||!('artifact' in response.result))throw new Error('Expected formal Actor artifact');
  expect((response.result.artifact!.system as any).attributes.ac).toMatchObject({flat:ir.creature.attributes.ac,calc:'flat'});
  expect((response.result.artifact!.system as any).details.biography.value).toContain('天生护甲');
});
test('flat AC does not invent an armor note and an explicit source note is preserved exactly',async()=>{
  const ir=buildRatWarlockIr();ir.creature.attributes.acKind='flat';delete ir.creature.attributes.acNote;
  expect(renderMonsterIntakeMarkdown(ir)).not.toContain('天生护甲');
  ir.creature.attributes.acNote='天生护甲；举盾时19';
  const markdown=renderMonsterIntakeMarkdown(ir);expect(markdown).toContain('天生护甲；举盾时19');
  // Source-presentation metadata and composed display both retain the note;
  // assert the actual visible artifact rather than counting YAML serialization.
  const response=await convertFinalActorSource(buildForgeActorRequest({content:markdown,displayName:ir.creature.identity.name,requestId:'flat-ac-source-note-fixture',fvttVersion:'14.364',systemVersion:'5.3.3'}));
  if(!('result' in response)||!('artifact' in response.result))throw new Error('Expected formal Actor artifact');
  const biography=String((response.result.artifact!.system as any).details.biography.value);
  expect(biography.match(/天生护甲/g)).toHaveLength(1);
  expect(biography).toContain('举盾时19');
});
