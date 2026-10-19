/** Presentation only: aliases are joined with a space. Authored punctuation
 * inside either name is retained, and an alias already present is not repeated. */
export function displayName(name: string, englishName?: string): string {
  const alias = englishName?.trim();
  return alias && !name.toLocaleLowerCase('en-US').includes(alias.toLocaleLowerCase('en-US'))
    ? `${name} ${alias}` : name;
}

/** Legacy bilingual parentheses are an alias delimiter only after a Chinese
 * name. An English qualifier such as Arcana/Nature (Uncommon) is authored text. */
export function splitBilingualName(raw: string): { name: string; englishName?: string } {
  const match = raw.match(/^(.+?)\s*[（(]\s*([A-Za-z][A-Za-z0-9\s&:'’\-]+?)\s*[）)]\s*$/u);
  if (match?.[1] && match[2] && /\p{Script=Han}/u.test(match[1])) {
    return { name: match[1].trim(), englishName: match[2].trim() };
  }
  return { name: raw.trim() };
}

/** Identity candidates from the existing bilingual presentation forms.
 * Authored English parentheses are qualifiers, never another identity. */
export function displayNameIdentityCandidates(itemName:string):string[]{
  const candidates=new Set<string>([itemName]),legacy=splitBilingualName(itemName);
  if(legacy.englishName){candidates.add(legacy.name);candidates.add(legacy.englishName);}
  const spaced=itemName.match(/^([\u3400-\u9fff][^A-Za-z]*)\s+([A-Za-z][\s\S]*)$/u);
  if(spaced){candidates.add(spaced[1]!.trim());candidates.add(spaced[2]!.trim());}
  return[...candidates].filter(Boolean);
}

/** Shared Node/browser name-presence check. Delimiter presentation is not a
 * missing name; enclosed words and numeric qualifiers remain searchable. */
export function sourceMentionsDisplayName(source:string,itemName:string):boolean{
  const candidates=new Set<string>([itemName]);
  const localized=itemName.match(/（(.+)）$/u)?.[1];if(localized)candidates.add(localized);
  for(const candidate of displayNameIdentityCandidates(itemName))if(/^[A-Za-z]/u.test(candidate))candidates.add(candidate);
  const bilingual=itemName.match(/\(([^)]+)\)/u)?.[1];if(bilingual)candidates.add(bilingual);
  const withoutParen=itemName.replace(/\s*\([^)]*\)\s*/gu,'').trim();if(withoutParen)candidates.add(withoutParen);
  const fold=(value:string)=>value.toLowerCase().replace(/[()（）]/gu,' ').replace(/\s+/gu,' ').trim();
  const full=fold(source);
  return [...candidates].some(candidate=>{const value=fold(candidate);return !!value&&full.includes(value);});
}
