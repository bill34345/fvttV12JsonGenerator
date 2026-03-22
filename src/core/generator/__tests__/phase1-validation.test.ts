import { describe, it, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ActorGenerator } from '../actor';
import { ChineseTemplateParser } from '../../parser/chinese';
import { ParserFactory } from '../../parser/router';

const VAULT_DIR = join(process.cwd(), 'obsidian/dnd数据转fvttjson/input');

function loadAndGenerate(filename: string): any {
  const factory = new ParserFactory();
  const content = readFileSync(join(VAULT_DIR, filename), 'utf-8');
  const parsed = factory.parse(content);
  const generator = new ActorGenerator();
  return generator.generate(parsed);
}

describe('Phase 1: Template Contamination', () => {
  let actor: any;

  beforeAll(() => {
    actor = loadAndGenerate('chuul-nullifier.md');
  });

  it('flags should be empty — no golden master pollution', () => {
    expect(actor.flags).toEqual({});
    expect(actor.flags?.babele).toBeUndefined();
    expect(actor.flags?.['mcdm-flee-mortals-where-evil-lives']).toBeUndefined();
    expect(actor.flags?.exportSource).toBeUndefined();
  });

  it('_stats should not inherit golden master values', () => {
    // _stats should either be absent or have fresh generated values
    if (actor._stats) {
      expect(actor._stats.lastModifiedBy).not.toBe('FccwB5HfAhy1F49a');
      expect(actor._stats.createdTime).toBeGreaterThan(0);
    }
  });

  it('folder should be null or undefined', () => {
    expect(actor.folder).toBeFalsy();
  });

  it('img should be empty string', () => {
    expect(actor.img).toBe('');
  });

  it('prototypeToken.flags should be empty', () => {
    expect(actor.prototypeToken?.flags).toEqual({});
  });
});

describe('Phase 1: Language Mapping', () => {
  let actor: any;

  beforeAll(() => {
    actor = loadAndGenerate('chuul-nullifier.md');
  });

  it('深渊语 should map to "deep"', () => {
    const langs = actor.system.traits.languages.value;
    expect(langs).toContain('deep');
    expect(langs).not.toContain('深渊语');
  });
});

describe('Phase 1: Damage Type Mapping', () => {
  let actor: any;

  beforeAll(() => {
    actor = loadAndGenerate('chuul-nullifier.md');
  });

  it('钳击 damage should be bludgeoning, not 钝击', () => {
    const pincer = actor.items.find((i: any) => i.name.includes('钳击'));
    expect(pincer).toBeDefined();
    const activity = Object.values(pincer.system.activities)[0] as any;
    expect(activity.damage.parts[0].types).toContain('bludgeoning');
    expect(activity.damage.parts[0].types).not.toContain('钝击');
  });
});

describe('Phase 1: Condition/Immunity Mapping', () => {
  let actor: any;

  beforeAll(() => {
    actor = loadAndGenerate('chuul-nullifier.md');
  });

  it('状态免疫 中毒 should map to poisoned', () => {
    expect(actor.system.traits.ci.value).toContain('poisoned');
    expect(actor.system.traits.ci.value).not.toContain('中毒');
  });

  it('伤害免疫 毒素 should map to poison', () => {
    expect(actor.system.traits.di.value).toContain('poison');
    expect(actor.system.traits.di.value).not.toContain('毒素');
  });
});

describe('Phase 1: 1/Day Ability Uses', () => {
  let actor: any;

  beforeAll(() => {
    actor = loadAndGenerate('slithering-bloodfin__滑行血鳍.md');
  });

  it('远洋尖啸 [1/日] should have uses.value=1, uses.max=1', () => {
    const xiao = actor.items.find((i: any) => i.name.includes('远洋尖啸'));
    expect(xiao).toBeDefined();
    expect(xiao.system.uses).toBeDefined();
    expect(xiao.system.uses.value).toBe(1);
    expect(xiao.system.uses.max).toBe(1);
    expect(xiao.system.uses.per).toBeDefined();
  });
});

describe('Phase 1: Empty Description', () => {
  let actor: any;

  beforeAll(() => {
    actor = loadAndGenerate('chuul-nullifier.md');
  });

  it('钳击 description should not be empty <p></p>', () => {
    const pincer = actor.items.find((i: any) => i.name.includes('钳击'));
    expect(pincer).toBeDefined();
    expect(pincer.system.description.value).not.toBe('<p></p>');
    expect(pincer.system.description.value.length).toBeGreaterThan(10);
  });
});

describe('Phase 1: Effect Binding', () => {
  let actor: any;

  beforeAll(() => {
    actor = loadAndGenerate('slithering-bloodfin__滑行血鳍.md');
  });

  it('扭滑 should remain a special utility feature without auto-applying statuses it is meant to clear', () => {
    const niuHua = actor.items.find((i: any) => i.name.startsWith('扭滑'));
    if (!niuHua) {
      expect(actor.items.some((i: any) => i.name.includes('Wriggly'))).toBe(false);
      return;
    }
    expect(niuHua.system.activation.type).toBe('special');
    expect(niuHua.effects ?? []).toHaveLength(0);
  });
});

describe('Phase 1: Bonus Action / Reaction Recognition', () => {
  let actor: any;

  beforeAll(() => {
    actor = loadAndGenerate('slithering-bloodfin__滑行血鳍.md');
  });

  it('吞咽 should be a bonus action', () => {
    const swallow = actor.items.find((i: any) => i.name.startsWith('吞咽'));
    expect(swallow).toBeDefined();
    expect(swallow.system.activation.type).toBe('bonus');
  });

  it('滑溜 should be a reaction', () => {
    const slip = actor.items.find((i: any) => i.name.startsWith('滑溜'));
    expect(slip).toBeDefined();
    expect(slip.system.activation.type).toBe('reaction');
  });
});

describe('Phase 1: Multi-damage Parsing', () => {
  let actor: any;

  beforeAll(() => {
    actor = loadAndGenerate('mock-dragon.md');
  });

  it('Bite should have 2 damage parts (piercing + fire)', () => {
    const bite = actor.items.find((i: any) => i.name.toLowerCase().includes('bite') || i.name.includes('啮咬'));
    expect(bite).toBeDefined();
    const activity = Object.values(bite.system.activities)[0] as any;
    expect(activity.damage.parts.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Phase 1: Spells Field Inheritance', () => {
  let actor: any;

  beforeAll(() => {
    actor = loadAndGenerate('chuul-nullifier.md');
  });

  it('non-casters should have all spells value: 0 and override: null', () => {
    const spells = actor.system.spells;
    for (const [key, spellLvl] of Object.entries(spells)) {
      expect((spellLvl as any).value).toBe(0);
      expect((spellLvl as any).override).toBeNull();
    }
    expect(actor.system.attributes.spellcasting).toBe('');
  });
});
