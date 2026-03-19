# Bestiary 英文输入扩展工作计划（不破坏中文流水线）

## TL;DR

> **Quick Summary**: 在现有 `Obsidian → FVTT JSON` 流水线内新增英文 bestiary 解析分支，自动检测输入格式，输出维持现有 JSON 结构，并实现中英双语名称与英文描述的中文翻译。
>
> **Deliverables**:
> - 英文格式解析链路（frontmatter + markdown body actions）
> - OpenAI 兼容翻译服务（支持中转商 base URL）+ 缓存
> - 双语名称输出（怪物名、动作名）
> - 中文流水线零回归（现有测试保持通过）
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 4 → Task 6 → Task 8

---

## Context

### Original Request
用户希望现有工具除中文模板外，也能直接处理 `5ecompendium/bestiary` 的英文 `.md`，并转换为可导入 FVTT 的 JSON；输出要求：
- 结构化字段中文化
- 名称双语拼接（如 `成年红龙Adult Red Dragon`、`啃咬Bite`）
- 动作描述翻译为中文（通过 OpenAI GPT API，支持中转商）
- 工具通用，用户自行选择输入文件
- 必须不破坏现有中文工作流

### Interview Summary
**Key Decisions**:
- 架构方案：扩展现有 pipeline（不做独立中间转换器）
- 格式识别：自动检测（`layout: creature` 判定英文 bestiary）
- 测试策略：TDD
- API 配置：配置文件方案
- 兼容要求：中文链路零回归

**Research Findings**:
- Bestiary 的核心差异是动作在 markdown body，而不是 YAML frontmatter
- 现有 `ActionParser` 对英文关键词有部分支持，但不覆盖英文 statblock 全格式
- `i18n` 目前以中文反查为主，需扩展英文映射能力
- 现有 `obsidianSync` 与 `index.ts` 可复用，需插入解析路由

### Metis Review
**Identified Gaps (addressed in this plan)**:
- 需要解析策略分层（中英文分支隔离），避免直接污染 `YamlParser`
- 英文动作解析应独立类实现，避免破坏中文动作 regex
- 翻译调用需缓存（成本与速率控制）
- 翻译失败策略必须明确（不应整批阻塞）
- 回归验证必须覆盖中文模板与增量同步

---

## Work Objectives

### Core Objective
在不影响现有中文模板解析能力的前提下，为同一 CLI/Sync 流程增加英文 bestiary 输入支持，并稳定输出可导入 dnd5e 4.3.x 的 JSON。

### Concrete Deliverables
- 解析路由层（自动识别中文模板 vs 英文 bestiary）
- 英文 frontmatter 解析与标准化
- 英文 markdown body（Actions/Legendary/Lair/Spellcasting）解析
- OpenAI 兼容翻译服务 + 本地缓存
- 双语名称格式化（中文优先 + 英文拼接）
- 完整 TDD 测试集与 E2E 回归

### Definition of Done
- [ ] `bun test` 全部通过
- [ ] `bun test tests/e2e.test.ts` 通过且中文用例不退化
- [ ] 英文样本转换后生成 JSON，包含双语名称与中文描述
- [ ] 翻译 API 不可用时，流程按策略降级并给出可追踪告警

### Must Have
- 自动检测英文 bestiary 输入
- 中文流水线行为保持不变
- 翻译服务支持 OpenAI-compatible `baseURL`
- 名称双语拼接规则一致、可预测

### Must NOT Have (Guardrails)
- 不得将中文 parser 强行改成“全宽松”导致中文字段 typo 被静默吞掉
- 不得在原 `ActionParser` 内堆叠英文复杂 regex（英文单独 parser）
- 不得引入必须人工介入的验证步骤
- 不得把 API key 写死在代码或提交到仓库

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> 所有验收均由执行代理通过命令/工具完成，不要求用户手工点击或肉眼确认。

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: TDD
- **Framework**: `bun test`

### If TDD Enabled
每个任务按 RED → GREEN → REFACTOR 执行：
1. RED: 新增失败测试（英文输入、翻译流程、混合同步）
2. GREEN: 最小实现使测试通过
3. REFACTOR: 清理重复逻辑、保持测试全绿

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

- 前端/UI：不适用
- CLI/解析：`Bash` 执行 `bun test`、`bun run src/index.ts ...`
- 同步流程：`Bash` 构造临时 vault 并执行 `--sync`
- 证据：日志与输出文件保存在 `.sisyphus/evidence/`

---

## Execution Strategy

### Parallel Execution Waves

Wave 1 (Foundation):
- Task 1: 解析路由与自动检测骨架
- Task 2: 英文 frontmatter 映射与术语映射基础
- Task 5: 翻译配置/缓存基础设施

Wave 2 (Core Parsing):
- Task 3: 英文 body 分段提取
- Task 4: 英文动作语句解析
- Task 6: 生成器集成（双语名称 + 描述翻译）

Wave 3 (Integration & Safety):
- Task 7: CLI/Sync 混合输入集成与清单行为
- Task 8: 全量回归、文档与交付验证

Critical Path: 1 → 3 → 4 → 6 → 8
Parallel Speedup: 约 30-40%

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|----------------------|
| 1 | None | 3, 7 | 2, 5 |
| 2 | None | 4, 6 | 1, 5 |
| 3 | 1 | 4, 6 | 5 |
| 4 | 2, 3 | 6 | None |
| 5 | None | 6, 7 | 1, 2, 3 |
| 6 | 2, 4, 5 | 8 | None |
| 7 | 1, 5 | 8 | None |
| 8 | 6, 7 | None | None |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1,2,5 | `task(category="unspecified-high", load_skills=[], run_in_background=false)` |
| 2 | 3,4,6 | 同上，按依赖顺序串并结合 |
| 3 | 7,8 | 集成阶段串行执行，优先稳定性 |

---

## TODOs

- [x] 1. 建立中英文解析路由（自动检测）

  **What to do**:
  - 新增 parser strategy/factory（中文 parser 与英文 parser 分离）
  - 自动检测规则：frontmatter 含 `layout: creature` 走英文分支，否则中文分支
  - 保留 `YamlParser` 原职责用于中文模板，不做破坏性重写
  - RED: 新增“路由选择”测试，先失败

  **Must NOT do**:
  - 不把中文 strict 逻辑直接删掉
  - 不在 `index.ts` 中硬编码大量 if/else 业务

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 涉及核心架构分层与兼容策略
  - **Skills**: `[]`
    - 本任务不依赖专门外部技能，重点是本仓库内部重构
  - **Skills Evaluated but Omitted**:
    - `git-master`: 本任务不做提交动作

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 5)
  - **Blocks**: 3, 7
  - **Blocked By**: None

  **References**:
  - `src/index.ts:18` - 当前 CLI 入口与 `YamlParser` 绑定点
  - `src/core/parser/yaml.ts:6` - 中文解析主入口，需保持兼容
  - `src/core/workflow/obsidianSync.ts:48` - Sync 模式当前固定使用 `YamlParser`

  **Acceptance Criteria**:
  - [x] 新增路由测试文件并通过：`bun test src/core/parser/__tests__/parser-router.test.ts`
  - [x] 中文模板仍可解析：`bun test src/core/parser/__tests__/yaml.test.ts`
  - [x] 英文 fixture 能命中英文分支（断言 parser type）

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: Router selects Chinese parser for legacy template
    Tool: Bash
    Preconditions: tests fixtures available
    Steps:
      1. Run: bun test src/core/parser/__tests__/parser-router.test.ts -t "chinese route" > .sisyphus/evidence/task-1-ch-route.log 2>&1
      2. Assert exit code = 0
      3. Search log for passing test name
    Expected Result: Chinese route test passes
    Failure Indicators: non-zero exit code or missing test pass output
    Evidence: .sisyphus/evidence/task-1-ch-route.log

  Scenario: Router selects English parser when layout=creature
    Tool: Bash
    Preconditions: english fixture with frontmatter layout: creature
    Steps:
      1. Run: bun test src/core/parser/__tests__/parser-router.test.ts -t "english route" > .sisyphus/evidence/task-1-en-route.log 2>&1
      2. Assert exit code = 0
      3. Assert log includes parser type "english"
    Expected Result: English route test passes
    Evidence: .sisyphus/evidence/task-1-en-route.log
  ```

  **Commit**: YES
  - Message: `feat(parser): add format router for chinese and bestiary markdown`
  - Files: `src/core/parser/*`, `src/core/parser/__tests__/*`
  - Pre-commit: `bun test src/core/parser/__tests__/parser-router.test.ts`

---

- [x] 2. 扩展英文 frontmatter 映射与术语归一

  **What to do**:
  - 为英文字段建立映射层（如 `name`, `str`, `armor_class`, `hit_points`, `challenge`）
  - 能解析 `27 (+8)`、`17 (18,000 XP)`、`19 (natural armor)` 等字符串
  - 扩展 i18n 映射能力：支持 English label / keyword → internal key / 中文术语
  - 对 bestiary 多余字段（`layout`, `tags`）在英文分支忽略或保留元信息，不抛错
  - RED: frontmatter 解析测试（含异常字段）

  **Must NOT do**:
  - 不改坏中文字段映射（`名称`、`力量` 等）
  - 不将“未知字段”全局静默（仅英文分支可宽容）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 字段契约与映射关系是解析正确性的基础
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `git-master`: 非提交任务

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 5)
  - **Blocks**: 4, 6
  - **Blocked By**: None

  **References**:
  - `src/config/mapping.ts:8` - 现有中文 `FIELD_MAPPING`
  - `src/core/mapper/i18n.ts:15` - 当前仅加载 `cn.json`
  - `src/core/parser/yaml.ts:50` - strict traverse 逻辑
  - `src/core/parser/__tests__/yaml.test.ts:34` - unknown field 现有行为基线
  - `https://raw.githubusercontent.com/5ecompendium/bestiary/master/_creatures/adult-red-dragon.md` - 英文 frontmatter 真实样本

  **Acceptance Criteria**:
  - [x] 英文字段解析单测通过（属性、AC、HP、CR、速度、感官）
  - [x] 英文未知字段不导致英文分支失败
  - [x] 中文 unknown field 规则保持原有预期（不退化）

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: Parse english frontmatter primitives and composite values
    Tool: Bash
    Preconditions: english fixture includes str/challenge/hit_points/armor_class
    Steps:
      1. Run: bun test src/core/parser/__tests__/english-frontmatter.test.ts > .sisyphus/evidence/task-2-frontmatter.log 2>&1
      2. Assert exit code = 0
      3. Assert tests verify parsed values (str=27, ac=19, hp=256)
    Expected Result: All frontmatter parse tests pass
    Evidence: .sisyphus/evidence/task-2-frontmatter.log

  Scenario: Chinese strict behavior remains unchanged
    Tool: Bash
    Preconditions: existing yaml strict test present
    Steps:
      1. Run: bun test src/core/parser/__tests__/yaml.test.ts -t "should throw on unknown field" > .sisyphus/evidence/task-2-strict.log 2>&1
      2. Assert exit code = 0
      3. Assert expected throw message includes InvalidField
    Expected Result: Chinese strict-mode baseline preserved
    Evidence: .sisyphus/evidence/task-2-strict.log
  ```

  **Commit**: YES
  - Message: `feat(parser): support english bestiary frontmatter mapping`
  - Files: `src/config/mapping.ts`, `src/core/mapper/i18n.ts`, parser tests
  - Pre-commit: `bun test src/core/parser/__tests__/english-frontmatter.test.ts`

---

- [x] 3. 实现英文 markdown body 分段提取（Actions/Legendary/Lair/Spellcasting）

  **What to do**:
  - 新增英文 body section extractor
  - 从 body 中提取并分类：普通动作、传奇动作、巢穴动作、施法块
  - 保留剩余叙事文本到 biography（避免丢失）
  - 支持 `>*` blockquote lair 列表、编号列表（如眼魔射线）
  - RED: section extraction tests

  **Must NOT do**:
  - 不把整段 body 原样塞进 biography 而忽略动作
  - 不依赖人工标注分段

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 结构切分直接决定后续动作解析成功率
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (critical)
  - **Blocks**: 4, 6
  - **Blocked By**: 1

  **References**:
  - `src/core/parser/yaml.ts:22` - 当前 body 仅用于 biography
  - `https://raw.githubusercontent.com/5ecompendium/bestiary/master/_creatures/aboleth.md` - 传奇动作样本
  - `https://raw.githubusercontent.com/5ecompendium/bestiary/master/_creatures/adult-red-dragon.md` - 巢穴动作样本
  - `https://raw.githubusercontent.com/5ecompendium/bestiary/master/_creatures/archmage.md` - 施法块样本

  **Acceptance Criteria**:
  - [x] body extractor 测试通过：能正确提取四类区块
  - [x] biography 保留非动作叙述文本
  - [x] 复杂样本（dragon/beholder）区块数量与预期一致

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: Extract action sections from adult-red-dragon fixture
    Tool: Bash
    Preconditions: fixture stored under tests/fixtures
    Steps:
      1. Run: bun test src/core/parser/__tests__/english-body-sections.test.ts -t "adult red dragon sections" > .sisyphus/evidence/task-3-sections.log 2>&1
      2. Assert exit code = 0
      3. Assert test checks actions/legendary/lair presence
    Expected Result: Section extraction is stable
    Evidence: .sisyphus/evidence/task-3-sections.log

  Scenario: Non-action narrative remains biography
    Tool: Bash
    Preconditions: fixture includes narrative paragraphs
    Steps:
      1. Run: bun test src/core/parser/__tests__/english-body-sections.test.ts -t "biography remainder" > .sisyphus/evidence/task-3-bio.log 2>&1
      2. Assert exit code = 0
      3. Assert biography text contains expected sentence
    Expected Result: Narrative is preserved
    Evidence: .sisyphus/evidence/task-3-bio.log
  ```

  **Commit**: YES
  - Message: `feat(parser): extract english action sections from markdown body`
  - Files: english parser modules + tests
  - Pre-commit: `bun test src/core/parser/__tests__/english-body-sections.test.ts`

---

- [x] 4. 实现 EnglishActionParser（独立于现有 ActionParser）

  **What to do**:
  - 新建 `EnglishActionParser`，将英文动作句子转为 `ActionData`
  - 支持攻击、to hit、reach/range、Hit damage、save DC、recharge、legendary cost
  - 支持多段伤害（`plus ... damage`）
  - 对无法结构化的描述保留原文（避免数据丢失）
  - RED: 针对 attack/save/recharge/spell line 的 parser tests

  **Must NOT do**:
  - 不在 `src/core/parser/action.ts` 里追加复杂英文逻辑
  - 不丢弃解析失败动作（至少保留 utility 描述）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: regex + 语义映射复杂，需高精度
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: 6
  - **Blocked By**: 2, 3

  **References**:
  - `src/core/parser/action.ts:33` - 现有中文动作解析接口与结构
  - `src/core/parser/__tests__/action.test.ts:7` - 现有动作测试风格
  - `src/core/generator/activity.ts:8` - `ActionData` 消费方
  - `https://github.com/jbhaywood/5e-statblock-importer` - 英文 statblock regex 参考

  **Acceptance Criteria**:
  - [x] 英文动作 parser 测试通过（attack/save/recharge/legendary cost）
  - [x] 多段伤害正确进入 `damage parts`
  - [x] 解析失败动作以 utility 形式保底，不抛未捕获异常

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: Parse melee attack with plus secondary damage
    Tool: Bash
    Preconditions: test input includes "Hit: ... piercing damage plus ... fire damage"
    Steps:
      1. Run: bun test src/core/parser/__tests__/english-action.test.ts -t "secondary damage" > .sisyphus/evidence/task-4-secondary-dmg.log 2>&1
      2. Assert exit code = 0
      3. Assert parsed damage array length = 2
    Expected Result: Primary and secondary damage both parsed
    Evidence: .sisyphus/evidence/task-4-secondary-dmg.log

  Scenario: Parse save-based breath action with recharge
    Tool: Bash
    Preconditions: input contains recharge + save DC phrase
    Steps:
      1. Run: bun test src/core/parser/__tests__/english-action.test.ts -t "recharge save action" > .sisyphus/evidence/task-4-recharge-save.log 2>&1
      2. Assert exit code = 0
      3. Assert parsed save.dc and recharge.value match expected
    Expected Result: Save + recharge are parsed correctly
    Evidence: .sisyphus/evidence/task-4-recharge-save.log
  ```

  **Commit**: YES
  - Message: `feat(parser): add dedicated english action parser`
  - Files: english action parser + tests
  - Pre-commit: `bun test src/core/parser/__tests__/english-action.test.ts`

---

- [x] 5. 接入 OpenAI 兼容翻译服务（含缓存与容错）

  **What to do**:
  - 新增 `TranslationService` 抽象与 `OpenAITranslationService` 实现
  - 读取配置文件（默认 `.env`，支持 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`）
  - 支持中转商 OpenAI-compatible endpoint
  - 增加本地缓存（默认 `data/translation-cache.json`）
  - 失败策略：翻译失败时保留英文原文并记录 warning（不阻塞整批转换）
  - RED: mock API tests + cache hit/miss tests

  **Must NOT do**:
  - 不将 key 输出到日志
  - 不因单条翻译失败中断全部文件

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 外部依赖、错误处理、缓存一致性
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: 6, 7
  - **Blocked By**: None

  **References**:
  - `package.json:14` - 现有依赖与运行环境
  - `src/index.ts:70` - 统一错误处理模式
  - `README.md:165` - 测试命令基线
  - `https://platform.openai.com/docs/api-reference/chat/create` - API 协议参考

  **Acceptance Criteria**:
  - [x] 翻译服务单测通过（mock 成功、mock 超时、mock 429）
  - [x] 缓存命中测试通过（同文案二次请求不触发外部调用）
  - [x] `.env` 缺失时行为可预期（明确错误或降级告警）

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: Cache prevents duplicate translation calls
    Tool: Bash
    Preconditions: translation service tests use mocked HTTP layer
    Steps:
      1. Run: bun test src/core/translation/__tests__/service.test.ts -t "cache hit" > .sisyphus/evidence/task-5-cache.log 2>&1
      2. Assert exit code = 0
      3. Assert mock request count remains 1 after two translate calls
    Expected Result: Second call reads from cache
    Evidence: .sisyphus/evidence/task-5-cache.log

  Scenario: API failure falls back to source English text
    Tool: Bash
    Preconditions: mock returns timeout/429
    Steps:
      1. Run: bun test src/core/translation/__tests__/service.test.ts -t "fallback on failure" > .sisyphus/evidence/task-5-fallback.log 2>&1
      2. Assert exit code = 0
      3. Assert output equals source text and warning recorded
    Expected Result: Pipeline remains non-blocking
    Evidence: .sisyphus/evidence/task-5-fallback.log
  ```

  **Commit**: YES
  - Message: `feat(translation): add openai-compatible translator with cache`
  - Files: translation modules + tests + env example
  - Pre-commit: `bun test src/core/translation/__tests__/service.test.ts`

---

- [x] 6. 集成生成逻辑：双语名称 + 中文描述 + 结构化数据落地

  **What to do**:
  - 英文解析结果接入 `ActorGenerator` 产物路径
  - 怪物名格式：`{zh}{en}`，无中文翻译时 fallback 仅英文
  - 动作名格式：`{zh}{en}`，无中文翻译时 fallback 仅英文
  - 动作描述：调用翻译服务输出中文描述到 `description.value`
  - 结构化字段仍按内部 key 输出符合 dnd5e schema
  - RED: bilingual naming + description translation integration tests

  **Must NOT do**:
  - 不覆盖中文输入时现有命名逻辑
  - 不改变 `activity` 结构契约

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 解析到生成的关键桥接点，回归风险高
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: 8
  - **Blocked By**: 2, 4, 5

  **References**:
  - `src/core/generator/actor.ts:27` - Actor 生成主流程
  - `src/core/generator/actor.ts:243` - 动作 item 构建位置
  - `src/core/generator/activity.ts:4` - activity 生成契约
  - `src/core/mapper/i18n.ts:64` - key→翻译能力入口

  **Acceptance Criteria**:
  - [x] 英文 dragon fixture 输出 `name` 为双语拼接
  - [x] 英文动作 item 名称为双语拼接
  - [x] 描述翻译后写入 `description.value`
  - [x] `activity` 的 `attack/save/damage` 字段保持可导入结构

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: English fixture generates bilingual actor and action names
    Tool: Bash
    Preconditions: english fixture + mock translation available
    Steps:
      1. Run: bun test tests/e2e.test.ts -t "english bilingual output" > .sisyphus/evidence/task-6-bilingual.log 2>&1
      2. Assert exit code = 0
      3. Assert actor name contains both zh and en substrings
      4. Assert at least one action item name contains both zh and en substrings
    Expected Result: Bilingual naming policy applied
    Evidence: .sisyphus/evidence/task-6-bilingual.log

  Scenario: Missing zh translation falls back to english-only name
    Tool: Bash
    Preconditions: fixture contains obscure action name not in dictionary
    Steps:
      1. Run: bun test tests/e2e.test.ts -t "name fallback" > .sisyphus/evidence/task-6-fallback-name.log 2>&1
      2. Assert exit code = 0
      3. Assert output name equals original english token
    Expected Result: No crash; deterministic fallback
    Evidence: .sisyphus/evidence/task-6-fallback-name.log
  ```

  **Commit**: YES
  - Message: `feat(generator): output bilingual names and translated descriptions`
  - Files: generator + integration tests
  - Pre-commit: `bun test tests/e2e.test.ts -t "english bilingual output"`

---

- [x] 7. 集成 CLI 与增量同步（混合语言输入）

  **What to do**:
  - 在单文件模式与 `--sync` 模式中接入新 parser 路由
  - mixed input（中文 + 英文）同目录并存时均可处理
  - 明确 manifest 行为：输入 hash 不变时跳过；必要时加入 parser/translation version 签名避免脏跳过
  - RED: obsidian sync mixed-language tests

  **Must NOT do**:
  - 不破坏现有 `output_backup` 与 manifest 基本语义
  - 不让英文文件因翻译错误变成 hard fail（除非配置要求严格失败）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 涉及批处理稳定性与数据一致性
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: 8
  - **Blocked By**: 1, 5

  **References**:
  - `src/index.ts:20` - sync 与单文件两条主路径
  - `src/core/workflow/obsidianSync.ts:89` - 批量扫描与增量入口
  - `src/core/workflow/__tests__/obsidianSync.test.ts:69` - 现有同步测试模式
  - `README.md:63` - sync 命令文档基线

  **Acceptance Criteria**:
  - [x] 混合输入 sync 测试通过（同批次含中文与英文文件）
  - [x] 英文文件更新时可触发重新生成并产生备份
  - [x] 未变化文件被正确跳过

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: Sync mixed chinese and english markdown files
    Tool: Bash
    Preconditions: temp vault contains one chinese md and one english md
    Steps:
      1. Run: bun test src/core/workflow/__tests__/obsidianSync.test.ts -t "mixed language" > .sisyphus/evidence/task-7-mixed-sync.log 2>&1
      2. Assert exit code = 0
      3. Assert output contains two generated json files
    Expected Result: Both language formats are processed in one sync run
    Evidence: .sisyphus/evidence/task-7-mixed-sync.log

  Scenario: Updated english file creates backup and new output
    Tool: Bash
    Preconditions: initial sync already generated english output
    Steps:
      1. Run: bun test src/core/workflow/__tests__/obsidianSync.test.ts -t "english file backup" > .sisyphus/evidence/task-7-backup.log 2>&1
      2. Assert exit code = 0
      3. Assert output_backup includes timestamped previous json
    Expected Result: Incremental semantics preserved
    Evidence: .sisyphus/evidence/task-7-backup.log
  ```

  **Commit**: YES
  - Message: `feat(workflow): support mixed chinese and english sync inputs`
  - Files: workflow + workflow tests + cli wiring
  - Pre-commit: `bun test src/core/workflow/__tests__/obsidianSync.test.ts`

---

- [x] 8. 全量回归、文档与交付验证

  **What to do**:
  - 补齐 E2E：中文模板、英文样本、翻译降级、混合同步
  - 补齐 README：英文输入说明、API 配置、缓存行为、降级策略
  - 执行全量测试与一次真实 CLI 试跑（可用 mock/测试配置）
  - 产出验证证据（日志 + 关键输出 JSON）

  **Must NOT do**:
  - 不仅验证 happy path；必须覆盖 API 失败与未知字段等负场景
  - 不以人工 eyeballing 作为唯一验收手段

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 最终质量门控与风险收敛
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (final)
  - **Blocks**: None (final)
  - **Blocked By**: 6, 7

  **References**:
  - `tests/e2e.test.ts:20` - 当前 E2E 基线
  - `README.md:52` - 使用方法章节
  - `README.md:163` - 测试命令章节
  - `templates/npc-example.md:1` - 中文输入基线模板

  **Acceptance Criteria**:
  - [x] `bun test` 全绿
  - [x] `bun test tests/e2e.test.ts` 全绿
  - [x] `bun run src/index.ts tests/fixtures/english/adult-red-dragon.md -o output/english-dragon.json` 成功
  - [x] 生成 JSON 包含双语名称、中文描述、可识别 activities 结构

  **Task 8 Execution Notes (2026-02-15)**:
  - 已执行 `bun test`，退出码 `1`；证据：`.sisyphus/evidence/task-8-bun-test.log`
  - 已执行 `bun test tests/e2e.test.ts`，退出码 `1`；证据：`.sisyphus/evidence/task-8-e2e-test.log`
  - 已执行 `bun run src/index.ts tests/fixtures/english/adult-red-dragon.md -o output/english-dragon.json`，退出码 `1`（`ENOENT` 输入文件缺失）；证据：`.sisyphus/evidence/task-8-cli.log`
  - 汇总证据：`.sisyphus/evidence/task-8-verification-summary.md`
  - 由于命令证据未满足全绿条件，Task 8 与本任务验收复选框保持未勾选。
  - 重新执行 `bun test`，退出码 `0`；证据：`.sisyphus/evidence/task-8-bun-test.log`
  - 重新执行 `bun test tests/e2e.test.ts`，退出码 `0`；证据：`.sisyphus/evidence/task-8-e2e-test.log`
  - 重新执行 `bun run src/index.ts tests/fixtures/english/adult-red-dragon.md -o output/english-dragon.json`，退出码 `0`；证据：`.sisyphus/evidence/task-8-cli.log`
  - 2026-02-15 (修正): 尽管 CLI 成功且退出码为 0，但验证发现 `output/english-dragon.json` 内容不符合预期（非双语且无动作项目），因此 Task 8 重新标记为未完成，待内容修复。
  - 2026-02-15 (最终): 已补齐英文 fixture 动作区块并接入本地术语回退翻译；重新执行 Task 8 验证命令均通过，`output/english-dragon.json` 已满足双语名称、中文描述与 activities 结构要求。

  **Agent-Executed QA Scenarios**:
  ```text
  Scenario: Full test suite passes with new english pipeline
    Tool: Bash
    Preconditions: code compiled and all tests updated
    Steps:
      1. Run: bun test > .sisyphus/evidence/task-8-full-test.log 2>&1
      2. Assert exit code = 0
      3. Assert no failed test lines in log
    Expected Result: Regression-free final test pass
    Evidence: .sisyphus/evidence/task-8-full-test.log

  Scenario: End-to-end english conversion via CLI command
    Tool: Bash
    Preconditions: english fixture exists and translation config uses test-safe mode/mock
    Steps:
      1. Run: bun run src/index.ts tests/fixtures/english/adult-red-dragon.md -o output/english-dragon.json > .sisyphus/evidence/task-8-cli.log 2>&1
      2. Assert exit code = 0
      3. Assert output/english-dragon.json exists
      4. Parse JSON and assert actor.name contains both Chinese and English segments
    Expected Result: CLI conversion succeeds and output contract matches
    Evidence: .sisyphus/evidence/task-8-cli.log
  ```

  **Commit**: YES
  - Message: `test(docs): finalize english pipeline coverage and usage docs`
  - Files: tests + README
  - Pre-commit: `bun test`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(parser): add format router for chinese and bestiary markdown` | parser routing files | parser router tests |
| 2 | `feat(parser): support english bestiary frontmatter mapping` | mapping + i18n + parser tests | english frontmatter tests |
| 3-4 | `feat(parser): parse english statblock body and actions` | english parser/action files | english parser tests |
| 5 | `feat(translation): add openai-compatible translator with cache` | translation service/config/tests | translation tests |
| 6-7 | `feat(workflow): integrate bilingual generation and mixed sync` | generator/workflow/index/tests | targeted e2e + workflow tests |
| 8 | `test(docs): finalize english pipeline coverage and usage docs` | README + full tests | full `bun test` |

---

## Defaults Applied (override if needed)

- **翻译失败策略默认值**: fail-soft（保留英文原文 + warning）
- **配置文件默认值**: `.env`（`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`）
- **翻译缓存默认值**: `data/translation-cache.json`
- **双语拼接默认值**: `中文English`（无空格）

---

## Success Criteria

### Verification Commands
```bash
bun test
# Expected: all tests pass

bun test tests/e2e.test.ts
# Expected: chinese + english e2e pass

bun run src/index.ts tests/fixtures/english/adult-red-dragon.md -o output/english-dragon.json
# Expected: Successfully generated output/english-dragon.json
```

### Final Checklist
- [x] 中文模板转换结果与现有基线一致（无回归）
- [x] 英文 bestiary 样本可稳定转换
- [x] 名称双语策略生效（怪物与动作）
- [x] 动作描述翻译生效，失败时有可追踪降级
- [x] sync 模式支持混合输入并保持增量语义
- [x] 无需人工步骤即可完成端到端验证
