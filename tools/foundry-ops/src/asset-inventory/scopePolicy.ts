import { resolve } from 'node:path';
import type { FoundryLabConfig } from '../config';
import type {
  LocalScopeClass,
  LocalScopeDeclaration,
  LocalScopeMeasurement,
  LocalScopePolicy,
  LocalScopeStatus,
} from './scopeModel';
import type { AssetRebuildability, AssetRetention } from './model';

interface DeclarationDefaults {
  status: LocalScopeStatus;
  scopeClass: LocalScopeClass;
  producer: string;
  consumers: string[];
  sensitivity: string;
  rebuildability: AssetRebuildability;
  retention: AssetRetention;
  measurement: LocalScopeMeasurement;
  evidence: string[];
  rationale: string;
}

export function buildLocalScopePolicy(config: FoundryLabConfig): LocalScopePolicy {
  const declarations: LocalScopeDeclaration[] = [];
  const add = (names: readonly string[], defaults: DeclarationDefaults) => {
    for (const name of names) declarations.push({ name, ...defaults });
  };

  add(['foundry-v14'], {
    status: 'classified',
    scopeClass: 'registered-asset-root',
    producer: 'Foundry Ops and project-local Foundry Lab workflows',
    consumers: ['Foundry Ops', 'local Foundry acceptance', 'module and world verification'],
    sensitivity: 'mixed; credentials and profile Config remain separately excluded',
    rebuildability: 'not-assumed-rebuildable',
    retention: 'critical',
    measurement: 'asset-inventory-summary',
    evidence: [
      'docs/remediation/2026-07-31-architecture-reorganization/EXECUTION_LEDGER.md#stage-5a',
      '.local/foundry-v14/inventory/asset-inventory/2026-07-31T14-04-11-949Z/summary.json',
    ],
    rationale: 'The detailed Stage 5A manifest owns this mixed runtime root; scope coverage reuses that accepted summary instead of rereading private subtrees.',
  });
  add(['cor-cotn.7z'], {
    status: 'classified',
    scopeClass: 'registered-asset-root',
    producer: 'historical world archival workflow',
    consumers: ['recovery review'],
    sensitivity: 'world content',
    rebuildability: 'not-assumed-rebuildable',
    retention: 'critical',
    measurement: 'top-level-metadata',
    evidence: ['Stage 5A root id legacy-world-archive'],
    rationale: 'Already registered and hashed as a critical legacy world archive in Stage 5A.',
  });

  add(['architecture-reorganization'], {
    status: 'classified',
    scopeClass: 'acceptance-evidence',
    producer: 'architecture reorganization verification runs',
    consumers: ['architecture execution ledger', 'regression comparison'],
    sensitivity: 'ordinary local test evidence',
    rebuildability: 'not-assumed-rebuildable',
    retention: 'preserve',
    measurement: 'recursive-metadata',
    evidence: ['docs/remediation/2026-07-31-architecture-reorganization/EXECUTION_LEDGER.md'],
    rationale: 'Contains the named stage-by-stage extraction, baseline, and CI evidence used by the active reorganization ledger.',
  });
  add(['diagnostics', 'final-verification', 'icon-acceptance', 'intake-foundry', 'intake-runs', 'intake-web-live', 'spell-resolver-acceptance', 'validation'], {
    status: 'classified',
    scopeClass: 'acceptance-evidence',
    producer: 'project verification and acceptance workflows',
    consumers: ['hardening ExecPlan', 'acceptance reports', 'semantic review'],
    sensitivity: 'project inputs, generated candidates, diagnostics, or acceptance captures',
    rebuildability: 'not-assumed-rebuildable',
    retention: 'preserve',
    measurement: 'recursive-metadata',
    evidence: [
      'docs/remediation/2026-07-15-project-hardening/EXECPLAN.md',
      'docs/acceptance/2026-07-18-rat-warlock-spell-resolver.md',
    ],
    rationale: 'Filesystem contents and tracked acceptance records identify these roots as retained verification evidence, not disposable caches.',
  });
  add(['rr-20260728-220757'], {
    status: 'classified',
    scopeClass: 'recovery-copy',
    producer: '2026-07-28 local production-snapshot restoration rehearsal',
    consumers: ['recovery evidence', 'production migration report'],
    sensitivity: 'world and recovery data',
    rebuildability: 'not-assumed-rebuildable',
    retention: 'critical',
    measurement: 'top-level-metadata',
    evidence: ['docs/remediation/2026-07-31-architecture-reorganization/EXECUTION_LEDGER.md'],
    rationale: 'The public architecture ledger records this exact path as the only successful restore rehearsal; machine-specific runbook details remain in ignored operator storage. Its linked runtime layout is not recursively traversed by scope coverage.',
  });
  add(['references'], {
    status: 'classified',
    scopeClass: 'reference-cache',
    producer: 'manifest-pinned reference bootstrap and index workflows',
    consumers: ['reference verification', 'version-specific schema review', 'optional offline validation'],
    sensitivity: 'public upstream source and generated indexes',
    rebuildability: 'reacquirable',
    retention: 'review-before-removal',
    measurement: 'recursive-metadata',
    evidence: ['docs/REFERENCE_INDEX.md', 'references/manifest.json'],
    rationale: 'Tracked provenance and bootstrap commands define this as an ignored, version-pinned upstream cache; generation does not require it at runtime.',
  });
  add(['gstack-source'], {
    status: 'classified',
    scopeClass: 'external-tool-cache',
    producer: 'local clone of https://github.com/garrytan/gstack.git',
    consumers: ['historical browser-helper build and acceptance'],
    sensitivity: 'public upstream source checkout',
    rebuildability: 'reacquirable',
    retention: 'review-before-removal',
    measurement: 'recursive-metadata',
    evidence: ['sanitized git origin inspected 2026-07-31', 'docs/remediation/2026-07-15-project-hardening/EXECPLAN.md'],
    rationale: 'A public upstream clone used to build a local browser helper; it is not project business source.',
  });
  add(['codex-cli'], {
    status: 'classified',
    scopeClass: 'external-tool-cache',
    producer: 'local Codex CLI acquisition',
    consumers: ['historical local AI acceptance tooling'],
    sensitivity: 'executable only; no profile contents registered here',
    rebuildability: 'unknown',
    retention: 'review-before-removal',
    measurement: 'recursive-metadata',
    evidence: ['filesystem inspection: one codex.exe binary'],
    rationale: 'This is a tool binary cache rather than project source; exact acquisition provenance still needs to be retained before any removal decision.',
  });
  add(['coverage-cli-repro', 'coverage-cli-repro-2', 'coverage-crawl-repro'], {
    status: 'classified',
    scopeClass: 'task-scratch',
    producer: 'focused coverage reproduction runs',
    consumers: ['historical coverage diagnosis'],
    sensitivity: 'coverage metadata',
    rebuildability: 'workflow-rebuildable',
    retention: 'review-before-removal',
    measurement: 'recursive-metadata',
    evidence: ['filesystem inspection: each root contains lcov.info only'],
    rationale: 'Narrow reproduction outputs are distinct from irreplaceable acceptance evidence, but this report does not authorize deletion.',
  });

  add(['8080'], {
    status: 'pending-review',
    scopeClass: 'pending-owner',
    producer: '未知的本地导出或解压流程',
    consumers: [],
    sensitivity: '完整的 cor-cotn 世界内容和压缩包',
    rebuildability: 'unknown',
    retention: 'critical',
    measurement: 'recursive-metadata',
    evidence: ['filesystem inspection: cor-cotn world.json and cor-cotn.zip; no tracked producer reference found'],
    rationale: '内容明确是有价值的世界数据，但现有证据无法证明其精确来源、哪份是权威副本、谁仍在使用；因此保持最高保护并等待后续人工确认。',
  });
  add(['map'], {
    status: 'pending-review',
    scopeClass: 'pending-owner',
    producer: '未知的地图生成流程',
    consumers: [],
    sensitivity: '可能由用户制作的地图、遮罩和 UVTT 输出',
    rebuildability: 'unknown',
    retention: 'preserve',
    measurement: 'recursive-metadata',
    evidence: ['filesystem inspection: four map/mask/UVTT files; no tracked consumer reference found'],
    rationale: '它看起来像用户内容，但项目内没有来源记录能证明这是输入、正式交付物还是临时文件。',
  });
  add(['tools'], {
    status: 'pending-review',
    scopeClass: 'pending-owner',
    producer: '多个外部工具的混合获取流程',
    consumers: [],
    sensitivity: '第三方可执行文件和公开源码副本',
    rebuildability: 'unknown',
    retention: 'review-before-removal',
    measurement: 'recursive-metadata',
    evidence: ['filesystem inspection: Auto-Wall.exe plus https://github.com/newren/git-filter-repo.git clone; no tracked consumer reference found'],
    rationale: '该目录混放两个无关工具，又没有持久的项目使用者或来源记录，不能擅自把它们归给同一个缓存 owner。',
  });

  add(['chrome-fvtt-import', 'chrome-fvtt-import2', 'chrome-fvtt-import3', 'fvtt-session-monitor'], {
    status: 'privacy-excluded',
    scopeClass: 'private-session-state',
    producer: 'dedicated Chrome acceptance profiles',
    consumers: ['historical local Foundry browser acceptance'],
    sensitivity: '可能包含浏览器 profile、cookie、本地存储和登录会话',
    rebuildability: 'unknown',
    retention: 'review-before-removal',
    measurement: 'top-level-metadata',
    evidence: ['foundry-modules/session-monitor/README.zh-CN.md', 'filesystem profile-root inspection without content traversal'],
    rationale: 'Only the top-level existence is reported; profile contents are deliberately not enumerated or hashed.',
  });
  add(['codex-oauth-proxy-source', 'thkdog-codex-proxy-source', 'intake-oauth-live'], {
    status: 'privacy-excluded',
    scopeClass: 'private-session-state',
    producer: 'bounded local Codex OAuth acceptance',
    consumers: ['historical AI Intake acceptance only'],
    sensitivity: '可能包含 OAuth 相关源码、运行状态、日志或凭据',
    rebuildability: 'unknown',
    retention: 'review-before-removal',
    measurement: 'top-level-metadata',
    evidence: ['docs/remediation/2026-07-15-project-hardening/EXECPLAN.md#bounded-codex-oauth-acceptance'],
    rationale: 'The report records the boundary but does not recursively inspect OAuth-related roots.',
  });
  add(['goddessfantasy-browser-bridge', 'foundry-mcp-bridge'], {
    status: 'privacy-excluded',
    scopeClass: 'private-session-state',
    producer: 'external browser or MCP bridge tooling',
    consumers: ['historical local browser/tool bridge runs'],
    sensitivity: '可能包含桥接服务状态、下载、认证信息或浏览器会话材料',
    rebuildability: 'unknown',
    retention: 'review-before-removal',
    measurement: 'top-level-metadata',
    evidence: ['filesystem boundary inspection only; no tracked project consumer found'],
    rationale: 'External bridge roots are intentionally registered without traversing potentially private state.',
  });

  add(['goddessfantasy.cookie'], {
    status: 'privacy-excluded',
    scopeClass: 'private-session-state',
    producer: 'authenticated GoddessFantasy crawl setup',
    consumers: ['authenticated crawl workflow'],
    sensitivity: '认证 cookie',
    rebuildability: 'unknown',
    retention: 'review-before-removal',
    measurement: 'top-level-metadata',
    evidence: ['Stage 5A explicit privacy exclusion'],
    rationale: 'Record only file metadata; never read or hash authentication contents.',
  });
  add([
    'fvtt-game-inspect.png', 'fvtt-join-inspect.png', 'intake-web-mobile.png', 'intake-web-mobile-final.png',
    'screen-chrome.png', 'screen-chrome2.png', 'screen-current.png', 'screen-fvtt.png', 'screen-fvtt2.png', 'screen-next.png',
  ], {
    status: 'privacy-excluded',
    scopeClass: 'acceptance-evidence',
    producer: 'local browser or desktop acceptance capture',
    consumers: ['historical visual acceptance'],
    sensitivity: '截图可能包含会话或桌面上下文',
    rebuildability: 'not-assumed-rebuildable',
    retention: 'preserve',
    measurement: 'top-level-metadata',
    evidence: ['filesystem metadata inspection only'],
    rationale: 'The capture is retained as evidence while its pixels remain outside automated inventory content inspection.',
  });

  add(['bolbara-projection.json'], {
    status: 'classified',
    scopeClass: 'acceptance-evidence',
    producer: 'AI Intake semantic projection review',
    consumers: ['Bolbara workflow diagnosis'],
    sensitivity: 'project creature data',
    rebuildability: 'not-assumed-rebuildable',
    retention: 'preserve',
    measurement: 'top-level-metadata',
    evidence: ['docs/remediation/2026-07-15-project-hardening/EXECPLAN.md#bolbara-intake-fidelity'],
    rationale: 'A retained semantic projection artifact from the accepted Intake remediation history.',
  });
  add(['fvtt-import-inspect.cjs', 'fvtt-import-run.cjs'], {
    status: 'classified',
    scopeClass: 'acceptance-evidence',
    producer: 'local Foundry import acceptance',
    consumers: ['historical import diagnosis'],
    sensitivity: 'local browser automation helper source',
    rebuildability: 'unknown',
    retention: 'preserve',
    measurement: 'top-level-metadata',
    evidence: ['filesystem metadata inspection; paired with 2026-07-12 Foundry captures'],
    rationale: 'Small helpers preserve how the corresponding acceptance evidence was produced; they are not current product entrypoints.',
  });
  add([
    'classpack-coverage.stderr.log', 'classpack-coverage.stdout.log', 'classpack-execplan-final.patch',
    'classpack-execplan-scope.patch', 'icon-execplan.patch', 'session-monitor-gates.patch',
    'session-monitor-gates-add.patch', 'session-monitor-scope.patch',
  ], {
    status: 'classified',
    scopeClass: 'task-scratch',
    producer: 'bounded architecture/hardening edit and verification runs',
    consumers: ['short-term recovery and diff review'],
    sensitivity: 'local logs or patch text',
    rebuildability: 'workflow-rebuildable',
    retention: 'review-before-removal',
    measurement: 'top-level-metadata',
    evidence: ['filesystem metadata and active reorganization chronology'],
    rationale: 'These are task recovery artifacts rather than authoritative plans or product source; no deletion is authorized by this classification.',
  });

  return {
    localRoot: resolve(config.repoRoot, '.local'),
    assetInventoryParent: resolve(config.inventoryRoot, 'asset-inventory'),
    defaultOutputParent: resolve(config.inventoryRoot, 'scope-coverage'),
    declarations: declarations.sort((left, right) => left.name.localeCompare(right.name, 'en')),
  };
}
