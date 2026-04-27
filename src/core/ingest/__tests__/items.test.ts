import { describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ItemsIngestionWorkflow, splitItemCollection } from '../items';

const ITEM_FIXTURE = `# 下面是两个示例物品

## 三祷之坠（Jewel of Three Prayers）

*奇物，传说（需同调）*

三祷之坠是一件诀别遗物...

**休眠态（Dormant State）.** 在这个状态下...

**觉醒态（Awakened State）.** ...

**升华态（Exalted State）.** ...

## 骑士之盾（Shield of the Cavalier）

*护甲（盾牌），极珍稀（需同调）*

骑士之盾是一件强大的防御装备...
`;

describe('splitItemCollection', () => {
  it('returns 4 blocks total (3 for 三祷之坠 + 1 for 骑士之盾)', () => {
    const blocks = splitItemCollection(ITEM_FIXTURE);
    expect(blocks).toHaveLength(4);
  });

  it('三祷之坠 has correct stage names', () => {
    const blocks = splitItemCollection(ITEM_FIXTURE);
    const jewelBlocks = blocks.filter((b) => b.chineseName === '三祷之坠');
    expect(jewelBlocks).toHaveLength(3);
    expect(jewelBlocks[0]?.stageName).toBe('Dormant State');
    expect(jewelBlocks[1]?.stageName).toBe('Awakened State');
    expect(jewelBlocks[2]?.stageName).toBe('Exalted State');
  });

  it('骑士之盾 has no stage name', () => {
    const blocks = splitItemCollection(ITEM_FIXTURE);
    const shieldBlock = blocks.find((b) => b.chineseName === '骑士之盾');
    expect(shieldBlock?.stageName).toBeUndefined();
  });

  it('parses names correctly', () => {
    const blocks = splitItemCollection(ITEM_FIXTURE);
    const jewelBlock = blocks.find((b) => b.chineseName === '三祷之坠');
    expect(jewelBlock?.chineseName).toBe('三祷之坠');
    expect(jewelBlock?.englishName).toBe('Jewel of Three Prayers');
  });

  it('rawBlock includes stage heading line', () => {
    const blocks = splitItemCollection(ITEM_FIXTURE);
    const dormantBlock = blocks.find((b) => b.stageName === 'Dormant State');
    expect(dormantBlock?.rawBlock).toContain('**休眠态（Dormant State）.**');
  });

  it('each stage block contains its stage content', () => {
    const blocks = splitItemCollection(ITEM_FIXTURE);
    const awakenedBlock = blocks.find((b) => b.stageName === 'Awakened State');
    expect(awakenedBlock?.rawBlock).toContain('**觉醒态（Awakened State）.**');
  });
  it('writes split item markdown into the requested middle items directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-items-ingest-'));
    const sourcePath = join(root, 'items.md');
    const emitDir = join(root, 'vault', 'middle', 'items');

    writeFileSync(
      sourcePath,
      [
        '# 下面是一个示例物品',
        '## 骑士之盾（Shield of the Cavalier）',
        '*护甲（盾牌），极珍稀（需同调）*',
        '',
        '持握这面盾牌期间，你的护甲等级获得 +2 加值。',
      ].join('\n'),
      'utf-8',
    );

    try {
      const workflow = new ItemsIngestionWorkflow();
      const result = await workflow.ingest({ sourcePath, emitDir });

      expect(result.emitDir).toBe(emitDir);
      expect(result.files).toHaveLength(1);
      expect(existsSync(join(emitDir, 'shield-of-the-cavalier__骑士之盾.md'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
