# PlainText → Chinese Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 1 of PlainTextIngestionWorkflow optimization - output structured Chinese template format with AI normalization and auto-generated audit reports.

**Architecture:** 
- Modify `OpenAICompatibleIngestNormalizer` to output structured YAML frontmatter + markdown actions in Chinese template format
- Create new `PlainTextAuditWorkflow` that generates detailed audit reports
- Output to `middle/` folder with naming convention `{slug}__{chinese-name}.md`
- Audit reports go to `audits/YYYY-MM-DD-{source-slug}-audit.md`

**Tech Stack:** TypeScript, Bun, js-yaml, OpenAI-compatible API

---

## 1. File Structure

```
src/core/ingest/
├── plaintext.ts                    # MODIFY: AI prompt, YAML parser, directory logic
└── plaintextAudit.ts               # CREATE: New audit workflow

obsidian/dnd数据转fvttjson/
├── input/                          # EXISTING: Source files
├── middle/                         # CREATE: AI-normalized output
└── audits/                         # CREATE: Audit reports
```

---

## 2. Test Fixtures

| File | Creatures | Purpose |
|------|-----------|---------|
| `obsidian/dnd数据转fvttjson/input/开发用数据.md` | 10 | Primary test |
| `obsidian/dnd数据转fvttjson/input/开发用数据2.md` | 3 | Secondary test (overlaps) |

**Expected output after implementation:**
- 13 markdown files in `middle/`
- 2 audit reports in `audits/`

---

## 3. Critical Implementation Notes

### CRITICAL: AI Output Format vs Parser Compatibility

**Problem**: The AI prompt outputs "ONLY the YAML" but `parseCreatureBlock()` expects markdown with `# **Name**` heading. This will cause a crash.

**Solution**: When `enableAiNormalize` is true, the normalized block will be pure YAML. We must:
1. Split the YAML frontmatter from the markdown body
2. Parse YAML with `js-yaml` directly
3. Construct `IngestedCreatureFile` manually instead of calling `parseCreatureBlock()`

### CRITICAL: Filename Convention

**Requirement**: Output files must be named `{slug}__{chinese-name}.md`

**Current behavior**: `parseCreatureBlock()` only adds slug prefix when English name exists.

**Solution**: Always generate slug from the Chinese name (using pinyin conversion or fallback slug) and use format `{slug}__{chinese-name}.md`

---

## 4. Implementation Tasks

### Task 1: Create PlainTextAuditWorkflow

**Files:**
- Create: `src/core/ingest/plaintextAudit.ts`
- Test: `src/core/ingest/__tests__/plaintextAudit.test.ts`

- [ ] **Step 1: Create audit interface types**

```typescript
// src/core/ingest/plaintextAudit.ts
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import yaml from 'js-yaml';

export interface AuditIssue {
  creature: string;
  severity: 'error' | 'warning' | 'info';
  field: string;
  originalValue: string;
  expectedValue: string;
  reason: string;
}

export interface PlainTextAuditWorkflowResult {
  sourcePath: string;
  emitDir: string;
  reportPath: string;
  creatureCount: number;
  issues: AuditIssue[];
}

export interface AuditReport {
  date: string;
  sourceFile: string;
  creatureCount: number;
  issues: AuditIssue[];
  summary: {
    error: number;
    warning: number;
    info: number;
  };
}
```

- [ ] **Step 2: Define validation rules (Chinese Template Action Format)**

```typescript
// Validation rules for Section 3.1 of design spec
const VALID_ACTION_TYPES = ['attack', 'save', 'utility'];
const VALID_ATTACK_TYPES = ['mwak', 'rwak', 'msak', 'rsak'];
const VALID_TARGET_TYPES = ['creature', 'object', 'creatureOrObject'];
const VALID_DAMAGE_TYPES = ['钝击', '穿刺', '挥砍', '毒素', '火焰', '寒冷', '闪电', '雷鸣', '光耀', '暗蚀', '力场', '心灵', '强酸'];

function validateAction(creature: string, action: Record<string, unknown>, index: number): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const prefix = `动作[${index}]`;
  
  // Type validation
  if (action.类型 && !VALID_ACTION_TYPES.includes(action.类型 as string)) {
    issues.push({
      creature,
      severity: 'error',
      field: `${prefix}.类型`,
      originalValue: String(action.类型),
      expectedValue: VALID_ACTION_TYPES.join('|'),
      reason: '动作类型必须是 attack|save|utility 之一',
    });
  }
  
  // Attack type validation (only for attack type)
  if (action.类型 === 'attack') {
    if (!action.攻击类型) {
      issues.push({
        creature,
        severity: 'error',
        field: `${prefix}.攻击类型`,
        originalValue: 'undefined',
        expectedValue: VALID_ATTACK_TYPES.join('|'),
        reason: '攻击类型动作必须指定 攻击类型 (mwak|rwak|msak|rsak)',
      });
    } else if (!VALID_ATTACK_TYPES.includes(action.攻击类型 as string)) {
      issues.push({
        creature,
        severity: 'error',
        field: `${prefix}.攻击类型`,
        originalValue: String(action.攻击类型),
        expectedValue: VALID_ATTACK_TYPES.join('|'),
        reason: '攻击类型必须是 mwak|rwak|msak|rsak 之一',
      });
    }
  }
  
  // Target type validation
  if (action.目标 && typeof action.目标 === 'object') {
    const target = action.目标 as Record<string, unknown>;
    if (target.类型 && !VALID_TARGET_TYPES.includes(target.类型 as string)) {
      issues.push({
        creature,
        severity: 'error',
        field: `${prefix}.目标.类型`,
        originalValue: String(target.类型),
        expectedValue: VALID_TARGET_TYPES.join('|'),
        reason: '目标类型必须是 creature|object|creatureOrObject 之一',
      });
    }
  }
  
  // Damage validation
  if (action.伤害 && Array.isArray(action.伤害)) {
    (action.伤害 as Array<Record<string, unknown>>).forEach((dmg, dmgIndex) => {
      if (!dmg.公式) {
        issues.push({
          creature,
          severity: 'error',
          field: `${prefix}.伤害[${dmgIndex}].公式`,
          originalValue: 'undefined',
          expectedValue: 'e.g., 2d8+5',
          reason: '伤害条目必须包含 公式 字段',
        });
      }
      if (!dmg.类型 || !VALID_DAMAGE_TYPES.includes(dmg.类型 as string)) {
        issues.push({
          creature,
          severity: 'error',
          field: `${prefix}.伤害[${dmgIndex}].类型`,
          originalValue: String(dmg.类型 ?? 'undefined'),
          expectedValue: VALID_DAMAGE_TYPES.join('|'),
          reason: '伤害类型必须是有效的中文伤害类型之一',
        });
      }
    });
  }
  
  return issues;
}
```

- [ ] **Step 3: Create audit workflow class**

```typescript
export class PlainTextAuditWorkflow {
  public async audit(options: { 
    sourcePath: string; 
    middleDir: string; 
    auditDir: string 
  }): Promise<PlainTextAuditWorkflowResult> {
    const { sourcePath, middleDir, auditDir } = options;
    const issues: AuditIssue[] = [];
    
    // 1. Ensure audit directory exists
    mkdirSync(auditDir, { recursive: true });
    
    // 2. Read all files from middleDir
    const files = readdirSync(middleDir).filter(f => f.endsWith('.md'));
    
    // 3. For each file, parse YAML frontmatter and validate actions
    for (const file of files) {
      const filePath = join(middleDir, file);
      const content = readFileSync(filePath, 'utf-8');
      const { frontmatter, body } = this.splitYamlMarkdown(content);
      
      if (frontmatter.动作) {
        const actions = Array.isArray(frontmatter.动作) ? frontmatter.动作 : [];
        actions.forEach((action, index) => {
          const actionIssues = validateAction(
            String(frontmatter.名称 ?? file),
            action as Record<string, unknown>,
            index
          );
          issues.push(...actionIssues);
        });
      }
      
      // Similar validation for 附赠动作, 反应, 传奇动作
    }
    
    // 4. Generate report
    const report = this.generateReport(sourcePath, files.length, issues);
    const reportPath = this.getReportPath(sourcePath, auditDir);
    writeFileSync(reportPath, emitAuditMarkdown(report));
    
    return {
      sourcePath,
      emitDir: middleDir,
      reportPath,
      creatureCount: files.length,
      issues,
    };
  }
  
  private splitYamlMarkdown(content: string): { frontmatter: Record<string, unknown>; body: string } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { frontmatter: {}, body: content };
    return {
      frontmatter: yaml.load(match[1]) as Record<string, unknown> || {},
      body: match[2],
    };
  }
  
  private getReportPath(sourcePath: string, auditDir: string): string {
    const date = new Date().toISOString().split('T')[0];
    const slug = sourcePath.replace(/.*\//, '').replace(/\.md$/, '');
    return join(auditDir, `${date}-${slug}-audit.md`);
  }
  
  private generateReport(sourcePath: string, creatureCount: number, issues: AuditIssue[]): AuditReport {
    const summary = { error: 0, warning: 0, info: 0 };
    for (const issue of issues) {
      summary[issue.severity]++;
    }
    return {
      date: new Date().toISOString().split('T')[0],
      sourceFile: sourcePath.replace(/.*\//, ''),
      creatureCount,
      issues,
      summary,
    };
  }
}
```

- [ ] **Step 4: Create markdown audit report generator**

```typescript
function emitAuditMarkdown(report: AuditReport): string {
  const severityIcon = { error: '🔴', warning: '🟡', info: 'ℹ️' };
  const lines = [
    '# PlainText → Chinese Template Audit Report',
    '',
    `**Date**: ${report.date}`,
    `**Source**: ${report.sourceFile}`,
    `**Creatures**: ${report.creatureCount}`,
    '',
    '---',
    '',
    '## Summary',
    '',
    '| Severity | Count |',
    '|----------|-------|',
    `| Error | ${report.summary.error} |`,
    `| Warning | ${report.summary.warning} |`,
    `| Info | ${report.summary.info} |`,
    '',
    '---',
    '',
    '## Issues',
    '',
    ...report.issues.map(issue => [
      `### ${severityIcon[issue.severity]} ${issue.severity}: ${issue.creature} - ${issue.field}`,
      '',
      `**Original Value**: \`${issue.originalValue}\``,
      `**Expected Value**: \`${issue.expectedValue}\``,
      `**Reason**: ${issue.reason}`,
      '',
    ].join('\n')),
  ];
  return lines.join('\n');
}
```

- [ ] **Step 5: Create test file**

```typescript
// src/core/ingest/__tests__/plaintextAudit.test.ts
import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PlainTextAuditWorkflow } from '../plaintextAudit';

describe('PlainTextAuditWorkflow', () => {
  const testDir = join(process.cwd(), 'tmp-test-audit');
  const middleDir = join(testDir, 'middle');
  const auditDir = join(testDir, 'audits');
  
  beforeEach(() => {
    mkdirSync(middleDir, { recursive: true });
    mkdirSync(auditDir, { recursive: true });
  });
  
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });
  
  test('generates audit report for middle/ output', async () => {
    // Setup: create sample Chinese template file
    const sampleFile = join(middleDir, 'test__测试生物.md');
    writeFileSync(sampleFile, `---\n名称: 测试生物\n动作:\n  - 名称: 攻击\n    类型: attack\n    攻击类型: mwak\n---\n`);
    
    const workflow = new PlainTextAuditWorkflow();
    const result = await workflow.audit({
      sourcePath: 'test.md',
      middleDir,
      auditDir,
    });
    
    expect(result.creatureCount).toBe(1);
    expect(result.issues.length).toBe(0); // Valid action should have no issues
  });
  
  test('detects invalid action type', async () => {
    const sampleFile = join(middleDir, 'test__测试生物.md');
    writeFileSync(sampleFile, `---\n名称: 测试生物\n动作:\n  - 名称: 攻击\n    类型: invalid\n---\n`);
    
    const workflow = new PlainTextAuditWorkflow();
    const result = await workflow.audit({
      sourcePath: 'test.md',
      middleDir,
      auditDir,
    });
    
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0].severity).toBe('error');
    expect(result.issues[0].field).toContain('类型');
  });
});
```

- [ ] **Step 6: Run test to verify**

Run: `bun test src/core/ingest/__tests__/plaintextAudit.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/ingest/plaintextAudit.ts src/core/ingest/__tests__/plaintextAudit.test.ts
git commit -m "feat: add PlainTextAuditWorkflow for generating audit reports"
```

---

### Task 2: Modify AI Normalization to Output Chinese Template Format

**Files:**
- Modify: `src/core/ingest/plaintext.ts` (OpenAICompatibleIngestNormalizer class at lines 961-1007)

- [ ] **Step 1: Update the AI normalization prompt**

Replace the existing prompt in `OpenAICompatibleIngestNormalizer` constructor's httpClient (around line 977-982):

```typescript
// Replace the system message content with:
'You are a D&D 5e monster statblock normalizer. Convert bilingual creature text to structured Chinese template format.

OUTPUT FORMAT: Return a JSON object with two fields:
- "frontmatter": YAML frontmatter as a string (starting with --- and ending with ---)
- "slug": URL-safe slug derived from the creature name

Frontmatter must follow this structure:
```yaml
名称: <bilingual name>
类型: npc
体型: <size in Chinese>
生物类型: <creature type in Chinese>
阵营: <alignment in Chinese>
能力:
  力量: <number>
  敏捷: <number>
  体质: <number>
  智力: <number>
  感知: <number>
  魅力: <number>
护甲等级: <value>
生命值: <value>
速度: <value>
感官: <object or string>
挑战等级: <number>
动作:
  - 名称: <string>
    类型: attack|save|utility
    攻击类型: mwak|rwak|msak|rsak  # only if 类型 is attack
    命中: <string>  # e.g., "+8"
    范围: <string>  # e.g., "触及10尺" or "射程30/120尺"
    伤害:
      - 公式: <string>  # e.g., "2d8+5"
        类型: 钝击|穿刺|挥砍|毒素|火焰|寒冷|闪电|雷鸣|光耀|暗蚀|力场|心灵|强酸
    目标:
      数量: <string>
      类型: creature|object|creatureOrObject
      特殊: <string>
    充能:
      最小: <number>
      最大: <number>
    每日: <number>
    需专注: <boolean>
    传奇消耗: <number>
    描述: <string>
附赠动作:
  - <same structure as 动作>
反应:
  - <same structure as 动作>
传奇动作:
  - <same structure as 动作>
    激活类型: legendary|action|bonus|reaction|minute|hour|day
```

RULES:
- 把动作格式从 `**名称**：近战武器攻击 (Melee Weapon Attack)：** 转换为 `**名称** [近战武器攻击]`
- 把 `**命中 (Hit)**：` 转换为动作条目中的独立字段
- 把充能格式 `**充能 5-6 / Recharge 5-6**` 转换为 `充能: {最小: 5, 最大: 6}`
- 把每日格式 `**1/日 / 1/day**` 转换为 `每日: 1`
- 把传奇消耗格式 `**消耗 2 动作**` 转换为 `传奇消耗: 2`
- 把 "仅限被魅惑的目标" 写入 `目标.特殊`
- 伤害类型映射：Bludgeoning→钝击, Piercing→穿刺, Slashing→挥砍, Poison→毒素, Fire→火焰, Cold→寒冷, Lightning→闪电, Thunder→雷鸣, Radiant→光耀, Necrotic→暗蚀, Force→力场, Psychic→心灵, Acid→强酸
- Target types must be: creature|object|creatureOrObject (NOT "space")

Return ONLY a JSON object with "frontmatter" and "slug" fields. No explanations.'
```

Also update the normalizeBlock method to parse the JSON response:

```typescript
public async normalizeBlock(block: string): Promise<string> {
  const response = await this.translator.translate(block, {
    sourceLanguage: 'markdown',
    targetLanguage: 'markdown',
    namespace: 'plaintext-ingest',
  });
  // Parse JSON response
  try {
    const parsed = JSON.parse(response);
    if (parsed.frontmatter) {
      return parsed.frontmatter;
    }
  } catch {
    // Fall back to treating response as raw YAML
  }
  return response;
}
```

- [ ] **Step 2: Verify lint**

Run: `bun run lint src/core/ingest/plaintext.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/core/ingest/plaintext.ts
git commit -m "feat: update AI normalization to output Chinese template YAML format"
```

---

### Task 3: Handle YAML-Only AI Output (Critical Fix)

**Files:**
- Modify: `src/core/ingest/plaintext.ts` (PlainTextIngestionWorkflow.ingest method and parseCreatureBlock)

**CRITICAL ISSUE**: `parseCreatureBlock()` expects markdown with heading `# **Name**` but AI outputs pure YAML. This will crash.

- [ ] **Step 1: Create a new method to parse AI-normalized YAML output**

Add a new method to handle YAML-only input from AI:

```typescript
export function parseYamlNormalizedBlock(yamlContent: string, heading: string): IngestedCreatureFile {
  // yamlContent is pure YAML from AI
  // heading is the original block heading extracted before AI call
  
  const frontmatter = yaml.load(yamlContent) as Frontmatter;
  
  // Extract names from heading (same logic as before)
  const names = parseNamesFromHeading(heading);
  const slug = slugifyEnglishName(names.englishName || names.chineseName);
  
  // ALWAYS use {slug}__{chinese-name}.md format
  const fileName = `${slug}__${sanitizeFileName(names.chineseName)}.md`;
  
  return {
    chineseName: names.chineseName,
    englishName: names.englishName,
    slug,
    fileName,
    markdown: `---\n${yaml.dump(frontmatter, { lineWidth: -1, noRefs: true, sortKeys: false })}---\n`,
    frontmatter,
    sections: {},  // AI output doesn't have section bodies - they're in YAML
    rawNotes: [],
  };
}
```

- [ ] **Step 2: Modify PlainTextIngestionWorkflow.ingest to detect YAML-only content**

Update the `ingest` method (around line 217):

```typescript
public async ingest(options: PlainTextIngestionOptions): Promise<PlainTextIngestionResult> {
  const sourcePath = this.resolvePath(options.sourcePath);
  const emitDir = this.resolvePath(options.emitDir);
  const middleDir = join(dirname(emitDir), 'middle');
  const auditDir = join(dirname(emitDir), 'audits');
  const raw = readFileSync(sourcePath, 'utf-8');
  const blocks = splitCollection(raw);
  const files: IngestedCreatureFile[] = [];

  for (const block of blocks) {
    let normalized = normalizeBlock(block.rawBlock);
    
    // If AI normalization is enabled
    if (options.enableAiNormalize && this.aiNormalizer) {
      try {
        const aiText = await this.aiNormalizer.normalizeBlock(normalized);
        normalized = aiText;
      } catch {
        // Fall back to rule-based normalization
      }
    }
    
    // CRITICAL: Detect if normalized is YAML-only or markdown
    let creature: IngestedCreatureFile;
    if (normalized.trim().startsWith('---') || normalized.includes('名称:')) {
      // YAML-only output from AI - parse differently
      creature = parseYamlNormalizedBlock(normalized, block.heading);
    } else {
      // Standard markdown format
      creature = parseCreatureBlock(normalized);
    }
    files.push(creature);
  }

  if (!options.dryRun) {
    mkdirSync(middleDir, { recursive: true });
    mkdirSync(auditDir, { recursive: true });
    for (const file of files) {
      const outputPath = join(middleDir, file.fileName);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, file.markdown);
    }
    
    // Trigger audit
    const auditWorkflow = new PlainTextAuditWorkflow();
    await auditWorkflow.audit({ sourcePath, middleDir, auditDir });
  }

  return {
    sourcePath,
    emitDir: middleDir,
    dryRun: Boolean(options.dryRun),
    usedAi: Boolean(options.enableAiNormalize && this.aiNormalizer),
    files,
  };
}
```

- [ ] **Step 3: Add required import for PlainTextAuditWorkflow**

Add to the imports at the top of `plaintext.ts`:

```typescript
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import yaml from 'js-yaml';
import { PlainTextAuditWorkflow } from './plaintextAudit';  // ADD THIS
```

- [ ] **Step 4: Verify lint**

Run: `bun run lint src/core/ingest/plaintext.ts`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/core/ingest/plaintext.ts
git commit -m "feat: handle YAML-only AI output and add middle/audits directories"
```

---

### Task 4: Integration Test with Test Data

**Files:**
- Run: `bun run src/index.ts --ingest-plaintext "obsidian/dnd数据转fvttjson/input/开发用数据.md" --emit-dir "obsidian/dnd数据转fvttjson/input"`

- [ ] **Step 1: Run ingestion on test data**

```bash
bun run src/index.ts --ingest-plaintext "obsidian/dnd数据转fvttjson/input/开发用数据.md" --emit-dir "obsidian/dnd数据转fvttjson/input"
```

**Note**: This will call the AI API for each creature. Ensure `OPENAI_API_KEY` or `TRANSLATION_API_KEY` is set in environment.

- [ ] **Step 2: Verify middle/ directory created**

Expected: `obsidian/dnd数据转fvttjson/middle/` contains 10 markdown files

- [ ] **Step 3: Verify audit report created**

Expected: `obsidian/dnd数据转fvttjson/audits/` contains `2026-03-28-kai-fa-yong-shu-ju-audit.md`

- [ ] **Step 4: Run ingestion on second test file**

```bash
bun run src/index.ts --ingest-plaintext "obsidian/dnd数据转fvttjson/input/开发用数据2.md" --emit-dir "obsidian/dnd数据转fvttjson/input"
```

- [ ] **Step 5: Verify total output**

Expected: 
- 13 files in `middle/`
- 2 audit reports in `audits/`

- [ ] **Step 6: Commit test results**

```bash
git add obsidian/dnd数据转fvttjson/middle/ obsidian/dnd数据转fvttjson/audits/
git commit -m "test: add normalized output and audit reports for test data"
```

---

## 5. Verification Checklist

After all tasks complete:

- [ ] All new files pass `bun run lint`
- [ ] `bun test` passes
- [ ] `middle/` contains 13 markdown files
- [ ] `audits/` contains 2 audit reports
- [ ] Each middle/ file has structured YAML frontmatter with `名称`, `类型`, `动作` etc.
- [ ] Actions in middle/ files follow Chinese template format (types are attack|save|utility, attack types are mwak|rwak|msak|rsak)
- [ ] Target types use FVTT standard (creature|object|creatureOrObject, NOT "space")
- [ ] Audit reports list issues with severity levels (🔴 error, 🟡 warning, ℹ️ info)

---

## 6. Dependencies

- `js-yaml` (already in use)
- `OpenAICompatibleTranslator` (already exists)
- `PlainTextAuditWorkflow` (new, internal)
- No new external dependencies required

---

## 7. Environment Variables Required

For AI normalization to work:
- `OPENAI_API_KEY` or `TRANSLATION_API_KEY`
- `OPENAI_BASE_URL` or `TRANSLATION_BASE_URL` (if using custom endpoint)
- `OPENAI_MODEL` or `TRANSLATION_MODEL` (defaults to `gpt-4o-mini`)
