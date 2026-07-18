# FVTT Target-World Spell Resolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Do not use subagents unless the user later gives separate authorization. Keep the checkboxes in this document current while executing.

**Goal:** Make project-generated Foundry v14 monster Actors resolve their source-evidenced spell lists to real 2024-first Spell documents in the destination world, without portable UUID assumptions, placeholder spells, or damage to unrelated Foundry content.

**Architecture:** AI Intake extracts a portable, versioned spell manifest. The existing Markdown parser and Actor generator carry that manifest into normal Actor JSON. A version-locked companion module running in Foundry 14.364/dnd5e 5.3.3 discovers every enabled readable Item compendium, deterministically resolves the whole manifest, and atomically creates native Cast Activities plus dnd5e cached Spell items. Pure matching/planning code remains independent of Foundry; a narrow adapter owns runtime APIs, rollback, review UI, and diagnostics.

**Tech Stack:** Bun 1.3.x, TypeScript 5.9.x, existing AI Intake/parser/generator, Foundry VTT 14.364, dnd5e 5.3.3, native dnd5e Cast Activity schema, React 19 for the existing Web workbench, project-local Foundry Lab.

## Global Constraints

- Final Actor JSON is always generated through the project parser/generator workflow. AI and the Foundry module never hand-author or patch a final JSON deliverable.
- The manifest contains source references and restrictions, not copied premium spell rules. Destination compendiums remain the authority for spell documents.
- First-release runtime support is exactly Foundry `14.364` plus dnd5e `5.3.3`. Unsupported versions fail closed before any Actor mutation.
- Every enabled, readable dnd5e Item compendium participates automatically. Package name, publisher, and `flags.dnd5e.types` are not trust gates.
- A document is a 2024 Spell only when `type === "spell"` and `system.source.rules === "2024"`. A 2014 candidate is considered only when no matching 2024 identifier, normalized English name, or explicit alias exists.
- Resolution and hydration are Actor-level all-or-nothing operations. No partial success may be reported or retained.
- The module only mutates its own flagged Cast Activities and cached Spells inside an explicitly linked project-generated spellcasting feature. It never scans or migrates the world, mutates compendiums, patches prototypes, or deletes by display name.
- Hydrated native Spells must remain usable when the resolver is disabled or removed.
- Preserve all user-owned dirty files. Before each commit, inspect `git status --short`, stage only paths named by the current task, and inspect `git diff --cached`.
- Parser/generator changes require fixture-backed positive, close-negative, and unrelated regression cases, `assertEqualStructure()` or stricter checks, and `bun run audit:anti-overfit:all`.
- Default automated tests use no network and no production Foundry instance. Runtime work uses only `.local/foundry-v14/data/server-mirror`.
- A passing test, successful build, Actor import, or ten created Items is mechanical evidence only. Closure also requires source-to-IR-to-Markdown-to-Actor semantic review and actual native spell use in local Foundry.

---

### Task 1: Record the false-green spell baseline and non-interference rules

**Files:**

- Modify: `.ruler/AGENTS.md`
- Modify: `AGENTS.md`
- Create: `src/foundry/monster-spell-resolver/AGENTS.md`
- Modify: `docs/remediation/2026-07-15-project-hardening/EXECPLAN.md`
- Modify: `docs/acceptance/current-support-matrix.md`
- Create: `src/core/intake/__tests__/fixtures/rat-warlock.raw.txt`
- Create: `src/core/intake/__tests__/rat-warlock-spell-baseline.test.ts`

- [ ] **Step 1: Preserve the current dirty-file baseline**

Run:

```powershell
git status --short
git diff -- .ruler/AGENTS.md AGENTS.md
```

Save the output in the Task 1 execution note inside the ExecPlan before editing. The existing modifications remain user-owned; do not normalize or replace either file.

- [ ] **Step 2: Add the Rat Warlock source verbatim and write the RED acceptance test**

The fixture must contain the exact user-provided text, including the introductory quotation, lore paragraphs, duplicate title, all ten spells, DC 12, attack +4, material-component waiver, Mage Armor self-only restriction, Giant Rat restriction, and Eldritch Blast two-ray instruction.

Write a test that drives the existing fake-provider intake path and asserts the current output does **not** satisfy functional spell acceptance:

```ts
test("Rat Warlock emits a portable ten-spell manifest without resolved items", async () => {
  const result = await runRatWarlockFixture();
  const actor = result.candidateActor;
  const manifest = actor.flags?.[RESOLVER_MODULE_ID]?.spellManifest;

  expect(result.monsters).toHaveLength(1);
  expect(manifest).toBeDefined();
  expect(manifest.spellcastingGroups.flatMap(group => group.spellRefs)).toHaveLength(10);
  expect(actor.items.filter(item => item.type === "spell")).toHaveLength(0);
  expect(result.spellResolution?.status).toBe("pending");
});
```

Do not weaken the test to accept description-only spellcasting.

- [ ] **Step 3: Run the RED test and record the real failure**

Run:

```powershell
bun test src/core/intake/__tests__/rat-warlock-spell-baseline.test.ts
```

Expected: failure proving that the current pipeline has no portable manifest or functional resolved spells. Record the exact failure in `EXECPLAN.md` as `SPELL-001`; do not rewrite the earlier AI Intake success history.

- [ ] **Step 4: Append the safety contract to project instructions**

Append the same focused hard gate to `.ruler/AGENTS.md` and root `AGENTS.md` while preserving surrounding dirty changes:

```markdown
## Target-World Spell Resolver Hard Gate

- Only Actors carrying a valid resolver manifest are eligible.
- Only module-owned embedded Spells and module-owned Cast Activities in an explicitly linked generated feature may be changed.
- Never mutate compendiums, patch Foundry/dnd5e prototypes, delete by name, or run an automatic world-wide migration.
- Hydration is Actor-level all-or-nothing with compensating rollback.
- Manual edits require Keep, Overwrite, or Cancel; closing the review is Cancel.
- Runtime acceptance uses the project-local Foundry mirror first. Production requires separate authorization.
```

The directory-level `AGENTS.md` must additionally require exact Foundry/dnd5e reference inspection before runtime schema changes.

- [ ] **Step 5: Correct the support claim append-only**

In the support matrix, preserve the prior Rat intake acceptance but add a dated qualification: non-spell statblock intake passed; functional spell resolution is open under `SPELL-001` until the local Foundry runtime gate passes.

- [ ] **Step 6: Verify and commit only Task 1 paths**

Run:

```powershell
git diff --check
git diff -- .ruler/AGENTS.md AGENTS.md docs/remediation/2026-07-15-project-hardening/EXECPLAN.md docs/acceptance/current-support-matrix.md src/foundry/monster-spell-resolver/AGENTS.md src/core/intake/__tests__/fixtures/rat-warlock.raw.txt src/core/intake/__tests__/rat-warlock-spell-baseline.test.ts
```

Stage new files normally. For the two already-dirty instruction files, use `git add -p` and select only the newly added resolver-safety hunks; leave every pre-existing user hunk unstaged. Inspect the cached diff, then commit:

```powershell
git add -p -- .ruler/AGENTS.md AGENTS.md
git add docs/remediation/2026-07-15-project-hardening/EXECPLAN.md docs/acceptance/current-support-matrix.md src/foundry/monster-spell-resolver/AGENTS.md src/core/intake/__tests__/fixtures/rat-warlock.raw.txt src/core/intake/__tests__/rat-warlock-spell-baseline.test.ts
git diff --cached
git commit -m "test: record portable spell resolution gap"
```

---

### Task 2: Define the portable manifest, findings, and stable hashes

**Files:**

- Create: `src/core/spell-resolution/types.ts`
- Create: `src/core/spell-resolution/validator.ts`
- Create: `src/core/spell-resolution/hash.ts`
- Create: `src/core/spell-resolution/index.ts`
- Create: `src/core/spell-resolution/__tests__/contracts.test.ts`

- [ ] **Step 1: Write contract RED tests**

Cover a valid Rat manifest plus unknown schema, duplicate `manifestId`/`groupId`/`refId`, invalid ability, invalid recovery, non-positive uses, shared-use contradictions, missing identifier and names, evidence quote mismatch, invalid expected level/school, and duplicate logical spells.

The public boundary must start with these exact stable shapes:

```ts
export const RESOLVER_MODULE_ID = "fvtt-json-generator-spell-resolver" as const;

export interface PortableSpellManifest {
  schemaVersion: 1;
  manifestId: string;
  sourceSha256: string;
  rulesPreference: "2024";
  spellcastingGroups: PortableSpellcastingGroup[];
}

export interface PortableSpellcastingGroup {
  groupId: string;
  featureItemKey: string;
  ability?: "str" | "dex" | "con" | "int" | "wis" | "cha";
  saveDc?: number;
  attackBonus?: number;
  spellRefs: PortableSpellRef[];
}

export interface PortableSpellRef {
  refId: string;
  identifier: string;
  originalName: string;
  englishName?: string;
  chineseName?: string;
  aliases: string[];
  expectedLevel?: number;
  expectedSchool?: string;
  sourceBookHint?: string;
  method: "innate" | "prepared" | "pact" | "at-will";
  uses?: {
    value: number;
    recovery: "day" | "shortRest" | "longRest";
    shared: boolean;
  };
  castingLevel?: number;
  ignoresMaterialComponents?: boolean;
  restrictions: PreservedSpellRestriction[];
  evidence: EvidenceRef[];
}
```

Use the existing intake `EvidenceRef` type rather than defining a structurally divergent duplicate.

- [ ] **Step 2: Run RED tests**

Run:

```powershell
bun test src/core/spell-resolution/__tests__/contracts.test.ts
```

Expected: module-not-found/type failures.

- [ ] **Step 3: Implement strict runtime validation and serialization**

`validatePortableSpellManifest(manifest, source)` returns a discriminated union:

```ts
type ManifestValidationResult =
  | { ok: true; value: PortableSpellManifest }
  | { ok: false; findings: SpellResolutionFinding[] };
```

Every finding has stable `code`, `path`, Chinese `message`, `blocking`, evidence, and optional candidates. Validation must never silently coerce an unknown version or unsupported enum.

- [ ] **Step 4: Implement two distinct hashes**

Implement canonical key ordering and explicit projections:

- `hashManifest()` covers all semantic manifest data.
- `hashManagedProjection()` covers only resolver-managed generated fields and excludes volatile Foundry fields such as uses spent, sort, timestamps, ownership, folder, and chat/runtime state.

Write a regression proving that casting a 1/day spell changes `spent` without being misclassified as a manual edit, while changing attack/save/target/description does change the managed projection hash.

- [ ] **Step 5: Run tests and typecheck**

Run:

```powershell
bun test src/core/spell-resolution/__tests__/contracts.test.ts
bun run typecheck:production
```

Expected: all pass.

- [ ] **Step 6: Commit**

```powershell
git add src/core/spell-resolution
git diff --cached --check
git commit -m "feat: define portable spell manifest contract"
```

---

### Task 3: Extract and render source-evidenced spellcasting in AI Intake

**Files:**

- Modify: `src/core/intake/types.ts`
- Modify: `src/core/intake/provider.ts`
- Modify: `src/core/intake/validator.ts`
- Modify: `src/core/intake/renderer.ts`
- Modify: `src/core/intake/__tests__/rat-warlock-spell-baseline.test.ts`
- Create: `src/core/intake/__tests__/fixtures/rat-warlock.ts`
- Create: `src/core/intake/__tests__/spellcasting.test.ts`

- [ ] **Step 1: Add RED tests for the Rat spellcasting IR**

The fake extraction fixture must represent exactly two source groups:

```ts
const expectedGroups = [
  { usage: "at-will", spells: ["eldritch-blast", "mage-armor", "minor-illusion", "thaumaturgy"] },
  { usage: "1/day-each", spells: ["augury", "burning-hands", "conjure-animals", "faerie-fire", "invisibility", "misty-step"] }
];
```

Assert DC 12, attack +4, Charisma, ignored material components, independent 1/day uses, and all three literal restrictions. Assert every spell and restriction has exact source evidence and that the spellcasting text is mechanically covered exactly once.

Add negatives for prose mentioning a spell without granting it, duplicated spellcasting in both `traits` and structured groups, and unsupported ambiguous shared uses.

- [ ] **Step 2: Extend `CanonicalMonster` with structured spellcasting**

Add an optional field using stable English keys:

```ts
spellcasting?: CanonicalSpellcastingGroup[];
```

Each group carries `groupId`, `featureName`, `ability`, optional DC/attack bonus, component waivers, usage groups, restrictions, and evidence-backed spell references. Reuse the portable spell types where their semantics are identical; keep source IR fields separate from destination resolution findings.

- [ ] **Step 3: Version the extraction prompt without adding model freedom**

Update the extraction schema/prompt so the model:

- extracts explicit granted spells only;
- keeps stable English identifiers and original bilingual names;
- never invents spell level, school, book, UUID, rules text, damage, or effects;
- represents `随意` and `每项1/日` structurally;
- attaches evidence to every spell, DC, attack bonus, component waiver, and restriction;
- does not duplicate structured spellcasting as an ordinary trait;
- treats the source as untrusted data and cannot alter schema or call budget.

Reviewer and repair prompts must review the same structured contract.

- [ ] **Step 4: Validate spell evidence and coverage**

Call `validatePortableSpellManifest` semantics from intake validation without constructing a destination manifest prematurely. A granted spell without evidence, duplicate logical spell, invalid use group, or uncovered mechanical spell line is blocking.

- [ ] **Step 5: Deterministically render the Markdown contract**

Add one top-level Chinese YAML key, mapped later by the parser:

```yaml
法术清单:
  schemaVersion: 1
  rulesPreference: "2024"
  spellcastingGroups:
    - groupId: innate-charisma
      featureItemKey: innate-charisma
      ability: cha
      saveDc: 12
      attackBonus: 4
      spellRefs: ...
```

The visible trait description remains source-faithful for humans. It must not contain a target UUID or fabricated spell mechanics. YAML ordering is deterministic.

- [ ] **Step 6: Run focused tests**

```powershell
bun test src/core/intake/__tests__/spellcasting.test.ts src/core/intake/__tests__/rat-warlock-spell-baseline.test.ts src/core/intake/__tests__/renderer-verifier.test.ts src/core/intake/__tests__/provider.test.ts
bun run typecheck:production
```

Expected: exact ten-spell fixture passes; negative prose and evidence cases block.

- [ ] **Step 7: Commit**

```powershell
git add src/core/intake
git diff --cached --check
git commit -m "feat: extract evidenced monster spell manifests"
```

---

### Task 4: Carry the portable manifest through Markdown parsing and Actor generation

**Files:**

- Modify: `src/config/mapping.ts`
- Modify: `src/core/parser/yaml.ts`
- Modify: `src/core/parser/__tests__/yaml.test.ts`
- Create: `src/core/parser/__tests__/fixtures/yaml-spell-manifest.md`
- Create: `src/core/generator/actor-spell-manifest.ts`
- Modify: `src/core/generator/actor.ts`
- Modify: `src/core/generator/__tests__/actor.test.ts`
- Create: `src/core/generator/__tests__/actor-spell-manifest.test.ts`
- Modify: `src/core/utils/assertEqualStructure.ts` only if a stricter path-aware assertion is required

- [ ] **Step 1: Write parser/generator RED tests**

Required cases:

1. Rat manifest produces an Actor flag and a group-linked source spellcasting feature.
2. The Actor contains zero placeholder Spell items and zero target-world UUIDs before hydration.
3. A same-shaped non-spell trait is unchanged.
4. A v12 Actor without a manifest is unchanged.
5. A v12 request with a portable spell manifest fails with a precise unsupported-target finding; it must not silently invoke the legacy mapper.
6. Existing legacy fixtures without `法术清单` retain their structure.

- [ ] **Step 2: Add explicit parser mapping**

Add `法术清单 -> spellManifest` to the mapping and a typed `ParsedNPC.spellManifest?: PortableSpellManifest`. Do not rely on unknown-object recursion for the public contract. In `applyField`, validate the whole manifest and preserve the returned typed value.

- [ ] **Step 3: Generate the portable v14 Actor boundary**

`buildActorSpellManifest()` must:

- reject non-v14 targets;
- place the manifest at `flags[RESOLVER_MODULE_ID].spellManifest`;
- set status `pending` and the manifest hash;
- identify each generated spellcasting feature by stable `featureItemKey`/`groupId` flags;
- create no embedded Spell and no Cast Activity yet;
- avoid the current `spellsMapper`, hard-coded Invisibility UUID, and level-0 placeholder path.

Use a source-derived stable feature key, not the translated feature display name.

- [ ] **Step 4: Enforce structure and anti-overfit coverage**

Use `assertEqualStructure()` against a v14 manifest fixture. Document rule classification:

- manifest flag shape: schema-derived;
- spell fields and restrictions: source-derived;
- stable feature linkage: schema-derived;
- v12 fail-closed behavior: explicit version boundary.

Generalization set: Rat Warlock, a second two-group caster, close negative lore-only spell mention, and unrelated Lurker.

- [ ] **Step 5: Run focused gates**

```powershell
bun test src/core/parser/__tests__/yaml.test.ts src/core/generator/__tests__/actor-spell-manifest.test.ts src/core/generator/__tests__/actor.test.ts
bun run audit:anti-overfit:all
bun run typecheck:production
```

Expected: pass with no unexplained anti-overfit finding.

- [ ] **Step 6: Commit**

```powershell
git add src/config/mapping.ts src/core/parser src/core/generator src/core/utils/assertEqualStructure.ts
git diff --cached --check
git commit -m "feat: generate portable spell resolver actors"
```

---

### Task 5: Implement deterministic destination matching and all-or-nothing planning

**Files:**

- Create: `src/core/spell-resolution/normalize.ts`
- Create: `src/core/spell-resolution/resolver.ts`
- Create: `src/core/spell-resolution/planner.ts`
- Modify: `src/core/spell-resolution/types.ts`
- Modify: `src/core/spell-resolution/index.ts`
- Create: `src/core/spell-resolution/__tests__/resolver.test.ts`
- Create: `src/core/spell-resolution/__tests__/planner.test.ts`

- [ ] **Step 1: Write the candidate-priority RED matrix**

Use metadata-only candidates. Cover:

- exact 2024 identifier;
- exact normalized English name;
- explicit alias;
- Chinese original name only as evidence/display, not fuzzy auto-match;
- saved concrete mapping that is still valid;
- invalidated saved mapping;
- explicit source-book hint;
- PHB over `dnd5e.spells24`;
- expansion-only Heroes of Faerun spell;
- multiple remaining equivalent sources -> review;
- 2024 contradiction -> review, never bypass to 2014;
- 2014 unique fallback only when no 2024 identifier/name/alias shares the logical spell;
- missing `system.source.rules` -> review;
- near-name fuzzy result as suggestion only;
- close negative names that must not auto-resolve.

- [ ] **Step 2: Define the Foundry-independent source index contract**

```ts
export interface SpellCandidateMetadata {
  id: string;
  uuid: string;
  packageId: string;
  packId: string;
  name: string;
  identifier?: string;
  rules?: string;
  sourceBook?: string;
  level?: number;
  school?: string;
}
```

Normalization may fold Unicode width, whitespace, punctuation, and ASCII case. It may not translate, stem, or infer a spell from approximate semantic similarity.

- [ ] **Step 3: Implement deterministic resolution**

Return one of `resolved`, `needs_review`, or `missing` per ref with an ordered trace explaining every filter and tie-break. Persisted mappings include logical ref key, selected UUID, rules, source inventory hash, and selection origin.

Use this exact order:

1. reuse a saved concrete mapping only if its UUID still exists and still satisfies the ref/rules constraints;
2. build the set of 2024 candidates sharing the exact identifier, normalized English name, or explicit alias;
3. reject contradictory level/school/source facts rather than silently down-ranking them;
4. within valid 2024 matches, prefer explicit source-book hint, then `dnd-players-handbook`, then `dnd5e.spells24`, then require review for indistinguishable remaining sources;
5. if any same-key 2024 candidate exists but is contradictory, return review;
6. only if no same-key 2024 candidate exists, repeat exact matching against 2014 candidates and mark a unique selection as fallback;
7. return approximate matches as review suggestions only.

- [ ] **Step 4: Implement full-Actor preflight planning**

`planSpellHydration()` accepts a valid manifest, candidate index, saved mappings, current managed projection, and manual decisions. It returns:

```ts
type HydrationPreflight =
  | { status: "ready"; plan: SpellHydrationPlan; report: SpellResolutionReport }
  | { status: "needs_review"; findings: SpellResolutionFinding[]; report: SpellResolutionReport }
  | { status: "incompatible"; findings: SpellResolutionFinding[]; report: SpellResolutionReport };
```

If any spell is missing, ambiguous, contradictory, or has an undecided manual conflict, there is no writable plan.

- [ ] **Step 5: Test idempotency inputs and source priority changes**

The same manifest + source inventory + selected UUIDs + configuration + decisions must produce the same plan hash. A priority change marks only affected selections stale; it does not produce an automatic Actor write.

- [ ] **Step 6: Run tests and commit**

```powershell
bun test src/core/spell-resolution/__tests__/resolver.test.ts src/core/spell-resolution/__tests__/planner.test.ts
bun run typecheck:production
git add src/core/spell-resolution
git diff --cached --check
git commit -m "feat: plan deterministic destination spell resolution"
```

---

### Task 6: Package the version-locked Foundry companion module and source index

**Files:**

- Create: `src/foundry/monster-spell-resolver/module.json`
- Create: `src/foundry/monster-spell-resolver/index.ts`
- Create: `src/foundry/monster-spell-resolver/foundry-globals.d.ts`
- Create: `src/foundry/monster-spell-resolver/foundry-adapter.ts`
- Create: `src/foundry/monster-spell-resolver/source-index.ts`
- Create: `src/foundry/monster-spell-resolver/settings.ts`
- Create: `src/foundry/monster-spell-resolver/lang/zh-CN.json`
- Create: `src/foundry/monster-spell-resolver/lang/en.json`
- Create: `src/foundry/monster-spell-resolver/styles/resolver.css`
- Create: `src/foundry/monster-spell-resolver/__tests__/module-manifest.test.ts`
- Create: `src/foundry/monster-spell-resolver/__tests__/source-index.test.ts`
- Create: `scripts/buildSpellResolver.ts`
- Modify: `package.json`

- [ ] **Step 1: Write RED package and discovery tests**

Assert module ID, ES module entry, localization, exact minimum/maximum verified versions, no socket or macro dependency, and no broad system compatibility claim.

For discovery, fake the Foundry adapter and include:

- a pack whose manifest says `types: ["spell"]`;
- Heroes of Faerun-style `options` pack without a type hint;
- an explicitly empty hint containing real Spells;
- a misleading hint containing no Spells;
- mixed Spell/non-Spell documents;
- unreadable and disabled packs;
- MIDI-style 2024/2014 mixed documents.

All enabled readable Item packs are indexed; only actual `type === "spell"` documents become candidates.

- [ ] **Step 2: Add a narrow Foundry adapter**

Keep runtime globals behind interfaces such as:

```ts
interface FoundrySpellSourceAdapter {
  getRuntimeVersions(): { foundry: string; dnd5e: string };
  listEnabledReadableItemPacks(): Promise<FoundryItemPackRef[]>;
  getItemIndex(pack: FoundryItemPackRef, fields: string[]): Promise<unknown[]>;
  getItemDocument(uuid: string): Promise<unknown | null>;
}
```

The pure core never imports `game`, `Hooks`, `Actor`, `Item`, or `foundry` globals.

- [ ] **Step 3: Build the source inventory from real index fields**

Request only `_id`, `name`, `type`, `system.identifier`, `system.source.rules`, `system.source.book`, `system.level`, and `system.school`. Fetch a full document only after selection. Compute an inventory hash from enabled package versions plus indexed candidate metadata.

- [ ] **Step 4: Add exact version gating and settings**

At `init`, register settings for source priority, saved concrete mappings, debug logging, and index metadata. At `ready`, if versions differ from Foundry 14.364/dnd5e 5.3.3, register status/diagnostics only and prohibit mutation.

- [ ] **Step 5: Add a deterministic build**

`scripts/buildSpellResolver.ts` uses `Bun.build` to bundle the module into ignored `dist/fvtt-json-generator-spell-resolver/`, copies module metadata/locales/styles/templates, validates that referenced files exist, and creates an installable ZIP without embedding source maps containing local absolute paths.

Add scripts:

```json
"build:spell-resolver": "bun run scripts/buildSpellResolver.ts",
"test:spell-resolver": "bun test src/core/spell-resolution src/foundry/monster-spell-resolver"
```

- [ ] **Step 6: Verify and commit**

```powershell
bun test src/foundry/monster-spell-resolver/__tests__/module-manifest.test.ts src/foundry/monster-spell-resolver/__tests__/source-index.test.ts
bun run build:spell-resolver
bun run typecheck:all
git add package.json scripts/buildSpellResolver.ts src/foundry/monster-spell-resolver
git diff --cached --check
git commit -m "feat: package target-world spell resolver module"
```

Expected: package validates and build artifacts remain ignored.

---

### Task 7: Generate native dnd5e Cast Activities and eager cached Spells

**Files:**

- Create: `src/foundry/monster-spell-resolver/cast-activity.ts`
- Create: `src/foundry/monster-spell-resolver/ownership.ts`
- Create: `src/foundry/monster-spell-resolver/hydrator.ts`
- Create: `src/foundry/monster-spell-resolver/transaction.ts`
- Create: `src/foundry/monster-spell-resolver/__tests__/cast-activity.test.ts`
- Create: `src/foundry/monster-spell-resolver/__tests__/ownership.test.ts`
- Create: `src/foundry/monster-spell-resolver/__tests__/hydrator.test.ts`
- Create: `src/foundry/monster-spell-resolver/__tests__/transaction.test.ts`

- [ ] **Step 1: Pin the runtime reference evidence in the tests**

Before implementation, cite the inspected local dnd5e 5.3.3 behavior in test comments and the ExecPlan:

- `CastActivity.cachedSpell` matches `flags.dnd5e.cachedFor === activity.relativeUUID`;
- `getCachedSpellData()` writes `flags.dnd5e.cachedFor`, `system.sourceItem`, and `_stats.compendiumSource`;
- `spell.challenge.attack` and `.save` override NPC attack/DC;
- `spell.properties` represents ignored components;
- native independent 1/day use is Activity uses plus an `activityUses` consumption target.

Do not transcribe private implementation wholesale; encode only the public data behavior required for compatibility.

- [ ] **Step 2: Write native-shape RED tests**

For Rat Warlock assert:

- each Cast Activity keeps the selected destination Compendium UUID;
- each eager cached Spell links to the activity via `flags.dnd5e.cachedFor` and keeps `_stats.compendiumSource`;
- at-will activities have no use consumption;
- six 1/day spells each have independent `max: "1"` daily recovery and `activityUses` consumption;
- attack override +4 and save override 12 are placed on the Cast Activity spell challenge;
- `spell.challenge` uses `override: true`, `attack: "4"`, and `save: "12"`, while `spell.ability` is `"cha"`;
- material components are ignored with Cast Activity `spell.properties: ["material"]` without removing vocal/somatic requirements or editing the compendium source;
- Mage Armor is target override self;
- Giant Rat and two-ray restrictions remain visible and reported as literal when unsupported, not encoded as invented effects;
- no custom Activity type, Item Macro, or module runtime macro is present.

- [ ] **Step 3: Build activity source data deterministically**

`buildCastActivitySource()` receives the source feature ID, selected UUID, manifest group/ref, and stable generated IDs. It returns native dnd5e 5.3.3 Activity source data plus resolver ownership flags and managed projection hash.

- [ ] **Step 4: Create eager cache data through dnd5e's prepared Activity**

Apply feature Activity updates first through public embedded-document APIs. Then read the Actor's prepared Cast Activity and call its public `getCachedSpellData()` to obtain the correct native cache shape. Merge only resolver ownership metadata, then create the embedded Spell. Do not manually clone a premium Spell document or replace the Activity's Compendium UUID with the embedded UUID.

- [ ] **Step 5: Enforce ownership before every update/delete**

Mutation is allowed only when all of these match:

- Actor manifest ID;
- generated feature group ID;
- managed Activity/Spell ownership flag;
- ref ID;
- expected document type;
- current parent Actor.

A name match alone never grants ownership.

- [ ] **Step 6: Implement compensating transaction and rollback**

The transaction service:

1. acquires an Actor-local mutex;
2. records a minimal snapshot of managed content and resolver flags;
3. applies the complete preflight plan;
4. validates the resulting managed projection;
5. commits status/report/single undo snapshot;
6. on failure, restores prior managed content and removes newly created managed documents;
7. reports exact residual differences if rollback also fails.

Test failure injection after feature update, after partial cache creation, during cleanup, and during rollback. Unrelated items/activities/effects/flags must remain deep-equal in every case.

- [ ] **Step 7: Test no-op reapplication and ordinary spell use**

Reapplying the same plan creates no new documents. Spending a daily use does not trigger manual-edit conflict because volatile use state is outside the managed hash.

- [ ] **Step 8: Run and commit**

```powershell
bun test src/foundry/monster-spell-resolver/__tests__/cast-activity.test.ts src/foundry/monster-spell-resolver/__tests__/ownership.test.ts src/foundry/monster-spell-resolver/__tests__/hydrator.test.ts src/foundry/monster-spell-resolver/__tests__/transaction.test.ts
bun run typecheck:all
git add src/foundry/monster-spell-resolver
git diff --cached --check
git commit -m "feat: hydrate native dnd5e monster spells atomically"
```

---

### Task 8: Add safe hooks, manual-conflict review, status, and GM controls

**Files:**

- Create: `src/foundry/monster-spell-resolver/hooks.ts`
- Create: `src/foundry/monster-spell-resolver/status.ts`
- Create: `src/foundry/monster-spell-resolver/review-app.ts`
- Create: `src/foundry/monster-spell-resolver/templates/review.hbs`
- Create: `src/foundry/monster-spell-resolver/templates/report.hbs`
- Modify: `src/foundry/monster-spell-resolver/index.ts`
- Modify: `src/foundry/monster-spell-resolver/lang/zh-CN.json`
- Modify: `src/foundry/monster-spell-resolver/lang/en.json`
- Modify: `src/foundry/monster-spell-resolver/styles/resolver.css`
- Create: `src/foundry/monster-spell-resolver/__tests__/hooks.test.ts`
- Create: `src/foundry/monster-spell-resolver/__tests__/review-app.test.ts`

- [ ] **Step 1: Write hook and review RED tests**

Assert immediate no-op for non-GM, unflagged Actor, unsupported versions, active resolver transaction, or already-applied plan hash. Assert create/update event bursts schedule one preflight only and never recurse from resolver-owned writes.

Manual edit review must expose exactly:

- **Keep manual**: preserve structurally valid current managed content and mark this ref protected;
- **Overwrite**: apply deterministic replacement;
- **Cancel**: mutate nothing;
- dialog close: identical to Cancel.

An invalid current manual structure cannot be silently kept; it remains blocking with an explanation.

- [ ] **Step 2: Register only versioned public hooks**

Use the local Foundry 14 hook reference in `.local/foundry-v14/app/14.364/client/hooks.mjs` to register:

- Actor creation/update hooks for flagged Actors;
- `getHeaderControlsApplicationV2`, filtered to an Actor application;
- `getActorContextOptions` for directory controls.

Do not monkey-patch Actor sheets or dnd5e classes. Add a test that scans bundled source for forbidden prototype assignment/custom Activity registration patterns.

- [ ] **Step 3: Implement once-per-finding review behavior**

Open automatically once per manifest/finding hash. The review shows source evidence, candidate package/book/rules/level/UUID, current/proposed diffs, fallback warnings, and literal-only restrictions. Apply remains disabled until every blocking issue has a decision.

- [ ] **Step 4: Add status and explicit GM actions**

Status values are `pending`, `resolving`, `needs_review`, `hydrated`, `stale`, `incompatible`, `failed`, and `failed-recovery-required`.

Expose:

- Resolve/Re-resolve Spells;
- View Resolution Report;
- View Sources;
- Undo Last Hydration;
- Export Diagnostic Report.

Controls are GM-only. There is no world-wide resolve button.

- [ ] **Step 5: Verify long-content UI and cancel semantics**

Test long Chinese text, UUIDs, JSON paths, and errors for wrapping/scrolling without overlapping controls. Verify Esc, title-bar close, and Cancel all leave Actor state unchanged.

- [ ] **Step 6: Run and commit**

```powershell
bun test src/foundry/monster-spell-resolver/__tests__/hooks.test.ts src/foundry/monster-spell-resolver/__tests__/review-app.test.ts
bun run build:spell-resolver
bun run typecheck:all
git add src/foundry/monster-spell-resolver
git diff --cached --check
git commit -m "feat: add spell resolver review and gm controls"
```

---

### Task 9: Make Intake verification, CLI, and Web report portable spell status truthfully

**Files:**

- Modify: `src/core/intake/types.ts`
- Modify: `src/core/intake/orchestrator.ts`
- Modify: `src/core/intake/verifier.ts`
- Modify: `src/core/intake/__tests__/orchestrator.test.ts`
- Modify: `src/core/intake/__tests__/renderer-verifier.test.ts`
- Modify: `src/index.ts`
- Modify: `tests/cli-ai-intake.test.ts`
- Modify: `src/web/client/App.tsx`
- Modify: `src/web/client/intakeReview.ts`
- Modify: `src/web/client/__tests__/intakeReview.test.ts`
- Modify: `src/web/server/jobs/__tests__/aiMonsterIntake.test.ts`

- [ ] **Step 1: Write RED verifier and messaging tests**

The deterministic verifier must block:

- a dropped or duplicated SpellRef;
- a fabricated target UUID or fake hashed ID in a portable Actor;
- any placeholder embedded Spell;
- missing group/feature linkage;
- changed usage, DC, attack, component waiver, or restriction;
- a claim that the portable Actor is already `hydrated` before destination-world runtime resolution.

It must pass an intact Rat manifest as source-accepted with `spellResolution.status === "pending"`.

- [ ] **Step 2: Add a distinct spell-resolution result**

Do not overload `MonsterIntakeStatus`. Add:

```ts
interface PortableSpellResolutionStatus {
  required: boolean;
  status: "not-required" | "pending" | "hydrated" | "needs_review" | "failed";
  manifestId?: string;
  spellCount: number;
  reportPath?: string;
}
```

At project generation time, a valid caster is `pending`, never `hydrated`. The Foundry module owns the transition to hydrated.

- [ ] **Step 3: Update CLI output without changing accepted Actor registration**

For a caster, print a separate line:

```text
法术：已整理 10 项；目标世界解析待完成（需 FVTT v14 解析模块）
```

The intake can remain source-accepted because its portable output is valid, but CLI output and reports may not call spells functional before runtime hydration.

- [ ] **Step 4: Update Web review/status copy**

Show `资料已整理，法术将在目标世界解析` and spell count. Do not offer a hydrated Actor download or imply spell functionality from the Intake job. Existing non-caster status remains unchanged.

- [ ] **Step 5: Run focused gates and commit**

```powershell
bun test src/core/intake/__tests__/orchestrator.test.ts src/core/intake/__tests__/renderer-verifier.test.ts tests/cli-ai-intake.test.ts src/web/client/__tests__/intakeReview.test.ts src/web/server/jobs/__tests__/aiMonsterIntake.test.ts
bun run web:build
bun run typecheck:production
git add src/core/intake src/index.ts tests/cli-ai-intake.test.ts src/web
git diff --cached --check
git commit -m "feat: report pending target-world spell resolution"
```

---

### Task 10: Add safe Foundry Lab build/install/verify commands

**Files:**

- Create: `scripts/foundry-lab/spellResolver.ts`
- Create: `scripts/foundry-lab/__tests__/spellResolver.test.ts`
- Modify: `scripts/foundry-lab/cli.ts`
- Modify: `scripts/foundry-lab/config.ts`
- Modify: `scripts/foundry-lab/README.md`
- Modify: `package.json`

- [ ] **Step 1: Write path-safety RED tests**

The installer accepts only the resolved project-local module destination:

```text
.local/foundry-v14/data/server-mirror/Data/modules/fvtt-json-generator-spell-resolver
```

Reject production paths, junction escapes, module-ID mismatches, missing build validation, and any target outside the configured mirror. Existing local module content is backed up before replacement. Uninstall removes only the exact module directory after revalidating its manifest ID.

- [ ] **Step 2: Add Foundry Lab commands**

Add:

```text
foundry:lab spell-resolver build
foundry:lab spell-resolver install --apply
foundry:lab spell-resolver verify-install
foundry:lab spell-resolver prepare-world --world=fvtt-v14-module-matrix --apply
foundry:lab spell-resolver uninstall --apply
```

`verify-install` compares build/install hashes, validates module metadata, and confirms Foundry/dnd5e version paths. It does not claim the module has run successfully.

- [ ] **Step 3: Add a disposable test-world preparation command**

`spell-resolver prepare-world --world=fvtt-v14-module-matrix --apply` may enable the module only in that project-local disposable world after backing up its configuration. It must reject `cor-cotn`, production-like data roots, unknown worlds, and any request that would alter another world.

- [ ] **Step 4: Run and commit**

```powershell
bun test scripts/foundry-lab/__tests__/spellResolver.test.ts
bun run foundry:lab spell-resolver build
bun run foundry:lab spell-resolver install --apply
bun run foundry:lab spell-resolver verify-install
bun run foundry:lab spell-resolver prepare-world --world=fvtt-v14-module-matrix --apply
bun run test:foundry-lab
git add scripts/foundry-lab package.json
git diff --cached --check
git commit -m "feat: install spell resolver in local foundry lab"
```

Expected: install is mechanically valid in the local mirror only.

---

### Task 11: Run the Rat Warlock through the real project workflow and local Foundry

**Files:**

- Create: `obsidian/dnd数据转fvttjson/input/鼠神邪术师.md` through the accepted Intake promotion path, not by hand
- Create: `obsidian/dnd数据转fvttjson/output/鼠神邪术师.json` through the project CLI/workflow, not by hand
- Create: `.local/spell-resolver-acceptance/<run-id>/` runtime evidence; keep this ignored/local
- Modify: `docs/remediation/2026-07-15-project-hardening/EXECPLAN.md`
- Create: `docs/acceptance/2026-07-18-rat-warlock-spell-resolver.md`

- [ ] **Step 1: Run bounded AI Intake on the unmarked raw fixture**

Use explicit existing OpenAI-compatible Intake configuration only. Do not use MiniMax, Legacy plaintext fallback, or hand-added Markdown markers.

```powershell
bun run src/index.ts --intake-monsters "src/core/intake/__tests__/fixtures/rat-warlock.raw.txt" --vault "obsidian/dnd数据转fvttjson" --fvtt-version 14 --effect-profile core
```

Expected mechanical result: exactly one source-accepted monster, ten portable spell refs, spell resolution `pending`, promoted Markdown in vault `input/`, and CLI-generated Actor JSON in vault `output/`.

Copy the exact bundle path printed by this command into `$run`; do not select a directory merely because it is newest. Confirm that its `manifest.json` source hash matches the fixture, then locate its single creature directory:

```powershell
$exactBundlePathPrintedByCli = Read-Host "Paste the exact bundle path printed by the Intake command"
$run = Resolve-Path $exactBundlePathPrintedByCli
$creature = Get-ChildItem "$run/creatures" -Directory
if ($creature.Count -ne 1) { throw "Expected exactly one Rat Warlock creature bundle" }
```

- [ ] **Step 2: Run source-to-portable verification**

```powershell
bun run verify:intake -- --source "src/core/intake/__tests__/fixtures/rat-warlock.raw.txt" --ir "$($creature.FullName)/intake-ir.json" --markdown "obsidian/dnd数据转fvttjson/input/鼠神邪术师.md" --actor "obsidian/dnd数据转fvttjson/output/鼠神邪术师.json"
```

Manually read the raw source, IR, Markdown, and Actor projection. Record that all ten names/usages, DC 12, attack +4, component waiver, self-only, Giant Rat, and two-ray facts remain present and no spell mechanics/UUID was invented.

- [ ] **Step 3: Install and launch the module in the disposable local mirror**

```powershell
bun run foundry:lab spell-resolver build
bun run foundry:lab spell-resolver install --apply
bun run foundry:lab spell-resolver verify-install
bun run foundry:lab spell-resolver prepare-world --world=fvtt-v14-module-matrix --apply
bun run foundry:lab launch server-mirror
```

Use the project-local Foundry 14.364 data mirror only.

- [ ] **Step 4: Import through Foundry's public Actor import path**

Capture browser/runtime evidence showing:

- imported Actor has `pending` resolver status;
- resolver preflight discovers all enabled/readable Item compendiums;
- exactly ten refs resolve before any write;
- hydration finishes as one transaction;
- status becomes `hydrated` only after post-write validation.

- [ ] **Step 5: Inspect the hydrated native document graph**

Verify exactly ten real cached Spell items and ten matching native Cast Activities. For every pair check destination Compendium UUID, `flags.dnd5e.cachedFor`, `_stats.compendiumSource`, resolver ownership, and source feature group linkage. Confirm no placeholder or duplicate item exists.

- [ ] **Step 6: Perform semantic spell-use acceptance**

Open Spell sheets and execute at least:

- Eldritch Blast as the attack spell: native attack workflow uses +4; two-ray source instruction remains visible if not natively enforceable;
- Burning Hands or Faerie Fire as the save spell: native save workflow uses DC 12;
- Mage Armor or Invisibility as the utility spell: sheet/activity opens and casts; Mage Armor is self-only;
- one 1/day spell twice: first use spends only that Activity's use; second use is blocked/warned by native behavior; other 1/day spells remain available;
- one at-will spell repeatedly: no daily use is spent.

Confirm ignored material components are represented by native Cast data. Confirm Giant Rat remains visible literal restriction for 2024 Conjure Animals and no unsupported automation is claimed.

- [ ] **Step 7: Exercise source priority and future-expansion discovery**

With local installed packs:

- prove PHB 2024 wins an otherwise equivalent PHB/`dnd5e.spells24` duplicate;
- add a fixture manifest for one real expansion-only 2024 Spell from `dnd-heroes-faerun` and resolve it without a hard-coded package/spell UUID or trust prompt;
- confirm an enabled mixed pack's 2014 spell does not beat a matching 2024 spell;
- confirm a unique 2014-only name produces a visible fallback report.

- [ ] **Step 8: Exercise non-interference and recovery**

Capture before/after projections for an unrelated Actor. Verify:

- identical re-resolution is a no-op;
- manually editing one managed Activity opens review;
- Keep preserves it;
- Overwrite restores deterministic content;
- Cancel and dialog close change nothing;
- injected mid-apply failure restores the full before-state;
- injected rollback failure yields `failed-recovery-required` and exact residual differences;
- disabling the resolver leaves hydrated cached Spells openable and castable;
- the unrelated Actor remains unchanged.

- [ ] **Step 9: Write semantic acceptance evidence**

The acceptance document records exact Foundry/dnd5e/package versions, commands, Actor/manifest IDs, counts, selected source UUIDs, screenshots/log references, mechanical results, human semantic observations, and remaining literal-only limitations. Do not copy full premium Spell descriptions.

- [ ] **Step 10: Commit tracked acceptance artifacts only**

```powershell
git add "obsidian/dnd数据转fvttjson/input/鼠神邪术师.md" "obsidian/dnd数据转fvttjson/output/鼠神邪术师.json" docs/acceptance/2026-07-18-rat-warlock-spell-resolver.md docs/remediation/2026-07-15-project-hardening/EXECPLAN.md
git diff --cached --check
git commit -m "test: accept target-world rat warlock spells"
```

Do not commit `.local` runtime data, credentials, premium spell bodies, cookies, or server databases.

---

### Task 12: Document delivery, run full gates, and close only proven findings

**Files:**

- Modify: `README.md`
- Modify: `docs/manual.md`
- Create: `docs/foundry-spell-resolver-install.zh-CN.md`
- Modify: `docs/acceptance/current-support-matrix.md`
- Modify: `docs/generated-actor-verification.md`
- Modify: `docs/remediation/2026-07-15-project-hardening/EXECPLAN.md`
- Modify: `scripts/foundry-lab/README.md`

- [ ] **Step 1: Write the user-facing boundary accurately**

Document:

- AI Intake as the recommended raw-text path;
- portable spell manifest versus destination-world hydration;
- normal Actor import followed by module resolution;
- automatic participation of all enabled readable spell sources;
- 2024-first/2014-only-if-no-2024-match rule;
- review behavior for ambiguity and manual edits;
- install/update/uninstall/diagnostic steps;
- exact supported Foundry/dnd5e versions;
- privacy/licensing boundary: no official spell rules copied into project manifests;
- OCR/PDF, v12 resolver, production installation, and world-wide migration remain unsupported/out of scope.

- [ ] **Step 2: Update verification instructions**

`docs/generated-actor-verification.md` must distinguish:

1. portable Actor verification (`pending` is correct);
2. target-world resolver report verification;
3. live native Spell use acceptance.

No single layer substitutes for the others.

- [ ] **Step 3: Run focused and aggregate mechanical gates**

```powershell
bun run test:spell-resolver
bun test src/core/intake src/core/parser src/core/generator tests/cli-ai-intake.test.ts --max-concurrency 4
bun run test:foundry-lab
bun run build:spell-resolver
bun run typecheck:production
bun run typecheck:all
bun run audit:anti-overfit:all
bun run web:build
bun test --max-concurrency 4
bun run ci:verify
```

Expected: every command exits 0. Record command, timestamp, duration, and result in the ExecPlan; do not replace semantic evidence with this list.

- [ ] **Step 4: Run repository and package hygiene checks**

```powershell
git status --short
git diff --check
git ls-files .local dist
git grep -n -E "(MONSTER_INTAKE_API_KEY|Authorization: Bearer|premium spell description)"
```

Expected: no local runtime/build artifacts or secrets are tracked; only known documentation references are present.

- [ ] **Step 5: Perform final semantic audit**

Read the Rat raw source, accepted Markdown, pre-hydration Actor, resolver report, post-hydration Actor projection, and local runtime acceptance evidence together. Explicitly answer:

- Are all ten source spells real destination-world Spells?
- Was 2024 priority followed, with 2014 used only under the approved absence rule?
- Do uses/DC/attack/components/restrictions retain source meaning?
- Can representative attack/save/utility spells actually be used?
- Does disabling the module preserve native use?
- Were unrelated Actors/items/activities/effects/flags unchanged?
- Are unautomated restrictions disclosed rather than falsely automated?

Any “no” keeps `SPELL-001` open and requires the smallest corrective task plus a repeated focused/runtime gate.

- [ ] **Step 6: Close the ledger finding only after both evidence layers pass**

Append, without rewriting history:

- mechanical verification evidence;
- semantic/runtime acceptance evidence;
- exact supported versions and installed source package versions;
- remaining limitations;
- closure decision for `SPELL-001`.

- [ ] **Step 7: Commit documentation and final ledger state**

```powershell
git add README.md docs scripts/foundry-lab/README.md
git diff --cached --check
git commit -m "docs: publish target-world spell resolver workflow"
```

Inspect final status. The resolver-specific instruction hunks added in Task 1 may be committed, but every other pre-existing user-owned hunk/path must remain unstaged and unmodified.

---

## Completion Gate

This plan is complete only when all of the following are true:

- The Rat Warlock enters as the original unmarked text and leaves the project workflow with an evidence-backed ten-spell portable manifest.
- The generated Actor contains no placeholder Spell, fake ID, or source-world UUID.
- The local Foundry 14.364/dnd5e 5.3.3 resolver discovers current and future enabled spell packs from real Item indexes and applies the approved 2024-first matching rule.
- Hydration creates native dnd5e Cast Activities and eager cached Spells with correct provenance, independent uses, challenge overrides, component handling, and preserved literal restrictions.
- Ambiguity, missing sources, manual edits, apply failure, and rollback failure all produce the specified safe states without partial success.
- Re-resolution is idempotent, unrelated Actor content is unchanged, and native spells remain usable after disabling the module.
- Focused tests, full tests, typechecks, anti-overfit, Web build, Foundry Lab, package build, and `ci:verify` pass.
- A human has compared the original text through the hydrated Actor and actually used representative spells in the local Foundry runtime.
- The support matrix and hardening ledger state exactly what passed, what remains literal-only, and what is still out of scope.

Passing only the automated gates does not satisfy this completion gate.
