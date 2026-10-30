import {existsSync} from 'node:fs';
import {test,expect} from 'bun:test';
import yaml from 'js-yaml';
import {makeBatches,decodeReply,prompt,type Unit} from './diagnostics/forge-template-batches-v2';
import {passes} from './diagnostics/forge-repeat-v2-checks';
import {prepareCases,schedule} from './diagnostics/forge-repeat-v2-trial';

const unit:Unit={id:'example',name:'Example',section:'action',quote:'Example source.',context:[]};
const batch=makeBatches([unit],'whole')[0]!;
const form=()=>yaml.load(batch.template) as any;
const reply=(v:any)=>({markdown:yaml.dump(v,{lineWidth:-1})});
test('V2 empty extensions are arrays, source stays program bound and illegal geometry fails',()=>{
 const f=form();expect(f.动作[0].距离).toEqual([]);expect(f.动作[0].治疗).toEqual([]);
 expect(decodeReply(reply(f),batch).rows[0].source).toBe(unit.quote);
 f.动作[0].范围={形状:'传送',大小尺:0,距离尺:120};expect(()=>decodeReply(reply(f),batch)).toThrow('V2_AREA');
});
test('non-area distance and exact source-derived dynamic healing coexist on ordinary action',()=>{
 const f=form();f.动作[0].距离=[{用途:'传送目的地',尺:120,条件:null}];
 f.动作[0].治疗=[{公式:null,取值依据:'目标实际受到的黯蚀伤害',类型:'治疗',目标:'自身',生效条件:'命中'}];
 const row=decodeReply(reply(f),batch).rows[0];expect(passes(row,{kind:'distance',feet:120})).toBe(true);expect(passes(row,{kind:'dynamicHealing'})).toBe(true);
 expect(prompt).toContain('传奇动作消耗和共享资源为null；距离和治疗不适用时为[]');
});
test('fixed healing supported, invalid number or incompatible basis rejected',()=>{
 const f=form();f.动作[0].治疗=[{公式:'20',取值依据:null,类型:'治疗',目标:'自身',生效条件:'回合开始'}];
 expect(passes(decodeReply(reply(f),batch).rows[0],{kind:'healing',formula:'20'})).toBe(true);
 f.动作[0].治疗[0].公式='actual damage';expect(()=>decodeReply(reply(f),batch)).toThrow('V2_HEALING');
});
test('legacy range and radial distance are accepted equivalent fields, no sentence-equality gate',()=>{
 expect(passes({范围:{形状:'球体',大小尺:15,距离尺:60}},{kind:'distance',feet:60})).toBe(true);
 expect(passes({范围:{形状:'半径',大小尺:120,中心:'自身'}},{kind:'distance',feet:120})).toBe(true);
 expect(passes({范围:{大小尺:15,距离尺:60}},{kind:'distance',feet:120})).toBe(false);
});
test('missing computed half is rejected even if prose says half, conditional numeric part accepted',()=>{
 const row={伤害:[{公式:'10d8+4',伤害类型:'挥砍',倍率:1}],特殊规则:'半血时伤害减半'};
 expect(passes(row,{kind:'damage',formula:'10d8+4',type:'slashing',multiplier:.5})).toBe(false);
 row.伤害.push({公式:'10d8+4',伤害类型:'挥砍',倍率:.5});
 expect(passes(row,{kind:'damage',formula:'10d8+4',type:'slashing',multiplier:.5})).toBe(true);
});
test('legendary cost and pool remain distinct from daily uses',()=>{
 const f=form();Object.assign(f.动作[0],{传奇动作消耗:2,共享资源:{名称:'传奇动作',上限:3,恢复:'自身回合开始',限制:'其他生物回合结束'}});
 const r=decodeReply(reply(f),batch).rows[0];expect(passes(r,{kind:'legendary',cost:2,pool:3})).toBe(true);expect(passes(r,{kind:'uses',max:3})).toBe(false);
});
test.skipIf(!existsSync('.local/forge-ab-high-first-pass-20261019/S1-A/source.md'))('all 24 paired candidates and 45 unique predetermined HTTP tasks; source crops/identities match',()=>{
 const cases=prepareCases();expect(cases.map(c=>c.units.length)).toEqual([3,7,10,14]);
 const tasks=schedule();expect(tasks).toHaveLength(24);
 let calls=0;const identities=new Set<string>();
 for(const t of tasks){const c=cases.find(c=>c.id===t.caseId)!;const bs=t.arm==='BC'?c.category:c.whole;calls+=bs.length;
  for(const b of bs){const id=[t.caseId,t.repeat,t.arm,b.id].join('/');expect(identities.has(id)).toBe(false);identities.add(id);}}
 expect(calls).toBe(45);expect(identities.size).toBe(45);
 const dragon=cases[2]!,vampire=cases[3]!;
 expect(dragon.source).not.toContain('Adult Red Dragon');expect(dragon.source).toContain('90-foot');expect(dragon.source).not.toContain('90--foot');
 expect(vampire.source).not.toContain('Shimmering Shield');expect(vampire.units[0]!.quote).toContain('except the damage it takes from sunlight');
 expect(vampire.units.at(-1)!.quote).toContain('one bite');
});
