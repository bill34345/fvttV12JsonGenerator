/** Numerical rubric frozen before requests. Natural-language conditions receive
 * a separate blinded source review, never an exact-sentence regex verdict. */
export const operations = (row: any) => [row, ...(row.其他操作 ?? [])];
const compact = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/gu,'');
const types: Record<string,string> = { 挥砍:'slashing',穿刺:'piercing',钝击:'bludgeoning',火焰:'fire',火:'fire',毒素:'poison',毒:'poison',酸蚀:'acid',强酸:'acid',酸:'acid',光耀:'radiant',黯蚀:'necrotic',暗蚀:'necrotic',死灵:'necrotic' };
const type = (s: string) => types[s] ?? s.toLowerCase();
export function passes(row: any, check: any): boolean {
  const ops=operations(row);
  switch(check.kind) {
    case 'attack': return ops.some(o=>o.攻击 && o.攻击.命中加值===check.toHit && o.攻击.触及尺===check.reach);
    case 'damage': return ops.some(o=>(o.伤害??[]).some((d:any)=>compact(d.公式)===compact(check.formula) && type(d.伤害类型)===check.type && d.倍率===check.multiplier));
    case 'save': return ops.some(o=>o.豁免 && o.豁免.DC===check.dc && o.豁免.属性?.length===1 && o.豁免.属性[0]===check.ability);
    case 'uses': return row.使用次数===check.max && typeof row.恢复方式==='string' && !!row.恢复方式.trim();
    case 'distance': return ops.some(o=>(o.距离??[]).some((d:any)=>d.尺===check.feet) || o.范围?.距离尺===check.feet || o.范围?.大小尺===check.feet || o.攻击?.射程尺===check.feet);
    case 'area': return ops.some(o=>o.范围?.大小尺===check.size);
    case 'legendary': return row.传奇动作消耗===check.cost && row.共享资源?.上限===check.pool && typeof row.共享资源?.恢复==='string' && !!row.共享资源.恢复.trim();
    case 'healing': return ops.some(o=>(o.治疗??[]).some((h:any)=>compact(h.公式)===compact(check.formula) && h.类型==='治疗'));
    case 'dynamicHealing': return ops.some(o=>(o.治疗??[]).some((h:any)=>h.公式==null && typeof h.取值依据==='string' && !!h.取值依据.trim() && h.类型==='治疗'));
    default: throw Error('UNKNOWN_FROZEN_CHECK');
  }
}
export function evaluate(rows: any[], requirements: any[]) {
  return requirements.map(req=>{
    const row=rows.find(r=>r.编号===req.id);
    return { unitId:req.id, name:req.name, status:row?'PENDING_MANUAL_REVIEW':'NO_PARSED_ROW',
      numericalChecks:req.checks.map((check:any,index:number)=>({index,check,pass:!!row&&passes(row,check)})),
      manualRequirements:req.manual };
  });
}
