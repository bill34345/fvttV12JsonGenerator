/** Source grammar shared by extraction and validation. No creature or spell names. */
export const DAILY_SPELL_LABEL = String.raw`(?:(?:shared|共享|共用)\s*)?(?:每(?:项|个)\s*)?-?\d+\s*(?:次\s*)?\/\s*(?:每日|日|day)(?:\s*(?:each|[（(]\s*shared\s*[）)]|shared))?`;
export const SPELL_LABEL_PREFIX = String.raw`\s*(?:(?:[-+*]|>)\s+)?(?:[*_~]{1,3})?\s*`;
export const SPELL_LABEL_SUFFIX = String.raw`\s*[:：]\s*(?:[*_~]{1,3})?\s*`;

export function dailySpellGrantLabel(text: string) {
  const match = new RegExp(`^${SPELL_LABEL_PREFIX}${DAILY_SPELL_LABEL}${SPELL_LABEL_SUFFIX}`, 'iu').exec(text);
  if (!match) return undefined;
  const count = Number(match[0].match(/-?\d+/u)![0]);
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('INVALID_SOURCE_SPELL_COUNT');
  const shared = /shared|共享|共用/iu.test(match[0]);
  // The supported Chinese statblock cadence “1次/每日” means each listed
  // spell has that daily count; bare English N/Day still needs ownership.
  const each = /each|每(?:项|个)/iu.test(match[0])||!shared&&/\d+\s*次\s*\/\s*每日/iu.test(match[0]);
  if (shared && each) throw new Error('CONFLICTING_SOURCE_SPELL_SHARING');
  return { match, count, shared, each };
}

/** Source-derived component clauses; negated or conditional waivers are GM work. */
export function sourceSpellComponentClause(source:string){
  const match=/(?:无需|无须|不需要|不需)\s*(?:任何|任意|全部|所有)?\s*(?:(?:材料|法术)成分|构材)|(?:without|requires? no|requiring no)\s+(?:material components?|(?:any\s+)?spell components?)/iu.exec(source);
  if(!match)return undefined;
  const before=source.slice(0,match.index).split(/[。.;；]/u).at(-1)??'';
  const after=source.slice(match.index+match[0].length).split(/[。.;；]/u)[0]??'';
  const ambiguous=/(?:\b(?:not|never|cannot)\b|\b[a-z]+n['’]t\b|并非|不是|并不是|并不|不能|无法)/iu.test(before)
    ||/(?:\b(?:if|unless|except|while|when|whenever|provided|only)\b|如果|除非|仅当|每当|若|当)/iu.test(before+' '+after);
  const quoted=/["“「『][^"”」』]*$/u.test(before)&&/["”」』]/u.test(after);
  return {match,ambiguous:ambiguous||quoted,all:/法术成分|spell components?/iu.test(match[0])};
}
