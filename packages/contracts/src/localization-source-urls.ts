/** Source-derived HTTP(S) citations are opaque display data. HTML attributes
 * and document enrichers are owned by the existing structural-token checks. */
export interface LocalizationSourceUrl { start: number; end: number; value: string }

export function localizationSourceUrls(text: string): LocalizationSourceUrl[] {
  const result: LocalizationSourceUrl[] = [];
  const scan = /<[^>]*>|\[\[[\s\S]*?\]\]|@(?:UUID|Compendium)\[[^\]]+\]|((?<![A-Za-z0-9_])https?:\/\/(?:(?!\[\[|@(?:UUID|Compendium)\[)[^\s<>"'，。；！？、（）【】《》\u0000-\u001f\u007f])+)/giu;
  for (const match of text.matchAll(scan)) {
    if (!match[1]) continue;
    // A Markdown destination's closing ')' is punctuation, not part of the
    // URL. Retain balanced parentheses inside the path (GFM autolink rule).
    let value=match[1];
    let excess=[...value].filter(char=>char===')').length-[...value].filter(char=>char==='(').length;
    while(excess>0&&value.endsWith(')')){value=value.slice(0,-1);excess--;}
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) continue;
    } catch { continue; }
    result.push({ start: match.index!, end: match.index! + value.length, value });
  }
  return result;
}

export function withoutLocalizationSourceUrls(text: string, urls = localizationSourceUrls(text)): string {
  let result = text;
  for (const url of [...urls].reverse()) result = result.slice(0, url.start) + ' ' + result.slice(url.end);
  return result;
}
