import { describe, expect, test } from 'bun:test';
import { alignTranslatedResults, applyResultTranslation, resultRangeKey, translateResultEntries } from '../index';

describe('Babele RollTable result alignment', () => {
  test('uses _id first and range as the compatibility fallback', () => {
    const source = [
      { _id: 'wild-a', range: [1, 4] as [number, number], type: 'text', description: 'source a' },
      { _id: 'confusion-doc', range: [1, 1] as [number, number], type: 'document', documentUuid: 'Compendium.example.tables.RollTable.cardinal' },
      { _id: 'confusion-text', range: [1, 1] as [number, number], type: 'text', description: 'source text' },
    ];
    const translated = [
      { range: [1, 4] as [number, number], type: 'text', description: 'wild translated' },
      { _id: 'confusion-text', range: [1, 1] as [number, number], type: 'text', description: 'text translated' },
      { _id: 'confusion-doc', range: [1, 1] as [number, number], type: 'document', name: '基本方位', documentUuid: 'Compendium.example.tables.RollTable.cardinal' },
    ];

    const aligned = alignTranslatedResults(source, translated);
    expect(aligned.map((entry) => entry.description ?? entry.name)).toEqual([
      'wild translated',
      '基本方位',
      'text translated',
    ]);
    expect(aligned[1]?.documentUuid).toBe('Compendium.example.tables.RollTable.cardinal');
  });

  test('keeps native source rows when a translation entry is absent', () => {
    const source = [{ _id: 'missing', range: [9, 10] as [number, number], type: 'text', description: 'English fallback' }];
    expect(alignTranslatedResults(source, [])).toEqual(source);
  });

  test('serializes the same range keys used by the translation JSON', () => {
    expect(resultRangeKey({ range: [1, 4] })).toBe('1-4');
    expect(resultRangeKey({ range: [97, 100] })).toBe('97-100');
  });

  test('maps scalar translation entries to result descriptions by _id before range', () => {
    const source = [
      { _id: 'wild', range: [1, 4] as [number, number], type: 'text', description: 'English' },
      { _id: 'confusion', range: [1, 1] as [number, number], type: 'text', description: 'English confusion' },
    ];
    const translated = translateResultEntries(source, {
      '1-4': '按范围翻译',
      confusion: '按 ID 翻译',
    });

    expect(translated.map((entry) => entry.description)).toEqual(['按范围翻译', '按 ID 翻译']);
  });

  test('preserves document identity when applying a scalar translation', () => {
    const source = {
      _id: 'doc',
      range: [1, 1] as [number, number],
      type: 'document',
      documentUuid: 'Compendium.example.tables.RollTable.cardinal',
      name: '',
      description: '',
    };

    const translated = applyResultTranslation(source, '文档结果说明');
    expect(translated.description).toBe('文档结果说明');
    expect(translated.documentUuid).toBe(source.documentUuid);
    expect(translated._id).toBe(source._id);
  });
});
