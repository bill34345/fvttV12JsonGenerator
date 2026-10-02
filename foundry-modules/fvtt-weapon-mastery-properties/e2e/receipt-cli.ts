import { readFile } from 'node:fs/promises';
import { classifyWeaponEvidence, RULES, type EvidenceReceipt } from './evidence.ts';
import { normalizeWeaponExport } from './receipt-evidence.ts';

/** Read an exported receipt without accessing or mutating Foundry. */
export function evaluateExport(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON receipt object.');
  const exported = value as Record<string, unknown>;
  const input = exported.classifiedInput ?? value;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected classifiedInput to be an object.');
  const normalized = normalizeWeaponExport(value);
  const receipt = normalized.input;
  if (!receipt.rules || typeof receipt.rules !== 'object' || Array.isArray(receipt.rules)) throw new Error('Receipt has no rule observations.');
  const names = Object.keys(receipt.rules);
  if (!names.length || names.some(name => !(RULES as readonly string[]).includes(name))) throw new Error('Receipt contains no known rule cases or an unknown rule.');
  const manifest = classifyWeaponEvidence(receipt);
  const identity = (receipt as EvidenceReceipt & { buildIdentity?: unknown }).buildIdentity ?? exported.buildIdentity;
  const proof = identity && typeof identity === 'object' ? identity as Record<string, unknown> : undefined;
  const identityValid = proof?.status === 'PASS'
    && typeof proof.expectedBuildId === 'string' && /^[a-f0-9]{64}$/i.test(proof.expectedBuildId)
    && proof.observedBuildId === proof.expectedBuildId
    && Array.isArray(proof.settings)
    && proof.settings.every((setting: unknown) => {
      if (!setting || typeof setting !== 'object') return false;
      const observed = setting as Record<string, unknown>;
      return JSON.stringify(observed.expected) === JSON.stringify(observed.observed);
    });
  const cases = names.map(name => manifest.rules[name as keyof typeof manifest.rules]);
  // Unprovided rules remain NOT_EXECUTED, never implicitly counted as passed.
  const exitCode = cases.some(result => result.status === 'FAIL') ? 1
    : identityValid && manifest.environment.status === 'PASS' && cases.every(result => result.status === 'PASS') ? 0 : 2;
  return { manifest, evaluatedRules: names, evidenceAssociation: normalized.association,
    buildIdentity: { status: identityValid ? 'PASS' : 'INCOMPLETE', reason: identityValid ? null : 'Expected and loaded build identity/settings are missing or mismatched.' },
    exitCode };
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 1 || args[0]!.startsWith('-')) throw new Error('Usage: bun run verify:weapon-evidence <receipt.json>');
    const result = evaluateExport(JSON.parse(await readFile(args[0]!, 'utf8')));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
