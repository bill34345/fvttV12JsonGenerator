import { parse, relative, resolve } from 'node:path';

export const SESSION_MONITOR_FOUNDRY_ENVIRONMENT = {
  labRoot: 'FVTT_OPS_LAB_ROOT',
  evidenceRoot: 'FVTT_OPS_EVIDENCE_ROOT',
  backupRoot: 'FVTT_OPS_BACKUP_ROOT',
} as const;

export type SessionMonitorEnvironment = Readonly<Record<string, string | undefined>>;

export function sessionMonitorFoundryPaths(
  workspaceRoot: string,
  environment: SessionMonitorEnvironment = {},
) {
  const root = resolve(workspaceRoot);
  const labRoot = resolve(
    environment[SESSION_MONITOR_FOUNDRY_ENVIRONMENT.labRoot]
      || resolve(root, '.local/foundry-v14'),
  );
  const evidenceRoot = resolve(
    environment[SESSION_MONITOR_FOUNDRY_ENVIRONMENT.evidenceRoot]
      || resolve(labRoot, 'evidence'),
  );
  const backupRoot = resolve(
    environment[SESSION_MONITOR_FOUNDRY_ENVIRONMENT.backupRoot]
      || resolve(labRoot, 'backups'),
  );

  assertSpecificRoot(root, labRoot, SESSION_MONITOR_FOUNDRY_ENVIRONMENT.labRoot);
  assertSpecificRoot(root, evidenceRoot, SESSION_MONITOR_FOUNDRY_ENVIRONMENT.evidenceRoot);
  assertSpecificRoot(root, backupRoot, SESSION_MONITOR_FOUNDRY_ENVIRONMENT.backupRoot);

  return {
    labRoot,
    evidenceRoot,
    backupRoot,
    destination: resolve(
      labRoot,
      'data/server-mirror/Data/modules/fvtt-session-monitor',
    ),
    sessionEvidenceRoot: resolve(
      evidenceRoot,
      'cor-cotn-performance/live-sessions',
    ),
  };
}

function assertSpecificRoot(repoRoot: string, target: string, variable: string): void {
  const volumeRoot = parse(target).root;
  if (relative(volumeRoot, target) === '' || relative(repoRoot, target) === '') {
    throw new Error(`${variable} must name a specific directory, not a volume or repository root: ${target}`);
  }
}
