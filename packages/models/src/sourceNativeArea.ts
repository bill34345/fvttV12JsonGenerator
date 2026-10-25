/** Source-derived representation mapping, explicitly requested for 2024
 * Emanations. Read only the model's own rule/proof text; never fill in a
 * missing area or change a distance, origin or other mechanic. */
export function nativeAreaShape<S extends string>(shape:S,distance:number,ruleText:string):S|'radius' {
  if(shape!=='sphere'&&shape!=='球形'||!Number.isSafeInteger(distance)||distance<=0||typeof ruleText!=='string')return shape;
  const text=ruleText.replace(/[*_`]/gu,'').replace(/[\u2010-\u2015]/gu,'-').replace(/\s+/gu,' ');
  // CHM 2024 uses 光环 for Emanation. Inline glossary links may leave
  // whitespace between the printed distance and the Chinese shape term.
  const areas=[...text.matchAll(/(?<![\d.])(\d+)\s*[- ]\s*(?:foot|feet|ft\.?)\s*[- ]?\s*Emanation\b/giu),
    ...text.matchAll(/(?<![\d.])(\d+)\s*尺\s*(?:的\s*)?光环/gu)];
  if(areas.length!==1||Number(areas[0]![1])!==distance)return shape;
  const at=areas[0]!.index!,after=at+areas[0]![0].length;
  const start=Math.max(...['.',';','!','?','。','；','！','？'].map(mark=>text.lastIndexOf(mark,at)))+1;
  const end=text.slice(after).search(/[.;!?。；！？]/u);
  const prefix=text.slice(start,at),suffix=text.slice(after,end<0?text.length:after+end);
  // Negation of an area's existence/type is not proof of that area. Do not
  // confuse it with a valid area's target exclusions ("does not affect ...").
  if(/\b(?:not\s+(?:(?:considered|treated|classified|defined|regarded|described|counted)(?:\s+as)?\s+|(?:create|produce|emit|generate|project|form|be)\s+)?|no\s+|without\s+(?:(?:creating|producing|emitting|generating)\s+)?|rather than\s+|instead of\s+|like\s+|similar to\s+|as if\s+|(?:would|could|might)\s+(?:be|create|generate|produce|emit|form)\s+)(?:an?\s+|any\s+)?$/iu.test(prefix))return shape;
  if(/^\s*(?:(?:originating|emanating)\s+from\s+[^,.;]+?\s+)?(?:(?:that|which)\s+)?(?:(?:does\s+not|doesn['’]t|cannot|can['’]t|never|will\s+not|won['’]t)\s+(?:exist|appear|occur|form|radiate|extend|manifest|arise)|(?:is|was|will\s+be)\s+not\s+(?:present|created|generated|formed|real|actual))\b/iu.test(suffix))return shape;
  if(/(?:并非|不是|不属于|不(?:被)?(?:视为|当作|认定为|定义为)|不构成|没有|未(?:产生|形成|创建|生成)|不(?:会|能|可)?(?:产生|形成|创建|生成)|类似于?|如同)\s*(?:一个|一片|该|这[个片])?\s*$/u.test(prefix)
    ||/^\s*(?:区域\s*)?(?:并不|并未|不会|不能|无法|未|不)(?:存在|出现|产生|形成|创建|生成)/u.test(suffix))return shape;
  // A proof containing another explicit geometry does not uniquely identify
  // this area. Names such as "Sphere Ward" or "Fire Aura" supply no geometry.
  if(/(?<![\d.])\d+\s*[- ]\s*(?:foot|feet|ft\.?)\s*[- ]?\s*(?:radius\s*[- ]?\s*)?(?:Sphere|Cylinder|Cone|Cube|Line|Rectangle)\b/iu.test(text)
    ||/\b(?:Sphere|Cylinder)\s+(?:with\s+)?an?\s+\d+\s*[- ]\s*foot\s*[- ]?\s*radius\b/iu.test(text)
    ||/(?<![\d.])\d+\s*尺[^\d。.;；]{0,40}?(?:球状|球形|柱状|圆柱形|锥状|锥形|立方体|线状|线形|矩形)/u.test(text)
    ||/(?:球状|球形|柱状|圆柱形)[^\d。.;；]{0,20}?半径\s*\d+\s*尺/u.test(text))return shape;
  return 'radius';
}
