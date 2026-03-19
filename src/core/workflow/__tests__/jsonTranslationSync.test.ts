import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonTranslationSyncWorkflow } from '../jsonTranslationSync';

class FakeTranslationService {
  public calls: string[] = [];

  public async translate(text: string): Promise<{ text: string; warnings: unknown[] }> {
    this.calls.push(text);
    return { text: `译:${text}`, warnings: [] };
  }
}

class MixedDirectionTranslationService {
  public async translate(text: string): Promise<{ text: string; warnings: unknown[] }> {
    if (text === '佩利顿爵士') {
      return { text: 'Sir Pelliton', warnings: [] };
    }

    if (text === '多重攻击') {
      return { text: 'Multiattack', warnings: [] };
    }

    return { text: `译:${text}`, warnings: [] };
  }
}

describe('JsonTranslationSyncWorkflow', () => {
  const roots: string[] = [];

  afterAll(() => {
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('translates only target fields and keeps non-target fields untouched', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-json-translate-'));
    roots.push(root);

    const filePath = join(root, 'actor.json');
    writeFileSync(
      filePath,
      JSON.stringify(
        {
          name: 'Sir Pelliton',
          system: {
            description: {
              value: '<p>Melee Weapon Attack: +9 to hit.</p>',
              chat: 'Deal damage.',
            },
            source: {
              book: 'MCDM Monstrous Bundle',
            },
          },
          items: [
            {
              name: 'Multiattack',
              system: {
                description: {
                  value: '<p>Already 中文</p>',
                },
                identifier: 'multiattack',
                requirements: 'One target',
                activities: {
                  dnd5eactivity000: {
                    description: {
                      chatFlavor: 'On hit',
                    },
                    target: {
                      affects: {
                        special: 'one creature',
                      },
                    },
                    useConditionText: 'if bloodied',
                    effectConditionText: 'until end of turn',
                    macroData: {
                      name: 'Leave This Name',
                    },
                  },
                },
              },
              effects: [
                {
                  name: 'Confused',
                  description: 'Cannot take reactions.',
                },
              ],
              _stats: {
                name: 'Do Not Touch',
              },
            },
          ],
        },
        null,
        2,
      ),
    );

    const fake = new FakeTranslationService();
    const workflow = new JsonTranslationSyncWorkflow({ translationService: fake });
    const result = await workflow.sync({ dirPath: root });

    expect(result.scannedFiles).toBe(1);
    expect(result.changedFiles).toBe(1);
    expect(result.translatedFields).toBeGreaterThan(0);
    expect(result.failures.length).toBe(0);

    const translated = JSON.parse(readFileSync(filePath, 'utf-8')) as {
      name: string;
      system: {
        description: { value: string; chat: string };
        source: { book: string };
      };
      items: Array<{
        name: string;
        system: {
          identifier: string;
          description: { value: string };
          activities: {
            dnd5eactivity000: {
              macroData: { name: string };
            };
          };
        };
        effects: Array<{
          name: string;
        }>;
        _stats: { name: string };
      }>;
    };
    expect(translated.name).toBe('译 (Sir Pelliton)');
    expect(translated.system.description.value.includes('<p>')).toBe(true);
    expect(translated.system.description.chat.startsWith('译:')).toBe(true);
    expect(translated.system.source.book).toBe('MCDM Monstrous Bundle');
    const firstItem = translated.items[0];
    expect(firstItem).toBeDefined();
    if (!firstItem) {
      throw new Error('Expected at least one item in translated fixture');
    }
    expect(firstItem.name).toBe('译 (Multiattack)');
    expect(firstItem.system.identifier).toBe('multiattack');
    expect(firstItem.system.description.value).toBe('<p>Already 中文</p>');
    expect(firstItem._stats.name).toBe('Do Not Touch');
    expect(firstItem.effects[0]?.name).toBe('Confused');
    expect(firstItem.system.activities.dnd5eactivity000.macroData.name).toBe(
      'Leave This Name',
    );
  });

  it('skips fields already translated in repeated runs', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-json-translate-repeat-'));
    roots.push(root);

    const filePath = join(root, 'item.json');
    writeFileSync(
      filePath,
      JSON.stringify(
        {
          name: 'Frost Brand Greatsword',
          system: {
            description: {
              value: '<p>Hit: 2d6 cold damage.</p>',
            },
          },
        },
        null,
        2,
      ),
    );

    const fake = new FakeTranslationService();
    const workflow = new JsonTranslationSyncWorkflow({ translationService: fake });

    const first = await workflow.sync({ dirPath: root });
    const second = await workflow.sync({ dirPath: root });

    expect(first.translatedFields).toBeGreaterThan(0);
    expect(second.translatedFields).toBe(0);
    expect(second.changedFiles).toBe(0);
    expect(second.skippedAlreadyTranslated).toBeGreaterThan(0);
  });

  it('fills missing english for chinese-only actor and item names', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-json-translate-bilingual-'));
    roots.push(root);

    const filePath = join(root, 'bilingual.json');
    writeFileSync(
      filePath,
      JSON.stringify(
        {
          name: '佩利顿爵士',
          items: [
            {
              name: '多重攻击',
              type: 'feat',
            },
          ],
        },
        null,
        2,
      ),
    );

    const workflow = new JsonTranslationSyncWorkflow({
      translationService: new MixedDirectionTranslationService(),
    });

    const result = await workflow.sync({ dirPath: root });
    expect(result.changedFiles).toBe(1);
    expect(result.translatedFields).toBe(2);

    const translated = JSON.parse(readFileSync(filePath, 'utf-8')) as {
      name: string;
      items: Array<{ name: string }>;
    };

    expect(translated.name).toBe('佩利顿爵士 (Sir Pelliton)');
    expect(translated.items[0]?.name).toBe('多重攻击 (Multiattack)');
  });
});
