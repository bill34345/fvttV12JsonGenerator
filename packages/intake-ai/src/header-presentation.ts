/** A comparison view only. Callers retain raw lines and their original offsets;
 * none of these transformations may be used to calculate evidence coordinates.
 * URLs are destinations, never sources of numeric rules. */
export function headerPresentation(value:string):string {
  // Numeric character references are visible text in exported Markdown tables.
  // Decode once in this comparison view, before width/markup normalization;
  // leave invalid references and line/control characters literal. Raw source
  // bytes and evidence offsets are still owned by the caller.
  return value.replace(/&#(x[0-9a-f]{1,6}|[0-9]{1,7});/giu,(literal,encoded:string)=>{
    const point=encoded[0]!.toLowerCase()==='x'?Number.parseInt(encoded.slice(1),16):Number.parseInt(encoded,10);
    return point>=0x20&&point<=0x10ffff&&!(point>=0x7f&&point<=0x9f)&&!(point>=0xd800&&point<=0xdfff)
      ?String.fromCodePoint(point):literal;
  }).normalize('NFKC')
    .replace(/^[ \t]{0,3}(?:>[ \t]?)+/gmu,'')
    .replace(/(\*{1,3}|_{2,3})(AC|HP|CR|XP|PB|STR|DEX|CON|INT|WIS|CHA)\1(?=[+\-\d])/giu,'$2 ')
    .replace(/(?<!!)\[([^\]\r\n]+)\]\((?:https?:\/\/|\/|#)[^()\r\n]*\)/gu,'$1');
}
