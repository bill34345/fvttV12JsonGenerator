/** A comparison view only. Callers retain raw lines and their original offsets;
 * none of these transformations may be used to calculate evidence coordinates.
 * URLs are destinations, never sources of numeric rules. */
export function headerPresentation(value:string):string {
  return value.normalize('NFKC')
    .replace(/^[ \t]{0,3}(?:>[ \t]?)+/gmu,'')
    .replace(/(\*{1,3}|_{2,3})(AC|HP|CR|XP|PB|STR|DEX|CON|INT|WIS|CHA)\1(?=[+\-\d])/giu,'$2 ')
    .replace(/(?<!!)\[([^\]\r\n]+)\]\((?:https?:\/\/|\/|#)[^()\r\n]*\)/gu,'$1');
}
