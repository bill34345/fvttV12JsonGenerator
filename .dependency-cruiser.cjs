/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Cycles hide ownership and make package extraction unsafe.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'contracts-package-is-independent',
      severity: 'error',
      comment: 'Shared contracts must not depend on implementations, delivery layers, or operator tooling.',
      from: { path: '^packages/contracts/' },
      to: { path: '^(src/|scripts/|apps/|packages/(?!contracts/))' },
    },
    {
      name: 'parser-package-is-independent',
      severity: 'error',
      comment: 'Parser package code depends only on contracts, models, spell contracts, and declared third-party packages.',
      from: { path: '^packages/parser/' },
      to: {
        path: '^(src/|scripts/|apps/|packages/(?!contracts/|models/|parser/|spell-manifest-contracts/))',
      },
    },
    {
      name: 'models-package-is-independent',
      severity: 'error',
      comment: 'Shared source-derived models depend only on contracts and portable spell contracts, never implementations or delivery layers.',
      from: { path: '^packages/models/' },
      to: { path: '^(src/|scripts/|apps/|packages/(?!contracts/|models/|spell-manifest-contracts/))' },
    },
    {
      name: 'generation-package-is-independent',
      severity: 'error',
      comment: 'Generation owns projection logic and depends only on portable contracts, models, parser output, and spell contracts.',
      from: { path: '^packages/generation/' },
      to: {
        path: '^(src/|scripts/|apps/|packages/(?!contracts/|generation/|models/|parser/|spell-manifest-contracts/))',
      },
    },
    {
      name: 'workflows-package-is-independent',
      severity: 'error',
      comment: 'Workflow orchestration depends on package contracts and injected ports, never concrete source-tree adapters or delivery layers.',
      from: { path: '^packages/workflows/' },
      to: {
        path: '^(src/|scripts/|apps/|packages/(?!contracts/|generation/|models/|parser/|spell-manifest-contracts/|workflows/))',
      },
    },
    {
      name: 'no-generation-to-intake-canonical-model-adapter',
      severity: 'error',
      comment: 'Generation consumes canonical source models from the models package, not AI Intake private types.',
      from: { path: '^(src/core/(generation|generator)/|packages/generation/)' },
      to: { path: '^src/core/intake/types[.]ts$' },
    },
    {
      name: 'spell-manifest-contracts-package-is-independent',
      severity: 'error',
      comment: 'Portable spell contracts depend only on shared contracts and no resolver runtime implementation.',
      from: { path: '^packages/spell-manifest-contracts/' },
      to: {
        path: '^(src/|scripts/|apps/|packages/(?!contracts/|spell-manifest-contracts/))',
      },
    },
    {
      name: 'no-production-to-legacy-contract-adapters',
      severity: 'error',
      comment: 'Production code imports the contracts package; legacy paths are compatibility adapters only.',
      from: {
        pathNot: '(^src/core/contracts/|/__tests__/|[.](test|spec)[.])',
      },
      to: { path: '^src/core/contracts/' },
    },
    {
      name: 'no-production-to-legacy-parser-kernel-adapters',
      severity: 'error',
      comment: 'Production code imports parser workspace exports; old source paths are compatibility adapters only.',
      from: {
        pathNot: '(^src/core/(parser/(action|englishAction|structuredAction|chineseActionRegex)[.]ts|parser/utils/normalize[.]ts|mapper/i18n[.]ts)$|^packages/parser/src/models/action[.]ts$|/__tests__/|[.](test|spec)[.])',
      },
      to: {
        path: '^src/core/(parser/(action|englishAction|structuredAction|chineseActionRegex)[.]ts|parser/utils/normalize[.]ts|mapper/i18n[.]ts)$',
      },
    },
    {
      name: 'no-production-to-legacy-high-level-parser-adapters',
      severity: 'error',
      comment: 'Production code imports high-level parser workspace exports; old source paths remain compatibility adapters only.',
      from: {
        pathNot: '(^src/config/mapping[.]ts$|^src/core/parser/(types|yaml|chinese|english|router|resourceSemantics|behaviorSemantics|item-parser|item-router|item-strategy)[.]ts$|/__tests__/|[.](test|spec)[.])',
      },
      to: {
        path: '(^src/config/mapping[.]ts$|^src/core/parser/(types|yaml|chinese|english|router|resourceSemantics|behaviorSemantics|item-parser|item-router|item-strategy)[.]ts$)',
      },
    },
    {
      name: 'no-production-to-legacy-model-adapters',
      severity: 'error',
      comment: 'Production code imports the models package; old source and parser-owned model paths are compatibility adapters only.',
      from: {
        pathNot: '(^src/core/models/(action|item|resource|behavior)[.]ts$|^packages/parser/src/models/action[.]ts$|/__tests__/|[.](test|spec)[.])',
      },
      to: {
        path: '(^src/core/models/(action|item|resource|behavior)[.]ts$|^packages/parser/src/models/action[.]ts$)',
      },
    },
    {
      name: 'no-production-to-legacy-generation-support-adapters',
      severity: 'error',
      comment: 'Production code imports generation target and stable-id exports; old core paths remain compatibility adapters only.',
      from: {
        pathNot: '(^src/core/(foundryTarget[.]ts|utils/stable-id[.]ts)$|/__tests__/|[.](test|spec)[.])',
      },
      to: {
        path: '^src/core/(foundryTarget[.]ts|utils/stable-id[.]ts)$',
      },
    },
    {
      name: 'no-production-to-legacy-generation-adapters',
      severity: 'error',
      comment: 'Production code imports the generation workspace package; old generator, generation, mapper, and mechanics paths are compatibility adapters only.',
      from: {
        pathNot: '(^src/core/(generation/|generator/|mapper/spells[.]ts$|mechanics/(acEffectExtraction|mechanicsExtraction)[.]ts$)|/__tests__/|[.](test|spec)[.])',
      },
      to: {
        path: '^src/core/(generation/|generator/|mapper/spells[.]ts$|mechanics/(acEffectExtraction|mechanicsExtraction)[.]ts$)',
      },
    },
    {
      name: 'no-production-to-legacy-generation-workflow-adapters',
      severity: 'error',
      comment: 'Production orchestration imports generation pipeline exports from the workflows package; old paths are compatibility adapters only.',
      from: {
        pathNot: '(^src/core/workflow/(generationPipeline|itemGenerationWorkflow)[.]ts$|/__tests__/|[.](test|spec)[.])',
      },
      to: {
        path: '^src/core/workflow/(generationPipeline|itemGenerationWorkflow)[.]ts$',
      },
    },
    {
      name: 'no-production-to-legacy-workflow-adapters',
      severity: 'error',
      comment: 'Production delivery and application code use package workflows through the application composition root; old workflow paths are compatibility-only.',
      from: {
        pathNot: '(^src/core/workflow/|/__tests__/|[.](test|spec)[.])',
      },
      to: {
        path: '^src/core/workflow/',
      },
    },
    {
      name: 'no-core-to-outer-layers',
      severity: 'error',
      comment: 'Core code must not depend on delivery, runtime, tooling, or operator layers.',
      from: { path: '^src/core/' },
      to: { path: '^(apps/|src/(web|foundry|tools)/|scripts/)' },
    },
    {
      name: 'cli-through-application-composition',
      severity: 'error',
      comment: 'The CLI delivery app depends on its public application composition surface, not scattered core implementation directories.',
      from: { path: '^apps/cli/' },
      to: {
        path: '^src/core/',
        pathNot: '^src/core/application/cli[.]ts$',
      },
    },
    {
      name: 'web-through-application-composition',
      severity: 'error',
      comment: 'The Web delivery app depends on browser-safe or server-only application composition surfaces, not scattered core implementation directories.',
      from: {
        path: '^apps/web/',
        pathNot: '(/__tests__/|[.](test|spec)[.])',
      },
      to: {
        path: '^src/core/',
        pathNot: '^src/core/application/web-(client|server)[.]ts$',
      },
    },
    {
      name: 'no-web-to-foundry-or-operator-tools',
      severity: 'error',
      comment: 'The Web app may use application/core APIs, not Foundry runtime or operator internals.',
      from: { path: '^apps/web/', pathNot: '(/__tests__/|[.](test|spec)[.])' },
      to: { path: '^(src/(foundry|tools)/|scripts/)' },
    },
    {
      name: 'no-foundry-to-web-or-operator-tools',
      severity: 'error',
      comment: 'Foundry modules are independent runtime adapters.',
      from: { path: '^src/foundry/', pathNot: '(/__tests__/|[.](test|spec)[.])' },
      to: { path: '^(apps/web/|src/tools/|scripts/)' },
    },
    {
      name: 'no-crawl-to-main-cli',
      severity: 'error',
      comment: 'Crawl core stays decoupled from the actor conversion CLI.',
      from: { path: '^src/core/crawl/' },
      to: { path: '^(src/index[.]ts$|apps/cli/src/main[.]ts$)' },
    },
    {
      name: 'single-conversion-through-application-facade',
      severity: 'error',
      comment: 'Production callers use the stable conversion application port, not the legacy workflow implementation.',
      from: {
        pathNot: '(^src/core/application/conversion[.]ts$|/__tests__/|[.](test|spec)[.])',
      },
      to: { path: '^src/core/workflow/singleFileConversion[.]ts$' },
    },
    {
      name: 'delivery-layers-through-application-use-cases',
      severity: 'error',
      comment: 'CLI, Web, Foundry, and operator tools use public application ports instead of workflow orchestration internals.',
      from: {
        path: '^(apps/(cli|web)/|src/index[.]ts$|src/(foundry|tools)/)',
        pathNot: '(/__tests__/|[.](test|spec)[.])',
      },
      to: {
        path: '^src/core/(workflow/|intake/orchestrator[.]ts$)',
      },
    },
    {
      name: 'no-delivery-to-generator-internals',
      severity: 'error',
      comment: 'Delivery and operator layers depend on application contracts, never generator implementation files.',
      from: {
        path: '^(apps/(cli|web)/|src/index[.]ts$|src/(foundry|tools)/)',
        pathNot: '(/__tests__/|[.](test|spec)[.])',
      },
      to: { path: '^src/core/generator/' },
    },
    {
      name: 'no-production-to-tests',
      severity: 'error',
      comment: 'Production modules must not import tests or test-only helpers.',
      from: { pathNot: '(^tests/|/__tests__/|[.](test|spec)[.])' },
      to: { path: '(^tests/|/__tests__/|[.](test|spec)[.])' },
    },
    {
      name: 'resolver-private-core-debt',
      severity: 'warn',
      comment: 'Known migration debt: the resolver must eventually depend on spell contracts, not intake/parser internals.',
      from: {
        path: '^src/foundry/monster-spell-resolver/',
        pathNot: '(/__tests__/|[.](test|spec)[.])',
      },
      to: { path: '^src/core/(intake|parser)/' },
    },
  ],
  options: {
    doNotFollow: { path: '^node_modules/' },
    includeOnly: ['^(src|packages|apps|scripts|tests)/'],
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'],
      mainFields: ['module', 'main', 'types'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
      archi: {
        collapsePattern: '^(src|packages|apps|scripts|tests)/[^/]+|node_modules/(?:@[^/]+/[^/]+|[^/]+)',
      },
    },
  },
};
