export interface BloodiedAttackClause {
  phase: 'targeting' | 'hit';
  text: string;
}

interface SourceSpan { start: number; end: number }
interface ProjectedText { text: string; offsets: SourceSpan[] }
interface Match {
  text: string;
  phases: BloodiedAttackClause['phase'][];
  spans: SourceSpan[];
}

const clauseStart = '(?:^|(?<=[;；:：]))\\s*';
const bloodied = '(?:Bloodied\\b|浴血)';
const targetingChange = /(?:触及(?:距离)?|射程|攻击范围|目标(?:数量|数目)|(?:额外|多个|更多)目标|(?:至多|最多|额外|多|再|可以?|能够?)(?:选择|指定|攻击)[^。！；，]{0,16}(?:目标|生物)|\b(?:reach|range|number of targets)\b|\b(?:can target|targets? up to|targets? (?:an? )?additional|target an extra)\b)/i;
const hitEffect = /(?:命中(?:时|后|：|:|，|,)|击中(?:时|后)|(?:额外|附加)[^。！；，]{0,40}伤害|(?:使|令|目标)[^。！；，]{0,18}(?:倒地|伏地|抓握|擒抱|豁免|失能|震慑|中毒|束缚|昏迷)|\bon (?:a |each |every )?hit\b|\bwhen (?:it|this attack|the attack) hits\b|\b(?:extra|additional|bonus) [^.!?;]{0,55}\bdamage\b|\b(?:target|hit creature)\b[^.!?;]{0,45}\b(?:prone|grappled|saving throw|has the [\w-]+ condition)\b)/i;
const tags = /<!--[\s\S]*?-->|<\/?[a-z](?:"[^"]*"|'[^']*'|[^"'<>])*>/gi;
const blockEnd = /^<\/(?:p|li|div|h[1-6])\s*>$|^<br\b/i;
const voidTags = /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/;

const entities: Record<string, string> = {
  amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"', rsquo: '’', lsquo: '‘',
  ndash: '–', mdash: '—', '#160': ' ', '#39': "'", '#38': '&',
};

export function bloodiedAttackClauses(body: string, actorName = ''): BloodiedAttackClause[] {
  return matchingClauses(body, actorName).flatMap(({ text, phases }) => phases.map(phase => ({ phase, text })));
}

export function redactBloodiedAttackClauses(body: string, actorName = ''): string {
  const spans = matchingClauses(body, actorName).flatMap(match => match.spans);
  return spans.length ? removeClauseText(body, spans) : body;
}

function matchingClauses(body: string, actorName: string): Match[] {
  const englishNames = actorName.match(/[a-z][a-z '\u2019-]*[a-z]|[a-z]/gi) ?? [];
  const chineseNames = actorName.match(/[\u3400-\u9fff]+/g) ?? [];
  const englishOwner = ['(?:(?:the|this) )?(?:attacker|creature|monster|npc)',
    ...englishNames.map(name => '(?:the )?' + escapeRegex(name.trim()))].join('|');
  const chineseOwner = ['攻击者', '该生物', '该怪物', '这只怪物', '这只怪', '此生物', '此怪物', '它', '自身',
    ...chineseNames.map(escapeRegex)].join('|');
  const englishConditional = '(?:while|when|if)\\s+';
  const englishState = '\\s+(?:is|remains)\\s+' + bloodied;
  const chineseConditional = '(?:(?:每当|当|若|如果|只要)\\s*)?';
  const chineseState = '(?:(?:在|处于)\\s*)?' + bloodied + '\\s*(?:状态\\s*)?(?:期间|时|(?=[，,:：]))';
  const heading = new RegExp(clauseStart + '(?:' + englishConditional + '(?:(?:it|' + englishOwner + ')' + englishState
    + '|' + bloodied + '(?!,?\\s+the target\\b))'
    + '|' + chineseConditional + '(?:(?:' + chineseOwner + ')\\s*)?' + chineseState + ')', 'i');
  const inline = new RegExp('(?<=[,，])\\s*' + '(?:' + englishConditional + '(?:' + englishOwner + ')' + englishState
    + '|' + chineseConditional + '(?:' + chineseOwner + ')\\s*' + chineseState + ')', 'i');
  const suffix = new RegExp('\\b' + englishConditional + '(?:' + englishOwner + ')' + englishState + '\\s*[.!?]?$', 'i');
  const results: Match[] = [];
  let pendingHeading: { text: string; span: SourceSpan } | undefined;

  for (const paragraph of readableParagraphs(body, englishNames[0], chineseNames[0])) {
    // A standalone heading qualifies the next rule paragraph, including its separate rider sentences.
    for (const part of pendingHeading ? [paragraph] : sentences(paragraph)) {
      const lead = heading.exec(part.text) ?? inline.exec(part.text);
      const condition = lead ?? suffix.exec(part.text);
      const continuation = condition ? undefined : pendingHeading;
      const start = lead ? lead.index + (lead[0].length - lead[0].trimStart().length) : part.text.search(/\S/);
      const text = condition ? part.text.slice(start).trim() : continuation ? continuation.text + ' ' + part.text.trim() : '';
      pendingHeading = undefined;
      if (!text) continue;
      const first = part.offsets[start];
      const last = part.offsets[part.text.trimEnd().length - 1];
      if (!first || !last) continue;
      const span = { start: first.start, end: last.end };
      if (lead && /^[\s,，:：]*$/.test(part.text.slice(lead.index + lead[0].length))) {
        pendingHeading = { text, span };
        continue;
      }
      const phases: BloodiedAttackClause['phase'][] = [];
      if (targetingChange.test(text)) phases.push('targeting');
      if (hitEffect.test(text)) phases.push('hit');
      if (phases.length) results.push({ text, phases, spans: continuation ? [continuation.span, span] : [span] });
    }
  }

  return results;
}

function readableParagraphs(body: string, englishName = 'creature', chineseName = '该生物'): ProjectedText[] {
  let visible = {
    text: body,
    offsets: Array.from({ length: body.length }, (_, i) => ({ start: i, end: i + 1 })),
  };
  visible = replaceProjected(visible, tags, ([tag]) => blockEnd.test(tag!) ? '\n' : '');
  visible = replaceProjected(visible, /&([\w#]+);/gi, ([entity, key]) =>
    Object.hasOwn(entities, key!.toLowerCase()) ? entities[key!.toLowerCase()]! : entity!);
  const paragraphs: ProjectedText[] = [];
  for (const line of visible.text.matchAll(/[^\r\n]+/g)) {
    let view = { text: line[0], offsets: visible.offsets.slice(line.index, line.index + line[0].length) };
    const chinese = /[\u3400-\u9fff]/.test(view.text);
    view = replaceProjected(view, /&reference\[([^\]]+)\](?:\{([^}]+)\})?/gi, ([, key, label]) =>
      key!.toLowerCase() === 'bloodied' ? (chinese ? '浴血' : 'Bloodied') : label ?? key!);
    view = replaceProjected(view, /\[\[lookup\s+@name(?:\s+lowercase)?\s*\]\]/gi, () => chinese ? chineseName : englishName);
    view = replaceProjected(view, /\s+/g, () => ' ');
    if (view.text.trim()) paragraphs.push(view);
  }
  return paragraphs;
}

function sentences(view: ProjectedText): ProjectedText[] {
  const parts: ProjectedText[] = [];
  let start = 0;
  for (const boundary of view.text.matchAll(/(?<=[。！？!?])\s*|(?<=\.)[ \t]+(?=\p{Lu})/gu)) {
    if (start < boundary.index) parts.push({ text: view.text.slice(start, boundary.index), offsets: view.offsets.slice(start, boundary.index) });
    start = boundary.index + boundary[0].length;
  }
  if (start < view.text.length) parts.push({ text: view.text.slice(start), offsets: view.offsets.slice(start) });
  return parts;
}

function replaceProjected(view: ProjectedText, pattern: RegExp, replacement: (match: RegExpMatchArray) => string): ProjectedText {
  const offsets: SourceSpan[] = [];
  let text = '';
  let start = 0;
  for (const match of view.text.matchAll(pattern)) {
    const index = match.index!;
    const end = index + match[0]!.length;
    const value = replacement(match);
    text += view.text.slice(start, index) + value;
    offsets.push(...view.offsets.slice(start, index));
    const span = { start: view.offsets[index]!.start, end: view.offsets[end - 1]!.end };
    for (let i = 0; i < value.length; i++) offsets.push(span);
    start = end;
  }
  text += view.text.slice(start);
  offsets.push(...view.offsets.slice(start));
  return { text, offsets };
}

function removeClauseText(body: string, spans: SourceSpan[]): string {
  const fragments: string[] = [];
  const open: { name: string; index: number; visible: number; removed: number }[] = [];
  let visible = 0;
  let removed = 0;
  let cursor = 0;

  function keepText(end: number) {
    let offset = cursor;
    for (const span of spans) {
      if (span.end <= offset) continue;
      if (span.start >= end) break;
      const retained = body.slice(offset, Math.max(offset, span.start));
      if (retained.trim()) visible++;
      fragments.push(retained);
      offset = Math.min(end, span.end);
      removed++;
    }
    const retained = body.slice(offset, end);
    if (retained.trim()) visible++;
    fragments.push(retained);
    cursor = end;
  }

  for (const match of body.matchAll(tags)) {
    const tag = match[0];
    keepText(match.index);
    const name = /^<\/?([\w-]+)/.exec(tag)?.[1]?.toLowerCase();
    const end = match.index + tag.length;
    if (name && tag.startsWith('</')) {
      const entry = open.at(-1);
      if (entry?.name === name) {
        open.pop();
        if (removed > entry.removed && visible === entry.visible) {
          fragments.length = entry.index;
          cursor = end;
          continue;
        }
      }
    } else if (name && !voidTags.test(name) && !tag.endsWith('/>')) {
      open.push({ name, index: fragments.length, visible, removed });
    }
    if (!name || voidTags.test(name) || tag.endsWith('/>')) {
      if (spans.some(span => span.start <= match.index && end <= span.end)) {
        cursor = end;
        continue;
      }
      visible++;
    }
    fragments.push(tag);
    cursor = end;
  }
  keepText(body.length);
  return fragments.join('');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^$${}()|[\]\\]/g, '\\$&');
}
