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
      name: 'no-core-to-outer-layers',
      severity: 'error',
      comment: 'Core code must not depend on delivery, runtime, tooling, or operator layers.',
      from: { path: '^src/core/' },
      to: { path: '^(src/(web|foundry|tools)/|scripts/)' },
    },
    {
      name: 'no-web-to-foundry-or-operator-tools',
      severity: 'error',
      comment: 'The Web app may use application/core APIs, not Foundry runtime or operator internals.',
      from: { path: '^src/web/', pathNot: '(/__tests__/|[.](test|spec)[.])' },
      to: { path: '^(src/(foundry|tools)/|scripts/)' },
    },
    {
      name: 'no-foundry-to-web-or-operator-tools',
      severity: 'error',
      comment: 'Foundry modules are independent runtime adapters.',
      from: { path: '^src/foundry/', pathNot: '(/__tests__/|[.](test|spec)[.])' },
      to: { path: '^(src/(web|tools)/|scripts/)' },
    },
    {
      name: 'no-crawl-to-main-cli',
      severity: 'error',
      comment: 'Crawl core stays decoupled from the actor conversion CLI.',
      from: { path: '^src/core/crawl/' },
      to: { path: '^src/index[.]ts$' },
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
        path: '^(src/index[.]ts$|src/(web|foundry|tools)/)',
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
        path: '^(src/index[.]ts$|src/(web|foundry|tools)/)',
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
    includeOnly: ['^(src|scripts|tests)/'],
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
        collapsePattern: '^(src|scripts|tests)/[^/]+|node_modules/(?:@[^/]+/[^/]+|[^/]+)',
      },
    },
  },
};
