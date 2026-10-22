/** Frozen-trial candidate; extends the v1 form without editing historical code/evidence. */
import yaml from 'js-yaml';
import { makeBatches as baseBatches, decodeReply as baseDecode, prompt as basePrompt, type Unit as BaseUnit, type Batch as BaseBatch } from './forge-template-batches';
export type Unit = BaseUnit & { context: string[] };
export type Batch = Omit<BaseBatch, 'units'> & { units: Unit[] };
export const prompt = basePrompt + `
以下是两种调用粒度共用的 V2 字段补充；不是具体来源的答案。context 是原文明示共享前言，必须与对应父特性一起理解。处理任何类型的单位都使用相同规则。
新增 距离: [{用途:string,尺:number,条件:string|null}]。用于传送/位移目的地距离、选择目标距离等无法放入攻击射程或真实区域的数字。范围只用于原文明示的几何区域，形状只能是球体/半径/锥形/线形/立方体/圆柱体/矩形，不把传送写成形状，原文无区域时范围=null。距离和限制仍需完整保留；不得为填表编造大小0。
新增 治疗: [{公式:string|null,取值依据:string|null,类型:治疗|临时生命值,目标:string,生效条件:string|null}]。固定值或骰子填公式，取值依据=null；取决于实际造成/承受的伤害等动态值时公式=null、取值依据写清关系，不以骰子平均值或伤害公式冒充实际治疗量。使用条件、回合时点、抑制/终止条件均保留。生命上限降低等其他后果仍在特殊规则完整表达。
新增 传奇动作消耗:number|null，及 共享资源:{名称:string,上限:number,恢复:string,限制:string|null}|null。仅存在明确共享预算时填写。传奇动作本身的共享预算与单项代价必须填；共享预算的总量/何时恢复/何时使用来自context，不能把每个选项变成各自独立每天次数。传奇抗性的每日次数仍是使用次数/恢复方式，不能混进传奇动作预算。普通且不属于共享预算的动作，传奇动作消耗和共享资源为null；距离和治疗不适用时为[]，有相应机制时正常填写。
条件和分支必须落到相应字段：伤害替代/减半不能仅写在特殊规则而让数值字段保持无条件全额。互斥分支分别写明确条件和倍率，不把替代伤害累加。一个结果没有伤害则不要编造伤害。完整条件和边界同时保留在特殊规则，不能为自动化省略人工判断。
第二个及后续操作也可以携带 距离 和 治疗，其结构相同。纯规则、形态、召唤、跨特性攻击引用等目前不要求自动化；特殊规则必须忠实保留条件、数量、期限、资源和所引用动作的含义。不存在的机制必须保持空值。
支持未知武器/法术分类的近战攻击/远程攻击；不得仅为了迎合旧生成器而猜成武器或法术。不要新增模板之外字段。`;

const saveYaml = (v: unknown) => yaml.dump(v, { noRefs: true, lineWidth: -1 });
const extras = ['距离','治疗','传奇动作消耗','共享资源'];
const obj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
function requireKeys(v: unknown, allowed: string[], path: string): asserts v is Record<string, any> {
  if (!obj(v) || Object.keys(v).some(k => !allowed.includes(k))) throw Error('V2_SHAPE:' + path);
}
const nullableText = (v: unknown) => v == null || typeof v === 'string';
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
function extensions(row: any, path: string) {
  if (!Array.isArray(row.距离) || !Array.isArray(row.治疗)) throw Error('V2_EXTENSION_LIST:' + path);
  for (const d of row.距离) {
    requireKeys(d, ['用途','尺','条件'], path + '/距离');
    if (typeof d.用途 !== 'string' || !number(d.尺) || d.尺 < 0 || !nullableText(d.条件)) throw Error('V2_DISTANCE:' + path);
  }
  for (const h of row.治疗) {
    requireKeys(h, ['公式','取值依据','类型','目标','生效条件'], path + '/治疗');
    const numeric = typeof h.公式 === 'string' && /^(?:\d+d\d+(?:\s*[+-]\s*\d+)?|\d+)$/iu.test(h.公式.trim());
    const dynamic = h.公式 == null && typeof h.取值依据 === 'string' && !!h.取值依据.trim();
    if (!(numeric && h.取值依据 == null || dynamic) || !['治疗','临时生命值'].includes(h.类型) || typeof h.目标 !== 'string' || !nullableText(h.生效条件)) throw Error('V2_HEALING:' + path);
  }
  if (row.范围 != null && (!['球体','球形','半径','锥形','线形','立方体','圆柱体','矩形'].includes(row.范围.形状) || !number(row.范围.大小尺) || row.范围.大小尺 <= 0)) throw Error('V2_AREA:' + path);
  if (row.传奇动作消耗 != null && (!Number.isSafeInteger(row.传奇动作消耗) || row.传奇动作消耗 < 1)) throw Error('V2_LEGENDARY_COST:' + path);
  if (row.共享资源 != null) {
    requireKeys(row.共享资源, ['名称','上限','恢复','限制'], path + '/共享资源');
    if (typeof row.共享资源.名称 !== 'string' || !Number.isSafeInteger(row.共享资源.上限) || row.共享资源.上限 < 1 || typeof row.共享资源.恢复 !== 'string' || !nullableText(row.共享资源.限制)) throw Error('V2_RESOURCE:' + path);
  }
}
export function makeBatches(units: Unit[], mode: 'category'|'whole'): Batch[] {
  return baseBatches(units, mode).map(b => {
    const form = yaml.load(b.template) as Record<string, any[]>;
    for (const rows of Object.values(form)) for (const row of rows) Object.assign(row, { 距离: [], 治疗: [], 传奇动作消耗: null, 共享资源: null });
    return { ...b, units: b.units as Unit[], template: saveYaml(form) };
  });
}
export function decodeReply(reply: unknown, batch: Batch) {
  requireKeys(reply, ['markdown'], '/reply');
  if (typeof reply.markdown !== 'string') throw Error('V2_MARKDOWN');
  const markdown = reply.markdown.trim().replace(/^```(?:yaml|yml)?\s*\n([\s\S]*?)\n```$/iu, '$1');
  const form = yaml.load(markdown, { schema: yaml.JSON_SCHEMA });
  if (!obj(form)) throw Error('V2_ROOT');
  const plain = structuredClone(form), byId = new Map<string, any>();
  for (const [category, rows] of Object.entries(form)) {
    if (!Array.isArray(rows)) throw Error('V2_CATEGORY_LIST');
    for (let i=0;i<rows.length;i++) {
      const row = rows[i]; if (!obj(row)) throw Error('V2_FEATURE');
      extensions(row, String(row.编号)); byId.set(row.编号, row);
      for (const key of extras) delete plain[category][i][key];
      if (row.其他操作 != null) {
        if (!Array.isArray(row.其他操作)) throw Error('V2_OPERATIONS');
        for (let j=0;j<row.其他操作.length;j++) {
          const op = row.其他操作[j]; if (!obj(op)) throw Error('V2_OPERATION');
          // Optional extensions on child operations; normalized empty arrays do
          // not invent any mechanic. Their original values remain in the reply.
          extensions({ 距离: [], 治疗: [], ...op }, `${row.编号}/${j}`);
          for (const key of extras) delete plain[category][i].其他操作[j][key];
        }
      }
    }
  }
  const validated = baseDecode({ markdown: saveYaml(plain) }, batch);
  return { markdown, rows: validated.rows.map(row => ({ ...byId.get(row.编号), category: row.category, source: row.source })) };
}
