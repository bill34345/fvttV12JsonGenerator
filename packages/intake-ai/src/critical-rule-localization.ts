/**
 * Lock only mechanically unambiguous English clauses while the provider translates
 * surrounding prose. These placeholders exist inside a single translation request;
 * neither the source request nor any approved localization record changes.
 */
const rules: Array<{ pattern: RegExp; translate: (groups: string[]) => string }> = [
  {
    pattern: /\bEach\s+creature\s+in\s+a\s+(\d+)[ -]foot[ -]radius\s+Sphere\s+within\s+(\d+)\s+feet(?=(?:\s|<br\s*\/?>)*(?:must|makes?|takes?)\b)/giu,
    translate: ([,radius,range]) => `中心距使用此能力的生物${range}尺以内、半径${radius}尺的球形区域内的每个生物`,
  },
  {
    pattern: /\bteleports?(?:\s|<br\s*\/?>)+to(?:\s|<br\s*\/?>)+a(?:\s|<br\s*\/?>)+space(?:\s|<br\s*\/?>)+within(?:\s|<br\s*\/?>)+(\d+)(?:\s|<br\s*\/?>)+feet(?=(?:\s|<br\s*\/?>)*(?:[.;]|$))/giu,
    translate: ([whole,range]) => `${whole!.match(/<br\s*\/?>/giu)?.join('')??''}传送至距其当前位置${range}尺以内的一处空间`,
  },
  {
    pattern: /\bEach(?:\s|<br\s*\/?>)+spell(?:\s|<br\s*\/?>)+of(?:\s|<br\s*\/?>)+Level(?:\s|<br\s*\/?>)+(\d+)(?:\s|<br\s*\/?>)+or(?:\s|<br\s*\/?>)+below(?:\s|<br\s*\/?>)+affecting(?:\s|<br\s*\/?>)+the(?:\s|<br\s*\/?>)+creature(?:\s|<br\s*\/?>)+ends\b/giu,
    translate: ([whole,level]) => `${whole!.match(/<br\s*\/?>/giu)?.join('')??''}影响该生物的${level}环或更低环阶法术都结束`,
  },
  {
    pattern: /\bSize\s+(Tiny|Small|Medium|Large|Huge|Gargantuan)\s*\((?:\s|<br\s*\/?>)*Swarm(?:\s|<br\s*\/?>)+of(?:\s|<br\s*\/?>)+(Tiny|Small|Medium|Large|Huge|Gargantuan)(?:\s|<br\s*\/?>)*\)/giu,
    translate: ([whole,outer,inner]) => `体型 ${sizeName(outer!)}（由${sizeName(inner!)}生物${whole!.match(/<br\s*\/?>/giu)?.join('')??''}组成的集群）`,
  },
  {
    pattern: /\bwithin\s+(\d+)\s+feet,?\s+the\s+target\s+takes\s+(\d+)\s+(fire|cold|acid|lightning|thunder|poison|necrotic|radiant|force|psychic|bludgeoning|piercing|slashing)\s+damage\b/giu,
    translate: ([, range, amount, type]) => `${range}尺内，目标受到${amount}点${damageName(type!)}伤害`,
  },
  {
    pattern: /\b(a|the)\s+creature\s+(not\s+)?wearing\s+heavy\s+armou?r\s+takes\s+(\d+)\s+(fire|cold|acid|lightning|thunder|poison|necrotic|radiant|force|psychic|bludgeoning|piercing|slashing)\s+damage\b/giu,
    translate: ([, , negative, amount, type]) => `${negative ? '未' : ''}穿着重甲的生物受到${amount}点${damageName(type!)}伤害`,
  },
  {
    pattern: /\bif\s+(it|the target|a creature|the creature)\s+(?:is\s+)?(not\s+)?wearing\s+heavy\s+armou?r\b/giu,
    translate: ([, subject, negative]) => `如果${subjectName(subject!)}${negative ? '未' : ''}穿着重甲`,
  },
  {
    pattern: /\b(the target|the creature|an affected creature|the affected creature|a creature)\s+(can|may)\s+repeat\s+(?:the|this|its)\s+saving\s+throw\s+at\s+the\s+(end|start|beginning)\s+of\s+each\s+of\s+(?:its|their)\s+turns,?\s+ending\s+(?:this|the)\s+effect\s+on\s+a\s+success\b/giu,
    translate: ([, subject, , time]) => `${subjectName(subject!)}可以在其每个回合${turnTime(time!)}再次进行豁免检定，成功则结束此效应`,
  },
  {
    pattern: /\bat\s+the\s+(end|start|beginning)\s+of\s+each\s+of\s+(?:its|their)\s+turns,?\s+(the target|the creature|an affected creature|the affected creature|a creature)\s+(can|may)\s+repeat\s+(?:the|this|its)\s+saving\s+throw,?\s+ending\s+(?:this|the)\s+effect\s+on\s+a\s+success\b/giu,
    translate: ([, time, subject]) => `${subjectName(subject!)}可以在其每个回合${turnTime(time!)}再次进行豁免检定，成功则结束此效应`,
  },
  {
    pattern: /\bsave\s+ends\s+at\s+(?:the\s+)?(end|start|beginning)\s+of\s+(?:(?:each\s+of\s+(?:its|their)|each|the|a)\s+)?turns?\b/giu,
    translate: ([, time]) => `在每个回合${turnTime(time!)}再次豁免，成功则结束此效应`,
  },
  {
    pattern: /\bon\s+a\s+(successful\s+saving\s+throw|success),?\s+(?:this|the)\s+effect\s+ends\b/giu,
    translate: ([, success]) => `${/^success$/iu.test(success!) ? '成功' : '豁免成功'}时，此效应结束`,
  },
  {
    pattern: /\b(?:this|the)\s+effect\s+ends\s+on\s+a\s+(successful\s+saving\s+throw|success)\b/giu,
    translate: ([, success]) => `${/^success$/iu.test(success!) ? '成功' : '豁免成功'}时，此效应结束`,
  },
  {
    pattern: /\b(?:fails?|failed)\s+(?:the|this)\s+saving\s+throw\s+by\s+(\d+)\s+or\s+more\b/giu,
    translate: ([, margin]) => `这次豁免检定的失败差值达到${margin}或以上`,
  },
  {
    pattern: /\bfailure\s+by\s+(\d+)\s+or\s+more\b/giu,
    translate: ([, margin]) => `失败差值达到${margin}或以上`,
  },
  {
    pattern: /\bif\s+this\s+damage\s+reduces\s+(a creature|the creature|a target|the target)\s+to\s+0\s+(?:hit\s+points|hp)\b/giu,
    translate: ([, subject]) => `如果此次伤害使${subjectName(subject!)}的生命值降至0`,
  },
  {
    pattern: /\bif\s+(a creature|the creature|a target|the target)\s+is\s+reduced\s+to\s+0\s+(?:hit\s+points|hp)\s+by\s+this\s+damage\b/giu,
    translate: ([, subject]) => `如果${subjectName(subject!)}因此次伤害而生命值降至0`,
  },
  {
    pattern: /\b(a creature|the creature|a target|the target)\s+reduced\s+to\s+0\s+(?:hit\s+points|hp)\s+by\s+this\s+damage\b/giu,
    translate: ([, subject]) => `因此次伤害生命值降至0的${/^(?:a creature|the creature)$/iu.test(subject!) ? '生物' : '目标'}`,
  },
  // These already-registered mechanical terms caused paid field retries in the
  // real source trial. Lock their confirmed wording after complete clauses.
  { pattern: /\bsaving throws?\b/giu, translate: () => '豁免检定' },
  { pattern: /\b(?:activity|activities)\b/giu, translate: () => '能力活动' },
];

const DAMAGE_NAMES: Record<string, string> = {
  fire: '火焰', cold: '寒冷', acid: '强酸', lightning: '闪电', thunder: '雷鸣', poison: '毒素',
  necrotic: '暗蚀', radiant: '光耀', force: '力场', psychic: '心灵',
  bludgeoning: '钝击', piercing: '穿刺', slashing: '挥砍',
};
function sizeName(value:string):string{return ({tiny:'微型',small:'小型',medium:'中型',large:'大型',huge:'巨型',gargantuan:'超巨型'} as Record<string,string>)[value.toLowerCase()]!;}
function damageName(value: string): string { return DAMAGE_NAMES[value.toLowerCase()]!; }

function turnTime(value: string): string { return /^end$/iu.test(value) ? '结束时' : '开始时'; }
function subjectName(value: string): string {
  const subject = value.toLowerCase();
  if (subject === 'the target') return '目标';
  if (subject === 'a target') return '一个目标';
  if (subject === 'a creature') return '一个生物';
  if (subject === 'an affected creature' || subject === 'the affected creature') return '受影响的生物';
  return '该生物';
}

function letters(index: number): string {
  let value = index + 1;
  let result = '';
  while (value > 0) { value--; result = String.fromCharCode(65 + value % 26) + result; value = Math.floor(value / 26); }
  return result;
}

export function protectCriticalRulePhrases(source: string): { text: string; restore: (translated: string) => string } {
  // A source containing our private delimiter cannot safely use this transport form.
  if (/⟪|⟫/u.test(source)) return { text: source, restore: translated => translated };
  const replacements = new Map<string, string>();
  const pairedAnchors:Array<[string,string]>=[];
  const put=(value:string)=>{const token=`⟪RULE${letters(replacements.size)}⟫`;replacements.set(token,value);return token;};
  // Do not match inside HTML attributes, entities or Foundry enrichment syntax.
  // Splitting also keeps a rule from spanning across a markup boundary.
  const text = source.split(/(<(?!br\s*\/?>)[^>]*>|&(?:[a-z]+|#\d+|#x[0-9a-f]+);|\[\[[\s\S]*?\]\]|@(?:UUID|Compendium)\[[^\]]+\])/giu)
    .map((segment, index) => {
      if (index % 2) return segment;
      let prose = segment;
      // Source-derived coordination: the condition qualifies half damage,
      // while the following effect is independent. Lock the predicate and both
      // results atomically, translate only its subject, and retain soft breaks.
      prose=prose.replace(/\bor(?:\s|<br\s*\/?>)+half(?:\s|<br\s*\/?>)+as(?:\s|<br\s*\/?>)+much(?:\s|<br\s*\/?>)+damage(?:\s|<br\s*\/?>)+if((?:\s|<br\s*\/?>)+[^,.;]{1,160}?),\s+and\s+the\s+target\s+is\s+(Grappled|Restrained|Prone)(?=(?:\s|<br\s*\/?>)*(?:[.(]|$))/giu,
        (whole:string,condition:string,status:string)=>{
          const clean=condition.replace(/<br\s*\/?>/giu,' ').replace(/\s+/gu,' ').trim();
          const predicate=/^(it|(?:the|a|an) [A-Za-z '’\-]{1,70}?) is (not )?(Bloodied|Grappled|Restrained|Prone)$/iu.exec(clean);
          if(!predicate)return whole;
          const names:Record<string,string>={bloodied:'浴血',grappled:'受擒',restrained:'束缚',prone:'倒地'};
          const head=put('；若'),tail=put(`${predicate[2]?'未处于':'处于'}${names[predicate[3]!.toLowerCase()]}状态，此伤害减半。目标还会陷入${names[status.toLowerCase()]}状态`);
          pairedAnchors.push([head,tail]);return `${head}${whole.match(/<br\s*\/?>/giu)?.join('')??''}${predicate[1]}${tail}`;
        });
      for (const rule of rules) {
        prose = prose.replace(rule.pattern, (...args: unknown[]) => {
          const groups = args.slice(0, -2).map(value => value === undefined ? '' : String(value));
          return put(rule.translate(groups));
        });
      }
      return prose;
    }).join('');
  return { text, restore(translated) {
    if (!replacements.size) return translated;
    const found = translated.match(/⟪RULE[A-Z]+⟫/gu) ?? [];
    if (found.length !== replacements.size || new Set(found).size !== replacements.size
      || found.some(token => !replacements.has(token))
      || pairedAnchors.some(([head,tail])=>translated.indexOf(head)>translated.indexOf(tail))
      || pairedAnchors.some(([head,tail])=>!/[\p{L}]/u.test(translated.slice(translated.indexOf(head)+head.length,translated.indexOf(tail)).replace(/<[^>]*>/gu,'')))
      || /⟪|⟫/u.test(translated.replace(/⟪RULE[A-Z]+⟫/gu, ''))) {
      throw new TypeError('译文漏掉、重复或改变了受保护的关键规则。');
    }
    let prose=translated;
    for(const [head] of pairedAnchors)prose=prose.replace(new RegExp(`[，,；;]\\s*(?=${head})`,'gu'),'');
    return prose.replace(/⟪RULE[A-Z]+⟫/gu, token => replacements.get(token)!);
  } };
}
