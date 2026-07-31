import { describe, expect, it } from 'bun:test';
import { FIELD_MAPPING as legacyFieldMapping } from '../../../config/mapping';
import { parseActorBehaviorSemantics as legacyParseActorBehaviorSemantics } from '../behaviorSemantics';
import { ChineseTemplateParser as LegacyChineseTemplateParser } from '../chinese';
import { EnglishBestiaryParser as LegacyEnglishBestiaryParser } from '../english';
import { parseActorResourceSemantics as legacyParseActorResourceSemantics } from '../resourceSemantics';
import { ParserFactory as LegacyParserFactory } from '../router';
import type { ParserRoute as LegacyParserRoute } from '../types';
import { YamlParser as LegacyYamlParser } from '../yaml';
import { parseActorBehaviorSemantics } from '@fvtt-json-generator/parser/behavior-semantics';
import { FIELD_MAPPING } from '@fvtt-json-generator/parser/mapping';
import { ChineseTemplateParser } from '@fvtt-json-generator/parser/chinese';
import { EnglishBestiaryParser } from '@fvtt-json-generator/parser/english';
import { parseActorResourceSemantics } from '@fvtt-json-generator/parser/resource-semantics';
import { ParserFactory } from '@fvtt-json-generator/parser/router';
import type { ParserRoute } from '@fvtt-json-generator/parser/types';
import { YamlParser } from '@fvtt-json-generator/parser/yaml';

describe('legacy high-level parser compatibility adapters', () => {
  it('forward the canonical package implementations and field mapping', () => {
    expect(LegacyYamlParser).toBe(YamlParser);
    expect(LegacyChineseTemplateParser).toBe(ChineseTemplateParser);
    expect(LegacyEnglishBestiaryParser).toBe(EnglishBestiaryParser);
    expect(LegacyParserFactory).toBe(ParserFactory);
    expect(legacyFieldMapping).toBe(FIELD_MAPPING);
    expect(legacyParseActorResourceSemantics).toBe(parseActorResourceSemantics);
    expect(legacyParseActorBehaviorSemantics).toBe(parseActorBehaviorSemantics);
    const route: ParserRoute = 'chinese';
    const legacyRoute: LegacyParserRoute = route;
    expect(legacyRoute).toBe('chinese');
  });
});
