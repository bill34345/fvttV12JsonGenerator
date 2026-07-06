import { describe, expect, it } from 'bun:test';
import { extractVisualHints } from '../visualHints';

describe('extractVisualHints', () => {
  it('extracts position hints from multi-statblock image captions', () => {
    const text = '(https://media.example/relentless.png)从左前方起顺时针依次为：无情梦魇、无情撕裂者、无情主宰译者 @x 无情杀手 Relentless Killers AC 15 HP 91';
    const hints = extractVisualHints(text, {
      topicId: '170033',
      chineseName: '无情撕裂者',
      englishName: 'Relentless Slasher',
    });

    expect(hints.positionHints.some((hint) => hint.includes('从左前方起顺时针依次为'))).toBe(true);
    expect(hints.captionHints.some((hint) => hint.includes('无情梦魇'))).toBe(true);
  });

  it('extracts single-creature appearance hints that help token framing', () => {
    const madamEva = '伊娃夫人 Madam Eva 口是心非的占卜师。尽管伊娃夫人看起来已年过七十，但她实际上远比看起来更加年迈。她在解读预兆、塔罗卡牌占卜以及通过降灵会进行驯灵方面的技艺几乎无人能比。伊娃夫人Madam Eva中型类人 AC 15';
    const dullahan = '杜拉罕Dullahan无头的复仇猎手。许多杜拉罕都会骑着亡灵或邪魔坐骑去追杀猎物。杜拉罕Dullahan中型亡灵 AC 16';

    const madamHints = extractVisualHints(madamEva, { chineseName: '伊娃夫人', englishName: 'Madam Eva' });
    const dullahanHints = extractVisualHints(dullahan, { chineseName: '杜拉罕', englishName: 'Dullahan' });

    expect(madamHints.appearanceHints.some((hint) => hint.includes('看起来已年过七十'))).toBe(true);
    expect(madamHints.appearanceHints.some((hint) => hint.includes('塔罗卡牌占卜'))).toBe(true);
    expect(dullahanHints.appearanceHints.some((hint) => hint.includes('无头'))).toBe(true);
    expect(dullahanHints.appearanceHints.some((hint) => hint.includes('骑着亡灵或邪魔坐骑'))).toBe(true);
  });
});
