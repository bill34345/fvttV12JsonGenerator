import { describe, expect, test } from 'bun:test';
import type { ForgeItemSourceId } from '@fvtt-json-generator/contracts';
import { parseForgeItemSource } from '../forgeItemSource';

const ITEM_SOURCE_ID = 'item:v1:123e4567-e89b-42d3-a456-426614174000' as ForgeItemSourceId;

function itemSource(lineEnding = '\n'): string {
  return [
    '---',
    `forge-source-id: ${ITEM_SOURCE_ID}`,
    'layout: item',
    '名称: 测试护盾',
    '类型: 护甲',
    '稀有度: 稀有',
    '---',
    '## 测试护盾（Test Shield）',
    '',
    '*护甲（盾牌），稀有*',
    '',
    '持握这面盾牌期间，你的护甲等级获得 +1 加值。',
  ].join(lineEnding);
}

describe('Forge Item parser boundary', () => {
  test('validates Item identity and delegates identical LF/CRLF semantics to ItemParser', () => {
    const lf = parseForgeItemSource(itemSource('\n'));
    const crlf = parseForgeItemSource(itemSource('\r\n'));
    expect(lf.sourceId).toBe(ITEM_SOURCE_ID);
    expect(crlf.sourceId).toBe(ITEM_SOURCE_ID);
    expect(crlf.item).toEqual(lf.item);
    expect(lf.item.name).toBe('测试护盾');
    expect(lf.item.englishName).toBe('Test Shield');
  });

  test('rejects missing, Actor-prefixed, malformed, and duplicate identities', () => {
    expect(() => parseForgeItemSource(itemSource().replace(`forge-source-id: ${ITEM_SOURCE_ID}\n`, ''))).toThrow(/required/u);
    expect(() => parseForgeItemSource(itemSource().replace('item:v1:', 'actor:v1:'))).toThrow(/item:v1/u);
    expect(() => parseForgeItemSource(itemSource().replace(ITEM_SOURCE_ID, 'item:v1:not-a-uuid'))).toThrow(/item:v1/u);
    expect(() => parseForgeItemSource(itemSource().replace(
      `forge-source-id: ${ITEM_SOURCE_ID}`,
      `forge-source-id: ${ITEM_SOURCE_ID}\nforge-source-id: ${ITEM_SOURCE_ID}`,
    ))).toThrow(/valid YAML/u);
  });

  test.each(['\n', '\r\n'])('requires a real name from the source using %j line endings', (eol) => {
    const prefix = ['---', `forge-source-id: ${ITEM_SOURCE_ID}`, 'layout: item'];
    const raw = [...prefix, '---', '***火球魔杖（Wand of Fireballs）***', '*魔杖，珍稀*', '持握时可以施放火球术。'].join(eol);
    expect(() => parseForgeItemSource(raw)).toThrow(/缺少可识别的名称.*AI 整理/u);
    expect(() => parseForgeItemSource(raw.replace('***火球魔杖（Wand of Fireballs）***', '##    '))).toThrow(/缺少可识别的名称/u);
    const fromHeading = raw.replace('***火球魔杖（Wand of Fireballs）***', '## 火球魔杖（Wand of Fireballs）');
    expect(parseForgeItemSource(fromHeading).item.name).toBe('火球魔杖');
    const fromYaml = [...prefix, 'name: Wand of Fireballs', 'type: Wand', '---', 'While holding it, you can cast Fireball.'].join(eol);
    expect(parseForgeItemSource(fromYaml).item.name).toBe('Wand of Fireballs');
  });
});
