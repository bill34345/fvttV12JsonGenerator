# Item AI Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI normalization to item parsing so that natural language descriptions (bullets, stage abilities) are processed by AI before code parsing, matching the Actor workflow pattern.

**Architecture:** 
- Create ItemAiNormalizer class that processes item body text and returns structured YAML
- Modify ObsidianSync workflow to apply AI normalization before ItemParser
- ItemParser simplified to only parse frontmatter (name, type, rarity, attunement) and structured YAML
- Graceful degradation: if AI unavailable, fallback to existing regex-based parsing

**Tech Stack:** TypeScript, OpenAI-compatible API, existing translation infrastructure

---

## File Structure

```
src/
  core/
    ingest/
      item-ai-normalizer.ts     # NEW: Item AI normalizer (similar to plaintext workflow)
    parser/
      item-parser.ts           # MODIFY: Simplify to parse frontmatter + YAML
      item-strategy.ts         # MODIFY: Update interface
    workflow/
      obsidianSync.ts          # MODIFY: Integrate AI normalization

tests/
  core/
    ingest/
      item-ai-normalizer.test.ts  # NEW: Unit tests for AI normalizer
```

---

## Task 1: Create ItemAiNormalizer Class

**Files:**
- Create: `src/core/ingest/item-ai-normalizer.ts`
- Reference: `src/core/ingest/plaintext.ts:1164-1193` (OpenAICompatibleIngestNormalizer pattern)

- [ ] **Step 1: Create skeleton class**

```typescript
import { createTranslationConfigFromEnv } from '../translation';
import type { Translator } from '../translation/types';

export interface ItemAiNormalizerOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

export class ItemAiNormalizer {
  private translator: Translator;

  constructor(options: ItemAiNormalizerOptions) {
    // Initialize translator
  }

  public async normalizeItem(bodyText: string): Promise<string> {
    // Send body text to AI, return structured YAML
  }
}
```

- [ ] **Step 2: Define AI prompt for item descriptions**

```typescript
// In normalizeItem(), send this prompt to AI:
const prompt = `将以下物品描述转换为结构化 YAML。

规则：
- AC 加值：识别为 "acBonus: +N"
- 充能：识别为 "uses: N"
- 水中呼吸：识别为 "waterBreathing: true"
- 游泳速度：识别为 "swimSpeed: N"
- 光照：识别为 "light: {radius: N}"
- 施展法术：识别为 "spell: {name, uses: N}"
- 状态解除：识别为 "removeCondition: [condition]"
- 豁免重掷：识别为 "saveReroll: true"
- 传送：识别为 "teleport: {distance: N, dc: N, damage: NdN}"

输入描述：
${bodyText}

输出格式：
\`\`\`yaml
abilities:
  - name: <名称>
    type: <effect|spell|use|save>
    description: <原文>
    acBonus: <数字>
    uses: <数字>
    waterBreathing: <true|false>
    swimSpeed: <数字>
    light: <对象>
    spell: <对象>
    removeCondition: <数组>
    saveReroll: <true|false>
    teleport: <对象>
\`\`\`
```

- [ ] **Step 3: Implement translation call**

```typescript
public async normalizeItem(bodyText: string): Promise<string> {
  const response = await this.translator.translate(bodyText, {
    sourceLanguage: 'zh-CN',
    targetLanguage: 'yaml',
    namespace: 'item-normalize',
  });
  
  // Parse YAML from response
  const cleaned = response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  // Extract YAML block if present
  return cleaned;
}
```

- [ ] **Step 4: Add error handling and fallback**

```typescript
public async normalizeItem(bodyText: string): Promise<string> {
  try {
    // ... translation call
  } catch (error) {
    // Return empty YAML on failure
    return 'abilities: []';
  }
}
```

- [ ] **Step 5: Create unit test file**

```typescript
// tests/core/ingest/item-ai-normalizer.test.ts
describe('ItemAiNormalizer', () => {
  test('parses AC bonus from description', async () => {
    const normalizer = new ItemAiNormalizer({ apiKey: 'test' });
    const result = await normalizer.normalizeItem('当佩戴这件饰物时，你的 AC 获得 +1 加值。');
    expect(result).toContain('acBonus: 1');
  });
  
  test('parses multiple abilities', async () => {
    const normalizer = new ItemAiNormalizer({ apiKey: 'test' });
    const result = await normalizer.normalizeItem('- AC 获得 +1 加值\n- 水中呼吸');
    expect(result).toContain('acBonus: 1');
    expect(result).toContain('waterBreathing: true');
  });
  
  test('graceful degradation on API failure', async () => {
    const normalizer = new ItemAiNormalizer({ apiKey: 'invalid' });
    const result = await normalizer.normalizeItem('some text');
    expect(result).toBeDefined();
  });
});
```

- [ ] **Step 6: Run tests**

Run: `bun test tests/core/ingest/item-ai-normalizer.test.ts`
Expected: Tests pass (may skip if no API key)

- [ ] **Step 7: Commit**

```bash
git add src/core/ingest/item-ai-normalizer.ts tests/core/ingest/item-ai-normalizer.test.ts
git commit -m "feat(item): add ItemAiNormalizer class for AI-based description parsing"
```

---

## Task 2: Modify ItemParser to Parse Frontmatter + YAML

**Files:**
- Modify: `src/core/parser/item-parser.ts:19-64` (parse method)

- [ ] **Step 1: Read current parse method**

```typescript
// Current structure:
parse(content: string): ParsedItem {
  const { frontmatter, body } = this.splitContent(content);
  const rawData = yaml.load(frontmatter) as Record<string, unknown>;
  
  // Parse frontmatter fields (name, type, rarity, attunement)
  const name = this.parseName(rawData);
  const type = this.parseType(rawData);
  // ...
  
  // Parse body with regex (THIS NEEDS TO CHANGE)
  const stages = this.parseStages(body);
  const bulletAbilities = this.parseBulletAbilities(body);
  
  return { name, type, ..., stages, structuredActions: bulletAbilities };
}
```

- [ ] **Step 2: Add optional yamlBody parameter**

```typescript
parse(content: string, normalizedBody?: string): ParsedItem {
  const { frontmatter, body } = this.splitContent(content);
  const rawData = yaml.load(frontmatter) as Record<string, unknown>;
  
  // Parse frontmatter fields (code handles these)
  const name = this.parseName(rawData);
  const type = this.parseType(rawData);
  const rarity = this.parseRarity(rawData);
  const attunement = this.parseAttunement(rawData);
  
  // If AI normalized body provided, parse YAML instead of regex
  let stages, structuredActions;
  if (normalizedBody) {
    const yamlData = yaml.load(normalizedBody) as Record<string, unknown>;
    stages = this.parseYamlStages(yamlData);
    structuredActions = this.parseYamlActions(yamlData);
  } else {
    // Fallback to regex parsing
    stages = this.parseStages(body);
    structuredActions = this.parseBulletAbilities(body);
  }
  
  return { name, type, rarity, attunement, stages, structuredActions };
}
```

- [ ] **Step 3: Add YAML parsing methods**

```typescript
private parseYamlStages(yamlData: Record<string, unknown>): ItemStage[] {
  // Parse { dormant: [...], awakened: [...], exalted: [...] }
}

private parseYamlActions(yamlData: Record<string, unknown>): StructuredActions {
  // Parse { abilities: [...] } into ActionData[]
}
```

- [ ] **Step 4: Update interface**

```typescript
// src/core/parser/item-strategy.ts
interface ItemParserStrategy {
  canParse(content: string): boolean;
  parse(content: string, normalizedBody?: string): ParsedItem;  // ADD normalizedBody
}
```

- [ ] **Step 5: Run existing tests**

Run: `bun test src/core/parser/__tests__/item-parser.test.ts`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/core/parser/item-parser.ts src/core/parser/item-strategy.ts
git commit -m "refactor(item): add YAML parsing support to ItemParser"
```

---

## Task 3: Integrate AI Normalization into ObsidianSync

**Files:**
- Modify: `src/core/workflow/obsidianSync.ts`
- Modify: `src/index.ts:127-158` (sync workflow)

- [ ] **Step 1: Read current ObsidianSync integration**

```typescript
// src/core/workflow/obsidianSync.ts
// Find where item parsing happens
```

- [ ] **Step 2: Add ItemAiNormalizer to ObsidianSync**

```typescript
import { ItemAiNormalizer } from '../ingest/item-ai-normalizer';

export class ObsidianSyncWorkflow {
  private itemAiNormalizer?: ItemAiNormalizer;
  
  constructor(options: { enableAiNormalize?: boolean } = {}) {
    if (options.enableAiNormalize) {
      this.itemAiNormalizer = new ItemAiNormalizer({});
    }
  }
  
  async sync(input: ObsidianSyncInput) {
    // ... existing logic ...
    
    // For items, apply AI normalization before parsing
    if (detectItemRoute(content) && this.itemAiNormalizer) {
      const { body } = splitContent(content);
      const normalizedBody = await this.itemAiNormalizer.normalizeItem(body);
      const parsed = itemParser.parse(content, normalizedBody);
    }
  }
}
```

- [ ] **Step 3: Update CLI to pass enableAiNormalize**

```bash
# src/index.ts
--enable-ai-normalize  # Add this flag to ObsidianSync options
```

- [ ] **Step 4: Run tests**

Run: `bun test src/core/workflow/__tests__/obsidianSync.test.ts`
Expected: Tests pass

- [ ] **Step 5: Commit**

```bash
git add src/core/workflow/obsidianSync.ts src/index.ts
git commit -m "feat(item): integrate AI normalization into ObsidianSync workflow"
```

---

## Task 4: End-to-End Test with 三祷之坠

**Files:**
- Test: `obsidian/dnd数据转fvttjson/input/items/三祷之坠.md`

- [ ] **Step 1: Run with AI normalization**

```bash
bun run src/index.ts --sync --vault "obsidian/dnd数据转fvttjson" --enable-ai-normalize
```

- [ ] **Step 2: Verify output JSON**

Check `obsidian/dnd数据转fvttjson/output/items/三祷之坠.json/三祷之坠.json`:

```json
{
  "effects": [
    {
      "_id": "...",
      "name": "AC +1 加值",
      "type": "passive",
      "changes": [{ "key": "system.attributes.ac.bonus", "mode": 2, "value": "+1" }]
    }
  ]
}
```

- [ ] **Step 3: Verify Awakened has AC +2**

Check `obsidian/dnd数据转fvttjson/output/items/三祷之坠.json/三祷之坠 (Awakened).json`:

```json
{
  "effects": [
    {
      "name": "AC +2 加值",
      "changes": [{ "key": "system.attributes.ac.bonus", "mode": 2, "value": "+2" }]
    }
  ]
}
```

- [ ] **Step 4: Verify Exalted has AC +3**

Check `obsidian/dnd数据转fvttjson/output/items/三祷之坠.json/三祷之坠 (Exalted).json`:

```json
{
  "effects": [
    {
      "name": "AC +3 加值",
      "changes": [{ "key": "system.attributes.ac.bonus", "mode": 2, "value": "+3" }]
    }
  ]
}
```

- [ ] **Step 5: Commit test output**

```bash
git add obsidian/dnd数据转fvttjson/output/items/
git commit -m "test(item): add 三祷之坠 AI normalization output"
```

---

## Task 5: Graceful Degradation Test

**Files:**
- Modify: `src/core/workflow/obsidianSync.ts`

- [ ] **Step 1: Test without AI (fallback to regex)**

```bash
bun run src/index.ts --sync --vault "obsidian/dnd数据转fvttjson"
# WITHOUT --enable-ai-normalize
```

- [ ] **Step 2: Verify fallback works**

Output should still be generated, but Awakened/Exalted may have wrong AC values (known limitation without AI).

- [ ] **Step 3: Document fallback behavior**

```markdown
## Graceful Degradation

If AI normalization is disabled or unavailable:
- Frontmatter parsing (name, type, rarity, attunement): WORKS
- Body parsing with regex: PARTIAL (AC "增加到 +N" not recognized)
- Known limitation: Awakened/Exalted AC values may be +1 instead of +2/+3
```

- [ ] **Step 4: Commit**

```bash
git add docs/...
git commit -m "docs(item): document AI normalization fallback behavior"
```

---

## Final Verification

- [ ] **F1: All unit tests pass**

Run: `bun test`
Expected: All pass (268+)

- [ ] **F2: 三祷之坠 generates correct JSON with AI**

Run: `bun run src/index.ts --sync --vault "obsidian/dnd数据转fvttjson" --enable-ai-normalize`

Verify:
- Dormant: AC +1 ✅
- Awakened: AC +2 ✅  
- Exalted: AC +3 ✅

- [ ] **F3: Graceful degradation works**

Run without `--enable-ai-normalize`
Expected: JSON generated, frontmatter correct

---

## Success Criteria

1. ✅ 三祷之坠 Dormant has AC +1 in effects
2. ✅ 三祷之坠 Awakened has AC +2 in effects
3. ✅ 三祷之坠 Exalted has AC +3 in effects
4. ✅ All existing tests pass
5. ✅ Graceful degradation when AI unavailable
6. ✅ Code parsing only handles frontmatter, AI handles descriptions
