import { test, expect } from 'bun:test';
import yaml from 'js-yaml';
import { makeBatches, decodeReply, prompt, type Unit } from './diagnostics/forge-template-batches';

const units: Unit[] = [{ id:'one', name:'Knife', section:'action', quote:'Knife source' }, { id:'two', name:'Trait', section:'trait', quote:'Trait source' }];
const batch = makeBatches(units, 'whole')[0]!;
const form = () => yaml.load(batch.template) as any;
const reply = (value: any) => ({ markdown: yaml.dump(value, { lineWidth: -1 }) });
test('only task grouping changes: same unit identities, empty form, prompt, no model proof field', () => {
  expect(makeBatches(units,'category')).toHaveLength(2); expect(makeBatches(units,'whole')).toHaveLength(1);
  expect(makeBatches(units,'category').flatMap(b => b.units)).toEqual(batch.units);
  expect(decodeReply({ markdown: batch.template }, batch).rows.map(r=>r.source)).toEqual(units.map(u=>u.quote));
  expect(batch.template).not.toContain('proof'); expect(prompt).toContain('不把平均值除以二');
});
test('one YAML fence and exact defined category alias accepted without modifying mechanics', () => {
  const bonus = makeBatches([{...units[0]!, section:'bonus'}], 'whole')[0]!;
  expect(decodeReply({ markdown:'```yaml\n'+bonus.template.replace('附赠动作:', '附加动作:')+'```' }, bonus).rows[0].编号).toBe('one');
});
test('missing, extra, duplicate, renamed and wrong-category units rejected', () => {
  const missing=form(); delete missing.特性; expect(()=>decodeReply(reply(missing),batch)).toThrow('FORM_MISSING');
  const extra=form(); extra.动作.push({...extra.动作[0],编号:'extra'}); expect(()=>decodeReply(reply(extra),batch)).toThrow('FORM_IDENTITY');
  const dup=form(); dup.动作.push({...dup.动作[0]}); expect(()=>decodeReply(reply(dup),batch)).toThrow('FORM_IDENTITY');
  const rename=form(); rename.动作[0].名称='Changed'; expect(()=>decodeReply(reply(rename),batch)).toThrow('FORM_IDENTITY');
  const move=form(); move.动作.push(move.特性.pop()); expect(()=>decodeReply(reply(move),batch)).toThrow('FORM_IDENTITY');
});
test('zero reach, signed toHit and explicit conditional half dice survive', () => {
  const f=form(); f.动作[0].攻击={类型:'近战攻击',命中加值:10,触及尺:0}; f.动作[0].伤害=[{公式:'10d8 + 4',伤害类型:'挥砍',生效条件:'半血',倍率:.5,成功时倍率:null}];
  const r=decodeReply(reply(f),batch).rows[0]; expect(r.攻击.触及尺).toBe(0); expect(r.伤害[0].公式).toBe('10d8 + 4'); expect(r.伤害[0].倍率).toBe(.5);
});
test('wrong numeric types, unsupported fields and malformed YAML fail, no silent semantic repairs', () => {
  const f=form(); f.动作[0].攻击={类型:'近战攻击',命中加值:'10'}; expect(()=>decodeReply(reply(f),batch)).toThrow('FORM_ATTACK');
  const extra=form(); extra.动作[0].effects=[]; expect(()=>decodeReply(reply(extra),batch)).toThrow('FORM_SHAPE');
  expect(()=>decodeReply({markdown:'动作: [bad'},batch)).toThrow();
});
test('shared complete source stays bound even when output explanatory prose differs', () => {
  const f=form(); f.动作[0].特殊规则='合法转述: 条件说明';
  const r=decodeReply(reply(f),batch); expect(r.rows[0].特殊规则).toBe('合法转述: 条件说明'); expect(r.rows[0].source).toBe('Knife source');
});
