import { describe, expect, test } from 'bun:test';
import { anchorIrEvidence, anchorIrEvidenceSourceAudit } from '@fvtt-json-generator/intake-ai/orchestrator';
import { auditMonsterIntakeSource } from '@fvtt-json-generator/intake-ai/validator';
import { buildValidLurkerIr } from '../src/core/intake/__tests__/fixtures/lurker';

const ENGLISH='Str 18 +4 +7\nDex 14 +2 +2\nCon 14 +2 +6\nInt 11 +0 +0\nWis 13 +1 +5\nCha 16 +3 +3';
const CHINESE='力量 18 +4 +7  敏捷 14 +2 +2  体质 14 +2 +6\n智力 11 +0 +0  感知 13 +1 +5  魅力 16 +3 +3';
function candidate(source:string,start=0,end=source.length){return {id:'source-test',label:'Source test',start,end,quote:source.slice(start,end)};}
function omitted(){const ir=buildValidLurkerIr();ir.creature.saves={};ir.claims=[];ir.coverage=[];return ir;}

describe('explicit candidate-scoped source-audit saving throws',()=>{
  for(const [label,rows] of [['English six-row PDF',ENGLISH],['Chinese multi-column',CHINESE],['explicit save list','Saving Throws Str +7, Con +6, Wis +5']]){
    test(`recovers source totals from ${label} and preserves exact claims`,()=>{
      for(const newline of ['\n','\r\n']){
        const source=`AC 14\nHP 65\n${rows}\nTraits\nOther source prose.`.replaceAll('\n',newline);
        const ir=omitted();
        const restored=anchorIrEvidenceSourceAudit(source,candidate(source),ir);
        expect(restored.creature.saves).toMatchObject({str:7,con:6,wis:5});
        expect(restored.claims.filter(claim=>claim.path==='/creature/saves').flatMap(claim=>claim.evidence).every(ref=>source.slice(ref.start,ref.end)===ref.quote)).toBe(true);
        expect(ir.creature.saves).toEqual({});
        expect(restored.creature.actions.map(({activationType:_,...action})=>action)).toEqual(ir.creature.actions);
        expect(auditMonsterIntakeSource(source,ir).findings.some(f=>f.code==='SOURCE_SAVE_OMITTED')).toBe(true);
        expect(auditMonsterIntakeSource(source,restored).findings.filter(f=>f.code==='SOURCE_SAVE_OMITTED')).toEqual([]);
        const again=anchorIrEvidenceSourceAudit(source,candidate(source),restored);
        expect(again.claims.filter(claim=>claim.path==='/creature/saves')).toEqual(restored.claims.filter(claim=>claim.path==='/creature/saves'));
      }
    });
  }
  test('does not borrow another candidate or a table inside Traits',()=>{
    const first='AC 14\nHP 65\nTraits\nSaving Throws Str +7, Con +6, Wis +5\n'+ENGLISH;
    const second='\nAC 18\nHP 228\n'+ENGLISH+'\nTraits';
    const result=anchorIrEvidenceSourceAudit(first+second,candidate(first+second,0,first.length),omitted());
    expect(result.creature.saves).toEqual({});
  });
  test('wrapped, colon and heading-free features cannot supply base saving throws',()=>{
    for(const heading of ['Traits:','**Traits**','**Traits:**','### Actions:','**Borrowed Form**','### Borrowed Form','Borrowed Form. Use the following while transformed:']){
      const source=`AC 14\nHP 65\n${heading}\nSaving Throws Str +9, Con +8`;
      expect(anchorIrEvidenceSourceAudit(source,candidate(source),omitted()).creature.saves).toEqual({});
    }
  });
  test('does not invent saves from an incomplete numeric fragment or overwrite conflicting IR values',()=>{
    const source='AC 14\nHP 65\nStr 18 +4 +7\nTraits';
    expect(anchorIrEvidenceSourceAudit(source,candidate(source),omitted()).creature.saves).toEqual({});
    const full='AC 14\nHP 65\n'+ENGLISH+'\nTraits';
    const ir=omitted();ir.creature.saves.con=4;
    const result=anchorIrEvidenceSourceAudit(full,candidate(full),ir);
    expect(result.creature.saves.con).toBe(4);
    expect(auditMonsterIntakeSource(full,result).findings).toContainEqual(expect.objectContaining({code:'SOURCE_SAVE_OMITTED',path:'/creature/saves/con'}));
  });
  test('keeps contradictory explicit lists blocked and does not choose a value',()=>{
    const source='AC 14\nHP 65\nSaving Throws Con +6\nSaving Throws Con +9\nTraits';
    const result=anchorIrEvidenceSourceAudit(source,candidate(source),omitted());
    expect(result.creature.saves).toEqual({});
    expect(auditMonsterIntakeSource(source,result).findings).toContainEqual(expect.objectContaining({code:'SOURCE_SAVE_CONFLICT',path:'/creature/saves/con'}));
  });
});

test('default anchoring preserves omitted and conflicting saves without copying header totals',()=>{
  const source='AC 14\nHP 65\n'+ENGLISH+'\nTraits',ir=omitted();ir.creature.saves.con=4;
  const before=structuredClone(ir),retained=anchorIrEvidence(source,candidate(source),ir);
  expect(retained.creature.saves).toEqual({con:4});expect(ir).toEqual(before);
  expect(retained.creature.actions.map(({activationType:_,...action})=>action)).toEqual(ir.creature.actions);
  expect(auditMonsterIntakeSource(source,retained).findings).toContainEqual(expect.objectContaining({code:'SOURCE_SAVE_OMITTED',path:'/creature/saves/con'}));
});
