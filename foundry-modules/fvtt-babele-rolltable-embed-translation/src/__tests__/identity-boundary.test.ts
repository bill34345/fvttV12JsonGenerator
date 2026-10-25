import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { alignTranslatedResults, applyResultTranslation, buildEmbedWrapper, clearTranslationSessionCache, registerRollTableEmbedWrapper, translateResultEntries, translatedCompendiumForPack } from '../index';

describe('translation identity and fallback', () => {
  test('ambiguous ID or range never selects an arbitrary row', () => {
    const source = [{ _id: 'a', range: [1, 2], description: 'original' }];
    expect(alignTranslatedResults(source, [
      { _id: 'a', range: [1, 2], description: 'first' },
      { _id: 'a', range: [1, 2], description: 'last' },
    ])).toEqual(source);
    expect(alignTranslatedResults(source, [
      { range: [1, 2], description: 'first' }, { range: [1, 2], description: 'last' },
    ])).toEqual(source);
    const shared = [...source, { _id: 'b', range: [1, 2], description: 'other' }];
    expect(translateResultEntries(shared, { '1-2': 'ambiguous' })).toEqual(shared);
    expect(alignTranslatedResults(shared, [{ range: [1, 2], description: 'ambiguous' }])).toEqual(shared);
  });

  test('object translations change display text while keeping source identity and state', () => {
    const source = { _id: 'a', range: [1, 2], type: 'document', documentUuid: 'Compendium.source.doc', drawn: true, name: 'English', description: 'English body' };
    const translation = { _id: 'foreign', range: [9, 10], type: 'text', documentUuid: 'Compendium.other.doc', drawn: false, name: '中文', description: '<em>说明</em>' };
    expect(applyResultTranslation(source, translation)).toEqual({ ...source, name: '中文', description: '<em>说明</em>' });
    expect(source.documentUuid).toBe('Compendium.source.doc');
  });

  test.each([false, true])('stages all result cells before changing native DOM; failure=%s', async (failure) => {
    const dom = new JSDOM('<table><tbody><tr><td>1</td><td>original one</td></tr><tr><td>2</td><td>original two</td></tr></tbody></table>');
    const keys = ['game', 'foundry', 'document'] as const;
    const prior = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const source = [{ _id: 'a', range: [1, 1], type: 'text', description: 'one' }, { _id: 'b', range: [2, 2], type: 'text', description: 'two' }];
    const embed = dom.window.document.querySelector('table')!;
    const original = embed.outerHTML;
    Object.assign(globalThis, { document: dom.window.document,
      game: { babele: { translatedCompendiumFor: () => ({ translate: () => ({ results: source.map(row => ({ ...row, description: `translated ${row.description}` })) }) }) } },
      foundry: { applications: { ux: { TextEditor: { implementation: { enrichHTML(value: string) {
        if (failure && value.includes('two')) throw new Error('synthetic enrichment failure');
        return value;
      } } } } } },
    });
    try {
      const result = await buildEmbedWrapper({ pack: 'synthetic.tables', toObject: () => ({ results: source }), results: { toObject: () => source } }, async () => embed, {});
      expect(result).toBe(embed);
      if (failure) expect(embed.outerHTML).toBe(original);
      else {
        expect([...embed.querySelectorAll('tr > td:nth-child(2)')].map(cell => cell.textContent)).toEqual(['translated one', 'translated two']);
        expect([...embed.querySelectorAll('tr > td:first-child')].map(cell => cell.textContent)).toEqual(['1', '2']);
        expect(source.map(row => row.description)).toEqual(['one', 'two']);
      }
    } finally {
      for (const [key, descriptor] of prior) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
      dom.window.close();
    }
  });

  test('registers once per libWrapper runtime and allows retry after a registration failure', () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'libWrapper');
    let attempts = 0;
    let fail = true;
    const wrapper = { register() { attempts++; if (fail) throw new Error('not ready'); } };
    Object.assign(globalThis, { libWrapper: wrapper });
    try {
      expect(() => registerRollTableEmbedWrapper()).toThrow('not ready');
      fail = false;
      registerRollTableEmbedWrapper();
      registerRollTableEmbedWrapper();
      expect(attempts).toBe(2);
      Object.assign(globalThis, { libWrapper: { register() { attempts++; } } });
      registerRollTableEmbedWrapper();
      expect(attempts).toBe(3);
    } finally {
      if (previous) Object.defineProperty(globalThis, 'libWrapper', previous);
      else Reflect.deleteProperty(globalThis, 'libWrapper');
    }
  });

  test('an old rejected language load does not evict the new cache after clear', async () => {
    clearTranslationSessionCache();
    let reject!: (reason: Error) => void;
    const old = new Promise<never>((_, fail) => { reject = fail; });
    let loads = 0;
    const facade = { sessionFor: async () => {
      loads++;
      if (loads === 1) return old;
      return { translatedCompendiumFor: () => null };
    } };
    const first = translatedCompendiumForPack(facade, 'pack', 'zh-CN');
    clearTranslationSessionCache();
    await translatedCompendiumForPack(facade, 'pack', 'zh-CN');
    reject(new Error('old request failed'));
    await expect(first).rejects.toThrow('old request failed');
    await translatedCompendiumForPack(facade, 'pack', 'zh-CN');
    expect(loads).toBe(2);
  });
});
