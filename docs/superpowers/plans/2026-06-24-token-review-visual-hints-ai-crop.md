# Token Review Visual Hints AI Crop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reproducible token review workflow that detects risky generated VTT tokens, extracts source-site visual hints, produces review artifacts/contact sheets, and prepares an AI-assisted crop candidate path without letting AI silently overwrite final token crops.

**Architecture:** Build a separate token review layer under `src/core/assets/` and expose it through `src/tools/crawlSites.ts`. The first implementation is deterministic and dependency-light: it reads generated actor JSON, local/public token images, `records.json`, and `token-crops.json`; writes `token-review.json`, `token-review.md`, and contact sheets; and marks `needs_review` when visual quality cannot be trusted. AI crop suggestions are a later optional provider interface that produces candidates only, with human confirmation still written to `token-crops.json`.

**Tech Stack:** Bun/TypeScript, `sharp`, existing crawl artifacts under `obsidian/dnd数据转fvttjson/crawls`, existing actor output under `obsidian/dnd数据转fvttjson/output`, existing `token-crops.json`, optional future Vision/VLM provider.

---

## Completion Criteria

- A new CLI command can review current GoddessFantasy token outputs without regenerating actor JSON or uploading images.
- The review command detects shared-source multi-actor images, duplicate token images, extreme source aspect ratios, missing slug-specific crop overrides, and first-seen/unconfirmed tokens.
- The review command extracts `visualHints` from the original `records.json`, including image captions, pre-statblock lore, positional hints, and appearance hints.
- The review output includes `token-review.json`, `token-review.md`, and one or more contact sheets that a human can inspect.
- AI, if added, only produces crop candidates and rationale; it never directly modifies final `token-crops.json` or uploads a replacement token without human confirmation.
- Final validation distinguishes mechanical checks from semantic/visual checks, following root `AGENTS.md`.

## File Structure

- Create `src/core/assets/tokenReview.ts`
  - Pure review model and orchestration.
  - Reads actor/token metadata, groups shared source images, computes duplicate-token hashes, classifies review reasons, and writes bounded review data.
- Create `src/core/assets/visualHints.ts`
  - Extracts useful visual text from `records.json` for a topic/block.
  - Separates `positionHints`, `appearanceHints`, `captionHints`, and `weakHints`.
- Create `src/core/assets/tokenReviewContactSheet.ts`
  - Generates review contact sheets with `sharp`.
  - Keeps visual rendering isolated from review logic.
- Create `src/core/assets/tokenCropCandidates.ts`
  - Defines `TokenCropCandidateProvider`.
  - Implements deterministic candidates first.
  - Leaves an interface for future AI/Vision providers.
- Modify `src/tools/crawlSites.ts`
  - Add `token-review` command.
  - Wire CLI args to `runTokenReview()`.
- Modify `src/tools/goddessFantasyPipeline.ts`
  - Optional: after pipeline completes, print where token review can be run.
  - Do not make token review a hard success gate in V1 unless `--review-tokens` is explicitly passed.
- Create `src/core/assets/__tests__/visualHints.test.ts`
  - Fixture-backed extraction tests.
- Create `src/core/assets/__tests__/tokenReview.test.ts`
  - Risk classification tests.
- Create `src/core/assets/__tests__/tokenReviewContactSheet.test.ts`
  - Metadata and smoke tests for generated contact sheets.
- Modify `tests/cli-plaintext-actors.test.ts` or create `src/tools/__tests__/tokenReviewCli.test.ts`
  - CLI-level dry-run/review artifact tests.

## Non-Goals

- Do not build a full image editor in this pass.
- Do not require Grounding DINO, SAM, Florence-2, OpenAI Vision, or any other AI provider for the first working version.
- Do not automatically commit or push generated review artifacts.
- Do not treat AI confidence as final correctness.
- Do not modify final actor JSON by hand; final JSON must still come from project workflows.

---

### Task 1: Token Review Data Model

**Files:**
- Create: `src/core/assets/tokenReview.ts`
- Test: `src/core/assets/__tests__/tokenReview.test.ts`

- [ ] **Step 1: Write failing tests for review reasons**

Create tests that construct minimal actor/token inputs and expect these reasons:

```ts
expect(result.items[0].reasons).toContain('shared-source-without-slug-crop');
expect(result.items[1].reasons).toContain('duplicate-token-image');
expect(result.items[2].reasons).toContain('extreme-source-aspect-ratio');
expect(result.items[3].reasons).toContain('unconfirmed-token');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
bun test src/core/assets/__tests__/tokenReview.test.ts
```

Expected: FAIL because `tokenReview.ts` does not exist.

- [ ] **Step 3: Implement review model types**

Add types:

```ts
export type TokenReviewReason =
  | 'shared-source-without-slug-crop'
  | 'duplicate-token-image'
  | 'extreme-source-aspect-ratio'
  | 'unconfirmed-token'
  | 'missing-token'
  | 'token-unreadable'
  | 'weak-visual-hints';

export interface TokenReviewItem {
  slug: string;
  displayName: string;
  actorJsonPath: string;
  sourceImageUrl?: string;
  sourceHash?: string;
  tokenUrl?: string;
  localTokenPath?: string;
  cropKey?: string;
  cropStatus: 'slug-specific' | 'source-hash' | 'missing';
  reasons: TokenReviewReason[];
  status: 'ok' | 'needs_review' | 'failed';
}

export interface TokenReviewResult {
  generatedAt: string;
  items: TokenReviewItem[];
  summary: {
    total: number;
    ok: number;
    needsReview: number;
    failed: number;
  };
}
```

- [ ] **Step 4: Implement minimal risk classification**

Implement pure functions:

```ts
export function classifyTokenReviewItems(input: TokenReviewInput): TokenReviewResult
```

Rules:
- Same `sourceHash` used by more than one actor and no `slug__hash` crop key -> `shared-source-without-slug-crop`.
- Same token image hash used by more than one actor -> `duplicate-token-image`.
- Source image aspect ratio greater than `2.2` or less than `0.45` -> `extreme-source-aspect-ratio`.
- No confirmation record for the exact `slug__hash` or token URL -> `unconfirmed-token`.

- [ ] **Step 5: Run test to verify it passes**

Run:

```powershell
bun test src/core/assets/__tests__/tokenReview.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/core/assets/tokenReview.ts src/core/assets/__tests__/tokenReview.test.ts
git commit -m "feat: add token review risk model"
```

---

### Task 2: Visual Hint Extraction From Crawl Records

**Files:**
- Create: `src/core/assets/visualHints.ts`
- Test: `src/core/assets/__tests__/visualHints.test.ts`

- [ ] **Step 1: Write failing tests with real-shaped snippets**

Use fixture text modeled after current records:

```ts
const relentless = '(image)从左前方起顺时针依次为：无情梦魇、无情撕裂者、无情主宰译者 @x 无情杀手 Relentless Killers...';
const hints = extractVisualHints(relentless, {
  topicId: '170033',
  chineseName: '无情撕裂者',
  englishName: 'Relentless Slasher',
});
expect(hints.positionHints).toContain('从左前方起顺时针依次为：无情梦魇、无情撕裂者、无情主宰');
```

Add single-actor examples:

```ts
expect(madamHints.appearanceHints).toContain('看起来已年过七十');
expect(madamHints.appearanceHints).toContain('塔罗卡牌占卜');
expect(dullahanHints.appearanceHints).toContain('无头的不死战士');
expect(dullahanHints.appearanceHints).toContain('骑着亡灵或邪魔坐骑');
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
bun test src/core/assets/__tests__/visualHints.test.ts
```

Expected: FAIL because extractor is missing.

- [ ] **Step 3: Implement `extractVisualHints()`**

Implementation rules:
- Preserve original text enough to avoid losing Chinese punctuation.
- Strip translator credits from hint output unless they are needed for source trace.
- Capture image-adjacent caption-like text before the first statblock marker.
- Capture phrases containing position words:
  - `从左`
  - `从右`
  - `顺时针`
  - `逆时针`
  - `前方`
  - `后方`
  - `上方`
  - `下方`
  - `左侧`
  - `右侧`
- Capture appearance phrases containing terms like:
  - `无头`
  - `骑着`
  - `看起来`
  - `形态`
  - `外形`
  - `巨大`
  - `庞大`
  - `触手`
  - `昆虫`
  - `真菌`
  - `塔罗`
  - `卡牌`
- Put weak statblock-only descriptors such as type/alignment into `weakHints`.

- [ ] **Step 4: Run tests**

```powershell
bun test src/core/assets/__tests__/visualHints.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/core/assets/visualHints.ts src/core/assets/__tests__/visualHints.test.ts
git commit -m "feat: extract visual hints for token review"
```

---

### Task 3: Review Artifact Writer

**Files:**
- Modify: `src/core/assets/tokenReview.ts`
- Create: `src/core/assets/tokenReviewContactSheet.ts`
- Test: `src/core/assets/__tests__/tokenReviewContactSheet.test.ts`

- [ ] **Step 1: Write failing contact sheet smoke test**

Test that a small set of generated token buffers produces a readable PNG:

```ts
const out = await writeTokenReviewContactSheet({
  items,
  outPath,
  title: 'Token Review',
});
const meta = await sharp(out).metadata();
expect(meta.format).toBe('png');
expect(meta.width).toBeGreaterThan(0);
expect(meta.height).toBeGreaterThan(0);
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
bun test src/core/assets/__tests__/tokenReviewContactSheet.test.ts
```

Expected: FAIL because contact sheet writer does not exist.

- [ ] **Step 3: Implement contact sheet generation**

Requirements:
- Use `sharp`.
- Render up to 12 items per sheet.
- Include label, status, and short reason list.
- Use stable dimensions so labels do not resize the image.
- Write outputs under:

```text
obsidian/dnd数据转fvttjson/output/assets/goddessfantasy/token-review/
```

- [ ] **Step 4: Implement JSON/Markdown writers**

Add:

```ts
export async function writeTokenReviewArtifacts(result, options): Promise<TokenReviewArtifactPaths>
```

Outputs:
- `token-review.json`
- `token-review.md`
- `contact-sheet-001.png`
- Optional `needs-review-sheet-001.png`

Markdown should list:
- Summary counts.
- Each `needs_review` item.
- Source image URL.
- Token URL.
- Reasons.
- Visual hints.
- Suggested next action.

- [ ] **Step 5: Run tests**

```powershell
bun test src/core/assets/__tests__/tokenReview.test.ts src/core/assets/__tests__/tokenReviewContactSheet.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/core/assets/tokenReview.ts src/core/assets/tokenReviewContactSheet.ts src/core/assets/__tests__/tokenReview*.test.ts
git commit -m "feat: write token review artifacts"
```

---

### Task 4: Token Review CLI

**Files:**
- Modify: `src/tools/crawlSites.ts`
- Create: `src/tools/__tests__/tokenReviewCli.test.ts`

- [ ] **Step 1: Write failing CLI test**

Add a CLI test that runs:

```powershell
bun run src/tools/crawlSites.ts token-review --vault "<tmp-vault>" --crawl-dir "<tmp-crawl-dir>" --dry-run
```

Expected output includes:

```text
Token review
Total:
Needs review:
Artifacts:
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
bun test src/tools/__tests__/tokenReviewCli.test.ts
```

Expected: FAIL because command is missing.

- [ ] **Step 3: Add command to `crawlSites.ts`**

Command:

```powershell
bun run src/tools/crawlSites.ts token-review `
  --vault "obsidian/dnd数据转fvttjson" `
  --crawl-dir "obsidian/dnd数据转fvttjson/crawls/goddessfantasy/board-2318" `
  --token-crops "obsidian/dnd数据转fvttjson/crawls/goddessfantasy/board-2318/plaintext/token-crops.json"
```

Options:
- `--vault <path>`
- `--crawl-dir <path>`
- `--token-crops <path>`
- `--out-dir <path>`
- `--dry-run`
- `--fail-on-needs-review`

Defaults:
- `vault`: `obsidian/dnd数据转fvttjson`
- `crawl-dir`: `obsidian/dnd数据转fvttjson/crawls/goddessfantasy/board-2318`
- `token-crops`: `<crawl-dir>/plaintext/token-crops.json`
- `out-dir`: `<vault>/output/assets/goddessfantasy/token-review`

- [ ] **Step 4: Run CLI test**

```powershell
bun test src/tools/__tests__/tokenReviewCli.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/tools/crawlSites.ts src/tools/__tests__/tokenReviewCli.test.ts
git commit -m "feat: expose token review CLI"
```

---

### Task 5: Integrate Review Hints With Pipeline Output

**Files:**
- Modify: `src/tools/goddessFantasyPipeline.ts`
- Modify: `src/tools/crawlSites.ts`
- Test: `src/tools/__tests__/goddessFantasyPipeline.test.ts`

- [ ] **Step 1: Write failing test for optional review summary**

Test behavior:
- Default pipeline does not run review.
- `--review-tokens` runs review after image processing.
- `--fail-on-token-review` exits non-zero if review has `needs_review`.

- [ ] **Step 2: Run test to verify it fails**

```powershell
bun test src/tools/__tests__/goddessFantasyPipeline.test.ts
```

Expected: FAIL because flags do not exist.

- [ ] **Step 3: Add optional flags**

Add to `goddessfantasy-pipeline`:
- `--review-tokens`
- `--fail-on-token-review`
- `--token-review-out-dir <path>`

Default behavior:
- Print a one-line suggestion when image mode is enabled:

```text
Token review: run `crawl-sites token-review ...` to inspect generated token art.
```

When `--review-tokens` is passed:
- Run token review after actor/image workflow.
- Write artifacts.
- Print summary.

- [ ] **Step 4: Run targeted test**

```powershell
bun test src/tools/__tests__/goddessFantasyPipeline.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/tools/goddessFantasyPipeline.ts src/tools/crawlSites.ts src/tools/__tests__/goddessFantasyPipeline.test.ts
git commit -m "feat: optionally review tokens after pipeline"
```

---

### Task 6: Manual Confirmation Manifest

**Files:**
- Modify: `src/core/assets/tokenReview.ts`
- Test: `src/core/assets/__tests__/tokenReview.test.ts`

- [ ] **Step 1: Write failing test for confirmation**

Confirmation file shape:

```json
{
  "confirmed": {
    "relentless-slasher__cbd5322a": {
      "confirmedAt": "2026-06-24T00:00:00.000Z",
      "reviewer": "human",
      "note": "face centered"
    }
  }
}
```

Expect:
- Confirmed exact crop key does not get `unconfirmed-token`.
- Shared source without slug-specific crop still gets `shared-source-without-slug-crop`.

- [ ] **Step 2: Run test to verify it fails**

```powershell
bun test src/core/assets/__tests__/tokenReview.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement confirmation loader**

Default path:

```text
<crawl-dir>/plaintext/token-review-confirmed.json
```

Keep it optional. Missing file is not an error.

- [ ] **Step 4: Run test**

```powershell
bun test src/core/assets/__tests__/tokenReview.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/core/assets/tokenReview.ts src/core/assets/__tests__/tokenReview.test.ts
git commit -m "feat: track manually confirmed token crops"
```

---

### Task 7: Future AI Candidate Provider Interface

**Files:**
- Create: `src/core/assets/tokenCropCandidates.ts`
- Test: `src/core/assets/__tests__/tokenCropCandidates.test.ts`

- [ ] **Step 1: Write tests for candidate provider contract**

Test that a provider returns bounded normalized crops:

```ts
expect(candidate.crop.left).toBeGreaterThanOrEqual(0);
expect(candidate.crop.left + candidate.crop.width).toBeLessThanOrEqual(1);
expect(candidate.requiresHumanApproval).toBe(true);
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
bun test src/core/assets/__tests__/tokenCropCandidates.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement provider types and deterministic baseline**

Add:

```ts
export interface TokenCropCandidate {
  crop: ImageTokenCrop;
  label: string;
  rationale: string;
  provider: 'deterministic' | 'vision-ai';
  confidence?: number;
  requiresHumanApproval: true;
}

export interface TokenCropCandidateProvider {
  suggest(input: TokenCropCandidateInput): Promise<TokenCropCandidate[]>;
}
```

Baseline provider:
- For shared-source with position hints, generate left/center/right or top/bottom candidates.
- For extreme portrait, generate face/upper-body/contain candidates.
- Never write `token-crops.json`.

- [ ] **Step 4: Run tests**

```powershell
bun test src/core/assets/__tests__/tokenCropCandidates.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/core/assets/tokenCropCandidates.ts src/core/assets/__tests__/tokenCropCandidates.test.ts
git commit -m "feat: add token crop candidate provider interface"
```

---

### Task 8: Real Data Validation

**Files:**
- No source code unless validation finds a bug.
- Generated review artifacts under:
  - `obsidian/dnd数据转fvttjson/output/assets/goddessfantasy/token-review/`

- [ ] **Step 1: Run full pipeline with images**

Run:

```powershell
bun run src/tools/crawlSites.ts goddessfantasy-pipeline `
  --cookie-header-file ".local/goddessfantasy.cookie" `
  --mode incremental `
  --request-delay-ms 800 `
  --effect-profile modded-v12 `
  --fvtt-version 12 `
  --image-mode ssh `
  --image-ssh-target "Administrator@49.232.12.153" `
  --image-remote-root "E:/Bill/imgSource" `
  --image-public-base-url "http://49.232.12.153/imgSource" `
  --image-allow-http `
  --image-token-frame "references/fifthed_border_medium.png" `
  --review-tokens
```

Expected:
- Pipeline completes.
- `Pipeline warnings: 0` unless new source/image issues are real.
- Token review artifacts are written.

- [ ] **Step 2: Inspect contact sheet manually**

Must inspect at least:
- `Relentless Slasher`
- `Relentless Nightmare`
- `Relentless Juggernaut`
- `Lesser Star Spawn Emissary`
- `Greater Star Spawn Emissary`
- `Madam Eva`
- `Dullahan`
- `Shoggoth`

Expected:
- Shared-source tokens are not identical when `slug__hash` overrides exist.
- Known fixed crops remain visually acceptable.
- Any poor token is reported as `needs_review`, not silently called complete.

- [ ] **Step 3: Verify public token URLs**

For every `needs_review` and every newly generated token:
- HTTP status is `200`.
- Content-Type is image.
- Metadata is `1024x1024 webp`.

- [ ] **Step 4: Run mechanical tests**

```powershell
bun test src/core/assets/__tests__/visualHints.test.ts `
  src/core/assets/__tests__/tokenReview.test.ts `
  src/core/assets/__tests__/tokenReviewContactSheet.test.ts `
  src/core/assets/__tests__/tokenCropCandidates.test.ts `
  src/tools/__tests__/tokenReviewCli.test.ts `
  src/tools/__tests__/goddessFantasyPipeline.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run project-level tests**

```powershell
bun run audit:anti-overfit
bun test
```

Expected:
- Anti-overfit audit passes.
- Full test suite passes.

- [ ] **Step 6: Check Git boundaries**

Run:

```powershell
git status --short
```

Verify:
- `.local/goddessfantasy.cookie` is not staged.
- Contact sheet artifacts are not staged unless explicitly intended.
- `.fvtt-sync-manifest.json` is not mixed into a tool-code commit.
- Generated crawl data is committed separately from tool code, if committed at all.

---

## Push Readiness Rules

Do not push until:

- Tool code and generated data are split into separate commits.
- `token-crops.json` changes are reviewed as human-curated data, not hidden in a broad generated artifact commit.
- All new token review outputs are either ignored or intentionally committed with a reason.
- No cookie, SSH credential, temporary cache, or local-only file is staged.
- Final response explicitly separates:
  - mechanical verification,
  - visual/semantic token review,
  - remaining risk.

## Recommended Commit Sequence

1. `feat: add token review risk model`
2. `feat: extract visual hints for token review`
3. `feat: write token review artifacts`
4. `feat: expose token review CLI`
5. `feat: optionally review tokens after pipeline`
6. `feat: track manually confirmed token crops`
7. `feat: add token crop candidate provider interface`
8. Optional data commit: `data: update GoddessFantasy token crop overrides`

## Future AI Provider Notes

The first AI provider should be optional and disabled by default. It may call a Vision/VLM service or a local model, but it must obey:

- Input includes source image, current token, `visualHints`, actor slug, and actor display name.
- Output is candidate crops plus rationale.
- Output must be normalized crop coordinates.
- Every candidate is `requiresHumanApproval: true`.
- Provider failures become review warnings, not pipeline failures.
- No AI provider writes `token-crops.json` directly.

Possible future integrations:
- Vision/VLM for natural-language crop suggestions.
- Grounding DINO or Florence-2 for text-conditioned bounding boxes.
- SAM/SAM2 for object mask refinement after a box is selected.
- Label Studio/CVAT only if this grows into a larger annotation workflow.

