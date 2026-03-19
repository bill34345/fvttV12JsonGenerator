import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ParserFactory } from '../router';

describe('ParserFactory', () => {
  const factory = new ParserFactory();

  it('selects chinese route when layout creature marker is absent', () => {
    const content = ['---', '名称: 成年红龙', '类型: npc', '---', '# 背景', '测试'].join('\n');

    expect(factory.detectRoute(content)).toBe('chinese');
    expect(factory.createParser(content).type).toBe('chinese');
  });

  it('selects english route when frontmatter includes layout: creature', () => {
    const fixture = readFileSync(new URL('./fixtures/english-bestiary-creature.md', import.meta.url), 'utf-8');

    expect(factory.detectRoute(fixture)).toBe('english');
    expect(factory.createParser(fixture).type).toBe('english');
  });

  it('keeps chinese strict unknown field behavior in default route', () => {
    const content = ['名称: 测试', 'UnknownField: 123'].join('\n');

    const parser = factory.createParser(content);
    expect(parser.type).toBe('chinese');
    expect(() => parser.parse(content)).toThrow('InvalidField');
  });
});
