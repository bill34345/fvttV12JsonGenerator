import type { CanonicalMonster } from './types';

type NativeSize = CanonicalMonster['identity']['size'];
const ALIASES: Record<string, NativeSize> = {
  tiny:'tiny',微型:'tiny',small:'small',小型:'small',medium:'medium',中型:'medium',
  large:'large',大型:'large',huge:'huge',巨型:'huge',gargantuan:'gargantuan',超巨型:'gargantuan',
};

/** Source-derived alternatives, not an interval, combined size or transformed
 * body's size. A list must explicitly say "or" / "或" and contain only unique
 * native size tokens. Its literal spelling remains a separate source field. */
export function sourceSizeOptions(literal:string):NativeSize[]|undefined {
  if(typeof literal!=='string')return;
  const value=literal.normalize('NFKC').trim();
  const single=ALIASES[value.toLowerCase()];
  if(single)return[single];
  if(!/\bor\b|或/iu.test(value))return;
  const tokens=value.split(/\s*(?:,\s*(?:or\s+)?|、|\bor\b|或(?:者)?)\s*/iu);
  const sizes=tokens.map(token=>ALIASES[token.trim().toLowerCase()]);
  if(sizes.length<2||sizes.some(size=>!size)||new Set(sizes).size!==sizes.length)return;
  return sizes as NativeSize[];
}

/** Native dnd5e stores one current size. Alternatives remain visible and
 * program-owned; this annotation grants no automatic shape changing. */
export function sizeChoiceProgramNote(identity:CanonicalMonster['identity']):string|undefined {
  if(!identity.sourceSize)return;
  const options=sourceSizeOptions(identity.sourceSize);
  if(!options||options.length<2||!options.includes(identity.size))return;
  return `原文体型选项：${identity.sourceSize}。角色卡当前体型：${identity.size}；GM 可从上述原文选项中选择体型，原生尺寸字段仅表示当前选择。`;
}
