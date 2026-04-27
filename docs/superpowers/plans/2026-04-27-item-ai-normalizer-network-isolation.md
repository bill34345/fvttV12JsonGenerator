# Item AI Normalizer Network Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `ItemAiNormalizer` tests deterministic by injecting the HTTP boundary instead of letting tests call the real network.

**Architecture:** Keep the current item normalizer behavior and prompt shape. Add a small `httpClient` dependency injection point to `ItemAiNormalizerOptions`, then update tests to mock the OpenAI-compatible `/chat/completions` response at that boundary. Do not change item parsing, item generation, NPC/monster workflows, or generated actor JSON.

**Tech Stack:** Bun test runner, TypeScript, existing OpenAI-compatible chat-completions payload shape, project-local `ItemAiNormalizer`.

---

## Current Evidence

- Full `bun test` currently reports `327 pass / 3 fail`.
- All remaining failures are in `tests/core/ingest/item-ai-normalizer.test.ts`.
- The failing tests assign `(normalizer as any).translator = ...`, but `src/core/ingest/item-ai-normalizer.ts` does not use a `translator` field. It owns a private `httpClient` initialized to `fetch.bind(globalThis)`.
- Because the fake translator is ignored, tests with `apiKey: 'test-key'` call the real network and fail with certificate or HTTP 401 errors.
- NPC/monster parser, workflow, acceptance, and plaintext tests are currently passing. Do not include them in this fix except as regression verification.

## Scope Boundary

In scope:
- `src/core/ingest/item-ai-normalizer.ts`
- `tests/core/ingest/item-ai-normalizer.test.ts`
- Verification commands listed below

Out of scope:
- `src/core/ingest/items.ts`
- `src/core/parser/item-parser.ts`
- `src/core/generator/item-generator.ts`
- `src/core/workflow/obsidianSync.ts` item routing behavior
- Any Foundry actor JSON hand-editing
- Any item-generation feature expansion
- Any network-dependent test

## File Structure

- Modify `src/core/ingest/item-ai-normalizer.ts`
  - Add a public testable dependency injection option: `httpClient?: ItemAiNormalizerHttpClient`.
  - Keep the existing fallback behavior: no API key returns `abilities: []`; HTTP errors return `abilities: []`; malformed or empty model responses return `abilities: []`; successful model content is cleaned and returned.

- Modify `tests/core/ingest/item-ai-normalizer.test.ts`
  - Replace stale `(normalizer as any).translator` mocks with `httpClient` mocks passed into the constructor.
  - Assert request URL, method, Authorization header, and body content for one success path.
  - Keep the existing cleaning behavior tests: fenced YAML, plain text, `<think>` tag removal, thrown network error fallback.

---

### Task 1: Write the Failing HTTP-Injection Tests

**Files:**
- Modify: `tests/core/ingest/item-ai-normalizer.test.ts`

- [ ] **Step 1: Replace the stale translator-mock tests with HTTP-client mocks**

Replace the contents of `tests/core/ingest/item-ai-normalizer.test.ts` with this exact test file:

```ts
import { describe, it, expect } from 'bun:test';
import { ItemAiNormalizer, type ItemAiNormalizerHttpClient } from '../../../src/core/ingest/item-ai-normalizer';

function createChatResponse(content: string, status = 200): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content,
          },
        },
      ],
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
}

describe('ItemAiNormalizer', () => {
  describe('constructor', () => {
    it('creates instance without API key', () => {
      const normalizer = new ItemAiNormalizer({});
      expect(normalizer).toBeDefined();
    });

    it('creates instance with API key', () => {
      const normalizer = new ItemAiNormalizer({
        apiKey: 'test-key',
        baseUrl: 'https://api.test.com/v1',
        model: 'test-model',
        timeoutMs: 10000,
      });
      expect(normalizer).toBeDefined();
    });
  });

  describe('normalizeItem', () => {
    it('returns abilities: [] when no API key configured and does not call httpClient', async () => {
      let called = false;
      const httpClient: ItemAiNormalizerHttpClient = async () => {
        called = true;
        return createChatResponse('unused');
      };

      const normalizer = new ItemAiNormalizer({ httpClient });
      const result = await normalizer.normalizeItem('Some item description');

      expect(result).toBe('abilities: []');
      expect(called).toBe(false);
    });

    it('sends an OpenAI-compatible request and returns cleaned YAML from a markdown fence', async () => {
      const mockBodyText = 'This armor grants its wearer +2 AC.';
      const expectedYaml = 'acBonus: +2';
      let requestUrl = '';
      let requestInit: RequestInit | undefined;

      const httpClient: ItemAiNormalizerHttpClient = async (url, init) => {
        requestUrl = url;
        requestInit = init;
        return createChatResponse(`\`\`\`yaml\n${expectedYaml}\n\`\`\``);
      };

      const normalizer = new ItemAiNormalizer({
        apiKey: 'test-key',
        baseUrl: 'https://api.test.com/v1/',
        model: 'test-model',
        timeoutMs: 10000,
        httpClient,
      });

      const result = await normalizer.normalizeItem(mockBodyText);
      const requestBody = JSON.parse(String(requestInit?.body ?? '{}')) as {
        model?: string;
        temperature?: number;
        messages?: Array<{ role?: string; content?: string }>;
      };

      expect(result).toBe(expectedYaml);
      expect(requestUrl).toBe('https://api.test.com/v1/chat/completions');
      expect(requestInit?.method).toBe('POST');
      expect((requestInit?.headers as Record<string, string>)?.Authorization).toBe('Bearer test-key');
      expect(requestBody.model).toBe('test-model');
      expect(requestBody.temperature).toBe(0);
      expect(requestBody.messages?.[0]?.role).toBe('user');
      expect(requestBody.messages?.[0]?.content).toContain(mockBodyText);
    });

    it('returns cleaned response when the model returns plain text', async () => {
      const expectedYaml = 'fireResistance: true';
      const httpClient: ItemAiNormalizerHttpClient = async () => createChatResponse(expectedYaml);

      const normalizer = new ItemAiNormalizer({
        apiKey: 'test-key',
        httpClient,
      });

      const result = await normalizer.normalizeItem('Cloak of the Phoenix');
      expect(result).toBe(expectedYaml);
    });

    it('strips think tags from response before extracting YAML', async () => {
      const expectedYaml = 'swimSpeed: 30';
      const httpClient: ItemAiNormalizerHttpClient = async () =>
        createChatResponse(`<think> Some thinking here </think>\`\`\`yaml\n${expectedYaml}\n\`\`\``);

      const normalizer = new ItemAiNormalizer({
        apiKey: 'test-key',
        httpClient,
      });

      const result = await normalizer.normalizeItem('Ring of swimming');
      expect(result).toBe(expectedYaml);
    });

    it('returns abilities: [] when the HTTP request throws', async () => {
      const httpClient: ItemAiNormalizerHttpClient = async () => {
        throw new Error('Network error');
      };

      const normalizer = new ItemAiNormalizer({
        apiKey: 'test-key',
        httpClient,
      });

      const result = await normalizer.normalizeItem('Some item description');
      expect(result).toBe('abilities: []');
    });

    it('returns abilities: [] when the HTTP response is not successful', async () => {
      const httpClient: ItemAiNormalizerHttpClient = async () => createChatResponse('ignored', 401);

      const normalizer = new ItemAiNormalizer({
        apiKey: 'test-key',
        httpClient,
      });

      const result = await normalizer.normalizeItem('Some item description');
      expect(result).toBe('abilities: []');
    });
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the expected type failure**

Run:

```powershell
bun test tests/core/ingest/item-ai-normalizer.test.ts
```

Expected before implementation:

```text
error: Module ... has no exported member 'ItemAiNormalizerHttpClient'
```

If the failure is instead about the `httpClient` constructor option not existing, that is also the expected red state for this task.

---

### Task 2: Add the HTTP Client Injection Point

**Files:**
- Modify: `src/core/ingest/item-ai-normalizer.ts`

- [ ] **Step 1: Export the HTTP client type**

Near the imports at the top of `src/core/ingest/item-ai-normalizer.ts`, replace the unused translator import with this exported type:

```ts
export type ItemAiNormalizerHttpClient = (url: string, init: RequestInit) => Promise<Response>;
```

Remove this line because the file does not use it:

```ts
import { OpenAICompatibleTranslator } from '../translation/openaiCompatible';
```

- [ ] **Step 2: Add `httpClient` to `ItemAiNormalizerOptions`**

Change the options interface to:

```ts
export interface ItemAiNormalizerOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  httpClient?: ItemAiNormalizerHttpClient;
}
```

- [ ] **Step 3: Use the injected client in the constructor**

In the class fields, keep:

```ts
private readonly httpClient: ItemAiNormalizerHttpClient;
```

In the constructor, replace:

```ts
this.httpClient = fetch.bind(globalThis);
```

with:

```ts
this.httpClient = options.httpClient ?? fetch.bind(globalThis);
```

- [ ] **Step 4: Run the focused test and confirm pass**

Run:

```powershell
bun test tests/core/ingest/item-ai-normalizer.test.ts
```

Expected:

```text
6 pass
0 fail
```

If the test count is 7 because the HTTP 401 case is included, the valid expected result is:

```text
7 pass
0 fail
```

---

### Task 3: Verify No Accidental Network Dependency Remains

**Files:**
- Modify only if Task 2 exposes a missed path: `tests/core/ingest/item-ai-normalizer.test.ts`

- [ ] **Step 1: Run the full suite**

Run:

```powershell
bun test
```

Expected:

```text
0 fail
```

The exact pass count may differ because the worktree already contains other test additions. The acceptance criterion is no failing tests.

- [ ] **Step 2: If `bun test` still fails in `ItemAiNormalizer`, inspect the failure category**

Use this command:

```powershell
bun test tests/core/ingest/item-ai-normalizer.test.ts
```

Allowed remaining issue categories:
- Type mismatch in the injected client shape.
- Response mock missing a `Response` method used by production code.
- Cleaning logic mismatch for fenced YAML or `<think>` removal.

Do not solve this by deleting tests or by allowing real network calls.

- [ ] **Step 3: If `bun test` fails outside `ItemAiNormalizer`, stop and classify**

Report:

```text
ItemAiNormalizer focused tests: pass/fail
Full suite unrelated failures:
- <test file>: <test name>: <first error line>
Next narrow fix:
- <single file/function to inspect next>
```

Do not bundle unrelated item parser or generator fixes into this plan.

---

### Task 4: Preserve NPC/Monster Workflow Confidence

**Files:**
- No code change expected.

- [ ] **Step 1: Run the NPC/monster and workflow regression slice**

Run:

```powershell
bun test tests/e2e.test.ts src/core/generator/__tests__/phase1-validation.test.ts src/core/ingest/__tests__/plaintext.test.ts src/core/workflow/__tests__/plainTextActor.test.ts tests/cli-plaintext-actors.test.ts
```

Expected:

```text
0 fail
```

- [ ] **Step 2: Regenerate one representative actor through the project CLI**

Run:

```powershell
bun run src/index.ts "obsidian/dnd数据转fvttjson/input/slithering-bloodfin__滑行血鳍.md" -o "obsidian/dnd数据转fvttjson/output/slithering-bloodfin__滑行血鳍.json"
```

Expected:

```text
Validation passed: No issues detected.
Successfully generated obsidian/dnd数据转fvttjson/output/slithering-bloodfin__滑行血鳍.json
Name: 滑行血鳍 (Slithering Bloodfin)
Items: 9
```

- [ ] **Step 3: Parse and spot-check the regenerated JSON**

Run:

```powershell
$env:ACTOR_JSON=(Resolve-Path -LiteralPath "obsidian\dnd数据转fvttjson\output\slithering-bloodfin__滑行血鳍.json").Path
node -e "const fs=require('fs'); const actor=JSON.parse(fs.readFileSync(process.env.ACTOR_JSON,'utf8')); console.log(JSON.stringify({name:actor.name,type:actor.type,hp:actor.system?.attributes?.hp,ac:actor.system?.attributes?.ac,blindsight:actor.system?.attributes?.senses?.blindsight,cr:actor.system?.details?.cr,itemCount:actor.items?.length,itemNames:actor.items?.map(i=>i.name)}, null, 2));"
```

Expected JSON values:

```json
{
  "name": "滑行血鳍 (Slithering Bloodfin)",
  "type": "npc",
  "hp": {
    "value": 143,
    "max": 143
  },
  "ac": {
    "flat": 16,
    "calc": "natural"
  },
  "blindsight": 100,
  "cr": 9,
  "itemCount": 9
}
```

The full printed `itemNames` must include:

```text
Bite
Tail Crash
Swallow
Pelagic Screech
```

Chinese-localized names are also acceptable if the English names appear in parentheses or if the generated item names match the current localized output.

---

## Completion Criteria

- `tests/core/ingest/item-ai-normalizer.test.ts` uses constructor injection and no `(normalizer as any).translator` assignment.
- `ItemAiNormalizerOptions` exposes `httpClient?: ItemAiNormalizerHttpClient`.
- No item AI normalizer test makes a real HTTP request.
- Focused item normalizer test passes.
- Full `bun test` passes, or any remaining failures are explicitly outside `ItemAiNormalizer` and classified before more work continues.
- NPC/monster regression slice passes.
- Representative Slithering Bloodfin actor JSON is regenerated through the project CLI and manually spot-checked against source expectations.

## Self-Review

- Spec coverage: This plan addresses the current full-suite failures, all of which are item AI normalizer network-isolation failures. It explicitly does not expand item generation.
- Placeholder scan: No `TBD`, `TODO`, `implement later`, or `fill in details` entries are used as implementation instructions.
- Type consistency: The same `ItemAiNormalizerHttpClient` type is exported by `src/core/ingest/item-ai-normalizer.ts` and imported by `tests/core/ingest/item-ai-normalizer.test.ts`.
