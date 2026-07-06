import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ParserFactory } from '../../parser/router';
import { parseCreatureBlock, splitCollection } from '../../ingest/plaintext';
import type { CrawledTopicRecord } from '../types';
import {
  convertRecordsToPlaintextCollection,
  readRecordsJson,
  runRecordsToPlaintext,
  writePlaintextCollection,
} from '../convert/recordsToPlaintext';

const fixtureDir = join(import.meta.dir, 'fixtures');
const recordsPath = join(fixtureDir, 'goddessfantasy-records.json');
const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('records-to-plaintext converter', () => {
  test('generates a plaintext collection that the existing ingestion path can parse', () => {
    const records = readRecordsJson(recordsPath);
    const result = convertRecordsToPlaintextCollection(records, {
      recordsPath,
      contentType: 'monster',
    });

    expect(result.recordsRead).toBe(2);
    expect(result.recordsMatched).toBe(1);
    expect(result.blocksEmitted).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.failures).toHaveLength(0);
    expect(result.markdown).toContain('# **伊斯人 (Yithian)**');
    expect(result.markdown).toContain('![伊斯人](https://media.dndbeyond.com/compendium-images/rthw/ogMxaVTj4GqgnUqr/22-042.yithian.jpg)');
    expect(result.markdown).not.toContain('论坛讨论回复不应进入 plaintext 输出');
    expect(result.markdown).not.toContain('调整 豁免');
    expect(result.markdown).not.toContain('调整豁免');
    expect(result.markdown).toContain('**豁免 (Saves)**：体质 +9，智力 +10');
    expect(result.markdown).toContain('- **魔法抗性 (Magic Resistance)**：伊斯人对抗法术和其他魔法效应时进行的豁免检定具有优势。');

    const blocks = splitCollection(result.markdown);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.englishName).toBe('Yithian');

    const generated = parseCreatureBlock(blocks[0]!.rawBlock);
    expect(generated.markdown).toContain('伊斯人 (Yithian)');

    const parsed = new ParserFactory().parse(generated.markdown);
    expect(parsed.name).toBe('伊斯人 (Yithian)');
    expect(parsed.attributes.ac?.value).toBe(14);
    expect(parsed.attributes.hp?.value).toBe(180);
    expect(parsed.attributes.movement?.walk).toBe(30);
    expect(parsed.abilities.str).toBe(18);
    expect(parsed.abilities.dex).toBe(10);
    expect(parsed.abilities.con).toBe(18);
    expect(parsed.abilities.int).toBe(21);
    expect(parsed.abilities.wis).toBe(18);
    expect(parsed.abilities.cha).toBe(19);
    expect(parsed.details.cr).toBe(15);
    expect(generated.sections).toHaveProperty('特性');
    expect(generated.sections).toHaveProperty('动作');
  });

  test('filters contentType=monster and skips unknown records', () => {
    const records = readRecordsJson(recordsPath);
    const result = convertRecordsToPlaintextCollection(records, {
      recordsPath,
      contentType: 'unknown',
    });

    expect(result.recordsMatched).toBe(1);
    expect(result.blocksEmitted).toBe(0);
    expect(result.failures[0]?.error).toContain('Unsupported content type');
  });

  test('falls back to posts[0].text when raw HTML is missing', () => {
    const records = readRecordsJson(recordsPath);
    const fallbackRecord: CrawledTopicRecord = {
      ...records[0]!,
      rawHtmlPath: 'missing.html',
    };

    const result = convertRecordsToPlaintextCollection([fallbackRecord], {
      recordsPath,
      contentType: 'monster',
    });

    expect(result.blocksEmitted).toBe(1);
    expect(result.warnings.some((warning) => warning.code === 'used-text-fallback')).toBe(true);
    expect(splitCollection(result.markdown)).toHaveLength(1);
  });

  test('uses the topic title for bilingual names when the first post starts with translator notes', () => {
    const records = readRecordsJson(recordsPath);
    const record: CrawledTopicRecord = {
      ...records[0]!,
      topicId: '168299',
      title: '【怪物】小法妖Gremishka',
      rawHtmlPath: 'missing.html',
      posts: [
        {
          ...records[0]!.posts[0]!,
          text: records[0]!.posts[0]!.text.replace(/^伊斯人Yithian/, '译者@铃谷 小法妖 Gremishka'),
        },
      ],
    };

    const result = convertRecordsToPlaintextCollection([record], {
      recordsPath,
      contentType: 'monster',
    });

    expect(result.markdown).toContain('# **小法妖 (Gremishka)**');
  });

  test('uses each statblock cell for multi-statblock posts and does not leak raw stat text', () => {
    const records = readRecordsJson(recordsPath);
    const record: CrawledTopicRecord = {
      ...records[0]!,
      topicId: '168320',
      title: '【怪物】丧尸Zombies',
      rawHtmlPath: 'goddessfantasy-topic-print-multi-statblock.html',
      imageUrls: [],
      posts: [
        {
          ...records[0]!.posts[0]!,
          title: '【怪物】丧尸Zombies',
          text: 'raw HTML contains the statblock source',
          imageUrls: [],
        },
      ],
    };

    const result = convertRecordsToPlaintextCollection([record], {
      recordsPath,
      contentType: 'monster',
    });

    expect(result.blocksEmitted).toBe(2);
    expect(result.items.map((item) => item.status)).toEqual(['ok', 'ok']);
    expect(result.warnings.some((warning) => warning.code === 'possible-multiple-statblocks')).toBe(false);
    expect(result.items.map((item) => item.fileName)).toEqual([
      '168320__swarm-of-zombie-limbs.md',
      '168320__zombie-clot.md',
    ]);
    expect(result.markdown).toContain('丧尸断肢集群 (Swarm of Zombie Limbs)');
    expect(result.markdown).toContain('丧尸肉团 (Zombie Clot)');
    expect(result.markdown).not.toContain('AC 12先攻');
    expect(result.markdown).not.toContain('特质Traits');
    expect(result.markdown).not.toContain('动作Actions');
  });

  test('recognizes Chinese-only section markers in flattened forum text', () => {
    const records = readRecordsJson(recordsPath);
    const record: CrawledTopicRecord = {
      ...records[0]!,
      rawHtmlPath: 'missing.html',
      posts: [
        {
          ...records[0]!.posts[0]!,
          text:
            '伊斯人Yithian大型异怪，混乱中立AC 14先攻 +5（15）HP 180（19d10+76）速度 30尺' +
            '力量18+4+4 敏捷10+0+0 体质18+4+9 智力21+5+10 感知18+4+4 魅力19+4+4' +
            '感官 真实视觉60尺；被动察觉14语言 深潜语CR 15（XP13,000；PB+5）' +
            '特性魔法抗性Magic Resistance。伊斯人对抗法术和其他魔法效应时进行的豁免检定具有优势。' +
            '动作多重攻击Multiattack。伊斯人发动三次钳击攻击。' +
            '(https://example.com/yithian.png)伊斯人Yithian大型异怪，混乱中立AC 14先攻 +5（15）',
        },
      ],
    };

    const result = convertRecordsToPlaintextCollection([record], {
      recordsPath,
      contentType: 'monster',
    });

    expect(result.markdown).toContain('### 特性 (Traits)');
    expect(result.markdown).toContain('### 动作 (Actions)');
    expect(result.markdown).toContain('- **魔法抗性 (Magic Resistance)**：');
    expect(result.markdown).toContain('- **多重攻击 (Multiattack)**：');
    expect(result.markdown).not.toContain('https://example.com/yithian.png');
    expect(result.markdown).not.toContain('AC 14先攻');
  });

  test('cleans source artifacts while preserving internal stat text inside feature bodies', () => {
    const records = readRecordsJson(recordsPath);
    const record: CrawledTopicRecord = {
      ...records[0]!,
      title: '【怪物】米·戈Mi-Go',
      rawHtmlPath: 'missing.html',
      imageUrls: ['https://example.com/mi-go.png'],
      posts: [
        {
          ...records[0]!.posts[0]!,
          text:
            '(https://example.com/mi-go.png)米·戈Mi-Go中型异怪，中立邪恶AC 16先攻 +6（16）HP 120（16d8+48）速度 30尺，飞行30尺' +
            '力量20+5+5 敏捷15+2+6 体质16+3+3 智力21+5+9 感知15+2+6 魅力12+1+1' +
            '感知 真实视觉120尺；被动察觉16语言 全部；心灵感应120尺CR 9（XP5,000；PB+4）' +
            '特质Traits银罐Silver Canister。米戈拥有一个银罐。携带或持握这个银罐期间，该米戈可以使用其采脑动作项。' +
            '银罐AC15，HP40，对所有伤害具有抗性。银罐在降至0生命值时破损。' +
            '动作Actions钳击Pincer。近战攻击检定：+9，触及5尺。命中：23（4d8+5）挥砍伤害。[/size]',
          imageUrls: ['https://example.com/mi-go.png'],
        },
      ],
    };

    const result = convertRecordsToPlaintextCollection([record], {
      recordsPath,
      contentType: 'monster',
    });

    expect(result.markdown).toContain('![米·戈](https://example.com/mi-go.png)');
    expect(result.markdown).not.toContain('\n(https://example.com/mi-go.png)\n');
    expect(result.markdown).toContain('**感官 (Senses)**：真实视觉 120 尺；被动察觉16');
    expect(result.markdown).toContain('**语言 (Languages)**：全部；心灵感应 120 尺');
    expect(result.markdown).toContain('**速度 (Speed)**：30 尺，飞行 30 尺');
    expect(result.markdown).toContain('银罐AC15，HP40，对所有伤害具有抗性。银罐在降至0生命值时破损。');
    expect(result.markdown).toContain('- **钳击 (Pincer)**：近战攻击检定：+9，触及 5 尺。');
    expect(result.markdown).not.toContain('[/size]');
    expect(result.warnings.some((warning) => warning.code === 'possible-multiple-statblocks')).toBe(false);
  });

  test('does not split a section entry from an English name embedded mid-sentence', () => {
    const records = readRecordsJson(recordsPath);
    const record: CrawledTopicRecord = {
      ...records[0]!,
      topicId: '170001',
      title: '【怪物】僵尸 Jiangshi',
      rawHtmlPath: 'missing.html',
      imageUrls: ['https://example.com/jiangshi.png'],
      posts: [
        {
          ...records[0]!.posts[0]!,
          title: '【怪物】僵尸 Jiangshi',
          text:
            '(https://example.com/jiangshi.png)僵尸 Jiangshi中型亡灵，守序邪恶AC 16先攻 -4（6）HP 119 (14d8+56)速度 20尺，飞行5尺（悬浮）' +
            '力量18+4+4 敏捷3-4-4 体质18+4+8 智力17+3+7 感知14+2+6 魅力12+1+5' +
            '免疫 毒素；魅惑，力竭，恐慌，麻痹，中毒感官 黑暗视觉120尺；被动察觉16语言 通用语CR 9 (XP 5,000; PB +4)' +
            '特质Traits僵尸弱点Jiangshi Weaknesses。僵尸拥有以下弱点。' +
            '动作Actions吸食精气Consume Energy。体质豁免检定：DC16，单一30尺内僵尸可见的生物。失败：18 (4d8) 暗蚀伤害。' +
            '成功：仅半伤。失败或成功：僵尸回复等同于所受暗蚀伤害的生命值，飞行速度提升至20尺直至其下一回合结束，其可以使用饥渴奔行附赠动作选项。' +
            '因此伤害生命值降至0的类人会在僵尸回合结束时变成一只由该僵尸操控的尸妖Wight。若该尸妖用其动作吸取生命杀死一名类人，其将在5天后转化为一只独立的僵尸。' +
            '附赠动作Bonus Actions饥渴奔行Hungering Stride（需求吸食精气）。僵尸执行疾走动作。',
          imageUrls: ['https://example.com/jiangshi.png'],
        },
      ],
    };

    const result = convertRecordsToPlaintextCollection([record], {
      recordsPath,
      contentType: 'monster',
    });

    expect(result.markdown).toContain('### 动作 (Actions)');
    expect(result.markdown).toContain('- **吸食精气 (Consume Energy)**：');
    expect(result.markdown).toContain('尸妖Wight。若该尸妖用其动作吸取生命杀死一名类人');
    expect(result.markdown).not.toContain('- **的类人会在僵尸回合结束时变成一只由该僵尸操控的尸妖 (Wight)**');
  });

  test('removes translator credit from pre-statblock lore', () => {
    const records = readRecordsJson(recordsPath);
    const record: CrawledTopicRecord = {
      ...records[0]!,
      topicId: '168299',
      title: '【怪物】小法妖Gremishka',
      rawHtmlPath: 'missing.html',
      imageUrls: [],
      posts: [
        {
          ...records[0]!.posts[0]!,
          title: '【怪物】小法妖Gremishka',
          text:
            '译者@铃谷小法妖 Gremishka魔法感应，法师杀手 栖息地：城市；宝藏：奥秘' +
            '小法妖 Gremishka微型怪兽，混乱邪恶AC 14先攻 +2（12）HP 31（7d4+14）速度 30尺' +
            '力量12+1+1敏捷14+2+2体质15+2+2智力11+0+0感知14+2+2魅力4-3-3' +
            '感官 黑暗视觉30尺；被动察觉12语言 理解通用语但不会说CR 2（XP450；PB+2）' +
            '特质Traits魔法抗性Magic Resistance。小法妖对抗法术和其他魔法效应时进行的豁免检定具有优势。' +
            '动作Actions啮咬Bite。近战攻击检定：+4，触及5尺。命中：5（1d6+2）穿刺伤害。',
          imageUrls: [],
        },
      ],
    };

    const result = convertRecordsToPlaintextCollection([record], {
      recordsPath,
      contentType: 'monster',
    });

    expect(result.markdown).toContain('# **小法妖 (Gremishka)**');
    expect(result.markdown).not.toContain('译者@铃谷');
  });

  test('does not treat section words inside entry bodies as new section headings', () => {
    const records = readRecordsJson(recordsPath);
    const record: CrawledTopicRecord = {
      ...records[0]!,
      rawHtmlPath: 'missing.html',
      posts: [
        {
          ...records[0]!.posts[0]!,
          text:
            '测试兽Test Beast中型异怪，中立AC 12HP 30（4d8+12）速度 30尺' +
            '力量10+0+0 敏捷12+1+1 体质16+3+3 智力8-1-1 感知10+0+0 魅力8-1-1' +
            '感官 黑暗视觉60尺；被动察觉10语言 无CR 1（XP200；PB+2）' +
            '特性\n压制灵光Suppressing Aura。目标不能使用反应，且不能执行特殊动作项。' +
            '动作\n爪击Claw。近战攻击检定：+4，触及5尺，目标120尺范围内。命中：7（2d4+2）挥砍伤害。',
        },
      ],
    };

    const result = convertRecordsToPlaintextCollection([record], {
      recordsPath,
      contentType: 'monster',
    });

    expect(result.markdown).toContain('### 特性 (Traits)');
    expect(result.markdown).toContain('- **压制灵光 (Suppressing Aura)**：目标不能使用反应，且不能执行特殊动作项。');
    expect(result.markdown).toContain('### 动作 (Actions)');
    expect(result.markdown).toContain('- **爪击 (Claw)**：近战攻击检定：+4，触及 5 尺，目标 120 尺范围内。');
    expect(result.markdown).not.toContain('### 反应 (Reactions)');
  });

  test('dry-run does not write output files', () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-records-plaintext-'));
    roots.push(root);
    const outFile = join(root, 'plaintext', 'monsters.md');

    const result = runRecordsToPlaintext({
      recordsPath,
      outFile,
      contentType: 'monster',
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.blocksEmitted).toBe(1);
    expect(existsSync(outFile)).toBe(false);
    expect(existsSync(join(dirname(outFile), 'manifest.json'))).toBe(false);
  });

  test('writes one markdown file per successful monster with index and manifests', () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-records-plaintext-'));
    roots.push(root);
    const outDir = join(root, 'plaintext', 'monsters');
    const records = readRecordsJson(recordsPath);

    const result = runRecordsToPlaintext({
      recordsPath,
      outDir,
      contentType: 'monster',
      force: true,
    });

    expect(result.recordsRead).toBe(records.length);
    expect(result.filesWritten).toBe(1);
    expect(result.items.find((item) => item.status === 'ok')?.fileName).toBe('169745__yithian.md');
    expect(existsSync(join(outDir, '169745__yithian.md'))).toBe(true);
    expect(existsSync(join(root, 'plaintext', 'index.md'))).toBe(true);
    expect(existsSync(join(root, 'plaintext', 'manifest.json'))).toBe(true);
    expect(existsSync(join(root, 'plaintext', 'warnings.jsonl'))).toBe(true);
    expect(existsSync(join(root, 'plaintext', 'failures.jsonl'))).toBe(true);
  });

  test('writes aggregate monsters.md when every emitted item is clean', () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-records-plaintext-'));
    roots.push(root);
    const outDir = join(root, 'plaintext', 'monsters');

    const result = runRecordsToPlaintext({
      recordsPath,
      outDir,
      contentType: 'monster',
      force: true,
    });

    const aggregateFile = join(root, 'plaintext', 'monsters.md');
    expect(result.warnings).toHaveLength(0);
    expect(result.failures).toHaveLength(0);
    expect(existsSync(aggregateFile)).toBe(true);
    expect(readFileSync(aggregateFile, 'utf-8')).toBe(result.markdown);
  });

  test('does not leave an aggregate monsters.md when conversion has warnings', () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-records-plaintext-'));
    roots.push(root);
    const outDir = join(root, 'plaintext', 'monsters');
    const aggregateFile = join(root, 'plaintext', 'monsters.md');
    mkdirSync(join(root, 'plaintext'), { recursive: true });
    writeFileSync(aggregateFile, 'stale aggregate', 'utf-8');
    const records = readRecordsJson(recordsPath);
    const fallbackRecord: CrawledTopicRecord = {
      ...records[0]!,
      rawHtmlPath: 'missing.html',
    };

    const converted = convertRecordsToPlaintextCollection([fallbackRecord], {
      recordsPath,
      outDir,
      contentType: 'monster',
    });
    const result = writePlaintextCollection(converted, { force: true });

    expect(result.filesWritten).toBe(1);
    expect(result.warnings.some((warning) => warning.code === 'used-text-fallback')).toBe(true);
    expect(existsSync(join(outDir, '169745__yithian.md'))).toBe(true);
    expect(existsSync(aggregateFile)).toBe(false);
  });

  test('one failed record does not prevent other monster files from being written', () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-records-plaintext-'));
    roots.push(root);
    const outDir = join(root, 'plaintext', 'monsters');
    const records = readRecordsJson(recordsPath);
    const manyRecords = Array.from({ length: 20 }, (_, index) => ({
      ...records[0]!,
      topicId: String(20000 + index),
      title: `【怪物】伊斯人${index} Yithian`,
    }));
    delete (manyRecords[7] as Partial<CrawledTopicRecord>).classification;

    const converted = convertRecordsToPlaintextCollection(manyRecords, {
      recordsPath,
      outDir,
      contentType: 'monster',
    });
    const result = writePlaintextCollection(converted, {
      force: true,
    });

    expect(result.recordsRead).toBe(20);
    expect(result.filesWritten).toBe(19);
    expect(result.failures).toHaveLength(1);
    expect(result.items.filter((item) => item.status === 'failed')).toHaveLength(1);
    expect(result.items.filter((item) => item.status === 'ok')).toHaveLength(19);
  });

  test('split multi-statblock items are written without needs_review warnings', () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-records-plaintext-'));
    roots.push(root);
    const outDir = join(root, 'plaintext', 'monsters');
    const records = readRecordsJson(recordsPath);
    const record: CrawledTopicRecord = {
      ...records[0]!,
      topicId: '168320',
      title: '【怪物】丧尸Zombies',
      rawHtmlPath: 'goddessfantasy-topic-print-multi-statblock.html',
      imageUrls: [],
      posts: [
        {
          ...records[0]!.posts[0]!,
          title: '【怪物】丧尸Zombies',
          text: 'raw HTML contains the statblock source',
          imageUrls: [],
        },
      ],
    };

    const converted = convertRecordsToPlaintextCollection([record], {
      recordsPath,
      outDir,
      contentType: 'monster',
    });
    const result = writePlaintextCollection(converted, {
      force: true,
    });

    expect(result.filesWritten).toBe(2);
    expect(result.items.map((item) => item.status)).toEqual(['ok', 'ok']);
    expect(result.items.map((item) => item.fileName)).toEqual([
      '168320__swarm-of-zombie-limbs.md',
      '168320__zombie-clot.md',
    ]);
    expect(existsSync(join(root, 'plaintext', 'monsters', '168320__swarm-of-zombie-limbs.md'))).toBe(true);
    expect(existsSync(join(root, 'plaintext', 'monsters', '168320__zombie-clot.md'))).toBe(true);
    expect(readFileSync(join(root, 'plaintext', 'warnings.jsonl'), 'utf-8')).toBe('');
  });

  test('writes each statblock cell from a multi-statblock topic as its own monster file', () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-records-plaintext-'));
    roots.push(root);
    const outDir = join(root, 'plaintext', 'monsters');
    const records = readRecordsJson(recordsPath);
    const record: CrawledTopicRecord = {
      ...records[0]!,
      topicId: '168320',
      title: '【怪物】丧尸Zombies',
      rawHtmlPath: 'goddessfantasy-topic-print-multi-statblock.html',
      imageUrls: [],
      posts: [
        {
          ...records[0]!.posts[0]!,
          title: '【怪物】丧尸Zombies',
          text: 'raw HTML contains the statblock source',
          imageUrls: [],
        },
      ],
    };

    const converted = convertRecordsToPlaintextCollection([record], {
      recordsPath,
      outDir,
      contentType: 'monster',
    });
    const result = writePlaintextCollection(converted, { force: true });

    expect(result.recordsRead).toBe(1);
    expect(result.recordsMatched).toBe(1);
    expect(result.filesWritten).toBe(2);
    expect(result.items.map((item) => item.fileName)).toEqual([
      '168320__swarm-of-zombie-limbs.md',
      '168320__zombie-clot.md',
    ]);
    expect(existsSync(join(outDir, '168320__swarm-of-zombie-limbs.md'))).toBe(true);
    expect(existsSync(join(outDir, '168320__zombie-clot.md'))).toBe(true);
    expect(readFileSync(join(outDir, '168320__swarm-of-zombie-limbs.md'), 'utf-8')).toContain('# **丧尸断肢集群 (Swarm of Zombie Limbs)**');
    expect(readFileSync(join(outDir, '168320__zombie-clot.md'), 'utf-8')).toContain('# **丧尸肉团 (Zombie Clot)**');
  });

  test('force=false rejects existing output and force=true overwrites it', () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-records-plaintext-'));
    roots.push(root);
    const outFile = join(root, 'plaintext', 'monsters.md');
    const records = readRecordsJson(recordsPath);
    const result = convertRecordsToPlaintextCollection(records, {
      recordsPath,
      outFile,
      contentType: 'monster',
    });

    writePlaintextCollection(result, { force: true });
    writeFileSync(outFile, 'stale', 'utf-8');

    const blocked = writePlaintextCollection(result, { force: false });
    expect(blocked.failures[0]?.error).toContain('Output file already exists');
    writePlaintextCollection(result, { force: true });

    expect(readFileSync(outFile, 'utf-8')).toContain('# **伊斯人 (Yithian)**');
    expect(existsSync(join(dirname(outFile), 'manifest.json'))).toBe(true);
    expect(existsSync(join(dirname(outFile), 'failures.jsonl'))).toBe(true);
  });

  test('missing classification is recorded as a failed item instead of crashing conversion', () => {
    const records = readRecordsJson(recordsPath);
    const broken = { ...records[0]! } as Partial<CrawledTopicRecord>;
    delete broken.classification;

    const result = convertRecordsToPlaintextCollection([broken as CrawledTopicRecord], {
      recordsPath,
      contentType: 'monster',
    });

    expect(result.blocksEmitted).toBe(0);
    expect(result.failures[0]?.error).toContain('classification.contentType');
    expect(result.items[0]?.status).toBe('failed');
  });
});
