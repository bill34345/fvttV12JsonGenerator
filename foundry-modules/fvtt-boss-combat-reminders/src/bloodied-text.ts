import type { HealthTrigger, TriggerKind } from './health.ts';

const nameLookup = /\[\[lookup\s+@name(?:\s+\w+)?\s*\]\]/gi;
const bloodiedReference = /&(?:amp;)?reference\[\s*bloodied\s*\](?:\{[^}]*\})?/gi;
const englishClause = '(?:^|[.!?;:]\\s*)';
const chineseClause = '(?:^|[.。！？；：:,，]\\s*)';

export function bloodiedDescription(description: string, name: string): HealthTrigger | undefined {
  const words = name.match(/[a-z][a-z '\-]*[a-z]|[a-z]/g)?.map(part => part.trim()) ?? [];
  const aliases = new Set(words.flatMap(part => [part, part.split(/\s+/).at(-1) ?? part]));
  const self = ['it', 'the creature', 'this creature', 'the monster', ...[...aliases].map(part => 'the ' + part)].join('|');
  const english = description.replace(nameLookup, 'creature').replace(bloodiedReference, 'bloodied');
  const englishTurn = new RegExp(englishClause + '(?:when(?:ever)?|if|each time) (?:' + self
    + ') starts? (?:its )?(?:own )?turn (?:while |still )?bloodied\\b');
  const englishEntry = new RegExp(englishClause + '(?:when(?:ever)?|if|once) (?:' + self
    + ') (first )?becomes bloodied\\b');
  const englishPassive = new RegExp(englishClause + 'while bloodied,?\\s+(?:' + self + ')\\b');
  const englishSplit = new RegExp(englishClause + 'while (?:' + self
    + ') is (?:large or medium|medium or large) and has 10\\+ (?:hit points|hp),\\s*(?:' + self + ') becomes bloodied\\b');

  if (englishTurn.test(english)) return { kind: 'bloodied-turn' };
  const entry = english.match(englishEntry);
  if (entry) return entry[1] ? { kind: 'bloodied', once: true } : { kind: 'bloodied' };
  if (englishSplit.test(english)) return { kind: 'bloodied', split: true };
  const passive = english.match(englishPassive);
  if (passive) {
    const effect = english.slice((passive.index ?? 0) + passive[0].length).trimStart();
    return passiveTrigger(/^has advantage on attack rolls and saving throws(?:[.!?]|$)/.test(effect));
  }

  const chineseNames = name.match(/[\u3400-\u9fff]+/g) ?? [];
  const owner = ['该生物', '该怪物', '这只怪物', '这只怪', '此生物', '此怪物', '它', '其', ...chineseNames].join('|');
  const chinese = description.replace(nameLookup, '该生物').replace(bloodiedReference, '浴血');
  const subject = '(?:(?:' + owner + ')\\s*)?';
  const chineseTurn = new RegExp(chineseClause + '(?:(?:每当|当|若|如果)\\s*)?' + subject
    + '(?:在\\s*)?(?:(?:自己的?|它的|其|自身的?)\\s*)?回合开始时\\s*(?:(?:若|如果)\\s*)?'
    + '(?:仍(?:然)?\\s*)?(?:处于\\s*)?浴血');
  const chineseEntry = new RegExp(chineseClause + '(?:(?:当|若|如果|每当)\\s*)?' + subject
    + '(首次\\s*)?(?:陷入|进入)\\s*浴血\\s*(?:状态\\s*)?(?:时|[，,。]|或|$)');
  const chinesePassive = new RegExp(chineseClause + subject + '(?:在\\s*)?浴血\\s*(?:状态\\s*)?期间');
  if (chineseTurn.test(chinese)) return { kind: 'bloodied-turn' };
  const chineseHit = chinese.match(chineseEntry);
  if (chineseHit) {
    if (chineseHit[1]) return { kind: 'bloodied', once: true };
    return /(?:大型或中型|中型或大型)且具有\s*10\+\s*生命值/.test(chinese)
      ? { kind: 'bloodied', split: true }
      : { kind: 'bloodied' };
  }
  const ongoing = chinese.match(chinesePassive);
  if (ongoing) {
    const effect = chinese.slice((ongoing.index ?? 0) + ongoing[0].length).trimStart();
    return passiveTrigger(/^(?:进行的)?攻击检定(?:与|和|及)豁免检定(?:均|都)?具有优势(?:[。！!]|$)/.test(effect));
  }
}

export function isBloodiedKind(kind: TriggerKind): boolean {
  return kind === 'bloodied' || kind === 'bloodied-turn' || kind === 'bloodied-while';
}

function passiveTrigger(advantage: boolean): HealthTrigger {
  return advantage ? { kind: 'bloodied-while', advantage: true } : { kind: 'bloodied-while' };
}
