export interface HeavyHitBranchInput {
  activityId: string;
  label: string;
  kind?: 'damage' | 'save' | 'utility';
}

export interface HeavyHitAutomationSpec {
  mode: 'random';
  trigger: 'attack-margin';
  acMargin: number;
  dieFormula: string;
  branchActivityIds: string[];
  branches: Array<HeavyHitBranchInput & { index: number }>;
}

export function shouldTriggerHeavyHit(options: {
  attackTotal: number;
  targetAC: number;
  acMargin?: number;
}): boolean {
  const acMargin = options.acMargin ?? 5;
  return (options.attackTotal - options.targetAC) >= acMargin;
}

export function selectHeavyHitBranch<T>(branches: T[], rollTotal: number): T | undefined {
  if (branches.length === 0) {
    return undefined;
  }

  const index = Math.max(0, Math.min(branches.length - 1, rollTotal - 1));
  return branches[index];
}

export function buildHeavyHitAutomationSpec(
  branches: HeavyHitBranchInput[],
  options?: { acMargin?: number },
): HeavyHitAutomationSpec {
  const acMargin = options?.acMargin ?? 5;
  return {
    mode: 'random',
    trigger: 'attack-margin',
    acMargin,
    dieFormula: `1d${branches.length}`,
    branchActivityIds: branches.map((branch) => branch.activityId),
    branches: branches.map((branch, index) => ({ ...branch, index: index + 1 })),
  };
}

export function buildHeavyHitMacroCommand(spec: HeavyHitAutomationSpec): string {
  const payload = JSON.stringify(spec);
  return `
const heavyHitSpec = ${payload};
const midi = globalThis.MidiQOL ?? MidiQOL;
if (!midi) return;
const scopeData = typeof scope !== "undefined" ? scope : {};
const workflow = scopeData.workflow ?? args?.[0]?.workflow ?? midi.Workflow?.getWorkflow?.(scopeData.workflowId);
const attackTotal = workflow?.attackTotal ?? workflow?.attackRoll?.total;
const firstTarget = workflow?.hitTargets?.first?.() ?? workflow?.targets?.first?.();
const targetAC = firstTarget?.actor?.system?.attributes?.ac?.value ?? firstTarget?.actor?.system?.attributes?.ac?.flat;
if (typeof attackTotal !== "number" || typeof targetAC !== "number") return;
if ((attackTotal - targetAC) < heavyHitSpec.acMargin) return;
const roll = await (new Roll(heavyHitSpec.dieFormula)).evaluate({ async: true });
const branch = heavyHitSpec.branches[Math.max(0, Math.min(heavyHitSpec.branches.length - 1, roll.total - 1))];
if (!branch) return;
const item = scopeData.activity?.item ?? scopeData.item ?? workflow?.item;
const activities = item?.system?.activities;
const branchActivity =
  activities?.get?.(branch.activityId) ??
  activities?.[branch.activityId] ??
  item?.activities?.get?.(branch.activityId);
await roll.toMessage({ flavor: "Heavy Hit" });
if (branchActivity?.use) {
  await branchActivity.use({}, {}, { configureDialog: false, workflow, trigger: "heavy-hit" });
} else {
  ui.notifications?.info?.(\`Heavy Hit triggered: \${branch.label}\`);
}
`.trim();
}
